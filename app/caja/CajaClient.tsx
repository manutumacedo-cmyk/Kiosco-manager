"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useCallback } from "react";
import {
  getOpenSession,
  getSessionTotals,
  openCashSession,
  closeCashSession,
  getClosedSessions,
  registerCashOutflow,
  fetchSessionOutflows,
  type SessionTotals,
} from "@/lib/services/cashSessions";
import type { CashSession, CashOutflow } from "@/types";

type PageState = "loading" | "cerrada" | "abierta" | "cerrando";

function fmt(n: number) {
  return new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 }).format(n);
}
function fmtBRL(n: number) {
  return new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export default function CajaClient({
  role,
  userId,
}: {
  role: "admin" | "cajero";
  userId: string | null;
}) {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [session, setSession] = useState<CashSession | null>(null);
  const [totals, setTotals] = useState<SessionTotals | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cajero, setCajero] = useState("");
  const [montoInicial, setMontoInicial] = useState("");
  const [montoInicialBrl, setMontoInicialBrl] = useState("");
  const [opening, setOpening] = useState(false);

  const [cerradoPor, setCerradoPor] = useState("");
  const [notas, setNotas] = useState("");
  const [contadoUyu, setContadoUyu] = useState("");
  const [contadoBrl, setContadoBrl] = useState("");
  const [closing, setClosing] = useState(false);
  const [closedSessions, setClosedSessions] = useState<CashSession[]>([]);
  const [arqueoConfirmado, setArqueoConfirmado] = useState(false);

  const [outflows, setOutflows] = useState<CashOutflow[]>([]);
  const [showSalidaModal, setShowSalidaModal] = useState(false);
  const [salidaMonto, setSalidaMonto] = useState("");
  const [salidaMoneda, setSalidaMoneda] = useState<"UYU" | "BRL">("UYU");
  const [salidaMotivo, setSalidaMotivo] = useState("");
  const [savingSalida, setSavingSalida] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const s = await getOpenSession();
      setSession(s);
      if (s) {
        const [t, o] = await Promise.all([getSessionTotals(s.id), fetchSessionOutflows(s.id)]);
        setTotals(t);
        setOutflows(o);
        setPageState("abierta");
      } else {
        setOutflows([]);
        setPageState("cerrada");
      }
      // Cajero only sees their own sessions; admin sees all
      const history = await getClosedSessions(10, role === "cajero" ? userId : undefined);
      setClosedSessions(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar sesión");
      setPageState("cerrada");
    }
  }, [role, userId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (pageState !== "abierta" || !session) return;
    const id = setInterval(async () => {
      try {
        setTotals(await getSessionTotals(session.id));
      } catch {
        // silencioso en background
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [pageState, session]);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setOpening(true);
    setError(null);
    try {
      const s = await openCashSession(cajero, parseFloat(montoInicial), parseFloat(montoInicialBrl) || 0);
      setSession(s);
      setTotals({
        total_ventas: 0,
        total_efectivo_uyu: 0,
        total_efectivo_brl: 0,
        total_digital: 0,
        cantidad_ventas: 0,
        total_brl_en_uyu: 0,
        total_salidas_uyu: 0,
        total_salidas_brl: 0,
      });
      setOutflows([]);
      setPageState("abierta");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al abrir caja");
    } finally {
      setOpening(false);
    }
  }

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setClosing(true);
    setError(null);
    try {
      await closeCashSession(
        session.id, cerradoPor, notas || null,
        contadoUyuNum, hayMovimientoBrl ? contadoBrlNum : null
      );
      setSession(null);
      setTotals(null);
      setCerradoPor("");
      setNotas("");
      setContadoUyu("");
      setContadoBrl("");
      setArqueoConfirmado(false);
      setPageState("cerrada");
      const history = await getClosedSessions(10, role === "cajero" ? userId : undefined);
      setClosedSessions(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cerrar caja");
    } finally {
      setClosing(false);
    }
  }

  async function handleRegistrarSalida(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    const monto = Number(salidaMonto.replace(",", "."));
    setSavingSalida(true);
    setError(null);
    try {
      await registerCashOutflow(session.id, monto, salidaMoneda, salidaMotivo);
      const [t, o] = await Promise.all([getSessionTotals(session.id), fetchSessionOutflows(session.id)]);
      setTotals(t);
      setOutflows(o);
      setSalidaMonto("");
      setSalidaMotivo("");
      setSalidaMoneda("UYU");
      setShowSalidaModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar la salida");
    } finally {
      setSavingSalida(false);
    }
  }

  const salidaMontoNum = Number(salidaMonto.replace(",", "."));
  const salidaInvalida = savingSalida || !salidaMotivo.trim() || !(salidaMontoNum > 0);

  const descuadreInvariante = totals
    ? totals.total_ventas - (totals.total_efectivo_uyu + totals.total_brl_en_uyu + totals.total_digital)
    : 0;
  const hayDescuadre =
    !!totals && Math.abs(descuadreInvariante) > 1 + totals.cantidad_ventas * 0.05;

  const esperadoUyu =
    (session?.monto_inicial ?? 0) + (totals?.total_efectivo_uyu ?? 0) - (totals?.total_salidas_uyu ?? 0);
  const esperadoBrl =
    (session?.monto_inicial_brl ?? 0) + (totals?.total_efectivo_brl ?? 0) - (totals?.total_salidas_brl ?? 0);
  const hayMovimientoBrl =
    (session?.monto_inicial_brl ?? 0) > 0 ||
    (totals?.total_efectivo_brl ?? 0) !== 0 ||
    (totals?.total_salidas_brl ?? 0) !== 0;

  const contadoUyuNum = contadoUyu.trim() === "" ? null : Math.round(Number(contadoUyu));
  const contadoBrlNum = contadoBrl.trim() === "" ? null : Number(contadoBrl.replace(",", "."));
  const difUyu = contadoUyuNum === null ? null : contadoUyuNum - esperadoUyu;
  const difBrl = contadoBrlNum === null ? null : contadoBrlNum - esperadoBrl;

  const arqueoDescuadra =
    (difUyu !== null && difUyu !== 0) ||
    (hayMovimientoBrl && difBrl !== null && Math.abs(difBrl) >= 0.005);

  const faltaContado = contadoUyu.trim() === "" || (hayMovimientoBrl && contadoBrl.trim() === "");
  const faltaNotaPorDescuadre = arqueoDescuadra && !notas.trim();
  const cierreBloqueado = closing || !cerradoPor.trim() || faltaContado || faltaNotaPorDescuadre;

  if (pageState === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[var(--text-secondary)] animate-pulse">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Image src="/logo.png" alt="24 SIETE" width={40} height={40} className="cursor-pointer" />
        </Link>
        <h1 className="text-2xl font-bold neon-text-cyan uppercase tracking-widest">
          Caja
        </h1>
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-[var(--error)] text-[var(--error)] bg-[rgba(255,59,59,0.08)] text-sm">
          {error}
        </div>
      )}

      {/* ──────── CERRADA ──────── */}
      {pageState === "cerrada" && (
        <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)] rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            <span className="text-[var(--text-secondary)] uppercase tracking-wide text-sm font-semibold">
              Caja cerrada
            </span>
          </div>

          <form onSubmit={handleOpen} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm uppercase tracking-wide text-[var(--text-secondary)]">
                Cajero
              </label>
              <input
                type="text"
                value={cajero}
                onChange={(e) => setCajero(e.target.value)}
                placeholder="Nombre del cajero"
                required
                autoFocus
                className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm uppercase tracking-wide text-[var(--text-secondary)]">
                  Fondo inicial $
                </label>
                <input
                  type="number"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                  placeholder="0.00"
                  required
                  min="0"
                  step="0.01"
                  className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm uppercase tracking-wide text-[var(--text-secondary)]">
                  Fondo inicial R$
                </label>
                <input
                  type="number"
                  value={montoInicialBrl}
                  onChange={(e) => setMontoInicialBrl(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={opening || !cajero.trim() || !montoInicial}
              className="w-full py-3 rounded-lg font-bold uppercase tracking-wide transition-all neon-outline-cyan neon-text-cyan hover:bg-[var(--neon-cyan)]/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {opening ? "Abriendo..." : "Abrir turno"}
            </button>
          </form>
        </div>
      )}

      {/* ──────── ABIERTA ──────── */}
      {pageState === "abierta" && session && (
        <div className="space-y-4">
          <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)] rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-green-400 inline-block animate-pulse" />
                <span className="neon-text-cyan uppercase tracking-wide font-bold text-sm">
                  Turno activo
                </span>
              </div>
              <span className="text-xs text-[var(--text-secondary)]">
                Totales se actualizan cada 30s
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[var(--text-secondary)]">Cajero</p>
                <p className="font-semibold text-[var(--text-primary)]">{session.cajero}</p>
              </div>
              <div>
                <p className="text-[var(--text-secondary)]">Apertura</p>
                <p className="font-semibold text-[var(--text-primary)]">{fmtDate(session.apertura_at)}</p>
              </div>
              <div>
                <p className="text-[var(--text-secondary)]">Fondo inicial</p>
                <p className="font-semibold text-[var(--text-primary)]">
                  $ {fmt(session.monto_inicial)}
                  {session.monto_inicial_brl > 0 && (
                    <span className="ml-2 text-[var(--text-secondary)]">
                      · R$ {fmtBRL(session.monto_inicial_brl)}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[var(--text-secondary)]">Ventas</p>
                <p className="font-semibold text-[var(--text-primary)]">{totals?.cantidad_ventas ?? 0}</p>
              </div>
            </div>

            {totals && (
              <div className="border-t border-[var(--slate-gray)] pt-4 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Total ventas</span>
                  <span className="font-bold text-lg neon-text-cyan">$ {fmt(totals.total_ventas)}</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Efectivo UYU</span>
                  <span>$ {fmt(totals.total_efectivo_uyu)}</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Efectivo BRL (neto)</span>
                  <span>R$ {fmtBRL(totals.total_efectivo_brl)}</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Digital / transferencia</span>
                  <span>$ {fmt(totals.total_digital)}</span>
                </div>
                {(totals.total_salidas_uyu > 0 || totals.total_salidas_brl > 0) && (
                  <div className="flex justify-between text-[var(--error)]">
                    <span>Salidas del local</span>
                    <span>
                      {totals.total_salidas_uyu > 0 && <>− $ {fmt(totals.total_salidas_uyu)}</>}
                      {totals.total_salidas_uyu > 0 && totals.total_salidas_brl > 0 && " · "}
                      {totals.total_salidas_brl > 0 && <>− R$ {fmtBRL(totals.total_salidas_brl)}</>}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {outflows.length > 0 && (
            <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)] rounded-xl p-4 space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-[var(--text-secondary)] font-semibold">
                Salidas del turno ({outflows.length})
              </h2>
              <div className="space-y-1.5 text-sm">
                {outflows.map((o) => (
                  <div key={o.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--text-secondary)] truncate">
                      {o.motivo}
                      <span className="text-[var(--text-muted)] text-xs ml-2">
                        {new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit" }).format(new Date(o.created_at))}
                      </span>
                    </span>
                    <span className="font-mono font-semibold text-[var(--error)] shrink-0">
                      − {o.moneda === "BRL" ? `R$ ${fmtBRL(o.monto)}` : `$ ${fmt(o.monto)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setSalidaMonto("");
              setSalidaMotivo("");
              setSalidaMoneda("UYU");
              setShowSalidaModal(true);
            }}
            className="w-full py-3 rounded-lg font-bold uppercase tracking-wide transition-all border border-[var(--warning)] text-[var(--warning)] hover:bg-[rgba(255,170,0,0.08)]"
          >
            − Registrar salida
          </button>

          <button
            onClick={() => {
              setCerradoPor(session.cajero);
              setContadoUyu("");
              setContadoBrl("");
              setArqueoConfirmado(false);
              setPageState("cerrando");
            }}
            className="w-full py-3 rounded-lg font-bold uppercase tracking-wide transition-all border border-[var(--error)] text-[var(--error)] hover:bg-[rgba(255,59,59,0.08)]"
          >
            Cerrar turno
          </button>
        </div>
      )}

      {/* ──────── CERRANDO ──────── */}
      {pageState === "cerrando" && session && totals && (
        <div className="space-y-4">
          <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)] rounded-xl p-6 space-y-4">
            <h2 className="text-sm uppercase tracking-wide text-[var(--text-secondary)] font-semibold">
              Resumen del turno
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[var(--text-secondary)]">Cajero</p>
                <p className="font-semibold">{session.cajero}</p>
              </div>
              <div>
                <p className="text-[var(--text-secondary)]">Apertura</p>
                <p className="font-semibold">{fmtDate(session.apertura_at)}</p>
              </div>
              <div>
                <p className="text-[var(--text-secondary)]">Fondo inicial</p>
                <p className="font-semibold">
                  $ {fmt(session.monto_inicial)}
                  {session.monto_inicial_brl > 0 && (
                    <span className="ml-2 text-[var(--text-secondary)]">
                      · R$ {fmtBRL(session.monto_inicial_brl)}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[var(--text-secondary)]">Ventas realizadas</p>
                <p className="font-semibold">{totals.cantidad_ventas}</p>
              </div>
            </div>

            <div className="border-t border-[var(--slate-gray)] pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Total ventas</span>
                <span className="font-bold neon-text-cyan">$ {fmt(totals.total_ventas)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Efectivo UYU</span>
                <span>$ {fmt(totals.total_efectivo_uyu)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Efectivo BRL (neto)</span>
                <span>R$ {fmtBRL(totals.total_efectivo_brl)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Digital / transferencia</span>
                <span>$ {fmt(totals.total_digital)}</span>
              </div>
              {(totals.total_salidas_uyu > 0 || totals.total_salidas_brl > 0) && (
                <div className="flex justify-between text-[var(--error)]">
                  <span>Salidas del local</span>
                  <span>
                    {totals.total_salidas_uyu > 0 && <>− $ {fmt(totals.total_salidas_uyu)}</>}
                    {totals.total_salidas_uyu > 0 && totals.total_salidas_brl > 0 && " · "}
                    {totals.total_salidas_brl > 0 && <>− R$ {fmtBRL(totals.total_salidas_brl)}</>}
                  </span>
                </div>
              )}
              {arqueoConfirmado && (
                <>
                  <div className="flex justify-between border-t border-[var(--slate-gray)] pt-2 font-semibold">
                    <span className="text-[var(--text-secondary)]">Efectivo total en caja $</span>
                    <span>$ {fmt(esperadoUyu)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-[var(--text-secondary)]">Efectivo total en caja R$</span>
                    <span>R$ {fmtBRL(esperadoBrl)}</span>
                  </div>
                </>
              )}
            </div>

            {hayDescuadre && (
              <div className="p-3 rounded-lg border border-[var(--warning)] bg-[rgba(255,170,0,0.08)] text-sm">
                <p className="text-[var(--warning)] font-semibold">⚠️ Aviso del sistema (no es tu conteo)</p>
                <p className="text-[var(--text-secondary)] text-xs mt-1">
                  Las ventas registradas no cierran entre sí: efectivo + digital no coincide
                  con el total de ventas (diferencia $ {fmt(Math.abs(descuadreInvariante))}).
                  Es un tema de las ventas del turno, no del efectivo que vas a contar.
                  Podés cerrar igual; avisá al dueño.
                </p>
              </div>
            )}
          </div>

          {/* Arqueo */}
          <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)] rounded-xl p-6 space-y-4">
            <h2 className="text-sm uppercase tracking-wide text-[var(--text-secondary)] font-semibold">
              Arqueo · contá la caja
            </h2>

            <div className="space-y-1.5">
              <label className="block text-sm text-[var(--text-secondary)]">Efectivo contado $ (pesos)</label>
              <input
                type="number" min="0" step="1" inputMode="numeric"
                value={contadoUyu}
                onChange={(e) => setContadoUyu(e.target.value)}
                placeholder="0"
                autoFocus
                readOnly={arqueoConfirmado}
                className={`w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors ${arqueoConfirmado ? "opacity-60 cursor-default" : ""}`}
              />
              {arqueoConfirmado && (
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Esperado: $ {fmt(esperadoUyu)}</span>
                  {difUyu !== null && (
                    <span className={difUyu === 0 ? "text-[var(--success)]" : difUyu > 0 ? "text-[var(--warning)]" : "text-[var(--error)]"}>
                      {difUyu === 0 ? "✅ Cuadra" : difUyu > 0 ? `🟡 Sobra $ ${fmt(difUyu)}` : `🔴 Falta $ ${fmt(Math.abs(difUyu))}`}
                    </span>
                  )}
                </div>
              )}
            </div>

            {hayMovimientoBrl && (
              <div className="space-y-1.5">
                <label className="block text-sm text-[var(--text-secondary)]">Efectivo contado R$ (reales)</label>
                <input
                  type="text" inputMode="decimal"
                  value={contadoBrl}
                  onChange={(e) => setContadoBrl(e.target.value)}
                  placeholder="0,00"
                  readOnly={arqueoConfirmado}
                  className={`w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors ${arqueoConfirmado ? "opacity-60 cursor-default" : ""}`}
                />
                {arqueoConfirmado && (
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Esperado: R$ {fmtBRL(esperadoBrl)}</span>
                    {difBrl !== null && (
                      <span className={Math.abs(difBrl) < 0.005 ? "text-[var(--success)]" : difBrl > 0 ? "text-[var(--warning)]" : "text-[var(--error)]"}>
                        {Math.abs(difBrl) < 0.005 ? "✅ Cuadra" : difBrl > 0 ? `🟡 Sobra R$ ${fmtBRL(difBrl)}` : `🔴 Falta R$ ${fmtBRL(Math.abs(difBrl))}`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {!arqueoConfirmado ? (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-muted)]">
                  Contá el efectivo físico y confirmá. El esperado y la diferencia se muestran después.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPageState("abierta")}
                    className="flex-1 py-3 rounded-lg font-bold uppercase tracking-wide border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-all"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    onClick={() => setArqueoConfirmado(true)}
                    disabled={faltaContado}
                    className="flex-1 py-3 rounded-lg font-bold uppercase tracking-wide transition-all neon-outline-cyan neon-text-cyan hover:bg-[var(--neon-cyan)]/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirmar conteo
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                {arqueoDescuadra ? (
                  <p className="text-xs text-[var(--warning)]">
                    Hay diferencia con lo esperado. Dejá una nota explicando el descuadre para poder cerrar.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--success)]">✅ El conteo coincide con lo esperado.</p>
                )}
                <button
                  type="button"
                  onClick={() => setArqueoConfirmado(false)}
                  className="shrink-0 text-xs uppercase tracking-wide text-[var(--text-secondary)] hover:text-[var(--neon-cyan)] transition-colors"
                >
                  Corregir conteo
                </button>
              </div>
            )}
          </div>

          {arqueoConfirmado && (
            <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)] rounded-xl p-6">
              <form onSubmit={handleClose} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm uppercase tracking-wide text-[var(--text-secondary)]">
                    Cerrado por
                  </label>
                  <input
                    type="text"
                    value={cerradoPor}
                    onChange={(e) => setCerradoPor(e.target.value)}
                    placeholder="Nombre de quien cierra"
                    required
                    className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm uppercase tracking-wide text-[var(--text-secondary)]">
                    {arqueoDescuadra ? "Notas · explicá el descuadre (obligatorio)" : "Notas (opcional)"}
                  </label>
                  <textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Observaciones del cierre..."
                    rows={3}
                    className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors resize-none"
                  />
                </div>
                {cierreBloqueado && !closing && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {!cerradoPor.trim() ? "Completá quién cierra."
                      : faltaContado ? "Ingresá el efectivo contado para cerrar."
                      : faltaNotaPorDescuadre ? "Hay descuadre: dejá una nota explicándolo." : ""}
                  </p>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setPageState("abierta")}
                    className="flex-1 py-3 rounded-lg font-bold uppercase tracking-wide border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-all"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={cierreBloqueado}
                    className="flex-1 py-3 rounded-lg font-bold uppercase tracking-wide transition-all border border-[var(--error)] text-[var(--error)] hover:bg-[rgba(255,59,59,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {closing ? "Cerrando..." : "Confirmar cierre"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ──────── HISTORIAL ──────── */}
      {closedSessions.length > 0 && (
        <div className="border-t border-[var(--slate-gray)] pt-6 space-y-3">
          <h2 className="text-sm uppercase tracking-wide text-[var(--text-secondary)] font-semibold">
            Historial de turnos
          </h2>
          <div className="space-y-3">
            {closedSessions.map((s) => (
              <div
                key={s.id}
                className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)] rounded-xl p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] truncate">
                      {s.cajero}
                      {s.cerrado_por && s.cerrado_por !== s.cajero && (
                        <span className="text-[var(--text-secondary)] font-normal">
                          {" "}→ {s.cerrado_por}
                        </span>
                      )}
                    </p>
                    <p className="text-[var(--text-secondary)] text-xs mt-0.5">
                      {fmtDate(s.apertura_at)} → {s.cierre_at ? fmtDate(s.cierre_at) : "—"}
                    </p>
                    {s.notas_cierre && (
                      <p className="text-[var(--text-secondary)] text-xs mt-1 italic truncate">
                        {s.notas_cierre}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="font-bold neon-text-cyan">$ {fmt(s.total_ventas ?? 0)}</p>
                    <p className="text-[var(--text-secondary)] text-xs">
                      $ {fmt(s.total_efectivo_uyu ?? 0)} UYU
                    </p>
                    {(s.total_efectivo_brl ?? 0) > 0 && (
                      <p className="text-[var(--text-secondary)] text-xs">
                        R$ {fmtBRL(s.total_efectivo_brl ?? 0)} BRL
                      </p>
                    )}
                    {(s.total_digital ?? 0) > 0 && (
                      <p className="text-[var(--text-secondary)] text-xs">
                        $ {fmt(s.total_digital ?? 0)} dig
                      </p>
                    )}
                    {((s.total_salidas_uyu ?? 0) > 0 || (s.total_salidas_brl ?? 0) > 0) && (
                      <p className="text-[var(--error)] text-xs">
                        Salidas:{" "}
                        {(s.total_salidas_uyu ?? 0) > 0 && <>$ {fmt(s.total_salidas_uyu ?? 0)}</>}
                        {(s.total_salidas_uyu ?? 0) > 0 && (s.total_salidas_brl ?? 0) > 0 && " · "}
                        {(s.total_salidas_brl ?? 0) > 0 && <>R$ {fmtBRL(s.total_salidas_brl ?? 0)}</>}
                      </p>
                    )}
                    <p className="text-[var(--text-secondary)] text-xs">{s.cantidad_ventas ?? 0} ventas</p>
                    {s.diferencia_uyu != null && s.diferencia_uyu !== 0 && (
                      <p className={`text-xs font-semibold ${s.diferencia_uyu > 0 ? "text-[var(--warning)]" : "text-[var(--error)]"}`}>
                        {s.diferencia_uyu > 0 ? `Sobró $ ${fmt(s.diferencia_uyu)}` : `Faltó $ ${fmt(Math.abs(s.diferencia_uyu))}`}
                      </p>
                    )}
                    {s.diferencia_brl != null && Math.abs(s.diferencia_brl) >= 0.005 && (
                      <p className={`text-xs font-semibold ${s.diferencia_brl > 0 ? "text-[var(--warning)]" : "text-[var(--error)]"}`}>
                        {s.diferencia_brl > 0 ? `Sobró R$ ${fmtBRL(s.diferencia_brl)}` : `Faltó R$ ${fmtBRL(Math.abs(s.diferencia_brl))}`}
                      </p>
                    )}
                    {s.efectivo_contado_uyu != null && (s.diferencia_uyu ?? 0) === 0 &&
                      (s.diferencia_brl == null || Math.abs(s.diferencia_brl) < 0.005) && (
                      <p className="text-[var(--success)] text-xs">✓ cuadró</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────── MODAL: REGISTRAR SALIDA ──────── */}
      {showSalidaModal && session && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--deep-dark)] border border-[var(--warning)] rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold uppercase tracking-wide text-[var(--warning)]">
                Registrar salida
              </h2>
              <button
                onClick={() => setShowSalidaModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Plata que sale de la caja durante el turno (proveedor, compra, etc.).
              Se descuenta del efectivo esperado en el arqueo.
            </p>
            <form onSubmit={handleRegistrarSalida} className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="block text-sm text-[var(--text-secondary)]">Monto</label>
                  <input
                    type="text" inputMode="decimal"
                    value={salidaMonto}
                    onChange={(e) => setSalidaMonto(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--warning)] transition-colors font-mono text-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm text-[var(--text-secondary)]">Moneda</label>
                  <div className="flex rounded-lg border border-[var(--slate-gray)] overflow-hidden">
                    {(["UYU", "BRL"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSalidaMoneda(m)}
                        className={`px-4 py-3 text-sm font-bold transition-all ${
                          salidaMoneda === m
                            ? "bg-[var(--warning)] text-[var(--deep-dark)]"
                            : "text-[var(--text-secondary)] hover:text-[var(--warning)]"
                        }`}
                      >
                        {m === "UYU" ? "$" : "R$"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm text-[var(--text-secondary)]">Motivo (obligatorio)</label>
                <input
                  type="text"
                  value={salidaMotivo}
                  onChange={(e) => setSalidaMotivo(e.target.value)}
                  placeholder="Ej: pago al sodero"
                  className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--warning)] transition-colors"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSalidaModal(false)}
                  className="flex-1 py-3 rounded-lg font-bold uppercase tracking-wide border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salidaInvalida}
                  className="flex-1 py-3 rounded-lg font-bold uppercase tracking-wide transition-all border border-[var(--warning)] text-[var(--warning)] hover:bg-[rgba(255,170,0,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingSalida ? "Guardando..." : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

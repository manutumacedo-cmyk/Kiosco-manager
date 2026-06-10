"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import {
  getOpenSession,
  getSessionTotals,
  openCashSession,
  closeCashSession,
  getClosedSessions,
  type SessionTotals,
} from "@/lib/services/cashSessions";
import type { CashSession } from "@/types";

type PageState = "loading" | "cerrada" | "abierta" | "cerrando";

// Pesos uruguayos: sin decimales (no hay centavos).
function fmt(n: number) {
  return new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 }).format(n);
}
// Reales: con centavos.
function fmtBRL(n: number) {
  return new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function CajaPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [session, setSession] = useState<CashSession | null>(null);
  const [totals, setTotals] = useState<SessionTotals | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Abrir turno
  const [cajero, setCajero] = useState("");
  const [montoInicial, setMontoInicial] = useState("");
  const [montoInicialBrl, setMontoInicialBrl] = useState("");
  const [opening, setOpening] = useState(false);

  // Cerrar turno
  const [cerradoPor, setCerradoPor] = useState("");
  const [notas, setNotas] = useState("");
  const [contadoUyu, setContadoUyu] = useState("");
  const [contadoBrl, setContadoBrl] = useState("");
  const [closing, setClosing] = useState(false);
  const [closedSessions, setClosedSessions] = useState<CashSession[]>([]);

  const loadSession = useCallback(async () => {
    try {
      const s = await getOpenSession();
      setSession(s);
      if (s) {
        const t = await getSessionTotals(s.id);
        setTotals(t);
        setPageState("abierta");
      } else {
        setPageState("cerrada");
      }
      const history = await getClosedSessions(10);
      setClosedSessions(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar sesión");
      setPageState("cerrada");
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Refrescar totales cada 30s mientras el turno está abierto
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
      });
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
      setPageState("cerrada");
      const history = await getClosedSessions(10);
      setClosedSessions(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cerrar caja");
    } finally {
      setClosing(false);
    }
  }

  // Invariante de consistencia: total_ventas ≈ efectivo_uyu + (cajón BRL valuado en UYU) + digital.
  // Aviso NO alarmista en el cierre si no cuadra (posible bug de datos). Ver B23-B25.
  // Tolerancia holgada: el vuelto en reales se redondea a centavos → arrastra ~centavos por venta.
  const descuadreInvariante = totals
    ? totals.total_ventas - (totals.total_efectivo_uyu + totals.total_brl_en_uyu + totals.total_digital)
    : 0;
  const hayDescuadre =
    !!totals && Math.abs(descuadreInvariante) > 1 + totals.cantidad_ventas * 0.05;

  // Arqueo (B28): comparar lo contado contra lo esperado por cajón.
  const esperadoUyu = (session?.monto_inicial ?? 0) + (totals?.total_efectivo_uyu ?? 0);
  const esperadoBrl = (session?.monto_inicial_brl ?? 0) + (totals?.total_efectivo_brl ?? 0);
  // Solo se exige contar reales si hubo fondo o movimiento en BRL.
  const hayMovimientoBrl = (session?.monto_inicial_brl ?? 0) > 0 || (totals?.total_efectivo_brl ?? 0) !== 0;

  const contadoUyuNum = contadoUyu.trim() === "" ? null : Math.round(Number(contadoUyu)); // pesos enteros
  const contadoBrlNum = contadoBrl.trim() === "" ? null : Number(contadoBrl);             // reales con centavos
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
        <Link href="/" className="h-10 w-10 rounded-full neon-border-cyan animate-pulse-cyan hover:bg-[var(--cyan-glow)] transition-all flex-shrink-0" />
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
                <p className="font-semibold text-[var(--text-primary)]">
                  {fmtDate(session.apertura_at)}
                </p>
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
                <p className="font-semibold text-[var(--text-primary)]">
                  {totals?.cantidad_ventas ?? 0}
                </p>
              </div>
            </div>

            {totals && (
              <div className="border-t border-[var(--slate-gray)] pt-4 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-secondary)]">Total ventas</span>
                  <span className="font-bold text-lg neon-text-cyan">
                    $ {fmt(totals.total_ventas)}
                  </span>
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
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setCerradoPor(session.cajero);
              setContadoUyu("");
              setContadoBrl("");
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
          {/* Resumen */}
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
              <div className="flex justify-between border-t border-[var(--slate-gray)] pt-2 font-semibold">
                <span className="text-[var(--text-secondary)]">Efectivo total en caja $</span>
                <span>$ {fmt(session.monto_inicial + totals.total_efectivo_uyu)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-[var(--text-secondary)]">Efectivo total en caja R$</span>
                <span>R$ {fmtBRL(session.monto_inicial_brl + totals.total_efectivo_brl)}</span>
              </div>
            </div>

            {hayDescuadre && (
              <div className="p-3 rounded-lg border border-[var(--warning)] bg-[rgba(255,170,0,0.08)] text-sm">
                <p className="text-[var(--warning)] font-semibold">⚠️ Revisar: los totales no cuadran</p>
                <p className="text-[var(--text-secondary)] text-xs mt-1">
                  Efectivo + digital no coincide con el total de ventas
                  (diferencia $ {fmt(Math.abs(descuadreInvariante))}). Conviene revisar
                  las ventas del turno antes de cerrar.
                </p>
              </div>
            )}
          </div>

          {/* Arqueo — contá la caja */}
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
                className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors"
              />
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Esperado: $ {fmt(esperadoUyu)}</span>
                {difUyu !== null && (
                  <span className={difUyu === 0 ? "text-[var(--success)]" : difUyu > 0 ? "text-[var(--warning)]" : "text-[var(--error)]"}>
                    {difUyu === 0 ? "✅ Cuadra" : difUyu > 0 ? `🟡 Sobra $ ${fmt(difUyu)}` : `🔴 Falta $ ${fmt(Math.abs(difUyu))}`}
                  </span>
                )}
              </div>
            </div>

            {hayMovimientoBrl && (
              <div className="space-y-1.5">
                <label className="block text-sm text-[var(--text-secondary)]">Efectivo contado R$ (reales)</label>
                <input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={contadoBrl}
                  onChange={(e) => setContadoBrl(e.target.value)}
                  placeholder="0,00"
                  className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors"
                />
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Esperado: R$ {fmtBRL(esperadoBrl)}</span>
                  {difBrl !== null && (
                    <span className={Math.abs(difBrl) < 0.005 ? "text-[var(--success)]" : difBrl > 0 ? "text-[var(--warning)]" : "text-[var(--error)]"}>
                      {Math.abs(difBrl) < 0.005 ? "✅ Cuadra" : difBrl > 0 ? `🟡 Sobra R$ ${fmtBRL(difBrl)}` : `🔴 Falta R$ ${fmtBRL(Math.abs(difBrl))}`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {arqueoDescuadra && (
              <p className="text-xs text-[var(--warning)]">
                Hay diferencia con lo esperado. Dejá una nota explicando el descuadre para poder cerrar.
              </p>
            )}
          </div>

          {/* Formulario de cierre */}
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
                  autoFocus
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
        </div>
      )}

      {/* ──────── HISTORIAL DE TURNOS ──────── */}
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
                  {/* Cajero / cerrado por + fechas + notas */}
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
                  {/* Totales */}
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
                    <p className="text-[var(--text-secondary)] text-xs">
                      {s.cantidad_ventas ?? 0} ventas
                    </p>
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
    </div>
  );
}

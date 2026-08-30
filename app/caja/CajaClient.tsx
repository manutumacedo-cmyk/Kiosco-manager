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
  getLastClosedSession,
  registerCashMovement,
  fetchSessionOutflows,
  type SessionTotals,
} from "@/lib/services/cashSessions";
import { fetchSalesBySession, cancelSaleOwnTurno } from "@/lib/services/sales";
import type { CashSession, CashOutflow, Sale, CategoriaSalida } from "@/types";

const CATEGORIAS_SALIDA: { id: CategoriaSalida; label: string }[] = [
  { id: "restock", label: "Restock" },
  { id: "proveedor", label: "Proveedor" },
  { id: "funcionario", label: "Funcionario" },
  { id: "gasto_personal", label: "Gasto personal" },
  { id: "otro", label: "Otro" },
];

type PageState = "loading" | "cerrada" | "abierta" | "cerrando";

function fmt(n: number) {
  return new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 }).format(n);
}
function fmtBRL(n: number) {
  return new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
/**
 * Etiqueta del movimiento de efectivo de una venta, para las listas del turno.
 *
 * `sales.total` está SIEMPRE en UYU: es la suma de precios del carrito. `moneda` solo dice
 * con qué pagó el cliente. Mostrar `R$ {total}` porque `moneda === 'BRL'` (lo que se hacía
 * antes, B41) daba "R$ 300" para una venta de $300 en la que al cajón entraron R$40 — el
 * cajero sumaba esa columna y nunca le cerraba contra el esperado en reales.
 *
 * Ahora el importe siempre se muestra en pesos, y al lado va el movimiento REAL de cada
 * cajón cuando existe: lo que entró en reales y, si el vuelto se dio en la otra moneda,
 * lo que salió en pesos.
 */
function ImporteVenta({ sale, className }: { sale: Sale; className?: string }) {
  const brl = Number(sale.mov_efectivo_brl ?? 0);
  const uyu = Number(sale.mov_efectivo_uyu ?? 0);
  const partes: string[] = [];
  if (brl !== 0) partes.push(`${brl > 0 ? "+" : "−"} R$ ${fmtBRL(Math.abs(brl))}`);
  if (brl !== 0 && uyu !== 0) partes.push(`${uyu > 0 ? "+" : "−"} $ ${fmt(Math.abs(uyu))}`);

  return (
    <>
      <span className={className}>$ {fmt(sale.total)}</span>
      {partes.length > 0 && (
        <span className="text-[var(--neon-magenta)] text-xs ml-2 font-mono font-normal">
          {partes.join(" ")}
        </span>
      )}
    </>
  );
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
  username,
}: {
  role: "admin" | "cajero";
  userId: string | null;
  username: string;
}) {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [session, setSession] = useState<CashSession | null>(null);
  const [totals, setTotals] = useState<SessionTotals | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [montoInicial, setMontoInicial] = useState("");
  const [montoInicialBrl, setMontoInicialBrl] = useState("");
  const [opening, setOpening] = useState(false);
  // Último turno cerrado (de cualquier cajero, porque el cajón es uno solo). Sirve para
  // mostrar con cuánto cerró y calcular cuánto se retiró antes de esta apertura. Ver B40.
  const [ultimoCierre, setUltimoCierre] = useState<CashSession | null>(null);

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
  const [salidaTipo, setSalidaTipo] = useState<"entrada" | "salida">("salida");
  const [salidaMotivo, setSalidaMotivo] = useState("");
  const [salidaCategoria, setSalidaCategoria] = useState<CategoriaSalida>("restock");
  const [savingSalida, setSavingSalida] = useState(false);

  const [turnoSales, setTurnoSales] = useState<Sale[]>([]);
  const [showCancelSaleId, setShowCancelSaleId] = useState<string | null>(null);
  const [cancelingSaleId, setCancelingSaleId] = useState<string | null>(null);

  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionSalesCache, setSessionSalesCache] = useState<Record<string, Sale[]>>({});
  const [loadingSessionSalesId, setLoadingSessionSalesId] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const s = await getOpenSession();
      setSession(s);
      if (s) {
        const [t, o, ventas] = await Promise.all([
          getSessionTotals(s.id),
          fetchSessionOutflows(s.id),
          fetchSalesBySession(s.id),
        ]);
        setTotals(t);
        setOutflows(o);
        setTurnoSales(ventas);
        setPageState("abierta");
      } else {
        setOutflows([]);
        setTurnoSales([]);
        // Contexto del cierre anterior para el form de apertura (B40). NO se precarga el
        // valor: la recaudación se retira del cajón después de cerrar, así que el contado
        // anterior NO es el fondo de este turno. Imponerlo daría faltantes falsos enormes
        // (se simuló contra 29 turnos reales: hasta −$23.700). Lo que sí falta hoy es
        // dejar rastro de cuánto se retiró — eso se calcula y se muestra al tipear.
        const ultimo = await getLastClosedSession();
        setUltimoCierre(ultimo);
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

  async function handleCancelSale(saleId: string) {
    if (!session) return;
    setCancelingSaleId(saleId);
    setError(null);
    try {
      await cancelSaleOwnTurno(saleId, username);
      const [t, ventas] = await Promise.all([
        getSessionTotals(session.id),
        fetchSalesBySession(session.id),
      ]);
      setTotals(t);
      setTurnoSales(ventas);
      setShowCancelSaleId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al anular la venta");
    } finally {
      setCancelingSaleId(null);
    }
  }

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
      const s = await openCashSession(username, parseFloat(montoInicial), parseFloat(montoInicialBrl) || 0, userId);
      setSession(s);
      setTotals({
        total_ventas: 0,
        total_efectivo_uyu: 0,
        total_efectivo_brl: 0,
        total_digital: 0,
        total_digital_uyu: 0,
        total_digital_brl: 0,
        total_digital_brl_en_uyu: 0,
        cantidad_ventas: 0,
        total_brl_en_uyu: 0,
        total_salidas_uyu: 0,
        total_salidas_brl: 0,
        total_entradas_uyu: 0,
        total_entradas_brl: 0,
      });
      setOutflows([]);
      setTurnoSales([]);
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
        session.id, username, notas || null,
        contadoUyuNum, hayMovimientoBrl ? contadoBrlNum : null, userId
      );
      setSession(null);
      setTotals(null);
      setTurnoSales([]);
      setNotas("");
      setContadoUyu("");
      setContadoBrl("");
      setArqueoConfirmado(false);
      setPageState("cerrada");
      const [history, ultimo] = await Promise.all([
        getClosedSessions(10, role === "cajero" ? userId : undefined),
        getLastClosedSession(),
      ]);
      setClosedSessions(history);
      setUltimoCierre(ultimo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cerrar caja");
    } finally {
      setClosing(false);
    }
  }

  async function handleToggleSession(sessionId: string) {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }
    setExpandedSessionId(sessionId);
    if (sessionSalesCache[sessionId]) return;
    setLoadingSessionSalesId(sessionId);
    try {
      const sales = await fetchSalesBySession(sessionId);
      setSessionSalesCache((prev) => ({ ...prev, [sessionId]: sales }));
    } catch {
      // silencioso — el botón queda expandido sin ventas
    } finally {
      setLoadingSessionSalesId(null);
    }
  }

  async function handleRegistrarMovimiento(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    const monto = Number(salidaMonto.replace(",", "."));
    setSavingSalida(true);
    setError(null);
    try {
      await registerCashMovement(session.id, monto, salidaMoneda, salidaTipo, salidaMotivo, salidaCategoria);
      const [t, o] = await Promise.all([getSessionTotals(session.id), fetchSessionOutflows(session.id)]);
      setTotals(t);
      setOutflows(o);
      setSalidaMonto("");
      setSalidaMotivo("");
      setSalidaMoneda("UYU");
      setSalidaTipo("salida");
      setSalidaCategoria("restock");
      setShowSalidaModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar el movimiento");
    } finally {
      setSavingSalida(false);
    }
  }

  // Retiro implícito entre el cierre anterior y esta apertura (B40). El cajón cierra con
  // fondo + recaudación; después alguien se lleva la recaudación y el turno siguiente
  // arranca con un fondo mucho más chico. Esa plata hoy no deja NINGÚN rastro: no es una
  // salida registrada ni aparece en el arqueo de ninguno de los dos turnos. Acá se calcula
  // y se muestra para que quien abre lo vea y lo confirme antes de arrancar.
  const aperturaUyuNum = montoInicial.trim() === "" ? null : Number(montoInicial.replace(",", "."));
  const aperturaBrlNum = montoInicialBrl.trim() === "" ? null : Number(montoInicialBrl.replace(",", "."));
  const retiroUyu =
    ultimoCierre?.efectivo_contado_uyu != null && aperturaUyuNum != null
      ? ultimoCierre.efectivo_contado_uyu - aperturaUyuNum
      : null;
  const retiroBrl =
    ultimoCierre?.efectivo_contado_brl != null && aperturaBrlNum != null
      ? ultimoCierre.efectivo_contado_brl - aperturaBrlNum
      : null;
  const hayRetiro = (retiroUyu != null && retiroUyu >= 1) || (retiroBrl != null && retiroBrl >= 0.05);
  const hayFondoDeMas = (retiroUyu != null && retiroUyu <= -1) || (retiroBrl != null && retiroBrl <= -0.05);

  const salidaMontoNum = Number(salidaMonto.replace(",", "."));
  const salidaInvalida = savingSalida || !salidaMotivo.trim() || !(salidaMontoNum > 0);

  const descuadreInvariante = totals
    ? totals.total_ventas - (totals.total_efectivo_uyu + totals.total_brl_en_uyu + totals.total_digital)
    : 0;
  // Tolerancia del invariante. Cada venta cobrada en reales puede desviarse hasta media
  // moneda de R$0,05 por el redondeo a monto entregable (B43) — a la tasa actual eso es
  // ~$0,20 por venta. El margen viejo (0,05/venta) era más chico que el error legítimo del
  // redondeo y habría empezado a marcar descuadre falso en turnos con muchas ventas en BRL.
  const hayDescuadre =
    !!totals && Math.abs(descuadreInvariante) > 1 + totals.cantidad_ventas * 0.25;

  const esperadoUyu =
    (session?.monto_inicial ?? 0) + (totals?.total_efectivo_uyu ?? 0)
    + (totals?.total_entradas_uyu ?? 0) - (totals?.total_salidas_uyu ?? 0);
  const esperadoBrl =
    (session?.monto_inicial_brl ?? 0) + (totals?.total_efectivo_brl ?? 0)
    + (totals?.total_entradas_brl ?? 0) - (totals?.total_salidas_brl ?? 0);
  const hayMovimientoBrl =
    (session?.monto_inicial_brl ?? 0) > 0 ||
    (totals?.total_efectivo_brl ?? 0) !== 0 ||
    (totals?.total_salidas_brl ?? 0) !== 0 ||
    (totals?.total_entradas_brl ?? 0) !== 0;

  const contadoUyuNum = contadoUyu.trim() === "" ? null : Math.round(Number(contadoUyu));
  const contadoBrlNum = contadoBrl.trim() === "" ? null : Number(contadoBrl.replace(",", "."));
  const difUyu = contadoUyuNum === null ? null : contadoUyuNum - esperadoUyu;
  const difBrl = contadoBrlNum === null ? null : contadoBrlNum - esperadoBrl;

  // Tolerancias por moneda. El peso uruguayo no tiene centavos en circulación, pero
  // `esperadoUyu` se arma sumando floats en JS y puede dar 300.00000000000006: comparar
  // contra cero exacto (lo que se hacía antes, B44) bloqueaba el cierre pidiendo nota
  // aunque el arqueo cuadrara perfecto. Medio peso es menos que la moneda más chica que
  // existe, así que no tapa ningún descuadre real.
  const arqueoDescuadra =
    (difUyu !== null && Math.abs(difUyu) >= 0.5) ||
    (hayMovimientoBrl && difBrl !== null && Math.abs(difBrl) >= 0.005);

  const faltaContado = contadoUyu.trim() === "" || (hayMovimientoBrl && contadoBrl.trim() === "");
  const faltaNotaPorDescuadre = arqueoDescuadra && !notas.trim();
  const cierreBloqueado = closing || faltaContado || faltaNotaPorDescuadre;

  if (pageState === "loading") {
    return (
      <div className="min-h-full flex items-center justify-center">
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
              {/* Fijo a la cuenta logueada (verificada por JWT) — no es editable: antes
                  cualquiera podía escribir cualquier nombre acá, sin quedar registro real
                  de quién abrió la caja. */}
              <div className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] flex items-center justify-between">
                <span className="font-semibold">{username}</span>
                <span className="text-xs text-[var(--text-muted)] uppercase">Tu cuenta</span>
              </div>
            </div>
            {ultimoCierre && (ultimoCierre.efectivo_contado_uyu != null || ultimoCierre.efectivo_contado_brl != null) && (
              <div className="rounded-lg border border-[var(--slate-gray)] bg-[var(--dark-bg)] px-4 py-3 space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                  Último cierre
                  {ultimoCierre.cierre_at ? ` · ${fmtDate(ultimoCierre.cierre_at)}` : ""}
                  {ultimoCierre.cerrado_por ? ` · ${ultimoCierre.cerrado_por}` : ""}
                </p>
                <p className="text-sm font-mono text-[var(--text-primary)]">
                  Se contaron{" "}
                  {ultimoCierre.efectivo_contado_uyu != null && <>$ {fmt(ultimoCierre.efectivo_contado_uyu)}</>}
                  {ultimoCierre.efectivo_contado_uyu != null && ultimoCierre.efectivo_contado_brl != null && " · "}
                  {ultimoCierre.efectivo_contado_brl != null && <>R$ {fmtBRL(ultimoCierre.efectivo_contado_brl)}</>}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Contá el cajón ahora y poné lo que hay. Si es menos, es porque se retiró la
                  recaudación — abajo te decimos cuánto.
                </p>
              </div>
            )}
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
                  autoFocus
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
                  required
                  min="0"
                  step="0.01"
                  className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--neon-cyan)] transition-colors"
                />
                <p className="text-xs text-[var(--text-muted)]">Si no hay reales en el cajón, poné 0.</p>
              </div>
            </div>
            {hayRetiro && (
              <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning)]/10 px-4 py-3 space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--warning)] font-semibold">
                  Se retiró del cajón desde el último cierre
                </p>
                <p className="text-lg font-mono font-bold text-[var(--warning)]">
                  {retiroUyu != null && retiroUyu >= 1 && <>$ {fmt(retiroUyu)}</>}
                  {retiroUyu != null && retiroUyu >= 1 && retiroBrl != null && retiroBrl >= 0.05 && " · "}
                  {retiroBrl != null && retiroBrl >= 0.05 && <>R$ {fmtBRL(retiroBrl)}</>}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Es la diferencia entre lo contado al cerrar y lo que estás declarando ahora.
                  Normalmente es la recaudación que se llevó el dueño. Si no esperabas este número,
                  revisá antes de abrir.
                </p>
              </div>
            )}
            {hayFondoDeMas && (
              <div className="rounded-lg border border-[var(--error)] bg-[var(--error)]/10 px-4 py-3 space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--error)] font-semibold">
                  Hay más plata que en el último cierre
                </p>
                <p className="text-lg font-mono font-bold text-[var(--error)]">
                  {retiroUyu != null && retiroUyu <= -1 && <>$ {fmt(Math.abs(retiroUyu))}</>}
                  {retiroUyu != null && retiroUyu <= -1 && retiroBrl != null && retiroBrl <= -0.05 && " · "}
                  {retiroBrl != null && retiroBrl <= -0.05 && <>R$ {fmtBRL(Math.abs(retiroBrl))}</>}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  El cajón tiene más de lo que se contó al cerrar. Puede ser plata que se agregó
                  para dar vuelto — pero verificá el conteo antes de abrir.
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={opening || !montoInicial || !montoInicialBrl}
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
                  <span>Digital en pesos</span>
                  <span>$ {fmt(totals.total_digital_uyu)}</span>
                </div>
                {totals.total_digital_brl > 0 && (
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Digital en reales (PIX)</span>
                    <span>R$ {fmtBRL(totals.total_digital_brl)}</span>
                  </div>
                )}
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
                {(totals.total_entradas_uyu > 0 || totals.total_entradas_brl > 0) && (
                  <div className="flex justify-between text-[var(--success)]">
                    <span>Entradas al local</span>
                    <span>
                      {totals.total_entradas_uyu > 0 && <>+ $ {fmt(totals.total_entradas_uyu)}</>}
                      {totals.total_entradas_uyu > 0 && totals.total_entradas_brl > 0 && " · "}
                      {totals.total_entradas_brl > 0 && <>+ R$ {fmtBRL(totals.total_entradas_brl)}</>}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {outflows.length > 0 && (
            <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)] rounded-xl p-4 space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-[var(--text-secondary)] font-semibold">
                Movimientos del turno ({outflows.length})
              </h2>
              <div className="space-y-1.5 text-sm">
                {outflows.map((o) => (
                  <div key={o.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--text-secondary)] truncate">
                      {o.categoria && (
                        <span className="text-[10px] uppercase font-bold text-[var(--warning)] border border-[var(--warning)] rounded px-1 mr-1.5">
                          {CATEGORIAS_SALIDA.find((c) => c.id === o.categoria)?.label ?? o.categoria}
                        </span>
                      )}
                      {o.motivo}
                      <span className="text-[var(--text-muted)] text-xs ml-2">
                        {new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit" }).format(new Date(o.created_at))}
                      </span>
                    </span>
                    <span className={`font-mono font-semibold shrink-0 ${o.tipo === "entrada" ? "text-[var(--success)]" : "text-[var(--error)]"}`}>
                      {o.tipo === "entrada" ? "+" : "−"} {o.moneda === "BRL" ? `R$ ${fmtBRL(o.monto)}` : `$ ${fmt(o.monto)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {turnoSales.length > 0 && (
            <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)] rounded-xl p-4 space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-[var(--text-secondary)] font-semibold">
                Ventas de este turno ({turnoSales.length})
              </h2>
              <div className="space-y-1.5 text-sm max-h-72 overflow-y-auto">
                {turnoSales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3">
                    <div className={`truncate ${s.estado === "anulada" ? "opacity-50" : ""}`}>
                      <ImporteVenta
                        sale={s}
                        className={s.estado === "anulada" ? "line-through text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}
                      />
                      <span className="text-[var(--text-muted)] text-xs ml-2 capitalize">
                        {s.metodo_pago}
                      </span>
                      <span className="text-[var(--text-muted)] text-xs ml-2">
                        {new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit" }).format(new Date(s.fecha))}
                      </span>
                    </div>
                    {s.estado === "activa" ? (
                      <button
                        onClick={() => setShowCancelSaleId(s.id)}
                        className="shrink-0 text-xs uppercase tracking-wide px-2 py-1 rounded border border-[var(--error)] text-[var(--error)] hover:bg-[rgba(255,59,59,0.08)] transition-all"
                      >
                        Anular
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs text-[var(--error)]">❌ Anulada</span>
                    )}
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
              setSalidaTipo("salida");
              setShowSalidaModal(true);
            }}
            className="w-full py-3 rounded-lg font-bold uppercase tracking-wide transition-all border border-[var(--warning)] text-[var(--warning)] hover:bg-[rgba(255,170,0,0.08)]"
          >
            ± Movimiento de caja
          </button>

          <button
            onClick={() => {
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
                <span>Digital en pesos</span>
                <span>$ {fmt(totals.total_digital_uyu)}</span>
              </div>
              {totals.total_digital_brl > 0 && (
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Digital en reales (PIX)</span>
                  <span>R$ {fmtBRL(totals.total_digital_brl)}</span>
                </div>
              )}
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
              {(totals.total_entradas_uyu > 0 || totals.total_entradas_brl > 0) && (
                <div className="flex justify-between text-[var(--success)]">
                  <span>Entradas al local</span>
                  <span>
                    {totals.total_entradas_uyu > 0 && <>+ $ {fmt(totals.total_entradas_uyu)}</>}
                    {totals.total_entradas_uyu > 0 && totals.total_entradas_brl > 0 && " · "}
                    {totals.total_entradas_brl > 0 && <>+ R$ {fmtBRL(totals.total_entradas_brl)}</>}
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
                  {/* Fijo a la cuenta logueada, igual que en apertura — puede ser distinta
                      de quien abrió el turno (se entrega a otro cajero), pero siempre la
                      cuenta real de quien está cerrando ahora, no texto libre. */}
                  <div className="w-full bg-[var(--dark-bg)] border border-[var(--slate-gray)] rounded-lg px-4 py-3 text-[var(--text-primary)] flex items-center justify-between">
                    <span className="font-semibold">{username}</span>
                    <span className="text-xs text-[var(--text-muted)] uppercase">Tu cuenta</span>
                  </div>
                  {session.cajero !== username && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Turno abierto por <strong>{session.cajero}</strong> — vas a cerrarlo con tu cuenta.
                    </p>
                  )}
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
                    {faltaContado ? "Ingresá el efectivo contado para cerrar."
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
                    {/* Totales YA NETOS de anulaciones posteriores al cierre (B26).
                        El snapshot crudo es el arqueo de esa noche y no se toca; acá
                        se muestra lo que realmente quedó vendido. */}
                    <p className="font-bold neon-text-cyan">
                      $ {fmt((s.total_ventas ?? 0) - (s.ajuste_ventas_post_cierre ?? 0))}
                    </p>
                    {(s.cantidad_anuladas_post_cierre ?? 0) > 0 && (
                      <p className="text-[var(--warning)] text-xs">
                        {s.cantidad_anuladas_post_cierre} anulada
                        {s.cantidad_anuladas_post_cierre === 1 ? "" : "s"} tras el cierre · −${" "}
                        {fmt(s.ajuste_ventas_post_cierre ?? 0)}
                      </p>
                    )}
                    <p className="text-[var(--text-secondary)] text-xs">
                      $ {fmt((s.total_efectivo_uyu ?? 0) - (s.ajuste_efectivo_uyu_post_cierre ?? 0))} UYU
                    </p>
                    {(s.total_efectivo_brl ?? 0) !== 0 && (
                      <p className="text-[var(--text-secondary)] text-xs">
                        R$ {fmtBRL((s.total_efectivo_brl ?? 0) - (s.ajuste_efectivo_brl_post_cierre ?? 0))} BRL
                      </p>
                    )}
                    {(s.total_digital ?? 0) > 0 && (
                      <p className="text-[var(--text-secondary)] text-xs">
                        $ {fmt((s.total_digital ?? 0) - (s.ajuste_digital_post_cierre ?? 0))} dig
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
                    {((s.total_entradas_uyu ?? 0) > 0 || (s.total_entradas_brl ?? 0) > 0) && (
                      <p className="text-[var(--success)] text-xs">
                        Entradas:{" "}
                        {(s.total_entradas_uyu ?? 0) > 0 && <>$ {fmt(s.total_entradas_uyu ?? 0)}</>}
                        {(s.total_entradas_uyu ?? 0) > 0 && (s.total_entradas_brl ?? 0) > 0 && " · "}
                        {(s.total_entradas_brl ?? 0) > 0 && <>R$ {fmtBRL(s.total_entradas_brl ?? 0)}</>}
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

                {/* Panel de ventas del turno — solo admin */}
                {role === "admin" && (
                  <>
                    <button
                      onClick={() => handleToggleSession(s.id)}
                      className="mt-3 w-full text-xs uppercase tracking-wide text-[var(--text-secondary)] hover:text-[var(--neon-cyan)] transition-colors flex items-center justify-center gap-1.5 pt-3 border-t border-[var(--slate-gray)]"
                    >
                      <span>{expandedSessionId === s.id ? "▲ Ocultar ventas" : "▼ Ver ventas del turno"}</span>
                    </button>

                    {expandedSessionId === s.id && (
                      <div className="mt-3 bg-[var(--dark-bg)] rounded-lg border border-[var(--slate-gray)] overflow-hidden">
                        {loadingSessionSalesId === s.id ? (
                          <p className="text-xs text-[var(--text-secondary)] p-3 text-center animate-pulse">
                            Cargando ventas...
                          </p>
                        ) : !sessionSalesCache[s.id] || sessionSalesCache[s.id].length === 0 ? (
                          <p className="text-xs text-[var(--text-secondary)] p-3 text-center">
                            Sin ventas registradas en este turno.
                          </p>
                        ) : (
                          <div className="divide-y divide-[var(--slate-gray)] max-h-72 overflow-y-auto">
                            {sessionSalesCache[s.id].map((v) => (
                              <div
                                key={v.id}
                                className={`flex items-center justify-between gap-3 px-3 py-2 text-xs ${v.estado === "anulada" ? "opacity-40" : ""}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[var(--text-muted)] shrink-0">
                                    {new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit" }).format(new Date(v.fecha))}
                                  </span>
                                  <span className={`capitalize shrink-0 ${v.estado === "anulada" ? "text-[var(--error)]" : "text-[var(--text-secondary)]"}`}>
                                    {v.estado === "anulada" ? "❌ anulada" : v.metodo_pago}
                                  </span>
                                  {v.nota && (
                                    <span className="text-[var(--text-muted)] truncate italic">{v.nota}</span>
                                  )}
                                </div>
                                <span className="font-mono font-semibold shrink-0">
                                  <ImporteVenta
                                    sale={v}
                                    className={v.estado === "anulada" ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}
                                  />
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────── MODAL: MOVIMIENTO DE CAJA ──────── */}
      {showSalidaModal && session && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--deep-dark)] border border-[var(--warning)] rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold uppercase tracking-wide text-[var(--warning)]">
                Movimiento de caja
              </h2>
              <button
                onClick={() => setShowSalidaModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Plata que entra o sale de la caja durante el turno (proveedor, compra, devolución,
              etc.) y no es una venta. Ajusta el efectivo esperado en el arqueo.
            </p>
            <form onSubmit={handleRegistrarMovimiento} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm text-[var(--text-secondary)]">Tipo</label>
                <div className="flex rounded-lg border border-[var(--slate-gray)] overflow-hidden">
                  {(["entrada", "salida"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSalidaTipo(t)}
                      className={`flex-1 px-4 py-3 text-sm font-bold uppercase tracking-wide transition-all ${
                        salidaTipo === t
                          ? t === "entrada"
                            ? "bg-[var(--success)] text-[var(--deep-dark)]"
                            : "bg-[var(--warning)] text-[var(--deep-dark)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--warning)]"
                      }`}
                    >
                      {t === "entrada" ? "+ Entrada" : "− Salida"}
                    </button>
                  ))}
                </div>
              </div>
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
              {salidaTipo === "salida" && (
                <div className="space-y-1.5">
                  <label className="block text-sm text-[var(--text-secondary)]">Categoría</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIAS_SALIDA.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSalidaCategoria(c.id)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${
                          salidaCategoria === c.id
                            ? "bg-[var(--warning)] text-[var(--deep-dark)] border-[var(--warning)]"
                            : "border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--warning)] hover:text-[var(--warning)]"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-sm text-[var(--text-secondary)]">Motivo (obligatorio)</label>
                <input
                  type="text"
                  value={salidaMotivo}
                  onChange={(e) => setSalidaMotivo(e.target.value)}
                  placeholder={salidaTipo === "entrada" ? "Ej: devolución de un préstamo" : "Ej: pago al sodero"}
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

      {/* ──────── MODAL: ANULAR VENTA DEL TURNO ──────── */}
      {showCancelSaleId && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--deep-dark)] border border-[var(--error)] rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h2 className="font-bold uppercase tracking-wide text-[var(--error)]">
              ⚠️ Anular venta
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Se marca la venta como anulada y se devuelve el stock. No se puede deshacer.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowCancelSaleId(null)}
                disabled={cancelingSaleId === showCancelSaleId}
                className="flex-1 py-3 rounded-lg font-bold uppercase tracking-wide border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCancelSale(showCancelSaleId)}
                disabled={cancelingSaleId === showCancelSaleId}
                className="flex-1 py-3 rounded-lg font-bold uppercase tracking-wide transition-all border border-[var(--error)] text-[var(--error)] hover:bg-[rgba(255,59,59,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cancelingSaleId === showCancelSaleId ? "Anulando..." : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { supabase } from "@/lib/supabaseClient";
import type { CashSession, CashOutflow, CategoriaSalida } from "@/types";

export interface SessionTotals {
  total_ventas: number;
  total_efectivo_uyu: number;
  total_efectivo_brl: number; // en BRL (neto: pagado − vuelto en BRL)
  total_digital: number;
  cantidad_ventas: number;
  total_brl_en_uyu: number;   // cajón BRL valuado en UYU (Σ mov_brl × tasa) — para el invariante
  total_salidas_uyu: number;  // salidas del local en pesos durante el turno
  total_salidas_brl: number;  // salidas del local en reales durante el turno
  total_entradas_uyu: number; // entradas de plata al local en pesos durante el turno (B32)
  total_entradas_brl: number; // entradas de plata al local en reales durante el turno (B32)
}

/**
 * Devuelve la sesión abierta, o null si no hay ninguna.
 */
export async function getOpenSession(): Promise<CashSession | null> {
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("estado", "abierta")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as CashSession | null;
}

/**
 * Calcula los totales en tiempo real de las ventas activas de una sesión.
 * Devuelve ceros si todavía no hay ventas asociadas (paso 3.3 las vincula).
 */
export async function getSessionTotals(sessionId: string): Promise<SessionTotals> {
  const [salesRes, outflowsRes] = await Promise.all([
    supabase
      .from("sales")
      .select("total, metodo_pago, mov_efectivo_uyu, mov_efectivo_brl, tasa_cambio")
      .eq("session_id", sessionId)
      .eq("estado", "activa"),
    supabase
      .from("cash_outflows")
      .select("monto, moneda, tipo")
      .eq("session_id", sessionId),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (outflowsRes.error) throw new Error(outflowsRes.error.message);

  const sales = salesRes.data || [];
  const outflows = outflowsRes.data || [];

  const total_salidas_uyu = outflows
    .filter((o) => o.moneda === "UYU" && o.tipo === "salida")
    .reduce((sum, o) => sum + Number(o.monto || 0), 0);
  const total_salidas_brl = outflows
    .filter((o) => o.moneda === "BRL" && o.tipo === "salida")
    .reduce((sum, o) => sum + Number(o.monto || 0), 0);
  const total_entradas_uyu = outflows
    .filter((o) => o.moneda === "UYU" && o.tipo === "entrada")
    .reduce((sum, o) => sum + Number(o.monto || 0), 0);
  const total_entradas_brl = outflows
    .filter((o) => o.moneda === "BRL" && o.tipo === "entrada")
    .reduce((sum, o) => sum + Number(o.monto || 0), 0);

  const total_ventas = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);

  // Efectivo por cajón = movimiento físico neto (calculado por la DB). Ver B23/B24/B25.
  const total_efectivo_uyu = sales.reduce((sum, s) => sum + Number(s.mov_efectivo_uyu || 0), 0);
  const total_efectivo_brl = sales.reduce((sum, s) => sum + Number(s.mov_efectivo_brl || 0), 0);

  const total_digital = sales
    .filter((s) => s.metodo_pago !== "efectivo")
    .reduce((sum, s) => sum + Number(s.total || 0), 0);

  // Cajón BRL valuado en UYU, a la tasa de cada venta — para el invariante de consistencia.
  const total_brl_en_uyu = sales.reduce(
    (sum, s) => sum + Number(s.mov_efectivo_brl || 0) * Number(s.tasa_cambio || 0),
    0
  );

  return {
    total_ventas,
    total_efectivo_uyu,
    total_efectivo_brl,
    total_digital,
    cantidad_ventas: sales.length,
    total_brl_en_uyu,
    total_salidas_uyu,
    total_salidas_brl,
    total_entradas_uyu,
    total_entradas_brl,
  };
}

/**
 * Registra un movimiento de plata del local (entrada o salida) via RPC atómica.
 * La función SQL valida turno abierto, monto > 0, tipo y motivo no vacío. B32.
 * `categoria` es obligatoria para "salida" (la RPC cae a "otro" si no se manda) e
 * ignorada para "entrada".
 */
export async function registerCashMovement(
  sessionId: string,
  monto: number,
  moneda: "UYU" | "BRL",
  tipo: "entrada" | "salida",
  motivo: string,
  categoria?: CategoriaSalida
): Promise<void> {
  const { error } = await supabase.rpc("register_cash_movement", {
    p_session_id: sessionId,
    p_monto: monto,
    p_moneda: moneda,
    p_tipo: tipo,
    p_motivo: motivo.trim(),
    p_categoria: tipo === "salida" ? categoria ?? "otro" : null,
  });

  if (error) throw new Error(error.message);
}

/**
 * Salidas por categoría, agregadas por sesión (vista `cash_outflows_by_category`), para
 * un conjunto de sesiones. Usado por reportes para "ganancia real" y proyección de restock.
 */
export interface OutflowCategoryTotal {
  session_id: string;
  categoria: CategoriaSalida;
  moneda: "UYU" | "BRL";
  total: number;
}

export async function fetchOutflowsByCategory(sessionIds: string[]): Promise<OutflowCategoryTotal[]> {
  if (sessionIds.length === 0) return [];

  const { data, error } = await supabase
    .from("cash_outflows_by_category")
    .select("session_id, categoria, moneda, total")
    .eq("tipo", "salida")
    .in("session_id", sessionIds);

  if (error) throw new Error(error.message);
  return (data ?? []) as OutflowCategoryTotal[];
}

/**
 * Movimientos (entradas y salidas) de una sesión, más recientes primero.
 */
export async function fetchSessionOutflows(sessionId: string): Promise<CashOutflow[]> {
  const { data, error } = await supabase
    .from("cash_outflows")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CashOutflow[];
}

export interface MovimientoDetallado extends CashOutflow {
  cajero: string;
  apertura_turno: string;
}

/**
 * Movimientos (entradas y salidas) de TODOS los turnos en un rango de fechas, con el
 * cajero y la apertura del turno que los generó (join contra cash_sessions, ya que
 * cash_outflows no tiene columna cajero propia). Para la página de historial completo
 * ("Movimientos"), no para el turno activo (ver fetchSessionOutflows).
 */
export async function fetchMovimientosDetallados(desde: string, hasta: string): Promise<MovimientoDetallado[]> {
  const { data, error } = await supabase
    .from("cash_outflows")
    .select("*, cash_sessions(cajero, apertura_at)")
    .gte("created_at", desde)
    .lte("created_at", hasta)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    session_id: row.session_id,
    monto: row.monto,
    moneda: row.moneda,
    tipo: row.tipo,
    motivo: row.motivo,
    categoria: row.categoria,
    created_at: row.created_at,
    cajero: row.cash_sessions?.cajero ?? "Desconocido",
    apertura_turno: row.cash_sessions?.apertura_at ?? row.created_at,
  }));
}

/**
 * Abre una nueva sesión de caja.
 * Lanza error si ya hay una sesión abierta (enforced por idx_one_open_session).
 */
export async function openCashSession(
  cajero: string,
  monto_inicial: number,
  monto_inicial_brl: number
): Promise<CashSession> {
  const { data, error } = await supabase
    .from("cash_sessions")
    .insert({ cajero: cajero.trim(), monto_inicial, monto_inicial_brl })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as CashSession;
}

/**
 * Devuelve las últimas `limit` sesiones cerradas, ordenadas por cierre DESC.
 */
export async function getClosedSessions(limit = 10, userId?: string | null): Promise<CashSession[]> {
  let query = supabase
    .from("cash_sessions")
    .select("*")
    .eq("estado", "cerrada")
    .order("cierre_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data ?? []) as CashSession[];
}

/**
 * Cierra la sesión y graba el snapshot de totales via RPC atómica.
 */
export async function closeCashSession(
  sessionId: string,
  cerradoPor: string,
  notas: string | null,
  contadoUyu: number | null = null,
  contadoBrl: number | null = null
): Promise<void> {
  const { error } = await supabase.rpc("close_cash_session", {
    p_session_id: sessionId,
    p_cerrado_por: cerradoPor.trim(),
    p_notas: notas?.trim() || null,
    p_efectivo_contado_uyu: contadoUyu,
    p_efectivo_contado_brl: contadoBrl,
  });

  if (error) throw new Error(error.message);
}

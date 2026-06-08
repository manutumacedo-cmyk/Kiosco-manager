import { supabase } from "@/lib/supabaseClient";
import type { CashSession } from "@/types";

export interface SessionTotals {
  total_ventas: number;
  total_efectivo_uyu: number;
  total_efectivo_brl: number; // en BRL (neto: pagado − vuelto en BRL)
  total_digital: number;
  cantidad_ventas: number;
  total_brl_en_uyu: number;   // cajón BRL valuado en UYU (Σ mov_brl × tasa) — para el invariante
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
  const { data, error } = await supabase
    .from("sales")
    .select("total, metodo_pago, mov_efectivo_uyu, mov_efectivo_brl, tasa_cambio")
    .eq("session_id", sessionId)
    .eq("estado", "activa");

  if (error) throw new Error(error.message);

  const sales = data || [];

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
  };
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
export async function getClosedSessions(limit = 10): Promise<CashSession[]> {
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("estado", "cerrada")
    .order("cierre_at", { ascending: false })
    .limit(limit);

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

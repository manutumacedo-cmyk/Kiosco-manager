import { supabase } from "@/lib/supabaseClient";
import type { Sale } from "@/types";

/**
 * Crea una venta completa usando la función RPC atómica `create_sale_atomic`.
 * Todo ocurre en una sola transacción PostgreSQL: sale + items + stock.
 *
 * IMPORTANTE: Requiere ejecutar lib/sql/migrations.sql en Supabase SQL Editor.
 * Si la función RPC no existe, cae al fallback no-atómico.
 */
export async function createSale(params: {
  metodo_pago: string;
  total: number;
  nota: string | null;
  moneda: string;
  pagado: number | null;
  vuelto: number | null;
  vuelto_moneda?: 'UYU' | 'BRL' | null;
  tasa_cambio?: number | null;
  session_id?: string | null;
  /** Clave de idempotencia (B18): mismo valor en un reintento → el server dedupea. */
  client_request_id?: string | null;
  items: Array<{
    product_id: string;
    cantidad: number;
    precio_unitario: number;
    stock_actual: number;
  }>;
  combos?: Array<{
    combo_id: string;
    combo_nombre: string;
    cantidad: number;
    precio_unitario: number;
    costo_unitario: number;
  }>;
}): Promise<string> {
  // Intentar vía RPC atómica
  const { data, error } = await supabase.rpc("create_sale_atomic", {
    p_metodo_pago: params.metodo_pago,
    p_total: params.total,
    p_nota: params.nota,
    p_moneda: params.moneda,
    p_pagado: params.pagado,
    p_vuelto: params.vuelto,
    p_vuelto_moneda: params.vuelto_moneda ?? null,
    p_session_id: params.session_id ?? null,
    p_tasa_cambio: params.tasa_cambio ?? null,
    p_client_request_id: params.client_request_id ?? null,
    p_items: params.items.map((it) => ({
      product_id: it.product_id,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
    })),
  });

  // Sin fallback a propósito: el camino manual que había acá insertaba directo en
  // `sales` sin ninguno de los guards de la RPC — se saltaba la resolución de turno
  // (B27), la idempotencia (B18) y la atomicidad. Encima se disparaba con cualquier
  // error cuyo mensaje contuviera "function" y "does not exist", no solo con la RPC
  // ausente. Si la RPC no está, hay que arreglar la DB, no cobrar sin red.
  if (error) throw new Error(error.message);

  const saleId = data as string;

  // Guardar combos vendidos en sale_combos (para reportes).
  // upsert idempotente (B18): si esto es un reintento que devolvió una venta ya
  // existente, no duplica filas (unique sale_combos(sale_id, combo_id)).
  if (params.combos && params.combos.length > 0) {
    const { error: comboError } = await supabase.from("sale_combos").upsert(
      params.combos.map((c) => ({
        sale_id: saleId,
        combo_id: c.combo_id,
        combo_nombre: c.combo_nombre,
        cantidad: c.cantidad,
        precio_unitario: c.precio_unitario,
        costo_unitario: c.costo_unitario,
      })),
      { onConflict: "sale_id,combo_id", ignoreDuplicates: true }
    );

    // No se tira el error: la venta YA está cobrada y anularla por esto sería peor.
    // Pero tampoco se traga en silencio como antes (B37): sin estas filas, los
    // combos no cuentan en reportes ni en costos, y el margen queda inflado.
    if (comboError) {
      console.error("[createSale] venta", saleId, "guardada SIN combos:", comboError.message);
    }
  }

  return saleId;
}

export async function fetchTodaySales(): Promise<Sale[]> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("sales")
    .select("id,fecha,metodo_pago,total,nota,moneda,estado,created_at")
    .gte("fecha", start.toISOString())
    .lte("fecha", end.toISOString());

  if (error) throw new Error(error.message);
  return (data ?? []) as Sale[];
}

export interface CancelSaleResult {
  items_restored: number;
  /** true si la venta era de un turno ya cerrado y se acumuló un ajuste (B26). */
  ajuste_post_cierre: boolean;
}

/**
 * Cancela una venta y devuelve el stock de los productos usando la función RPC
 * atómica cancel_sale. Registra quién anuló (B30). Si el turno de la venta ya
 * estaba cerrado, la RPC acumula el ajuste en cash_sessions sin tocar el arqueo
 * original (B26) y lo informa en `ajuste_post_cierre`.
 */
export async function cancelSale(
  saleId: string,
  anuladaPor?: string | null
): Promise<CancelSaleResult> {
  const { data, error } = await supabase.rpc("cancel_sale", {
    p_sale_id: saleId,
    p_anulada_por: anuladaPor ?? null,
  });

  // Sin fallback a propósito: el camino manual que había acá no era atómico, no
  // acumulaba el ajuste post-cierre (B26) y llamaba a increment_stock con los
  // nombres de parámetro equivocados, así que dejaba la venta anulada y el stock
  // sin devolver. Si la RPC no está, hay que arreglar la DB — no descuadrar la
  // caja en silencio.
  if (error) throw new Error(error.message);

  return {
    items_restored: data?.items_restored ?? 0,
    ajuste_post_cierre: data?.ajuste_post_cierre ?? false,
  };
}

/**
 * Cancela una venta como cajero: solo si pertenece al turno actualmente abierto (B33).
 * La RPC `cancel_sale_own_turno` rechaza ventas de turnos ya cerrados.
 */
export async function cancelSaleOwnTurno(saleId: string, anuladaPor: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_sale_own_turno", {
    p_sale_id: saleId,
    p_anulada_por: anuladaPor,
  });

  if (error) throw new Error(error.message);
}

/**
 * Ventas (activas y anuladas) de una sesión de caja, más recientes primero.
 * Usado para que el cajero vea y pueda anular ventas de su turno abierto (B33).
 */
export async function fetchSalesBySession(sessionId: string): Promise<Sale[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("id,fecha,metodo_pago,total,nota,moneda,pagado,vuelto,vuelto_moneda,mov_efectivo_uyu,mov_efectivo_brl,estado,anulada_por,anulada_at,session_id,session_id_original,created_at")
    .eq("session_id", sessionId)
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Sale[];
}

/**
 * Obtiene ventas por rango de fechas con sus items
 */
export type SaleConItems = Sale & {
  items?: Array<{ product_id: string; cantidad: number; precio_unitario: number; nombre: string }>;
};

export async function fetchSalesByDateRange(
  startDate: Date,
  endDate: Date
): Promise<SaleConItems[]> {
  // Query 1: ventas + items sin join a products (no hay FK intencional — ver schema B2)
  const { data, error } = await supabase
    .from("sales")
    .select(`
      id,
      fecha,
      metodo_pago,
      total,
      nota,
      moneda,
      estado,
      anulada_por,
      anulada_at,
      session_id,
      session_id_original,
      created_at,
      sale_items (
        product_id,
        cantidad,
        precio_unitario
      )
    `)
    .gte("fecha", startDate.toISOString())
    .lte("fecha", endDate.toISOString())
    .order("fecha", { ascending: false });

  if (error) throw new Error(`Error obteniendo ventas: ${error.message}`);

  return hidratarItems(data);
}

/**
 * Ventas de UN TURNO, con items. El turno es la unidad real de la operación: la
 * jornada cruza la medianoche, así que filtrar por fecha de calendario la parte
 * al medio (B1/B27). Incluye las ventas reasignadas desde un turno cerrado.
 */
export async function fetchSalesBySessionWithItems(
  sessionId: string
): Promise<SaleConItems[]> {
  const { data, error } = await supabase
    .from("sales")
    .select(`
      id,
      fecha,
      metodo_pago,
      total,
      nota,
      moneda,
      estado,
      anulada_por,
      anulada_at,
      session_id,
      session_id_original,
      created_at,
      sale_items (
        product_id,
        cantidad,
        precio_unitario
      )
    `)
    .eq("session_id", sessionId)
    .order("fecha", { ascending: false });

  if (error) throw new Error(`Error obteniendo ventas del turno: ${error.message}`);

  return hidratarItems(data);
}

/**
 * Resuelve los nombres de producto en TypeScript en vez de con un join: sale_items
 * no tiene FK a products a propósito (las líneas de combo referencian el id del
 * combo, ver B2), así que esos ids no matchean y quedan como "Producto eliminado".
 */
async function hidratarItems(data: any): Promise<SaleConItems[]> {
  const productIds = [...new Set(
    (data || []).flatMap((s: any) => (s.sale_items || []).map((i: any) => i.product_id as string))
  )];
  const { data: productsData } = productIds.length > 0
    ? await supabase.from("products").select("id, nombre").in("id", productIds)
    : { data: [] };
  const productMap = new Map((productsData || []).map((p: any) => [p.id as string, p.nombre as string]));

  return (data || []).map((sale: any) => ({
    id: sale.id,
    fecha: sale.fecha,
    metodo_pago: sale.metodo_pago,
    total: sale.total,
    nota: sale.nota,
    moneda: sale.moneda,
    pagado: sale.pagado ?? null,
    vuelto: sale.vuelto ?? null,
    vuelto_moneda: sale.vuelto_moneda ?? null,
    estado: sale.estado || "activa",
    anulada_por: sale.anulada_por ?? null,
    anulada_at: sale.anulada_at ?? null,
    session_id: sale.session_id ?? null,
    session_id_original: sale.session_id_original ?? null,
    created_at: sale.created_at,
    items: sale.sale_items?.map((item: any) => ({
      product_id: item.product_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      nombre: productMap.get(item.product_id) ?? "Producto eliminado",
    })),
  }));
}

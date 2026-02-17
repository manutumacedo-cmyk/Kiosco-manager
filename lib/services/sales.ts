import { supabase } from "@/lib/supabaseClient";
import type { Sale } from "@/types";
import { generatePostSaleInsights } from "./strategicInsights";

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
  items: Array<{
    product_id: string;
    cantidad: number;
    precio_unitario: number;
    stock_actual: number;
  }>;
}): Promise<string> {
  // Intentar vía RPC atómica
  const { data, error } = await supabase.rpc("create_sale_atomic", {
    p_metodo_pago: params.metodo_pago,
    p_total: params.total,
    p_nota: params.nota,
    p_items: params.items.map((it) => ({
      product_id: it.product_id,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
    })),
  });

  if (error) {
    // Si la función no existe, fallback al método no-atómico
    if (error.message.includes("function") && error.message.includes("does not exist")) {
      return createSaleFallback(params);
    }
    throw new Error(error.message);
  }

  const saleId = data as string;

  // 🔥 HOOK POST-VENTA: Motor de Inteligencia Estratégica
  generatePostSaleInsights({
    sale_id: saleId,
    items: params.items,
    total: params.total,
    fecha: new Date(),
  }).catch(err => {
    console.error('[Post-Sale Hook] Error generando insights:', err);
    // No lanzar error para no afectar la venta
  });

  return saleId;
}

/** Fallback no-atómico (para cuando la función RPC no está creada aún) */
async function createSaleFallback(params: {
  metodo_pago: string;
  total: number;
  nota: string | null;
  items: Array<{
    product_id: string;
    cantidad: number;
    precio_unitario: number;
    stock_actual: number;
  }>;
}): Promise<string> {
  const { data: sale, error: e1 } = await supabase
    .from("sales")
    .insert({
      metodo_pago: params.metodo_pago,
      total: params.total,
      nota: params.nota,
    })
    .select("id")
    .single();

  if (e1) throw new Error(e1.message);
  const sale_id = sale.id as string;

  const { error: e2 } = await supabase.from("sale_items").insert(
    params.items.map((it) => ({
      sale_id,
      product_id: it.product_id,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
    }))
  );

  if (e2) throw new Error(e2.message);

  for (const it of params.items) {
    const nuevo = Math.max(0, it.stock_actual - it.cantidad);
    const { error: e3 } = await supabase
      .from("products")
      .update({ stock: nuevo })
      .eq("id", it.product_id);

    if (e3) throw new Error(e3.message);
  }

  // 🔥 HOOK POST-VENTA: Motor de Inteligencia Estratégica
  generatePostSaleInsights({
    sale_id,
    items: params.items,
    total: params.total,
    fecha: new Date(),
  }).catch(err => {
    console.error('[Post-Sale Hook] Error generando insights:', err);
  });

  return sale_id;
}

export async function fetchTodaySales(): Promise<Sale[]> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("sales")
    .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
    .gte("fecha", start.toISOString())
    .lte("fecha", end.toISOString());

  if (error) throw new Error(error.message);
  return (data ?? []) as Sale[];
}

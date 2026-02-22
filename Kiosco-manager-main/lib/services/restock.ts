import { supabase } from "@/lib/supabaseClient";
import type { RestockSource } from "@/types";

export async function fetchSourcesForProduct(
  productId: string
): Promise<RestockSource[]> {
  const { data, error } = await supabase
    .from("restock_sources")
    .select(
      "id,product_id,lugar,precio_compra,moneda,presentacion,contacto,url,notas,created_at"
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as RestockSource[];
}

export async function createSource(source: {
  product_id: string;
  lugar: string;
  precio_compra: number;
  moneda: string;
  presentacion: string | null;
  contacto: string | null;
  url: string | null;
  notas: string | null;
}): Promise<void> {
  const { error } = await supabase.from("restock_sources").insert(source);
  if (error) throw new Error(error.message);
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase
    .from("restock_sources")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Registra una compra de reposición y suma stock al producto.
 * Usa RPC `increment_stock` para actualización atómica.
 *
 * IMPORTANTE: Requiere ejecutar lib/sql/migrations.sql en Supabase SQL Editor.
 * Si la función RPC no existe, cae al fallback no-atómico.
 */
export async function registerPurchase(params: {
  product_id: string;
  source_id: string;
  cantidad: number;
  precio_unitario: number;
  moneda: string;
  costo_total: number;
  notas: string | null;
}): Promise<void> {
  // 1) Insertar compra
  const { error: insErr } = await supabase
    .from("restock_purchases")
    .insert(params);
  if (insErr) throw new Error(insErr.message);

  // 2) Incrementar stock atómicamente via RPC
  const { error: rpcErr } = await supabase.rpc("increment_stock", {
    p_product_id: params.product_id,
    p_cantidad: params.cantidad,
  });

  if (rpcErr) {
    // Fallback si la función no existe
    if (rpcErr.message.includes("function") && rpcErr.message.includes("does not exist")) {
      await incrementStockFallback(params.product_id, params.cantidad);
      return;
    }
    throw new Error(rpcErr.message);
  }
}

/** Fallback no-atómico (para cuando la función RPC no está creada aún) */
async function incrementStockFallback(
  productId: string,
  cantidad: number
): Promise<void> {
  const { data: cur, error: readErr } = await supabase
    .from("products")
    .select("stock")
    .eq("id", productId)
    .single();
  if (readErr) throw new Error(readErr.message);

  const currentStock = Number(cur?.stock ?? 0);

  const { error: updErr } = await supabase
    .from("products")
    .update({ stock: currentStock + cantidad })
    .eq("id", productId);
  if (updErr) throw new Error(updErr.message);
}

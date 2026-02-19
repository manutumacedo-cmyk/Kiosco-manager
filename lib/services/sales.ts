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
    .select("id,fecha,metodo_pago,total,nota,moneda,estado,created_at")
    .gte("fecha", start.toISOString())
    .lte("fecha", end.toISOString());

  if (error) throw new Error(error.message);
  return (data ?? []) as Sale[];
}

/**
 * Cancela una venta y devuelve el stock de los productos
 * usando la función RPC atómica cancel_sale
 */
export async function cancelSale(saleId: string): Promise<void> {
  const { data, error } = await supabase.rpc("cancel_sale", {
    p_sale_id: saleId,
  });

  if (error) {
    // Si la función RPC no existe, usar fallback manual
    if (error.message.includes("function") && error.message.includes("does not exist")) {
      return cancelSaleFallback(saleId);
    }
    throw new Error(error.message);
  }

  // Log de éxito
  console.log("[cancelSale] Venta anulada:", data);
}

/**
 * Fallback manual para cancelar venta (sin RPC)
 * IMPORTANTE: No es atómico, puede tener race conditions
 */
async function cancelSaleFallback(saleId: string): Promise<void> {
  // 1. Verificar que la venta existe y está activa
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("id, estado")
    .eq("id", saleId)
    .single();

  if (saleError) throw new Error(`Venta no encontrada: ${saleError.message}`);
  if (sale.estado === "anulada") throw new Error("La venta ya está anulada");

  // 2. Obtener items de la venta
  const { data: items, error: itemsError } = await supabase
    .from("sale_items")
    .select("product_id, cantidad")
    .eq("sale_id", saleId);

  if (itemsError) throw new Error(`Error obteniendo items: ${itemsError.message}`);

  // 3. Marcar venta como anulada
  const { error: updateError } = await supabase
    .from("sales")
    .update({ estado: "anulada" })
    .eq("id", saleId);

  if (updateError) throw new Error(`Error anulando venta: ${updateError.message}`);

  // 4. Devolver stock de cada producto
  for (const item of items || []) {
    const { error: stockError } = await supabase.rpc("increment_stock", {
      product_id: item.product_id,
      quantity: item.cantidad,
    });

    // Si no existe la función RPC, usar update directo
    if (stockError && stockError.message.includes("does not exist")) {
      const { data: product } = await supabase
        .from("products")
        .select("stock")
        .eq("id", item.product_id)
        .single();

      if (product) {
        await supabase
          .from("products")
          .update({ stock: product.stock + item.cantidad })
          .eq("id", item.product_id);
      }
    } else if (stockError) {
      console.error(`Error restaurando stock de ${item.product_id}:`, stockError);
    }
  }
}

/**
 * Obtiene ventas por rango de fechas con sus items
 */
export async function fetchSalesByDateRange(
  startDate: Date,
  endDate: Date
): Promise<Array<Sale & { items?: Array<{ product_id: string; cantidad: number; precio_unitario: number; nombre: string }> }>> {
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
      created_at,
      sale_items (
        product_id,
        cantidad,
        precio_unitario,
        products (
          nombre
        )
      )
    `)
    .gte("fecha", startDate.toISOString())
    .lte("fecha", endDate.toISOString())
    .order("fecha", { ascending: false });

  if (error) throw new Error(`Error obteniendo ventas: ${error.message}`);

  // Transformar datos
  return (data || []).map((sale: any) => ({
    id: sale.id,
    fecha: sale.fecha,
    metodo_pago: sale.metodo_pago,
    total: sale.total,
    nota: sale.nota,
    moneda: sale.moneda,
    estado: sale.estado || "activa",
    created_at: sale.created_at,
    items: sale.sale_items?.map((item: any) => ({
      product_id: item.product_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      nombre: item.products?.nombre || "Producto eliminado",
    })),
  }));
}

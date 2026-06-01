import { supabase } from "@/lib/supabaseClient";
import type { Sale, SaleItemWithProduct, Product } from "@/types";

export interface SaleWithItems extends Sale {
  sale_items?: Array<{
    product_id: string;
    cantidad: number;
    precio_unitario: number;
    nombre: string;
  }>;
}

export interface ComboSaleData {
  combo_id: string;
  combo_nombre: string;
  cantidad: number;
  precio_unitario: number;
  costo_unitario: number;
}

export interface TodayReport {
  sales: Sale[];
  items: SaleItemWithProduct[];
  alertas: Product[];
  salesWithItems: SaleWithItems[];
  comboItems: ComboSaleData[];
}

export interface PeriodReport {
  sales: Sale[];
  items: SaleItemWithProduct[];
  products: Product[];
  comboItems: ComboSaleData[];
}

export async function fetchTodayReport(): Promise<TodayReport> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const [s1, s2, s3, s4, s5] = await Promise.all([
    supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
      .gte("fecha", start.toISOString())
      .lte("fecha", end.toISOString())
      .eq("estado", "activa")
      .order("fecha", { ascending: false }),
    supabase
      .from("sale_items")
      .select("product_id, cantidad, precio_unitario, sales!inner(estado)")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .eq("sales.estado", "activa"),
    supabase
      .from("products")
      .select("id,nombre,categoria,stock,stock_minimo,activo,precio,costo,created_at")
      .eq("activo", true),
    supabase
      .from("sales")
      .select(`
        id,
        fecha,
        metodo_pago,
        total,
        nota,
        moneda,
        created_at,
        sale_items(product_id, cantidad, precio_unitario)
      `)
      .gte("fecha", start.toISOString())
      .lte("fecha", end.toISOString())
      .eq("estado", "activa")
      .order("fecha", { ascending: false }),
    supabase
      .from("sale_combos")
      .select("combo_id, combo_nombre, cantidad, precio_unitario, costo_unitario, sales!inner(estado)")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .eq("sales.estado", "activa"),
  ]);

  if (s1.error) throw new Error(s1.error.message);
  if (s2.error) throw new Error(s2.error.message);
  if (s3.error) throw new Error(s3.error.message);
  if (s4.error) throw new Error(s4.error.message);
  if (s5.error) throw new Error(s5.error.message);

  const sales = (s1.data ?? []) as Sale[];
  const products = (s3.data ?? []) as Product[];
  const prodMap = new Map(products.map(p => [p.id, { nombre: p.nombre, costo: p.costo }]));
  const rawItems = (s2.data ?? []) as Array<{ product_id: string; cantidad: number; precio_unitario: number }>;
  const items: SaleItemWithProduct[] = rawItems.map(it => ({
    product_id: it.product_id,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    products: prodMap.get(it.product_id) ?? null,
  }));
  const alertas = products.filter((p) => p.stock <= p.stock_minimo);
  const rawSalesWithItems = (s4.data ?? []) as any[];
  const salesWithItems: SaleWithItems[] = rawSalesWithItems.map((sale: any) => ({
    ...sale,
    sale_items: (sale.sale_items || []).map((item: any) => ({
      product_id: item.product_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      nombre: prodMap.get(item.product_id)?.nombre ?? 'Desconocido',
    })),
  }));
  const comboItems = (s5.data ?? []) as ComboSaleData[];

  return { sales, items, alertas, salesWithItems, comboItems };
}

/**
 * Obtiene reporte de la semana actual (últimos 7 días)
 */
export async function fetchWeeklyReport(): Promise<PeriodReport> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const [s1, s2, s3, s4] = await Promise.all([
    supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
      .gte("fecha", start.toISOString())
      .lte("fecha", end.toISOString())
      .eq("estado", "activa")
      .order("fecha", { ascending: false }),
    supabase
      .from("sale_items")
      .select("product_id, cantidad, precio_unitario, sales!inner(estado)")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .eq("sales.estado", "activa"),
    supabase
      .from("products")
      .select("id,nombre,categoria,stock,stock_minimo,activo,precio,costo,created_at")
      .eq("activo", true),
    supabase
      .from("sale_combos")
      .select("combo_id, combo_nombre, cantidad, precio_unitario, costo_unitario, sales!inner(estado)")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .eq("sales.estado", "activa"),
  ]);

  if (s1.error) throw new Error(s1.error.message);
  if (s2.error) throw new Error(s2.error.message);
  if (s3.error) throw new Error(s3.error.message);
  if (s4.error) throw new Error(s4.error.message);

  const products = (s3.data ?? []) as Product[];
  const prodMap = new Map(products.map(p => [p.id, { nombre: p.nombre, costo: p.costo }]));
  const rawItems = (s2.data ?? []) as Array<{ product_id: string; cantidad: number; precio_unitario: number }>;
  const items: SaleItemWithProduct[] = rawItems.map(it => ({
    product_id: it.product_id,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    products: prodMap.get(it.product_id) ?? null,
  }));

  return {
    sales: (s1.data ?? []) as Sale[],
    items,
    products,
    comboItems: (s4.data ?? []) as ComboSaleData[],
  };
}

/**
 * Obtiene reporte del mes actual
 */
export async function fetchMonthlyReport(): Promise<PeriodReport> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const [s1, s2, s3, s4] = await Promise.all([
    supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
      .gte("fecha", start.toISOString())
      .lte("fecha", end.toISOString())
      .eq("estado", "activa")
      .order("fecha", { ascending: false }),
    supabase
      .from("sale_items")
      .select("sale_id, product_id, cantidad, precio_unitario, sales!inner(estado)")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .eq("sales.estado", "activa"),
    supabase
      .from("products")
      .select("id,nombre,categoria,stock,stock_minimo,activo,precio,costo,created_at")
      .eq("activo", true),
    supabase
      .from("sale_combos")
      .select("combo_id, combo_nombre, cantidad, precio_unitario, costo_unitario, sales!inner(estado)")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .eq("sales.estado", "activa"),
  ]);

  if (s1.error) throw new Error(s1.error.message);
  if (s2.error) throw new Error(s2.error.message);
  if (s3.error) throw new Error(s3.error.message);
  if (s4.error) throw new Error(s4.error.message);

  const products = (s3.data ?? []) as Product[];
  const prodMap = new Map(products.map(p => [p.id, { nombre: p.nombre, costo: p.costo }]));
  const rawItems = (s2.data ?? []) as Array<{ sale_id: string; product_id: string; cantidad: number; precio_unitario: number }>;
  const items: SaleItemWithProduct[] = rawItems.map(it => ({
    product_id: it.product_id,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    products: prodMap.get(it.product_id) ?? null,
  }));

  return {
    sales: (s1.data ?? []) as Sale[],
    items,
    products,
    comboItems: (s4.data ?? []) as ComboSaleData[],
  };
}

import { supabase } from "@/lib/supabaseClient";
import type { Sale, SaleItemWithProduct, Product } from "@/types";

export interface SaleWithItems extends Sale {
  sale_items?: Array<{
    cantidad: number;
    precio_unitario: number;
    products: { nombre: string } | { nombre: string }[] | null;
  }>;
}

export interface TodayReport {
  sales: Sale[];
  items: SaleItemWithProduct[];
  alertas: Product[];
  salesWithItems: SaleWithItems[]; // Ventas con items para tabla detallada
}

export interface PeriodReport {
  sales: Sale[];
  items: SaleItemWithProduct[];
  products: Product[];
}

export async function fetchTodayReport(): Promise<TodayReport> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const [s1, s2, s3, s4] = await Promise.all([
    supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
      .gte("fecha", start.toISOString())
      .lte("fecha", end.toISOString())
      .order("fecha", { ascending: false }),
    supabase
      .from("sale_items")
      .select("cantidad, precio_unitario, products(nombre, costo)")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString()),
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
        sale_items(cantidad, precio_unitario, products(nombre))
      `)
      .gte("fecha", start.toISOString())
      .lte("fecha", end.toISOString())
      .order("fecha", { ascending: false }),
  ]);

  if (s1.error) throw new Error(s1.error.message);
  if (s2.error) throw new Error(s2.error.message);
  if (s3.error) throw new Error(s3.error.message);
  if (s4.error) throw new Error(s4.error.message);

  const sales = (s1.data ?? []) as Sale[];
  const items = (s2.data ?? []) as SaleItemWithProduct[];
  const products = (s3.data ?? []) as Product[];
  const alertas = products.filter((p) => p.stock <= p.stock_minimo);
  const salesWithItems = (s4.data ?? []) as SaleWithItems[];

  return { sales, items, alertas, salesWithItems };
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

  const [s1, s2, s3] = await Promise.all([
    supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
      .gte("fecha", start.toISOString())
      .lte("fecha", end.toISOString())
      .order("fecha", { ascending: false }),
    supabase
      .from("sale_items")
      .select("cantidad, precio_unitario, products(nombre, costo)")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString()),
    supabase
      .from("products")
      .select("id,nombre,categoria,stock,stock_minimo,activo,precio,costo,created_at")
      .eq("activo", true),
  ]);

  if (s1.error) throw new Error(s1.error.message);
  if (s2.error) throw new Error(s2.error.message);
  if (s3.error) throw new Error(s3.error.message);

  return {
    sales: (s1.data ?? []) as Sale[],
    items: (s2.data ?? []) as SaleItemWithProduct[],
    products: (s3.data ?? []) as Product[],
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

  const [s1, s2, s3] = await Promise.all([
    supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
      .gte("fecha", start.toISOString())
      .lte("fecha", end.toISOString())
      .order("fecha", { ascending: false }),
    supabase
      .from("sale_items")
      .select("cantidad, precio_unitario, sale_id, product_id, products(nombre, costo, precio)")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString()),
    supabase
      .from("products")
      .select("id,nombre,categoria,stock,stock_minimo,activo,precio,costo,created_at")
      .eq("activo", true),
  ]);

  if (s1.error) throw new Error(s1.error.message);
  if (s2.error) throw new Error(s2.error.message);
  if (s3.error) throw new Error(s3.error.message);

  return {
    sales: (s1.data ?? []) as Sale[],
    items: (s2.data ?? []) as SaleItemWithProduct[],
    products: (s3.data ?? []) as Product[],
  };
}

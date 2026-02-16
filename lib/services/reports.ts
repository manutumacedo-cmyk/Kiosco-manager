import { supabase } from "@/lib/supabaseClient";
import type { Sale, SaleItemWithProduct, Product } from "@/types";

export interface TodayReport {
  sales: Sale[];
  items: SaleItemWithProduct[];
  alertas: Product[];
}

export async function fetchTodayReport(): Promise<TodayReport> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const [s1, s2, s3] = await Promise.all([
    supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
      .gte("fecha", start.toISOString())
      .lte("fecha", end.toISOString()),
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

  const sales = (s1.data ?? []) as Sale[];
  const items = (s2.data ?? []) as SaleItemWithProduct[];
  const products = (s3.data ?? []) as Product[];
  const alertas = products.filter((p) => p.stock <= p.stock_minimo);

  return { sales, items, alertas };
}

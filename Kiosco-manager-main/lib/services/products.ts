import { supabase } from "@/lib/supabaseClient";
import type { Product } from "@/types";

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id,nombre,categoria,precio,costo,stock,stock_minimo,activo")
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export async function fetchActiveProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id,nombre,categoria,precio,costo,stock,stock_minimo,activo")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export async function createProduct(p: {
  nombre: string;
  categoria: string | null;
  precio: number;
  costo: number;
  stock: number;
  stock_minimo: number;
}): Promise<void> {
  const { error } = await supabase.from("products").insert({
    nombre: p.nombre,
    categoria: p.categoria,
    precio: p.precio,
    costo: p.costo,
    stock: p.stock,
    stock_minimo: p.stock_minimo,
    activo: true,
  });
  if (error) throw new Error(error.message);
}

export async function updateProduct(
  id: string,
  fields: { precio?: number; costo?: number; stock?: number; stock_minimo?: number; categoria?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

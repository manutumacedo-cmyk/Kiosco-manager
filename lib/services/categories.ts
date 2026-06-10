import { supabase } from "@/lib/supabaseClient";

export async function fetchCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("nombre")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.nombre as string);
}

export async function createCategory(nombre: string): Promise<void> {
  const { error } = await supabase
    .from("categories")
    .insert({ nombre: nombre.trim() });
  if (error) throw new Error(error.message);
}

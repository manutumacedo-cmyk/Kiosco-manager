import { supabase } from "@/lib/supabaseClient";
import type { Combo, ComboItem, ComboWithProducts, ExchangeRateConfig } from "@/types";

// ========== COMBOS ==========

/**
 * Obtiene todos los combos activos con sus productos
 */
export async function fetchActiveCombos(): Promise<ComboWithProducts[]> {
  const { data, error } = await supabase
    .from("combos_with_products")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  if (error) throw new Error(error.message);
  return (data ?? []) as ComboWithProducts[];
}

/**
 * Obtiene todos los combos (incluye inactivos)
 */
export async function fetchAllCombos(): Promise<ComboWithProducts[]> {
  const { data, error } = await supabase
    .from("combos_with_products")
    .select("*")
    .order("nombre");

  if (error) throw new Error(error.message);
  return (data ?? []) as ComboWithProducts[];
}

/**
 * Crea un combo nuevo
 */
export async function createCombo(params: {
  nombre: string;
  descripcion: string | null;
  precio: number;
  items: Array<{ product_id: string; cantidad: number }>;
}): Promise<string> {
  // 1. Crear el combo
  const { data: combo, error: e1 } = await supabase
    .from("combos")
    .insert({
      nombre: params.nombre,
      descripcion: params.descripcion,
      precio: params.precio,
      activo: true,
    })
    .select("id")
    .single();

  if (e1) throw new Error(e1.message);
  const combo_id = combo.id as string;

  // 2. Insertar los items del combo
  const { error: e2 } = await supabase.from("combo_items").insert(
    params.items.map((it) => ({
      combo_id,
      product_id: it.product_id,
      cantidad: it.cantidad,
    }))
  );

  if (e2) throw new Error(e2.message);

  return combo_id;
}

/**
 * Actualiza un combo existente
 */
export async function updateCombo(params: {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  activo: boolean;
  items: Array<{ product_id: string; cantidad: number }>;
}): Promise<void> {
  // 1. Actualizar el combo
  const { error: e1 } = await supabase
    .from("combos")
    .update({
      nombre: params.nombre,
      descripcion: params.descripcion,
      precio: params.precio,
      activo: params.activo,
    })
    .eq("id", params.id);

  if (e1) throw new Error(e1.message);

  // 2. Eliminar items antiguos
  const { error: e2 } = await supabase
    .from("combo_items")
    .delete()
    .eq("combo_id", params.id);

  if (e2) throw new Error(e2.message);

  // 3. Insertar nuevos items
  if (params.items.length > 0) {
    const { error: e3 } = await supabase.from("combo_items").insert(
      params.items.map((it) => ({
        combo_id: params.id,
        product_id: it.product_id,
        cantidad: it.cantidad,
      }))
    );

    if (e3) throw new Error(e3.message);
  }
}

/**
 * Elimina un combo (soft delete - marca como inactivo)
 */
export async function deleteCombo(id: string): Promise<void> {
  const { error } = await supabase
    .from("combos")
    .update({ activo: false })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

// ========== TASAS DE CAMBIO ==========

/**
 * Obtiene la tasa de cambio configurada (BRL -> UYU)
 */
export async function getExchangeRate(): Promise<number> {
  const { data, error } = await supabase
    .from("exchange_rate_config")
    .select("rate")
    .eq("currency_from", "BRL")
    .eq("currency_to", "UYU")
    .single();

  if (error) throw new Error(error.message);
  return data.rate;
}

/**
 * Actualiza la tasa de cambio BRL -> UYU
 */
export async function updateExchangeRate(rate: number): Promise<void> {
  const { error } = await supabase
    .from("exchange_rate_config")
    .upsert(
      {
        currency_from: "BRL",
        currency_to: "UYU",
        rate,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "currency_from,currency_to",
      }
    );

  if (error) throw new Error(error.message);
}

/**
 * Convierte un monto de BRL a UYU usando la tasa configurada
 */
export async function convertBRLtoUYU(amountBRL: number): Promise<number> {
  const rate = await getExchangeRate();
  return amountBRL * rate;
}

import { supabase } from "@/lib/supabaseClient";

/**
 * Un producto a costear, con cuánto factura para poder priorizarlo.
 *
 * El orden importa más que la lista completa: la categoría "Vasos" son 11
 * productos sin costo que representan el 67% de la facturación. Cargar esos once
 * ya hace que los márgenes del sistema sirvan (B39).
 */
export interface ProductoParaCostear {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  costo: number | null;
  costo_botella: number | null;
  porciones_por_botella: number | null;
  unidades_vendidas: number;
  facturado: number;
}

export async function fetchProductosParaCostear(dias = 30): Promise<ProductoParaCostear[]> {
  const { data, error } = await supabase.rpc("productos_para_costear", { p_dias: dias });
  if (error) throw new Error(error.message);

  return ((data ?? []) as ProductoParaCostear[]).map((p) => ({
    ...p,
    precio: Number(p.precio ?? 0),
    costo: p.costo == null ? null : Number(p.costo),
    costo_botella: p.costo_botella == null ? null : Number(p.costo_botella),
    unidades_vendidas: Number(p.unidades_vendidas ?? 0),
    facturado: Number(p.facturado ?? 0),
  }));
}

export interface CostoAGuardar {
  id: string;
  costo: number;
  /** Solo para tragos servidos de botella; null si el costo se cargó directo. */
  costo_botella: number | null;
  porciones_por_botella: number | null;
}

/**
 * Guarda varios costos de una. Va de a uno porque son pocos productos por tanda
 * y así un error en uno no tira abajo el resto de la carga.
 */
export async function guardarCostos(
  costos: CostoAGuardar[]
): Promise<{ guardados: number; errores: string[] }> {
  const errores: string[] = [];
  let guardados = 0;

  for (const c of costos) {
    const { error } = await supabase
      .from("products")
      .update({
        costo: c.costo,
        costo_botella: c.costo_botella,
        porciones_por_botella: c.porciones_por_botella,
        costo_actualizado_at: new Date().toISOString(),
      })
      .eq("id", c.id);

    if (error) errores.push(`${c.id}: ${error.message}`);
    else guardados++;
  }

  return { guardados, errores };
}

/** Costo unitario a partir de la botella. null si los datos no alcanzan. */
export function costoPorPorcion(
  costoBotella: number | null,
  porciones: number | null
): number | null {
  if (!costoBotella || !porciones || porciones <= 0) return null;
  return costoBotella / porciones;
}

export interface ResumenCobertura {
  totalProductos: number;
  sinCosto: number;
  facturadoTotal: number;
  facturadoSinCosto: number;
  /** Porción de la facturación que ya tiene costo conocido (0..1). */
  cobertura: number;
}

export function calcularCobertura(productos: ProductoParaCostear[]): ResumenCobertura {
  const facturadoTotal = productos.reduce((a, p) => a + p.facturado, 0);
  const sinCostoList = productos.filter((p) => !p.costo);
  const facturadoSinCosto = sinCostoList.reduce((a, p) => a + p.facturado, 0);

  return {
    totalProductos: productos.length,
    sinCosto: sinCostoList.length,
    facturadoTotal,
    facturadoSinCosto,
    cobertura: facturadoTotal > 0 ? 1 - facturadoSinCosto / facturadoTotal : 1,
  };
}

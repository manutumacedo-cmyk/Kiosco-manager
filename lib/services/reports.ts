import { supabase } from "@/lib/supabaseClient";
import type { Sale, SaleItemWithProduct, Product, CategoriaSalida } from "@/types";
import { getOpenSession, getClosedSessions, fetchOutflowsByCategory, type OutflowCategoryTotal } from "./cashSessions";

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
  /** Salidas/entradas de caja del turno, agregadas por categoría (vista cash_outflows_by_category). */
  outflows: OutflowCategoryTotal[];
}

export interface PeriodReport {
  sales: Sale[];
  items: SaleItemWithProduct[];
  products: Product[];
  comboItems: ComboSaleData[];
  /** Productos (nombres) agrupados por ticket, para análisis de co-ocurrencia (combos reales). */
  itemsBySale: Map<string, string[]>;
  /** Costo total de items por venta (sale_id → costo), para filtrar Ganancia/Costos por método de pago. */
  costoPorVenta: Map<string, number>;
  /** Salidas/entradas de caja del período, agregadas por categoría (vista cash_outflows_by_category). */
  outflows: OutflowCategoryTotal[];
}

/**
 * "Ganancia real" = ingresos − costo de mercadería − salidas de caja en UYU (restock,
 * pagos a proveedores, gastos personales, etc.). Las salidas en BRL se informan aparte
 * SIN netear contra la ganancia en pesos: `cash_outflows` no guarda la tasa de cambio del
 * momento (a diferencia de `sales`, que sí la tiene por venta), así que convertir
 * inventaría un tipo de cambio que no se registró — mejor mostrarlo separado que fabricar
 * un número. Las "entradas" (plata que no es venta, ej. devolución de un préstamo) tampoco
 * se suman: no son ganancia, son un movimiento de caja informativo aparte.
 */
export interface GananciaReal {
  ingresos: number;
  costoMercaderia: number;
  salidasPorCategoria: Record<CategoriaSalida, number>; // en UYU
  totalSalidasUyu: number;
  totalSalidasBrl: number; // informativo, no restado (ver nota arriba)
  gananciaReal: number;
  margenPorcentaje: number;
}

export function calcularGananciaReal(
  ingresos: number,
  costoMercaderia: number,
  outflows: OutflowCategoryTotal[]
): GananciaReal {
  const salidasPorCategoria: Record<CategoriaSalida, number> = {
    restock: 0,
    proveedor: 0,
    gasto_personal: 0,
    otro: 0,
  };
  let totalSalidasUyu = 0;
  let totalSalidasBrl = 0;

  for (const o of outflows) {
    if (o.moneda === "UYU") {
      salidasPorCategoria[o.categoria] += o.total;
      totalSalidasUyu += o.total;
    } else {
      totalSalidasBrl += o.total;
    }
  }

  const gananciaReal = ingresos - costoMercaderia - totalSalidasUyu;
  const margenPorcentaje = ingresos > 0 ? (gananciaReal / ingresos) * 100 : 0;

  return { ingresos, costoMercaderia, salidasPorCategoria, totalSalidasUyu, totalSalidasBrl, gananciaReal, margenPorcentaje };
}

/**
 * Carga el catálogo de productos activos (para costos, alertas de stock y mapeo de nombres).
 */
async function fetchActiveProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id,nombre,categoria,stock,stock_minimo,activo,precio,costo,created_at")
    .eq("activo", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

type RawSaleItem = { sale_id: string; product_id: string; cantidad: number; precio_unitario: number };

/**
 * A partir de qué tamaño de lista de ventas dejamos de filtrar por `sale_id IN (...)` y
 * pasamos a un inner-join por `session_id`. Con muchas ventas, el IN arma una URL gigante
 * que puede romper en Supabase; el join empuja el filtro a la DB. Ambos caminos mantienen
 * el mismo eje: por sesión, NO por rango de fecha.
 */
const SALE_IDS_INLINE_MAX = 200;

/**
 * Trae `sale_items` y `sale_combos` de un conjunto de ventas (identificadas por sus
 * `saleIds`, todas pertenecientes a las sesiones `sessionIds`). Elige la estrategia según
 * el tamaño de `saleIds` (ver SALE_IDS_INLINE_MAX).
 */
async function fetchItemsYCombos(
  saleIds: string[],
  sessionIds: string[]
): Promise<{ rawItems: RawSaleItem[]; comboItems: ComboSaleData[] }> {
  if (saleIds.length === 0) {
    return { rawItems: [], comboItems: [] };
  }

  const useJoin = saleIds.length > SALE_IDS_INLINE_MAX;

  const itemsQuery = useJoin
    ? supabase
        .from("sale_items")
        .select("sale_id, product_id, cantidad, precio_unitario, sales!inner(session_id, estado)")
        .in("sales.session_id", sessionIds)
        .eq("sales.estado", "activa")
    : supabase
        .from("sale_items")
        .select("sale_id, product_id, cantidad, precio_unitario")
        .in("sale_id", saleIds);

  const combosQuery = useJoin
    ? supabase
        .from("sale_combos")
        .select("combo_id, combo_nombre, cantidad, precio_unitario, costo_unitario, sales!inner(session_id, estado)")
        .in("sales.session_id", sessionIds)
        .eq("sales.estado", "activa")
    : supabase
        .from("sale_combos")
        .select("combo_id, combo_nombre, cantidad, precio_unitario, costo_unitario")
        .in("sale_id", saleIds);

  const [itemsRes, combosRes] = await Promise.all([itemsQuery, combosQuery]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (combosRes.error) throw new Error(combosRes.error.message);

  return {
    rawItems: (itemsRes.data ?? []) as RawSaleItem[],
    comboItems: (combosRes.data ?? []) as ComboSaleData[],
  };
}

/**
 * Reporte "Diario": ventas de la sesión de caja activa. Si no hay sesión abierta, usa el
 * último turno cerrado. El eje es el `session_id`, NO la fecha (un turno cruza la medianoche).
 * Ventas con `session_id = NULL` quedan fuera por construcción.
 */
export async function fetchDiarioReport(): Promise<TodayReport> {
  const open = await getOpenSession();
  const session = open ?? (await getClosedSessions(1))[0] ?? null;

  // products siempre se cargan: las alertas de stock no dependen de que haya una sesión.
  const products = await fetchActiveProducts();
  const alertas = products.filter((p) => p.stock <= p.stock_minimo);
  const prodMap = new Map(products.map((p) => [p.id, { nombre: p.nombre, costo: p.costo }]));

  if (!session) {
    return { sales: [], items: [], alertas, salesWithItems: [], comboItems: [], outflows: [] };
  }

  const [salesRes, withItemsRes, outflows] = await Promise.all([
    supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
      .eq("session_id", session.id)
      .eq("estado", "activa")
      .order("fecha", { ascending: false }),
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
      .eq("session_id", session.id)
      .eq("estado", "activa")
      .order("fecha", { ascending: false }),
    fetchOutflowsByCategory([session.id]),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (withItemsRes.error) throw new Error(withItemsRes.error.message);

  const sales = (salesRes.data ?? []) as Sale[];
  const saleIds = sales.map((s) => s.id);

  const { rawItems, comboItems } = await fetchItemsYCombos(saleIds, [session.id]);
  const items: SaleItemWithProduct[] = rawItems.map((it) => ({
    product_id: it.product_id,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    products: prodMap.get(it.product_id) ?? null,
  }));

  const rawSalesWithItems = (withItemsRes.data ?? []) as any[];
  const salesWithItems: SaleWithItems[] = rawSalesWithItems.map((sale: any) => ({
    ...sale,
    sale_items: (sale.sale_items || []).map((item: any) => ({
      product_id: item.product_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      nombre: prodMap.get(item.product_id)?.nombre ?? "Desconocido",
    })),
  }));

  return { sales, items, alertas, salesWithItems, comboItems, outflows };
}

/**
 * Reporte por sesiones: las últimas `n` sesiones de caja por fecha de apertura, incluida la
 * abierta si existe (no se filtra estado). El eje es `session_id`, NO la fecha.
 *
 * NOTA INTENCIONAL — doble conteo: la sesión abierta aparece acá Y TAMBIÉN en el reporte
 * Diario al mismo tiempo. Es correcto y esperado, igual que "hoy" está incluido en "esta
 * semana". No filtrar la sesión abierta para "corregirlo".
 */
export async function fetchSesionesReport(n: 7 | 30): Promise<PeriodReport> {
  const sessionsRes = await supabase
    .from("cash_sessions")
    .select("id")
    .order("apertura_at", { ascending: false })
    .limit(n);
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  const sessionIds = (sessionsRes.data ?? []).map((s: { id: string }) => s.id);

  const products = await fetchActiveProducts();
  const prodMap = new Map(products.map((p) => [p.id, { nombre: p.nombre, costo: p.costo }]));

  if (sessionIds.length === 0) {
    return { sales: [], items: [], products, comboItems: [], itemsBySale: new Map(), costoPorVenta: new Map(), outflows: [] };
  }

  const [salesRes, outflows] = await Promise.all([
    supabase
      .from("sales")
      .select("id,fecha,metodo_pago,total,nota,moneda,created_at")
      .in("session_id", sessionIds)
      .eq("estado", "activa")
      .order("fecha", { ascending: false }),
    fetchOutflowsByCategory(sessionIds),
  ]);
  if (salesRes.error) throw new Error(salesRes.error.message);

  const sales = (salesRes.data ?? []) as Sale[];
  const saleIds = sales.map((s) => s.id);

  const { rawItems, comboItems } = await fetchItemsYCombos(saleIds, sessionIds);
  const items: SaleItemWithProduct[] = rawItems.map((it) => ({
    product_id: it.product_id,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    products: prodMap.get(it.product_id) ?? null,
  }));

  const itemsBySale = new Map<string, string[]>();
  const costoPorVenta = new Map<string, number>();
  for (const it of rawItems) {
    const nombre = prodMap.get(it.product_id)?.nombre ?? "?";
    const nombres = itemsBySale.get(it.sale_id);
    if (nombres) nombres.push(nombre);
    else itemsBySale.set(it.sale_id, [nombre]);

    const costo = (prodMap.get(it.product_id)?.costo ?? 0) * Number(it.cantidad || 0);
    costoPorVenta.set(it.sale_id, (costoPorVenta.get(it.sale_id) ?? 0) + costo);
  }

  return { sales, items, products, comboItems, itemsBySale, costoPorVenta, outflows };
}

/**
 * Promedio mensual de salidas categoría "restock" en las últimas ~90 sesiones (~3 meses,
 * ver nota de `fetchSesionesReport` sobre 30 sesiones ≈ 1 mes). Usado para proyectar cuánto
 * saldría el restock del mes en curso a partir del ritmo histórico — no vincula compras a
 * productos/cantidades exactas (esa es otra feature, ver restock_purchases sin usar).
 *
 * El divisor NO es un 3 fijo: se calcula del rango real de fechas entre la sesión más vieja
 * y la más nueva del set traído. Con menos de ~90 sesiones de historia (kiosco nuevo, o
 * turnos poco frecuentes) 90 sesiones pueden cubrir bastante menos de 3 meses calendario —
 * dividir por 3 igual subestimaría el promedio a la mitad o menos.
 */
export async function fetchRestockPromedioMensual(): Promise<number> {
  const sessionsRes = await supabase
    .from("cash_sessions")
    .select("id, apertura_at")
    .order("apertura_at", { ascending: false })
    .limit(90);
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  const sessions = sessionsRes.data ?? [];
  if (sessions.length === 0) return 0;

  const sessionIds = sessions.map((s) => s.id);
  const outflows = await fetchOutflowsByCategory(sessionIds);
  const totalRestockPeriodo = outflows
    .filter((o) => o.categoria === "restock" && o.moneda === "UYU")
    .reduce((sum, o) => sum + o.total, 0);

  const fechas = sessions.map((s) => new Date(s.apertura_at).getTime());
  const rangoDias = (Math.max(...fechas) - Math.min(...fechas)) / (1000 * 60 * 60 * 24);
  const meses = Math.max(rangoDias / 30, 1); // mínimo 1 mes: evita inflar el promedio con poca historia

  return totalRestockPeriodo / meses;
}

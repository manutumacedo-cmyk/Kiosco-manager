import { supabase } from "@/lib/supabaseClient";
import type { CashSession } from "@/types";

/**
 * Un turno con sus números ya calculados, para el historial.
 *
 * La jornada del kiosco cruza la medianoche (abre 21:00, cierra 06:00), así que
 * filtrar por fecha de calendario parte los turnos al medio. Acá el turno ES la
 * unidad: se identifica por su APERTURA, no por su cierre.
 */
export interface TurnoConStats {
  session: CashSession;
  /** Ingresos de ventas activas. Ya es neto: las anuladas no suman, se hayan
   *  anulado antes o después del cierre (B26). */
  ingresos: number;
  cantidadVentas: number;
  cantidadAnuladas: number;
  costoMercaderia: number;
  salidasUyu: number;
  /** ingresos − costo de mercadería − salidas en UYU. Mismo criterio que
   *  calcularGananciaReal() en reports.ts, para no tener dos definiciones. */
  ganancia: number;
  margenPorcentaje: number;
  /** Ventas que se cobraron acá pero venían de un turno ya cerrado (B27). */
  cantidadReasignadas: number;
  /** Facturación de productos SIN costo cargado. Hoy el 84% del catálogo no tiene
   *  costo, así que la ganancia sale inflada: sin este dato el número parece real
   *  y no lo es. La UI lo usa para marcar la ganancia como estimada (M8). */
  facturadoSinCosto: number;
  /** Porción del ingreso que sí tiene costo conocido (0..1). */
  coberturaCosto: number;
}

/**
 * Turnos con sus totales, más recientes primero. Incluye el turno abierto si lo hay.
 *
 * Hace 5 queries y agrega en memoria en vez de una vista SQL: son pocas filas
 * (un turno por noche) y así el cálculo de ganancia vive en un solo lugar del
 * código, no duplicado entre TS y SQL.
 */
export async function fetchTurnosConStats(limit = 60): Promise<TurnoConStats[]> {
  const { data: sessionsData, error: e1 } = await supabase
    .from("cash_sessions")
    .select("*")
    .order("apertura_at", { ascending: false })
    .limit(limit);

  if (e1) throw new Error(e1.message);
  const sessions = (sessionsData ?? []) as CashSession[];
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);

  const [salesRes, outflowsRes] = await Promise.all([
    supabase
      .from("sales")
      .select("id, session_id, total, estado, session_id_original")
      .in("session_id", sessionIds),
    supabase
      .from("cash_outflows")
      .select("session_id, monto, moneda, tipo")
      .in("session_id", sessionIds)
      .eq("tipo", "salida")
      .eq("moneda", "UYU"),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (outflowsRes.error) throw new Error(outflowsRes.error.message);

  const sales = salesRes.data ?? [];
  const activas = sales.filter((s) => s.estado === "activa");
  const activasIds = activas.map((s) => s.id);

  // Costo de mercadería: items sueltos vía products.costo, líneas de combo vía
  // sale_combos.costo_unitario (los combos no son productos, ver B2).
  const [itemsRes, combosRes, productsRes] = await Promise.all([
    activasIds.length > 0
      ? supabase
          .from("sale_items")
          .select("sale_id, product_id, cantidad, precio_unitario")
          .in("sale_id", activasIds)
      : Promise.resolve({ data: [], error: null }),
    activasIds.length > 0
      ? supabase.from("sale_combos").select("sale_id, cantidad, costo_unitario").in("sale_id", activasIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("products").select("id, costo"),
  ]);

  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (combosRes.error) throw new Error(combosRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);

  const costoProducto = new Map<string, number>(
    (productsRes.data ?? []).map((p: { id: string; costo: number | null }) => [p.id, Number(p.costo ?? 0)])
  );

  // sale_id → costo total de esa venta, y sale_id → facturado de líneas sin costo.
  // Lo segundo es lo que permite avisar que la ganancia está incompleta en vez de
  // mostrar un número inflado como si fuera exacto.
  const costoPorVenta = new Map<string, number>();
  const sinCostoPorVenta = new Map<string, number>();

  for (const it of itemsRes.data ?? []) {
    const costoUnit = costoProducto.get(it.product_id);
    const cantidad = Number(it.cantidad || 0);

    costoPorVenta.set(it.sale_id, (costoPorVenta.get(it.sale_id) ?? 0) + (costoUnit ?? 0) * cantidad);

    // Ojo: las líneas de combo referencian el id del combo, que no está en products
    // (B2). Ésas no cuentan como "sin costo" — su costo viene de sale_combos.
    const esProducto = costoProducto.has(it.product_id);
    if (esProducto && !costoUnit) {
      const facturado = cantidad * Number(it.precio_unitario || 0);
      sinCostoPorVenta.set(it.sale_id, (sinCostoPorVenta.get(it.sale_id) ?? 0) + facturado);
    }
  }

  for (const c of combosRes.data ?? []) {
    const costo = Number(c.costo_unitario || 0) * Number(c.cantidad || 0);
    costoPorVenta.set(c.sale_id, (costoPorVenta.get(c.sale_id) ?? 0) + costo);
  }

  const salidasPorSesion = new Map<string, number>();
  for (const o of outflowsRes.data ?? []) {
    salidasPorSesion.set(o.session_id, (salidasPorSesion.get(o.session_id) ?? 0) + Number(o.monto || 0));
  }

  return sessions.map((session) => {
    const delTurno = sales.filter((s) => s.session_id === session.id);
    const activasDelTurno = delTurno.filter((s) => s.estado === "activa");

    const ingresos = activasDelTurno.reduce((acc, s) => acc + Number(s.total || 0), 0);
    const costoMercaderia = activasDelTurno.reduce(
      (acc, s) => acc + (costoPorVenta.get(s.id) ?? 0),
      0
    );
    const salidasUyu = salidasPorSesion.get(session.id) ?? 0;
    const ganancia = ingresos - costoMercaderia - salidasUyu;
    const facturadoSinCosto = activasDelTurno.reduce(
      (acc, s) => acc + (sinCostoPorVenta.get(s.id) ?? 0),
      0
    );

    return {
      session,
      ingresos,
      cantidadVentas: activasDelTurno.length,
      cantidadAnuladas: delTurno.length - activasDelTurno.length,
      costoMercaderia,
      salidasUyu,
      ganancia,
      margenPorcentaje: ingresos > 0 ? (ganancia / ingresos) * 100 : 0,
      cantidadReasignadas: delTurno.filter((s) => s.session_id_original != null).length,
      facturadoSinCosto,
      coberturaCosto: ingresos > 0 ? Math.max(0, 1 - facturadoSinCosto / ingresos) : 1,
    };
  });
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * Etiqueta de la jornada, nombrada por su APERTURA.
 *
 * Una noche que abre el viernes 21:00 y cierra el sábado 06:00 es "el turno del
 * viernes", aunque su fecha de cierre sea sábado. Por eso el historial no se
 * puede filtrar por fecha de calendario.
 */
export function etiquetaTurno(session: CashSession): {
  dia: string;
  fecha: string;
  rango: string;
  cruzaMedianoche: boolean;
} {
  const apertura = new Date(session.apertura_at);
  const cierre = session.cierre_at ? new Date(session.cierre_at) : null;

  const hhmm = (d: Date) =>
    d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });
  const ddmm = (d: Date) =>
    d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });

  const cruzaMedianoche = cierre ? cierre.toDateString() !== apertura.toDateString() : false;

  const rango = cierre
    ? cruzaMedianoche
      ? `${hhmm(apertura)} → ${ddmm(cierre)} ${hhmm(cierre)}`
      : `${hhmm(apertura)} → ${hhmm(cierre)}`
    : `${hhmm(apertura)} → en curso`;

  return {
    dia: DIAS[apertura.getDay()],
    fecha: apertura.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" }),
    rango,
    cruzaMedianoche,
  };
}

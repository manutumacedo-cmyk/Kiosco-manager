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

interface StatsRow {
  session_id: string;
  ingresos: number;
  cantidad_ventas: number;
  cantidad_anuladas: number;
  costo_mercaderia: number;
  salidas_uyu: number;
  facturado_sin_costo: number;
  cantidad_reasignadas: number;
}

/**
 * Turnos con sus totales, más recientes primero. Incluye el turno abierto si lo hay.
 *
 * La agregación la hace la RPC `turnos_con_stats` en el servidor, no el cliente.
 * La primera versión traía todas las ventas y todos los sale_items y sumaba en
 * memoria, lo que significaba un `.in("sale_id", [...])` con 2.553 uuids: una URL
 * de ~95 KB que el servidor rechaza, y la lista quedaba vacía.
 */
export async function fetchTurnosConStats(limit = 60): Promise<TurnoConStats[]> {
  const [sessionsRes, statsRes] = await Promise.all([
    supabase
      .from("cash_sessions")
      .select("*")
      .order("apertura_at", { ascending: false })
      .limit(limit),
    supabase.rpc("turnos_con_stats", { p_limit: limit }),
  ]);

  if (sessionsRes.error) throw new Error(sessionsRes.error.message);
  if (statsRes.error) throw new Error(statsRes.error.message);

  const sessions = (sessionsRes.data ?? []) as CashSession[];
  const stats = new Map<string, StatsRow>(
    ((statsRes.data ?? []) as StatsRow[]).map((r) => [r.session_id, r])
  );

  return sessions.map((session) => {
    const r = stats.get(session.id);

    const ingresos = Number(r?.ingresos ?? 0);
    const costoMercaderia = Number(r?.costo_mercaderia ?? 0);
    const salidasUyu = Number(r?.salidas_uyu ?? 0);
    const facturadoSinCosto = Number(r?.facturado_sin_costo ?? 0);
    const ganancia = ingresos - costoMercaderia - salidasUyu;

    return {
      session,
      ingresos,
      cantidadVentas: Number(r?.cantidad_ventas ?? 0),
      cantidadAnuladas: Number(r?.cantidad_anuladas ?? 0),
      costoMercaderia,
      salidasUyu,
      ganancia,
      margenPorcentaje: ingresos > 0 ? (ganancia / ingresos) * 100 : 0,
      cantidadReasignadas: Number(r?.cantidad_reasignadas ?? 0),
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

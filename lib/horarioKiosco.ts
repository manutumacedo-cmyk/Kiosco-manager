/**
 * Hora local del kiosco. Única fuente de verdad de "qué hora es en Rivera".
 *
 * El server corre en UTC (Vercel) y Rivera está en UTC−3. Comparar la hora cruda de
 * `new Date()` contra el horario de trabajo correría la ventana 3 horas y haría que
 * las alertas salieran todas mal, así que todo pasa por `Intl` con la zona explícita.
 * Uruguay no aplica horario de verano desde 2015, pero se usa igual el nombre de zona
 * en vez de un offset fijo: si eso cambia, cambia solo.
 */

export const TZ_KIOSCO = "America/Montevideo";

/** Horario normal de trabajo: 18:30 a 03:30. Cruza la medianoche. */
export const APERTURA_MIN = 18 * 60 + 30; // 1110
export const CIERRE_MIN = 3 * 60 + 30; //  210

const formatoHora = new Intl.DateTimeFormat("es-UY", {
  timeZone: TZ_KIOSCO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const formatoFechaHora = new Intl.DateTimeFormat("es-UY", {
  timeZone: TZ_KIOSCO,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Minutos desde la medianoche en hora de Rivera. */
export function minutosDelDia(fecha: Date = new Date()): number {
  const partes = formatoHora.formatToParts(fecha);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? 0);
  return hora * 60 + minuto;
}

/** "19:42", hora de Rivera. */
export function horaLocal(fecha: Date = new Date()): string {
  return formatoHora.format(fecha);
}

/** "28/08 19:42", hora de Rivera. Para listas donde el año no aporta. */
export function fechaHoraLocal(fecha: Date | string): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return formatoFechaHora.format(d).replace(", ", " ");
}

/**
 * ¿Está dentro del horario normal de trabajo? La ventana cruza la medianoche, por eso
 * es un OR y no un rango: 18:30–23:59 o 00:00–03:30.
 */
export function estaEnHorario(fecha: Date = new Date()): boolean {
  const min = minutosDelDia(fecha);
  return min >= APERTURA_MIN || min <= CIERRE_MIN;
}

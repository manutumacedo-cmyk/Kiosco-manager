import { supabaseServer } from "@/lib/supabaseServer";
import { horaLocal, fechaHoraLocal, estaEnHorario } from "@/lib/horarioKiosco";
import { getEntradasSinCerrar } from "@/lib/services/attendance";

/**
 * Notificaciones del negocio (M11). Canal por el que el sistema le avisa cosas al admin
 * sin que tenga que ir a buscarlas. Solo se leen desde rutas admin-only.
 */

export type SeveridadNotificacion = "info" | "alerta" | "critico";

export interface Notificacion {
  id: string;
  tipo: string;
  severidad: SeveridadNotificacion;
  titulo: string;
  mensaje: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  leida_at: string | null;
  leida_por: string | null;
}

interface NuevaNotificacion {
  tipo: string;
  severidad?: SeveridadNotificacion;
  titulo: string;
  mensaje: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function crearNotificacion(n: NuevaNotificacion): Promise<void> {
  const { error } = await supabaseServer.from("notifications").insert({
    tipo: n.tipo,
    severidad: n.severidad ?? "info",
    titulo: n.titulo,
    mensaje: n.mensaje,
    user_id: n.userId ?? null,
    metadata: n.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

/** Lista con el username del usuario al que se refiere el aviso, si sigue existiendo. */
export async function listarNotificaciones(
  opciones: { soloNoLeidas?: boolean; limite?: number } = {}
): Promise<(Notificacion & { username: string | null })[]> {
  const { soloNoLeidas = false, limite = 100 } = opciones;

  let query = supabaseServer
    .from("notifications")
    .select("*, users:user_id (username)")
    .order("created_at", { ascending: false })
    .limit(limite);

  if (soloNoLeidas) query = query.is("leida_at", null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((n) => {
    const { users, ...resto } = n as Notificacion & { users: { username: string } | null };
    return { ...resto, username: users?.username ?? null };
  });
}

export async function contarNoLeidas(): Promise<number> {
  const { count, error } = await supabaseServer
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("leida_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Idempotente: si ya estaba leída, no pisa quién ni cuándo la leyó primero. */
export async function marcarLeida(id: string, adminId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("notifications")
    .update({ leida_at: new Date().toISOString(), leida_por: adminId })
    .eq("id", id)
    .is("leida_at", null);
  if (error) throw new Error(error.message);
}

export async function marcarTodasLeidas(adminId: string): Promise<number> {
  const { data, error } = await supabaseServer
    .from("notifications")
    .update({ leida_at: new Date().toISOString(), leida_por: adminId })
    .is("leida_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/**
 * Aviso de login fuera del horario de trabajo (18:30-03:30). Lo dispara el login;
 * quien llama decide si corresponde (solo cajeros) — acá solo se arma el texto.
 */
export async function notificarLoginFueraDeHorario(params: {
  userId: string;
  username: string;
  fecha: Date;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  const hora = horaLocal(params.fecha);
  await crearNotificacion({
    tipo: "login_fuera_horario",
    severidad: "alerta",
    titulo: `Login fuera de horario: ${params.username}`,
    mensaje: `${params.username} entró al sistema a las ${hora}, fuera del horario de trabajo (18:30 a 03:30).`,
    userId: params.userId,
    metadata: {
      hora_local: hora,
      ip: params.ip,
      user_agent: params.userAgent,
    },
  });
}

/**
 * Aviso de llegada o salida del local (M12). El dueño no está todas las noches:
 * esto le arma la noche completa en un solo lugar, con la hora exacta de cada
 * marca, sin tener que cruzar el historial de asistencia con otra pantalla.
 *
 * La severidad sube a 'alerta' cuando la marca cae fuera del horario de trabajo:
 * una llegada a las 22:00 es normal, una a las 11 de la mañana no.
 */
export async function notificarAsistencia(params: {
  userId: string;
  username: string;
  tipo: "entrada" | "salida";
  fecha: Date;
  desde?: string | null;
}): Promise<void> {
  const hora = horaLocal(params.fecha);
  const enHorario = estaEnHorario(params.fecha);
  const esEntrada = params.tipo === "entrada";

  let mensaje = esEntrada
    ? `${params.username} marcó su llegada al local a las ${hora}.`
    : `${params.username} marcó su salida del local a las ${hora}.`;

  // En la salida, decir desde cuándo estaba ahorra abrir el historial para
  // saber cuánto trabajó.
  if (!esEntrada && params.desde) {
    mensaje += ` Había llegado a las ${horaLocal(new Date(params.desde))} (${duracionLegible(params.desde, params.fecha)}).`;
  }
  if (!enHorario) {
    mensaje += " Está fuera del horario de trabajo (18:30 a 03:30).";
  }

  await crearNotificacion({
    tipo: esEntrada ? "asistencia_entrada" : "asistencia_salida",
    severidad: enHorario ? "info" : "alerta",
    titulo: `${esEntrada ? "Llegada" : "Salida"}: ${params.username} · ${hora}`,
    mensaje,
    userId: params.userId,
    metadata: { hora_local: hora, tipo: params.tipo, desde: params.desde ?? null },
  });
}

/** "3 h 25 min" — cuánto pasó entre dos momentos. */
function duracionLegible(desde: string | Date, hasta: Date): string {
  const ms = hasta.getTime() - new Date(desde).getTime();
  const minutos = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Avisa de las entradas que quedaron sin cerrar. Se dispara al abrir el centro
 * de notificaciones, no por un cron: el proyecto no tiene uno, y el momento en
 * que el dueño mira la pantalla es exactamente cuando el aviso le sirve.
 *
 * Idempotente por `attendance_id` en metadata: una entrada colgada genera un
 * único aviso, por más veces que se abra la pantalla.
 */
export async function notificarEntradasSinCerrar(): Promise<number> {
  const abiertas = await getEntradasSinCerrar();
  if (abiertas.length === 0) return 0;

  const { data: yaAvisadas } = await supabaseServer
    .from("notifications")
    .select("metadata")
    .eq("tipo", "asistencia_sin_cerrar");
  const avisados = new Set(
    (yaAvisadas ?? []).map((n) => (n.metadata as { attendance_id?: string })?.attendance_id)
  );

  const nuevas = abiertas.filter((a) => !avisados.has(a.id));
  for (const a of nuevas) {
    await crearNotificacion({
      tipo: "asistencia_sin_cerrar",
      severidad: "alerta",
      titulo: `Entrada sin cerrar: ${a.username}`,
      mensaje: `${a.username} marcó su llegada el ${fechaHoraLocal(a.check_in)} y nunca marcó la salida. El sistema no la cierra solo — corregila a mano si hace falta.`,
      userId: a.user_id,
      metadata: { attendance_id: a.id, check_in: a.check_in },
    });
  }
  return nuevas.length;
}

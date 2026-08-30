import { supabaseServer } from "@/lib/supabaseServer";
import { horaLocal } from "@/lib/horarioKiosco";

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

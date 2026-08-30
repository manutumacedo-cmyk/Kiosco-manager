import { supabaseServer } from "@/lib/supabaseServer";

export interface AttendanceRecord {
  id: string;
  user_id: string;
  check_in: string;
  check_out: string | null;
}

export interface AttendanceWithUser extends AttendanceRecord {
  username: string;
}

/** Entrada abierta (sin salida marcada) del usuario, o null. */
export async function getOpenAttendance(
  userId: string
): Promise<AttendanceRecord | null> {
  const { data } = await supabaseServer
    .from("attendance")
    .select("id, user_id, check_in, check_out")
    .eq("user_id", userId)
    .is("check_out", null)
    .maybeSingle();
  return data ?? null;
}

/**
 * Marca la entrada. Idempotente: si ya hay una entrada abierta la devuelve
 * tal cual (el índice único parcial de la DB impide duplicar de todas formas).
 */
export async function checkIn(userId: string): Promise<AttendanceRecord> {
  const open = await getOpenAttendance(userId);
  if (open) return open;

  const { data, error } = await supabaseServer
    .from("attendance")
    .insert({ user_id: userId })
    .select("id, user_id, check_in, check_out")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo marcar la entrada");
  }
  return data;
}

/** Marca la salida de la entrada abierta. Devuelve null si no había ninguna. */
export async function checkOut(userId: string): Promise<AttendanceRecord | null> {
  const { data, error } = await supabaseServer
    .from("attendance")
    .update({ check_out: new Date().toISOString() })
    .eq("user_id", userId)
    .is("check_out", null)
    .select("id, user_id, check_in, check_out")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Historial de asistencia (más recientes primero), con el nombre de usuario. */
export async function listAttendance(limit = 200): Promise<AttendanceWithUser[]> {
  const { data, error } = await supabaseServer
    .from("attendance")
    .select("id, user_id, check_in, check_out, users(username)")
    .order("check_in", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const users = r.users as { username: string } | { username: string }[] | null;
    const username = Array.isArray(users)
      ? users[0]?.username ?? "?"
      : users?.username ?? "?";
    return {
      id: r.id,
      user_id: r.user_id,
      check_in: r.check_in,
      check_out: r.check_out,
      username,
    };
  });
}

/** Registros del propio usuario, para mostrarle su historial en el perfil. */
export async function listAttendanceByUser(
  userId: string,
  limit = 20
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabaseServer
    .from("attendance")
    .select("id, user_id, check_in, check_out")
    .eq("user_id", userId)
    .order("check_in", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Entradas que quedaron abiertas mucho más de lo que dura un turno: alguien
 * marcó llegada, cerró el navegador y se fue sin marcar la salida. No se
 * cierran solas (inventar una hora de salida sería inventar un dato); se
 * listan para avisarle al dueño y que las corrija.
 *
 * El umbral son 14 horas: el turno más largo posible es 18:30 a 03:30 (9h),
 * así que a las 14h ya no hay ninguna explicación honesta.
 */
export async function getEntradasSinCerrar(
  horas = 14
): Promise<AttendanceWithUser[]> {
  const limite = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseServer
    .from("attendance")
    .select("id, user_id, check_in, check_out, users(username)")
    .is("check_out", null)
    .lt("check_in", limite)
    .order("check_in", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const users = r.users as { username: string } | { username: string }[] | null;
    const username = Array.isArray(users) ? users[0]?.username ?? "?" : users?.username ?? "?";
    return { id: r.id, user_id: r.user_id, check_in: r.check_in, check_out: r.check_out, username };
  });
}

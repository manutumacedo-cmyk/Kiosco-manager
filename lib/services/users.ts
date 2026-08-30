import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabaseServer";

export type UserRole = "admin" | "cajero";

export interface AppUser {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<AppUser | null> {
  const { data: user } = await supabaseServer
    .from("users")
    .select("id, username, password_hash, role, active")
    .eq("username", username.trim())
    .is("deleted_at", null)
    .single();

  if (!user) return null;
  if (!user.active) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return { id: user.id, username: user.username, role: user.role, active: user.active };
}

export async function listUsers(): Promise<
  (AppUser & { created_at: string; sesionActiva: boolean; ultimoLogin: string | null })[]
> {
  const { data } = await supabaseServer
    .from("users")
    .select("id, username, role, active, created_at")
    .is("deleted_at", null)
    .order("created_at");
  const users = data ?? [];

  const ahora = new Date().toISOString();

  const { data: activeSessions } = await supabaseServer
    .from("user_sessions")
    .select("user_id")
    .is("ended_at", null)
    .gt("expires_at", ahora);
  const activeUserIds = new Set((activeSessions ?? []).map((s) => s.user_id));

  // Última conexión (M11): NO se guarda en `users`, se deriva de user_sessions, que es
  // donde ya se escribe en cada login. Una columna paralela se desincronizaría.
  // Una query por usuario en vez de traer la tabla entera y agrupar en JS: son 3-5
  // usuarios, y traer todo chocaría contra el límite de 1000 filas de PostgREST en
  // cuanto se acumulen logins (a ~2 por noche, poco más de un año).
  const ultimosLogins = await Promise.all(
    users.map(async (u) => {
      const { data } = await supabaseServer
        .from("user_sessions")
        .select("created_at")
        .eq("user_id", u.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return [u.id, data?.created_at ?? null] as const;
    })
  );
  const ultimoLoginPorUser = new Map(ultimosLogins);

  return users.map((u) => ({
    ...u,
    sesionActiva: activeUserIds.has(u.id),
    ultimoLogin: ultimoLoginPorUser.get(u.id) ?? null,
  }));
}

export async function createUser(
  username: string,
  password: string,
  role: UserRole,
  createdBy: string
): Promise<AppUser> {
  const password_hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabaseServer
    .from("users")
    .insert({ username, password_hash, role, created_by: createdBy })
    .select("id, username, role, active")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function toggleUserActive(id: string, active: boolean): Promise<void> {
  const { data, error } = await supabaseServer
    .from("users")
    .update({ active })
    .eq("id", id)
    .select();

  if (error || !data?.length) {
    throw new Error("Usuario no encontrado o sin cambios");
  }
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabaseServer
    .from("users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  await supabaseServer
    .from("user_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("user_id", id)
    .is("ended_at", null);
}

export async function resetPassword(id: string, newPassword: string): Promise<void> {
  const password_hash = await bcrypt.hash(newPassword, 12);
  const { data, error } = await supabaseServer
    .from("users")
    .update({ password_hash })
    .eq("id", id)
    .select();

  if (error || !data?.length) {
    throw new Error("Usuario no encontrado o reset falló");
  }
}

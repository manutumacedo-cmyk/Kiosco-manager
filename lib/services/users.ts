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
  (AppUser & { created_at: string; sesionActiva: boolean })[]
> {
  const { data } = await supabaseServer
    .from("users")
    .select("id, username, role, active, created_at")
    .is("deleted_at", null)
    .order("created_at");
  const users = data ?? [];

  const { data: activeSessions } = await supabaseServer
    .from("user_sessions")
    .select("user_id")
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString());
  const activeUserIds = new Set((activeSessions ?? []).map((s) => s.user_id));

  return users.map((u) => ({ ...u, sesionActiva: activeUserIds.has(u.id) }));
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

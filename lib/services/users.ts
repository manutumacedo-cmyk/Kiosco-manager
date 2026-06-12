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
    .eq("username", username)
    .single();

  if (!user) return null;
  if (!user.active) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return { id: user.id, username: user.username, role: user.role, active: user.active };
}

export async function listUsers(): Promise<(AppUser & { created_at: string })[]> {
  const { data } = await supabaseServer
    .from("users")
    .select("id, username, role, active, created_at")
    .order("created_at");
  return data ?? [];
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
  await supabaseServer.from("users").update({ active }).eq("id", id);
}

export async function resetPassword(id: string, newPassword: string): Promise<void> {
  const password_hash = await bcrypt.hash(newPassword, 12);
  await supabaseServer.from("users").update({ password_hash }).eq("id", id);
}

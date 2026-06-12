"use client";

import { useState } from "react";
import type { AppUser } from "@/lib/services/users";

type User = AppUser & { created_at: string };

export default function UsuariosClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Crear usuario
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "cajero">("cajero");
  const [creating, setCreating] = useState(false);

  // Reset password
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  function notify(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null); }
    else { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 3000);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear");
      const listRes = await fetch("/api/usuarios");
      setUsers(await listRes.json());
      setUsername("");
      setPassword("");
      setRole("cajero");
      notify(`Usuario "${data.username}" creado`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Error al crear usuario", true);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    setSaving((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, active } : u));
      notify(active ? "Usuario activado" : "Usuario desactivado");
    } catch {
      notify("Error al actualizar usuario", true);
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/usuarios/${resetTarget}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al resetear");
      setResetTarget(null);
      setNewPassword("");
      notify("Contraseña actualizada");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Error al resetear", true);
    } finally {
      setResetting(false);
    }
  }

  const userForReset = resetTarget ? users.find((u) => u.id === resetTarget) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Notificaciones */}
      {error && (
        <div className="p-4 rounded-lg border border-[var(--error)] text-[var(--error)] bg-[rgba(255,59,59,0.08)] text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg border border-[var(--success)] text-[var(--success)] bg-[rgba(0,255,136,0.08)] text-sm">
          {success}
        </div>
      )}

      {/* Crear usuario */}
      <div className="data-card neon-hover-magenta">
        <h2 className="font-bold text-[var(--neon-magenta)] uppercase tracking-wide mb-4">
          Nuevo Usuario
        </h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="block text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">
              Usuario
            </span>
            <input
              className="cyber-input w-full"
              placeholder="nombre_usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">
              Contraseña
            </span>
            <input
              className="cyber-input w-full"
              type="password"
              placeholder="mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">
              Rol
            </span>
            <select
              className="cyber-input w-full"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "cajero")}
            >
              <option value="cajero">Cajero</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={creating || !username.trim() || password.length < 6}
            className="cyber-button-magenta disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? "Creando..." : "Crear"}
          </button>
        </form>
      </div>

      {/* Lista de usuarios */}
      <div className="data-card overflow-hidden p-0">
        <div className="px-4 py-3 border-b-2 border-[var(--neon-magenta)] bg-[var(--carbon-gray)]">
          <span className="font-bold text-[var(--neon-magenta)] uppercase tracking-wide">
            Usuarios ({users.length})
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[var(--carbon-gray)] border-b-2 border-[var(--neon-magenta)]">
            <tr>
              <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Usuario</th>
              <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Rol</th>
              <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Estado</th>
              <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Creado</th>
              <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === currentUserId;
              return (
                <tr
                  key={u.id}
                  className={`border-t border-[var(--slate-gray)] ${
                    isMe ? "bg-[rgba(255,0,255,0.04)]" : "hover:bg-[var(--carbon-gray)]"
                  }`}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{u.username}</span>
                      {isMe && (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--neon-magenta)] text-[var(--neon-magenta)] bg-[var(--magenta-glow)]">
                          tú
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs font-bold uppercase tracking-wide ${
                      u.role === "admin" ? "text-[var(--neon-magenta)]" : "text-[var(--neon-cyan)]"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3">
                    {u.active ? (
                      <span className="text-xs px-2 py-1 rounded-full border border-[var(--success)] text-[var(--success)] bg-[rgba(0,255,136,0.08)]">
                        Activo
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full border border-[var(--error)] text-[var(--error)] bg-[rgba(255,59,59,0.08)]">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-[var(--text-secondary)] font-mono text-xs">
                    {new Intl.DateTimeFormat("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(u.created_at))}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {!isMe && (
                        <button
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                            u.active
                              ? "border-[var(--warning)] text-[var(--warning)] hover:bg-[rgba(255,170,0,0.08)]"
                              : "border-[var(--success)] text-[var(--success)] hover:bg-[rgba(0,255,136,0.08)]"
                          }`}
                          onClick={() => handleToggle(u.id, !u.active)}
                          disabled={!!saving[u.id]}
                        >
                          {saving[u.id] ? "..." : u.active ? "Desactivar" : "Activar"}
                        </button>
                      )}
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-all"
                        onClick={() => { setResetTarget(u.id); setNewPassword(""); }}
                      >
                        Reset clave
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal: resetear contraseña */}
      {resetTarget && userForReset && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="data-card neon-outline-cyan w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold neon-text-cyan uppercase tracking-wide">
              Nueva contraseña
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Usuario: <span className="font-bold text-[var(--text-primary)]">{userForReset.username}</span>
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <input
                className="cyber-input w-full"
                type="password"
                placeholder="Nueva contraseña (mínimo 6 caracteres)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
                autoFocus
                autoComplete="new-password"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={resetting || newPassword.length < 6}
                  className="cyber-button-cyan flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {resetting ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => { setResetTarget(null); setNewPassword(""); }}
                  className="cyber-button flex-1"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

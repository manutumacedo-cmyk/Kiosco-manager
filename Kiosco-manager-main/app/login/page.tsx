"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al iniciar sesión");
        setLoading(false);
        return;
      }

      // Redirigir a la página principal
      router.push("/");
      router.refresh();
    } catch (err) {
      setError("Error de conexión");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--deep-dark)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-full neon-border-cyan animate-pulse-cyan" />
            <h1 className="text-5xl font-bold">
              <span className="neon-text-cyan">24</span>
              <span className="neon-text-magenta"> SIETE</span>
            </h1>
            <div className="h-12 w-12 rounded-full neon-border-magenta animate-pulse-magenta" />
          </div>
          <p className="text-[var(--text-secondary)] font-mono text-sm uppercase tracking-wide">
            24 SIETE: TU SED NO TIENE HORARIO, NOSOTROS TAMPOCO.
          </p>
        </div>

        {/* Formulario de Login */}
        <div className="data-card neon-outline-cyan">
          <div className="text-center mb-6">
            <div className="text-2xl font-bold neon-text-cyan uppercase tracking-wide">
              Acceso Restringido
            </div>
            <div className="text-sm text-[var(--text-muted)] font-mono mt-2">
              Ingresá tus credenciales para continuar
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Usuario */}
            <div>
              <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2 font-mono">
                Usuario
              </label>
              <input
                type="text"
                className="cyber-input w-full"
                placeholder="Ingresá tu usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoComplete="username"
                required
              />
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wide mb-2 font-mono">
                Contraseña
              </label>
              <input
                type="password"
                className="cyber-input w-full"
                placeholder="Ingresá tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                required
              />
            </div>

            {/* Error */}
            {error && (
              <div className="border-2 border-[var(--error)] bg-[rgba(255,0,85,0.1)] rounded-lg p-3 animate-pulse-error">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⚠️</span>
                  <span className="text-[var(--error)] font-bold text-sm">{error}</span>
                </div>
              </div>
            )}

            {/* Botón de Entrar */}
            <button
              type="submit"
              disabled={loading}
              className="cyber-button-magenta w-full py-3 text-lg font-bold"
              style={{
                boxShadow: loading
                  ? "none"
                  : "0 0 20px rgba(255, 0, 255, 0.6), 0 0 40px rgba(255, 0, 255, 0.3)",
              }}
            >
              {loading ? "VERIFICANDO..." : "ENTRAR"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-[var(--slate-gray)] text-center">
            <div className="text-xs text-[var(--text-muted)] font-mono">
              🔒 Sesión protegida con JWT
            </div>
          </div>
        </div>

        {/* Info adicional */}
        <div className="mt-6 text-center">
          <div className="inline-block border border-[var(--slate-gray)] rounded-lg px-4 py-2">
            <p className="text-[var(--text-muted)] text-xs font-mono">
              Powered by <span className="neon-text-cyan">Manuel Macedo</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

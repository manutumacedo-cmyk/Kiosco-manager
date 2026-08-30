"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { Notificacion } from "@/lib/services/notifications";
import { fechaHoraLocal } from "@/lib/horarioKiosco";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, Panel } from "@/app/reportes/hoy/dashboardUi";

type NotificacionConUsuario = Notificacion & { username: string | null };

// El color es la única jerarquía visual: en una lista larga, lo que importa es distinguir
// de un vistazo un aviso que exige actuar de uno informativo.
const SEVERIDAD_STYLE = {
  info: { color: "var(--text-secondary)", borde: "var(--slate-gray)", icono: "ℹ" },
  alerta: { color: "var(--warning)", borde: "var(--warning)", icono: "⚠" },
  critico: { color: "var(--error)", borde: "var(--error)", icono: "✕" },
} as const;

export default function NotificacionesClient({
  initial,
}: {
  initial: NotificacionConUsuario[];
}) {
  const toast = useToast();
  const [notificaciones, setNotificaciones] = useState(initial);
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const noLeidas = useMemo(
    () => notificaciones.filter((n) => n.leida_at === null).length,
    [notificaciones]
  );

  const visibles = soloNoLeidas
    ? notificaciones.filter((n) => n.leida_at === null)
    : notificaciones;

  async function marcarLeida(id: string) {
    // Optimista: marcar leído no mueve plata y la lista tiene que responder al toque.
    const antes = notificaciones;
    setNotificaciones((prev) =>
      prev.map((n) => (n.id === id ? { ...n, leida_at: new Date().toISOString() } : n))
    );
    try {
      const res = await fetch(`/api/notificaciones/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error();
    } catch {
      setNotificaciones(antes);
      toast.error("No se pudo marcar como leída");
    }
  }

  async function marcarTodas() {
    if (trabajando || noLeidas === 0) return;
    setTrabajando(true);
    const antes = notificaciones;
    const ahora = new Date().toISOString();
    setNotificaciones((prev) =>
      prev.map((n) => (n.leida_at === null ? { ...n, leida_at: ahora } : n))
    );
    try {
      const res = await fetch("/api/notificaciones", { method: "PATCH" });
      if (!res.ok) throw new Error();
      toast.success("Todo marcado como leído");
    } catch {
      setNotificaciones(antes);
      toast.error("No se pudo marcar todo como leído");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="min-h-full bg-[var(--deep-dark)] p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image src="/logo.png" alt="24 SIETE" width={40} height={40} className="cursor-pointer" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--cyan-core)" }}>
            Notificaciones
          </h1>
          {noLeidas > 0 && (
            <span className="rounded-full bg-[var(--error)] px-2.5 py-0.5 text-xs font-bold text-white">
              {noLeidas} sin leer
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoloNoLeidas((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all ${
              soloNoLeidas
                ? "border-[var(--neon-cyan)] text-[var(--neon-cyan)]"
                : "border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)]"
            }`}
          >
            {/* El botón dice qué va a pasar si lo tocás, no en qué estado estás. */}
            {soloNoLeidas ? "Ver todas" : "Ver solo sin leer"}
          </button>
          <button
            onClick={marcarTodas}
            disabled={trabajando || noLeidas === 0}
            className="cyber-button disabled:cursor-not-allowed disabled:opacity-40"
          >
            Marcar todo leído
          </button>
        </div>
      </div>

      <Panel title="Avisos del negocio" accent="magenta">
        {visibles.length === 0 ? (
          <EmptyState>
            {soloNoLeidas
              ? "No hay avisos sin leer."
              : "Todavía no hay avisos. Acá van a aparecer los logins fuera del horario de trabajo (18:30 a 03:30) y otros movimientos que valga la pena mirar."}
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {visibles.map((n) => {
              const estilo = SEVERIDAD_STYLE[n.severidad] ?? SEVERIDAD_STYLE.info;
              const leida = n.leida_at !== null;
              return (
                <li
                  key={n.id}
                  className={`rounded-lg border p-3 transition-opacity ${leida ? "opacity-50" : ""}`}
                  style={{ borderColor: leida ? "var(--slate-gray)" : estilo.borde }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{ color: estilo.color }}>{estilo.icono}</span>
                        <span className="font-semibold" style={{ color: estilo.color }}>
                          {n.titulo}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{n.mensaje}</p>
                      <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                        {fechaHoraLocal(n.created_at)}
                        {n.username && ` · ${n.username}`}
                        {typeof n.metadata?.ip === "string" && ` · IP ${n.metadata.ip}`}
                      </p>
                    </div>
                    {!leida && (
                      <button
                        onClick={() => marcarLeida(n.id)}
                        className="flex-shrink-0 rounded-lg border border-[var(--slate-gray)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-all hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)]"
                      >
                        Marcar leída
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { AttendanceRecord } from "@/lib/services/attendance";
import { fechaHoraLocal, horaLocal } from "@/lib/horarioKiosco";
import { useToast } from "@/components/ui/Toast";
import { AttendanceIcon } from "@/components/Icons";

/** "3 h 25 min" entre dos marcas, o desde la llegada hasta ahora. */
function duracion(desde: string, hasta: string | null): string {
  const fin = hasta ? new Date(hasta) : new Date();
  const minutos = Math.max(0, Math.round((fin.getTime() - new Date(desde).getTime()) / 60000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default function PerfilClient({
  username,
  role,
  initialAbierta,
  initialRegistros,
}: {
  username: string;
  role: "admin" | "cajero";
  initialAbierta: AttendanceRecord | null;
  initialRegistros: AttendanceRecord[];
}) {
  const toast = useToast();
  const [abierta, setAbierta] = useState(initialAbierta);
  const [registros, setRegistros] = useState(initialRegistros);
  const [busy, setBusy] = useState(false);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);

  async function marcarEntrada() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/asistencia/entrada", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setAbierta(data.open);
      setRegistros((prev) => [data.open, ...prev.filter((r) => r.id !== data.open.id)]);
      toast.success(`Llegada registrada a las ${horaLocal(new Date(data.open.check_in))}`);
    } catch {
      toast.error("No se pudo registrar la llegada");
    } finally {
      setBusy(false);
    }
  }

  async function marcarSalida() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/asistencia/salida", { method: "POST" });
      const data = await res.json();
      if (!res.ok && res.status !== 409) throw new Error();
      setAbierta(null);
      setConfirmandoSalida(false);
      if (data.closed) {
        setRegistros((prev) => prev.map((r) => (r.id === data.closed.id ? data.closed : r)));
        toast.success(`Salida registrada a las ${horaLocal(new Date(data.closed.check_out))}`);
      }
    } catch {
      toast.error("No se pudo registrar la salida");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full space-y-6 bg-[var(--deep-dark)] p-6">
      <div className="flex items-center gap-3">
        <Link href="/">
          <Image src="/logo.png" alt="24 SIETE" width={40} height={40} className="cursor-pointer" />
        </Link>
        <h1 className="text-3xl font-bold neon-text-magenta">MI PERFIL</h1>
      </div>

      {/* Quien soy */}
      <div className="data-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Usuario</div>
          <div className="text-xl font-bold text-[var(--text-primary)]">{username}</div>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${
            role === "admin"
              ? "border-[var(--neon-magenta)] text-[var(--neon-magenta)]"
              : "border-[var(--neon-cyan)] text-[var(--neon-cyan)]"
          }`}
        >
          {role === "admin" ? "Administrador" : "Cajero"}
        </span>
      </div>

      {/* Marcar llegada / salida */}
      <div className="data-card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--neon-cyan)]">
          Mi horario de hoy
        </h2>

        {abierta ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="h-3 w-3 flex-shrink-0 rounded-full bg-[var(--success)] shadow-[0_0_8px_var(--success)] motion-safe:animate-pulse" />
              <div>
                <div className="text-lg font-bold text-[var(--success)]">En el local</div>
                <div className="font-mono text-sm text-[var(--text-secondary)]">
                  Desde las {horaLocal(new Date(abierta.check_in))} ·{" "}
                  {duracion(abierta.check_in, null)}
                </div>
              </div>
            </div>
            <button
              onClick={() => setConfirmandoSalida(true)}
              disabled={busy}
              className="min-h-[56px] w-full rounded-lg border-2 border-[var(--warning)] px-4 text-base font-bold uppercase tracking-wide text-[var(--warning)] transition-all hover:bg-[rgba(255,170,0,0.1)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warning)]"
            >
              Marcar salida
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)]">No estás marcado en el local.</p>
            <button
              onClick={marcarEntrada}
              disabled={busy}
              className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-lg border-2 border-[var(--success)] px-4 text-base font-bold uppercase tracking-wide text-[var(--success)] transition-all hover:bg-[rgba(0,255,136,0.1)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--success)]"
            >
              <AttendanceIcon size={24} className="flex-shrink-0" />
              {busy ? "Registrando..." : "Marcar llegada"}
            </button>
          </>
        )}
      </div>

      {/* Historial propio */}
      <div className="data-card space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--neon-cyan)]">
          Mis últimos registros
        </h2>
        {registros.length === 0 ? (
          <p className="py-4 text-center font-mono text-sm text-[var(--text-muted)]">
            Todavía no marcaste ninguna llegada.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--slate-gray)]">
            {registros.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-mono text-sm text-[var(--text-primary)]">
                  {fechaHoraLocal(r.check_in)}
                </span>
                <span className="font-mono text-sm text-[var(--text-secondary)]">
                  {r.check_out ? (
                    <>
                      → {horaLocal(new Date(r.check_out))}{" "}
                      <span className="text-[var(--text-muted)]">
                        ({duracion(r.check_in, r.check_out)})
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--success)]">sin salida</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmandoSalida && abierta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="data-card w-full max-w-sm space-y-4 border-[var(--warning)]">
            <h2 className="text-lg font-bold uppercase tracking-wide text-[var(--warning)]">
              Marcar salida
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Llegaste a las{" "}
              <span className="font-bold text-[var(--text-primary)]">
                {horaLocal(new Date(abierta.check_in))}
              </span>{" "}
              ({duracion(abierta.check_in, null)}). ¿Marcás tu salida ahora?
            </p>
            <div className="flex gap-3">
              <button
                onClick={marcarSalida}
                disabled={busy}
                className="flex-1 rounded-lg border border-[var(--warning)] px-3 py-2 text-sm text-[var(--warning)] transition-all hover:bg-[rgba(255,170,0,0.08)] disabled:opacity-40"
              >
                {busy ? "Marcando..." : "Sí, me voy"}
              </button>
              <button onClick={() => setConfirmandoSalida(false)} className="cyber-button flex-1">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

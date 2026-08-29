"use client";

import { useEffect, useState } from "react";
import { AttendanceIcon } from "./Icons";

interface OpenAttendance {
  id: string;
  check_in: string;
}

// Botón de asistencia en la barra: si no marcaste entrada, pulsa en verde
// pidiéndola; si estás "en el local", muestra desde qué hora y permite marcar
// la salida (con confirmación para evitar toques accidentales en la tablet).
export default function AttendanceControl() {
  const [open, setOpen] = useState<OpenAttendance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch("/api/asistencia/estado")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setOpen(data.open);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function marcarEntrada() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/asistencia/entrada", { method: "POST" });
      const data = await res.json();
      if (res.ok) setOpen(data.open);
    } catch (error) {
      console.error("Error al marcar entrada:", error);
    } finally {
      setBusy(false);
    }
  }

  async function marcarSalida() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/asistencia/salida", { method: "POST" });
      if (res.ok || res.status === 409) {
        setOpen(null);
        setConfirming(false);
      }
    } catch (error) {
      console.error("Error al marcar salida:", error);
    } finally {
      setBusy(false);
    }
  }

  // Hasta saber el estado no mostramos nada, para que el botón no "salte".
  if (!loaded) return null;

  const horaEntrada = open
    ? new Intl.DateTimeFormat("es-UY", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(open.check_in)
      )
    : null;

  return (
    <>
      {open ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={busy}
          title={`En el local desde las ${horaEntrada} — tocá para marcar la salida`}
          style={{ ["--accent" as string]: "var(--success)" }}
          className="flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--success)] px-3 py-2 text-sm font-semibold uppercase tracking-wide text-[var(--success)] transition-all duration-150 hover:shadow-[0_0_12px_-2px_var(--success)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--success)] motion-reduce:transition-none"
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success)] motion-safe:animate-pulse" />
          <span className="hidden md:inline">En el local · {horaEntrada}</span>
          <span className="md:hidden">{horaEntrada}</span>
        </button>
      ) : (
        <button
          onClick={marcarEntrada}
          disabled={busy}
          title="Marcar que llegaste al local"
          className="flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--warning)] px-3 py-2 text-sm font-semibold uppercase tracking-wide text-[var(--warning)] transition-all duration-150 hover:bg-[rgba(255,170,0,0.08)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warning)] motion-safe:animate-pulse motion-reduce:transition-none"
        >
          <AttendanceIcon size={20} className="flex-shrink-0" />
          <span className="hidden md:inline">{busy ? "..." : "Marcar entrada"}</span>
        </button>
      )}

      {/* Confirmación de salida */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="data-card w-full max-w-sm space-y-4 border-[var(--success)]">
            <h2 className="text-lg font-bold uppercase tracking-wide text-[var(--success)]">
              Marcar salida
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Estás en el local desde las{" "}
              <span className="font-bold text-[var(--text-primary)]">{horaEntrada}</span>.
              ¿Marcar tu salida ahora?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={marcarSalida}
                disabled={busy}
                className="flex-1 rounded-lg border border-[var(--success)] px-3 py-2 text-sm text-[var(--success)] transition-all hover:bg-[rgba(0,255,136,0.08)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Marcando..." : "Sí, me voy"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="cyber-button flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

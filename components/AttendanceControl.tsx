"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AttendanceIcon } from "./Icons";

interface OpenAttendance {
  id: string;
  check_in: string;
}

/**
 * Indicador de asistencia en la barra: dice de un vistazo si estás marcado en
 * el local y desde qué hora. No marca nada — la llegada y la salida se marcan
 * en /perfil, que es el único lugar donde vive esa acción (M12). Tener el mismo
 * botón en dos lugares invitaba a marcar sin querer al pasar por la barra.
 */
export default function AttendanceControl() {
  const [open, setOpen] = useState<OpenAttendance | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/asistencia/estado")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setOpen(data.open);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Hasta saber el estado no mostramos nada, para que la barra no "salte".
  if (!loaded) return null;

  const horaEntrada = open
    ? new Intl.DateTimeFormat("es-UY", {
        timeZone: "America/Montevideo",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(open.check_in))
    : null;

  if (open) {
    return (
      <Link
        href="/perfil"
        title={`En el local desde las ${horaEntrada} — tocá para marcar la salida`}
        className="flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--success)] px-3 py-2 text-sm font-semibold uppercase tracking-wide text-[var(--success)] transition-all duration-150 hover:shadow-[0_0_12px_-2px_var(--success)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--success)] motion-reduce:transition-none"
      >
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success)] motion-safe:animate-pulse" />
        <span className="hidden md:inline">En el local · {horaEntrada}</span>
        <span className="md:hidden">{horaEntrada}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/perfil"
      title="No estás marcado en el local — tocá para marcar tu llegada"
      className="flex min-h-[40px] items-center gap-2 rounded-lg border border-[var(--warning)] px-3 py-2 text-sm font-semibold uppercase tracking-wide text-[var(--warning)] transition-all duration-150 hover:bg-[rgba(255,170,0,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warning)] motion-reduce:transition-none"
    >
      <AttendanceIcon size={20} className="flex-shrink-0" />
      <span className="hidden md:inline">Sin marcar</span>
    </Link>
  );
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AttendanceIcon } from "@/components/Icons";

export default function LlegadaClient({ username }: { username: string }) {
  const router = useRouter();
  const [marcando, setMarcando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function marcarLlegada() {
    if (marcando) return;
    setMarcando(true);
    setError(null);
    try {
      const res = await fetch("/api/asistencia/entrada", { method: "POST" });
      if (!res.ok) throw new Error();
      // La cookie del gate ya se borró en el server; refresh para que el
      // middleware deje pasar.
      router.push("/");
      router.refresh();
    } catch {
      setError("No se pudo registrar. Probá de nuevo.");
      setMarcando(false);
    }
  }

  const ahora = new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-[var(--deep-dark)] p-6">
      <Image src="/logo.png" alt="24 SIETE" width={72} height={72} priority />

      <div className="data-card w-full max-w-md space-y-5 text-center">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-[var(--neon-cyan)]">
            Marcá tu llegada
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {username ? (
              <>
                Hola <span className="font-bold text-[var(--text-primary)]">{username}</span>.{" "}
              </>
            ) : null}
            Antes de empezar, registrá que llegaste al local.
          </p>
        </div>

        <div className="font-mono text-4xl font-bold text-[var(--text-primary)]">{ahora}</div>

        <button
          onClick={marcarLlegada}
          disabled={marcando}
          className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-lg border-2 border-[var(--success)] px-4 text-lg font-bold uppercase tracking-wide text-[var(--success)] transition-all hover:bg-[rgba(0,255,136,0.1)] hover:shadow-[0_0_20px_-4px_var(--success)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--success)] motion-reduce:transition-none"
        >
          <AttendanceIcon size={28} className="flex-shrink-0" />
          {marcando ? "Registrando..." : "Llegué"}
        </button>

        {error && (
          <p className="text-sm text-[var(--error)]" role="alert">
            {error}
          </p>
        )}

        <p className="text-xs text-[var(--text-muted)]">
          La salida la marcás cuando te vas, y no es obligatoria.
        </p>
      </div>
    </div>
  );
}

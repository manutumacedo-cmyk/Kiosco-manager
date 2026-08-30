"use client";

import { useMemo, useState } from "react";
import type { AttendanceWithUser } from "@/lib/services/attendance";

const fmtFecha = new Intl.DateTimeFormat("es-UY", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fmtHora = new Intl.DateTimeFormat("es-UY", {
  hour: "2-digit",
  minute: "2-digit",
});

function duracion(checkIn: string, checkOut: string | null): string {
  const fin = checkOut ? new Date(checkOut).getTime() : Date.now();
  const min = Math.max(0, Math.round((fin - new Date(checkIn).getTime()) / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

export default function AsistenciaClient({
  initialRecords,
}: {
  initialRecords: AttendanceWithUser[];
}) {
  const [filtro, setFiltro] = useState<string>("todos");

  const usuarios = useMemo(() => {
    const set = new Set(initialRecords.map((r) => r.username));
    return Array.from(set).sort();
  }, [initialRecords]);

  const visibles =
    filtro === "todos"
      ? initialRecords
      : initialRecords.filter((r) => r.username === filtro);

  const enElLocal = initialRecords.filter((r) => r.check_out === null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Quiénes están ahora */}
      <div className="data-card neon-hover-cyan">
        <h2 className="font-bold text-[var(--neon-cyan)] uppercase tracking-wide mb-3">
          En el local ahora ({enElLocal.length})
        </h2>
        {enElLocal.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Nadie marcó entrada todavía.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {enElLocal.map((r) => (
              <span
                key={r.id}
                className="text-sm px-3 py-1.5 rounded-full border border-[var(--success)] text-[var(--success)] bg-[rgba(0,255,136,0.08)]"
              >
                🟢 {r.username} · desde {fmtHora.format(new Date(r.check_in))}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="data-card overflow-hidden p-0">
        <div className="px-4 py-3 border-b-2 border-[var(--neon-cyan)] bg-[var(--carbon-gray)] flex items-center justify-between gap-3">
          <span className="font-bold text-[var(--neon-cyan)] uppercase tracking-wide">
            Registro ({visibles.length})
          </span>
          <select
            className="cyber-input text-sm"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          >
            <option value="todos">Todos</option>
            {usuarios.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--carbon-gray)] border-b-2 border-[var(--neon-cyan)]">
              <tr>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Usuario</th>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Fecha</th>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Entrada</th>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Salida</th>
                <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Horas</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[var(--text-secondary)]">
                    Sin registros de asistencia todavía.
                  </td>
                </tr>
              )}
              {visibles.map((r) => (
                <tr key={r.id} className="border-t border-[var(--slate-gray)] hover:bg-[var(--carbon-gray)]">
                  <td className="p-3 font-medium text-[var(--text-primary)]">{r.username}</td>
                  <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">
                    {fmtFecha.format(new Date(r.check_in))}
                  </td>
                  <td className="p-3 font-mono text-xs text-[var(--text-primary)]">
                    {fmtHora.format(new Date(r.check_in))}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    {r.check_out ? (
                      <span className="text-[var(--text-primary)]">
                        {fmtHora.format(new Date(r.check_out))}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full border border-[var(--success)] text-[var(--success)] bg-[rgba(0,255,136,0.08)]">
                        🟢 En el local
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs text-[var(--text-secondary)]">
                    {duracion(r.check_in, r.check_out)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

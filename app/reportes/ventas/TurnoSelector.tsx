"use client";

import type { TurnoConStats } from "@/lib/services/turnos";
import { etiquetaTurno } from "@/lib/services/turnos";

const fmt = (n: number) =>
  n.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

interface Props {
  turnos: TurnoConStats[];
  seleccionado: string | null;
  onSelect: (sessionId: string) => void;
  loading: boolean;
}

/**
 * Lista de turnos, la unidad real de la operación. Se nombra por la APERTURA:
 * una jornada que abre viernes 21:00 y cierra sábado 06:00 es "el turno del
 * viernes", y aparece como una sola fila aunque cruce la medianoche.
 */
export default function TurnoSelector({ turnos, seleccionado, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="data-card text-center py-10">
        <div className="neon-text-cyan font-mono animate-glow">Cargando turnos...</div>
      </div>
    );
  }

  if (turnos.length === 0) {
    return (
      <div className="data-card text-center py-10">
        <div className="text-4xl mb-3">🗓️</div>
        <div className="text-[var(--text-secondary)]">Todavía no hay turnos registrados</div>
      </div>
    );
  }

  return (
    <div className="data-card p-0 overflow-hidden">
      {/* Encabezado: en desktop hace de cabecera de tabla */}
      <div className="hidden md:grid grid-cols-[1.6fr_1fr_0.9fr_1fr_1fr] gap-3 px-4 py-2.5 border-b border-[var(--slate-gray)] bg-[var(--dark-bg)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
        <div>Turno</div>
        <div>Cajero</div>
        <div className="text-right">Ventas</div>
        <div className="text-right">Ingresos</div>
        <div className="text-right">Ganancia</div>
      </div>

      <div className="divide-y divide-[var(--slate-gray)] max-h-[28rem] overflow-y-auto">
        {turnos.map((t) => {
          const { dia, fecha, rango, cruzaMedianoche } = etiquetaTurno(t.session);
          const activo = seleccionado === t.session.id;
          const abierto = t.session.estado === "abierta";
          const sinArqueo = !abierto && t.session.efectivo_contado_uyu == null;

          return (
            <button
              key={t.session.id}
              onClick={() => onSelect(t.session.id)}
              aria-current={activo ? "true" : undefined}
              className={`w-full text-left px-4 py-3 transition-colors grid grid-cols-1 md:grid-cols-[1.6fr_1fr_0.9fr_1fr_1fr] gap-1 md:gap-3 md:items-center ${
                activo
                  ? "bg-[var(--magenta-glow)] border-l-2 border-[var(--neon-magenta)]"
                  : "border-l-2 border-transparent hover:bg-[var(--carbon-gray)]"
              }`}
            >
              {/* Turno: día + fecha + rango horario */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold ${activo ? "text-[var(--neon-magenta)]" : "text-[var(--text-primary)]"}`}>
                    {dia}
                  </span>
                  <span className="font-mono text-sm text-[var(--text-secondary)]">{fecha}</span>
                  {abierto && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--success)] text-[var(--dark-bg)]">
                      En curso
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                  {rango}
                  {cruzaMedianoche && <span className="ml-1.5 opacity-70">🌙</span>}
                </div>
              </div>

              {/* Cajero */}
              <div className="text-sm text-[var(--text-secondary)] truncate">
                {t.session.cajero}
                {t.session.cerrado_por && t.session.cerrado_por !== t.session.cajero && (
                  <span className="block text-[10px] text-[var(--text-muted)]">
                    cerró: {t.session.cerrado_por}
                  </span>
                )}
              </div>

              {/* Cantidad de ventas */}
              <div className="text-sm md:text-right font-mono text-[var(--text-secondary)]">
                {t.cantidadVentas}
                {t.cantidadAnuladas > 0 && (
                  <span className="text-[var(--error)] text-xs"> (−{t.cantidadAnuladas})</span>
                )}
              </div>

              {/* Ingresos */}
              <div className="md:text-right font-mono font-bold neon-text-cyan">
                $ {fmt(t.ingresos)}
              </div>

              {/* Ganancia. Si buena parte del ingreso viene de productos sin costo
                  cargado, el número está inflado: se marca en vez de mentir. */}
              <div className="md:text-right">
                <div
                  className={`font-mono font-bold ${
                    t.ganancia >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"
                  }`}
                  title={
                    t.coberturaCosto < 0.9
                      ? `Estimada: $${fmt(t.facturadoSinCosto)} facturados son de productos sin costo cargado`
                      : undefined
                  }
                >
                  $ {fmt(t.ganancia)}
                  {t.coberturaCosto < 0.9 && <span className="text-[var(--warning)]"> *</span>}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {t.coberturaCosto < 0.9
                    ? `estimada · ${(t.coberturaCosto * 100).toFixed(0)}% con costo`
                    : `${t.margenPorcentaje.toFixed(0)}% margen`}
                </div>
              </div>

              {/* Avisos que importan para la caja */}
              {(sinArqueo || t.cantidadReasignadas > 0 || (t.session.cantidad_anuladas_post_cierre ?? 0) > 0) && (
                <div className="md:col-span-5 flex flex-wrap gap-2 mt-1 text-[10px]">
                  {sinArqueo && (
                    <span className="text-[var(--warning)]">⚠ sin arqueo</span>
                  )}
                  {(t.session.cantidad_anuladas_post_cierre ?? 0) > 0 && (
                    <span className="text-[var(--warning)]">
                      ⚠ {t.session.cantidad_anuladas_post_cierre} anulada(s) tras el cierre
                    </span>
                  )}
                  {t.cantidadReasignadas > 0 && (
                    <span className="text-[var(--text-muted)]">
                      ↪ {t.cantidadReasignadas} venta(s) vinieron de un turno anterior
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

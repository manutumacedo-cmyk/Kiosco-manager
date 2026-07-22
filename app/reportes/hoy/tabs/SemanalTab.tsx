import type { GananciaReal } from "@/lib/services/reports";
import type { MetricasPeriodo } from "@/lib/services/dashboardAnalytics";
import { MetricCard, Panel, EmptyState, GananciaRealBreakdown, Dot, TH, TROW, money } from "../dashboardUi";
import type { MetodoFilter } from "../types";

interface DiaResumen {
  fecha: Date;
  total: number;
  cantidad: number;
}

export function SemanalTab({
  metricasSemanalesFiltradas,
  gananciaRealSemanal,
  metodoFilterSemanal,
  onCycleMetodoFilter,
  ventasPorDia,
}: {
  metricasSemanalesFiltradas: MetricasPeriodo;
  gananciaRealSemanal: GananciaReal;
  metodoFilterSemanal: MetodoFilter;
  onCycleMetodoFilter: () => void;
  ventasPorDia: DiaResumen[];
}) {
  return (
    <div className="space-y-6">
      {/* Filtro por método de pago */}
      <div className="flex justify-end">
        <button
          onClick={onCycleMetodoFilter}
          className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-colors"
        >
          Método: {metodoFilterSemanal === "todos" ? "Todos" : metodoFilterSemanal}
        </button>
      </div>

      {/* Totales Semanales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MetricCard
          accent="cyan"
          label="Ingresos (7 sesiones)"
          value={money(metricasSemanalesFiltradas.totalIngresos)}
          sub={`${metricasSemanalesFiltradas.ventasCount} ventas`}
        />
        <MetricCard
          accent="magenta"
          hero
          label="Ganancia real"
          value={money(gananciaRealSemanal.gananciaReal)}
          sub={
            metodoFilterSemanal === "todos"
              ? `Margen ${gananciaRealSemanal.margenPorcentaje.toFixed(1)}% · resta costo y salidas de caja`
              : `Margen ${gananciaRealSemanal.margenPorcentaje.toFixed(1)}% · sin salidas (filtrado por ${metodoFilterSemanal})`
          }
        />
        <MetricCard
          accent="neutral"
          label="Promedio por día"
          value={money(metricasSemanalesFiltradas.totalIngresos / 7)}
        />
      </div>

      <GananciaRealBreakdown
        ingresos={gananciaRealSemanal.ingresos}
        costoMercaderia={gananciaRealSemanal.costoMercaderia}
        salidasPorCategoria={gananciaRealSemanal.salidasPorCategoria}
        totalSalidasUyu={gananciaRealSemanal.totalSalidasUyu}
        totalSalidasBrl={gananciaRealSemanal.totalSalidasBrl}
        gananciaReal={gananciaRealSemanal.gananciaReal}
        ocultoPorFiltro={metodoFilterSemanal === "todos" ? undefined : metodoFilterSemanal}
      />

      {/* Tabla Comparativa por Día */}
      <Panel title="Comparativa día por día" accent="magenta">
        {ventasPorDia.length === 0 ? (
          <EmptyState>
            {metodoFilterSemanal === "todos" ? "Sin datos esta semana" : `Sin ventas con método "${metodoFilterSemanal}" esta semana`}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--slate-gray)]">
                <tr>
                  <th className={`${TH} text-left`}>Día</th>
                  <th className={`${TH} text-left`}>Fecha</th>
                  <th className={`${TH} text-right`}>Cant. ventas</th>
                  <th className={`${TH} text-right`}>Total vendido</th>
                  <th className={`${TH} text-right`}>% del total</th>
                </tr>
              </thead>
              <tbody>
                {ventasPorDia.map((dia, index) => {
                  const diaSemana = dia.fecha.toLocaleDateString('es-AR', { weekday: 'long' });
                  const fechaFormato = dia.fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  const porcentaje = (dia.total / metricasSemanalesFiltradas.totalIngresos) * 100;
                  const esMejorDia = dia.total === Math.max(...ventasPorDia.map(d => d.total));

                  return (
                    <tr
                      key={index}
                      className={TROW}
                      style={esMejorDia ? { background: "rgba(255,255,255,0.04)" } : undefined}
                    >
                      <td className="p-3 text-[var(--text-primary)] font-semibold capitalize" style={esMejorDia ? { borderLeft: "3px solid var(--magenta-core)" } : undefined}>
                        {diaSemana}
                        {esMejorDia && <span className="ml-2"><Dot color="var(--magenta-core)" title="Mejor día" /></span>}
                      </td>
                      <td className="p-3 text-[var(--text-secondary)] font-mono tabular-nums">
                        {fechaFormato}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {dia.cantidad}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold" style={{ color: "var(--magenta-core)" }}>
                        {money(dia.total)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {porcentaje.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

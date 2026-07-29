import type { GananciaReal } from "@/lib/services/reports";
import type { SaleWithItems } from "@/lib/services/reports";
import type { MetricasPeriodo } from "@/lib/services/dashboardAnalytics";
import { MetricCard, Panel, EmptyState, GananciaRealBreakdown, TH, TROW, money } from "../dashboardUi";
import type { MetodoFilter, ItemsOrder } from "../types";

export function DiarioTab({
  metricasDiariasFiltradas,
  gananciaRealDiaria,
  metodoFilterDiario,
  onCycleMetodoFilter,
  sortDiario,
  onToggleSortHora,
  onToggleSortTotal,
  itemsOrderDiario,
  onCycleItemsOrder,
  ventasDiarioOrdenadas,
}: {
  metricasDiariasFiltradas: MetricasPeriodo;
  gananciaRealDiaria: GananciaReal;
  metodoFilterDiario: MetodoFilter;
  onCycleMetodoFilter: () => void;
  sortDiario: { column: "hora" | "total"; direction: "asc" | "desc" };
  onToggleSortHora: () => void;
  onToggleSortTotal: () => void;
  itemsOrderDiario: ItemsOrder;
  onCycleItemsOrder: () => void;
  ventasDiarioOrdenadas: SaleWithItems[];
}) {
  return (
    <div className="space-y-6">
      {/* Total Acumulado del Día */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MetricCard
          accent="cyan"
          label="Ingresos hoy"
          value={money(metricasDiariasFiltradas.totalIngresos)}
          sub={`${metricasDiariasFiltradas.ventasCount} ventas${metodoFilterDiario !== "todos" ? ` · ${metodoFilterDiario}` : ""}`}
        />
        <MetricCard
          accent="magenta"
          hero
          label="Ganancia real"
          value={money(gananciaRealDiaria.gananciaReal)}
          sub={
            metodoFilterDiario === "todos"
              ? `Margen ${gananciaRealDiaria.margenPorcentaje.toFixed(1)}% · resta costo y salidas de caja`
              : `Margen ${gananciaRealDiaria.margenPorcentaje.toFixed(1)}% · sin salidas (filtrado por ${metodoFilterDiario})`
          }
        />
        <MetricCard
          accent="cost"
          label="Costos hoy"
          value={money(metricasDiariasFiltradas.totalCostos)}
        />
      </div>

      <GananciaRealBreakdown
        ingresos={gananciaRealDiaria.ingresos}
        costoMercaderia={gananciaRealDiaria.costoMercaderia}
        salidasPorCategoria={gananciaRealDiaria.salidasPorCategoria}
        totalSalidasUyu={gananciaRealDiaria.totalSalidasUyu}
        totalSalidasBrl={gananciaRealDiaria.totalSalidasBrl}
        gananciaReal={gananciaRealDiaria.gananciaReal}
        ocultoPorFiltro={metodoFilterDiario === "todos" ? undefined : metodoFilterDiario}
      />

      {/* Tabla de Ventas Detallada */}
      <Panel title="Detalle de ventas del día" accent="cyan">
        {ventasDiarioOrdenadas.length === 0 && metodoFilterDiario === "todos" ? (
          <EmptyState>Sin ventas hoy</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--slate-gray)]">
                <tr>
                  <th className={`${TH} text-left`}>Ticket</th>
                  <th className={`${TH} text-left`}>
                    <button onClick={onToggleSortHora} className="flex items-center gap-1 uppercase tracking-wider hover:text-[var(--neon-cyan)] transition-colors">
                      Hora {sortDiario.column === "hora" ? (sortDiario.direction === "desc" ? "↓" : "↑") : ""}
                    </button>
                  </th>
                  <th className={`${TH} text-left`}>
                    <button onClick={onCycleItemsOrder} className="flex items-center gap-1 uppercase tracking-wider hover:text-[var(--neon-cyan)] transition-colors">
                      Items {itemsOrderDiario === "az" ? "A-Z" : itemsOrderDiario === "za" ? "Z-A" : ""}
                    </button>
                  </th>
                  <th className={`${TH} text-left`}>
                    <button onClick={onCycleMetodoFilter} className="flex items-center gap-1 uppercase tracking-wider hover:text-[var(--neon-cyan)] transition-colors">
                      Método {metodoFilterDiario !== "todos" ? `· ${metodoFilterDiario}` : ""}
                    </button>
                  </th>
                  <th className={`${TH} text-right`}>
                    <button onClick={onToggleSortTotal} className="flex items-center gap-1 uppercase tracking-wider hover:text-[var(--neon-cyan)] transition-colors ml-auto">
                      Total {sortDiario.column === "total" ? (sortDiario.direction === "desc" ? "↓" : "↑") : ""}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ventasDiarioOrdenadas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[var(--text-muted)] font-mono text-sm">
                      Sin ventas con método &quot;{metodoFilterDiario}&quot;
                    </td>
                  </tr>
                )}
                {ventasDiarioOrdenadas.map((sale) => {
                  const fecha = new Date(sale.fecha);
                  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                  const items = sale.sale_items || [];
                  const orderedItems =
                    itemsOrderDiario === "original"
                      ? items
                      : [...items].sort((a, b) =>
                          itemsOrderDiario === "az" ? a.nombre.localeCompare(b.nombre) : b.nombre.localeCompare(a.nombre)
                        );
                  const itemsText = orderedItems.map(item =>
                    `${item.cantidad}x ${item.nombre}`
                  ).join(', ');

                  return (
                    <tr key={sale.id} className={TROW}>
                      <td className="p-3 text-[var(--text-muted)] font-mono text-xs">
                        #{sale.id.slice(0, 8)}
                      </td>
                      <td className="p-3 text-[var(--text-secondary)] font-mono tabular-nums">
                        {hora}
                      </td>
                      <td className="p-3 text-[var(--text-secondary)] max-w-xs truncate">
                        {itemsText || 'Sin items'}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-white/[0.05] text-[var(--text-secondary)] border border-[var(--slate-gray)]">
                          {sale.metodo_pago}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold" style={{ color: "var(--magenta-core)" }}>
                        {money(Number(sale.total))}
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

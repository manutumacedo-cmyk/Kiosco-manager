import type { GananciaReal } from "@/lib/services/reports";
import type { MetricasPeriodo, ProductAnalysis } from "@/lib/services/dashboardAnalytics";
import { MetricCard, Panel, GananciaRealBreakdown, TH, TROW, money, margenColor } from "../dashboardUi";
import type { MetodoFilter } from "../types";

export function MensualTab({
  metricasMensualesFiltradas,
  gananciaRealMensual,
  metodoFilterMensual,
  onCycleMetodoFilter,
  restockPromedioMensual,
  masVendidos,
  masRentables,
  combosMes,
}: {
  metricasMensualesFiltradas: MetricasPeriodo;
  gananciaRealMensual: GananciaReal;
  metodoFilterMensual: MetodoFilter;
  onCycleMetodoFilter: () => void;
  restockPromedioMensual: number;
  masVendidos: ProductAnalysis[];
  masRentables: ProductAnalysis[];
  combosMes: ProductAnalysis[];
}) {
  return (
    <div className="space-y-6">
      {/* Filtro por método de pago */}
      <div className="flex justify-end">
        <button
          onClick={onCycleMetodoFilter}
          className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-colors"
        >
          Método: {metodoFilterMensual === "todos" ? "Todos" : metodoFilterMensual}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <MetricCard accent="cyan" label="Ingresos del mes" value={money(metricasMensualesFiltradas.totalIngresos)} sub={`${metricasMensualesFiltradas.ventasCount} ventas`} />
        <MetricCard
          accent="magenta"
          hero
          label="Ganancia real"
          value={money(gananciaRealMensual.gananciaReal)}
          sub={metodoFilterMensual === "todos" ? "Resta costo y salidas de caja" : `Sin salidas (filtrado por ${metodoFilterMensual})`}
        />
        <MetricCard accent="cost" label="Costos del mes" value={money(metricasMensualesFiltradas.totalCostos)} valueColor="var(--warning)" />
        <MetricCard
          accent="cyan"
          label="Margen real"
          value={`${gananciaRealMensual.margenPorcentaje.toFixed(1)}%`}
          valueColor={margenColor(gananciaRealMensual.margenPorcentaje)}
        />
      </div>
      {metodoFilterMensual !== "todos" && (
        <p className="text-xs text-[var(--text-muted)] -mt-4">
          Los productos, combos y horarios de abajo no están filtrados por método (solo las tarjetas de arriba).
        </p>
      )}

      <GananciaRealBreakdown
        ingresos={gananciaRealMensual.ingresos}
        costoMercaderia={gananciaRealMensual.costoMercaderia}
        salidasPorCategoria={gananciaRealMensual.salidasPorCategoria}
        totalSalidasUyu={gananciaRealMensual.totalSalidasUyu}
        totalSalidasBrl={gananciaRealMensual.totalSalidasBrl}
        gananciaReal={gananciaRealMensual.gananciaReal}
        ocultoPorFiltro={metodoFilterMensual === "todos" ? undefined : metodoFilterMensual}
      />

      <Panel title="Proyección de restock" accent="cost">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Restock este mes</div>
            <div className="text-2xl font-bold mt-1 font-mono tabular-nums" style={{ color: "var(--warning)" }}>
              {money(gananciaRealMensual.salidasPorCategoria.restock)}
            </div>
          </div>
          <div>
            <div className="text-[var(--text-muted)] text-xs uppercase tracking-wider">Promedio mensual (últimos 3 meses)</div>
            <div className="text-2xl font-bold mt-1 font-mono tabular-nums" style={{ color: "var(--text-primary)" }}>
              {money(restockPromedioMensual)}
            </div>
          </div>
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-3">
          Para planificar cuánto vas a necesitar mes a mes en reposición, usá el promedio: es más estable que el
          gasto de un solo mes.
        </p>
      </Panel>

      {/* Top productos del mes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Más vendidos (cantidad)" accent="cyan">
          <div className="space-y-3">
            {masVendidos.map((p, i) => (
              <div key={i} className="flex justify-between items-center border-b border-[var(--slate-gray)] pb-2 last:border-0">
                <span className="text-[var(--text-primary)]">
                  <span className="text-[var(--text-muted)] font-mono mr-2">{i + 1}.</span>{p.nombre}
                  {p.esCombo && <span className="ml-2 text-[10px] text-[var(--magenta-core)] font-bold border border-[var(--magenta-mid)] px-1 rounded">COMBO</span>}
                </span>
                <span className="font-mono tabular-nums font-bold text-[var(--text-primary)]">{p.cantidad} u.</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Más rentables (ganancia)" accent="magenta">
          <div className="space-y-3">
            {masRentables.map((p, i) => (
              <div key={i} className="flex justify-between items-center border-b border-[var(--slate-gray)] pb-2 last:border-0">
                <span className="text-[var(--text-primary)]">
                  <span className="text-[var(--text-muted)] font-mono mr-2">{i + 1}.</span>{p.nombre}
                  {p.esCombo && <span className="ml-2 text-[10px] text-[var(--magenta-core)] font-bold border border-[var(--magenta-mid)] px-1 rounded">COMBO</span>}
                </span>
                <span className="font-mono tabular-nums font-bold" style={{ color: "var(--magenta-core)" }}>{money(p.gananciaTotal)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Combos del mes */}
      {combosMes.length > 0 && (
        <Panel title="Combos vendidos este mes" accent="magenta">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--slate-gray)]">
                <tr>
                  <th className={`${TH} text-left`}>Combo</th>
                  <th className={`${TH} text-right`}>Vendidos</th>
                  <th className={`${TH} text-right`}>Ingresos</th>
                  <th className={`${TH} text-right`}>Ganancia</th>
                  <th className={`${TH} text-right`}>Margen %</th>
                </tr>
              </thead>
              <tbody>
                {combosMes.sort((a, b) => b.gananciaTotal - a.gananciaTotal).map((c, i) => (
                  <tr key={i} className={TROW}>
                    <td className="p-3 text-[var(--text-primary)] font-medium">{c.nombre}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{c.cantidad}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{money(c.ingresoTotal)}</td>
                    <td className="p-3 text-right font-mono tabular-nums font-bold" style={{ color: "var(--magenta-core)" }}>{money(c.gananciaTotal)}</td>
                    <td className="p-3 text-right font-mono tabular-nums font-bold" style={{ color: margenColor(c.margenPorcentaje) }}>
                      {c.margenPorcentaje.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

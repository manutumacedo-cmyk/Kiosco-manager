import type { GananciaReal } from "@/lib/services/reports";
import type { MetricasPeriodo, ProductAnalysis } from "@/lib/services/dashboardAnalytics";
import { MetricCard, Panel, EmptyState, Dot, TH, TROW, money, margenColor } from "../dashboardUi";

export function MargenTab({
  gananciaRealMensualSinFiltro,
  metricasMensuales,
  productosMes,
  combosMes,
  todosLosMes,
  masRentables,
  menosRentables,
}: {
  gananciaRealMensualSinFiltro: GananciaReal;
  metricasMensuales: MetricasPeriodo;
  productosMes: ProductAnalysis[];
  combosMes: ProductAnalysis[];
  todosLosMes: ProductAnalysis[];
  masRentables: ProductAnalysis[];
  menosRentables: ProductAnalysis[];
}) {
  return (
    <div className="space-y-6">
      {/* Resumen general de margen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          accent="cyan"
          label="Margen real promedio"
          value={`${gananciaRealMensualSinFiltro.margenPorcentaje.toFixed(1)}%`}
          valueColor={margenColor(gananciaRealMensualSinFiltro.margenPorcentaje)}
          sub={
            <span className="inline-flex items-center gap-1.5">
              <Dot color={margenColor(gananciaRealMensualSinFiltro.margenPorcentaje)} />
              {gananciaRealMensualSinFiltro.margenPorcentaje > 40 ? "Excelente" : gananciaRealMensualSinFiltro.margenPorcentaje > 25 ? "Bueno" : "Bajo"}
            </span>
          }
        />
        <MetricCard
          accent="magenta"
          hero
          label="Ganancia real (mes)"
          value={money(gananciaRealMensualSinFiltro.gananciaReal)}
          sub={`Ingresos: ${money(gananciaRealMensualSinFiltro.ingresos)}`}
        />
        <MetricCard
          accent="cost"
          label="Costos + salidas totales"
          value={money(gananciaRealMensualSinFiltro.costoMercaderia + gananciaRealMensualSinFiltro.totalSalidasUyu)}
          valueColor="var(--warning)"
          sub={gananciaRealMensualSinFiltro.ingresos > 0
            ? `${(((gananciaRealMensualSinFiltro.costoMercaderia + gananciaRealMensualSinFiltro.totalSalidasUyu) / gananciaRealMensualSinFiltro.ingresos) * 100).toFixed(1)}% de ingresos`
            : undefined}
        />
      </div>

      {/* Tabla completa de análisis de margen por producto */}
      <Panel
        title="Margen por producto y combo (último mes)"
        accent="magenta"
        right={`${productosMes.length} productos · ${combosMes.length} combos`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--slate-gray)]">
              <tr>
                <th className={`${TH} text-left`}>#</th>
                <th className={`${TH} text-left`}>Producto</th>
                <th className={`${TH} text-right`}>Vendido</th>
                <th className={`${TH} text-right`}>Ingresos</th>
                <th className={`${TH} text-right`}>Ganancia</th>
                <th className={`${TH} text-right`}>Margen %</th>
                <th className={`${TH} text-center`}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {todosLosMes
                .sort((a, b) => b.gananciaTotal - a.gananciaTotal)
                .map((p, i) => {
                  return (
                    <tr key={i} className={TROW}>
                      <td className="p-3 text-[var(--text-muted)] font-mono tabular-nums">{i + 1}</td>
                      <td className="p-3 text-[var(--text-primary)] font-medium">
                        {p.nombre}
                        {p.esCombo && <span className="ml-2 text-[10px] text-[var(--magenta-core)] font-bold border border-[var(--magenta-mid)] px-1 rounded">COMBO</span>}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{p.cantidad}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {money(p.ingresoTotal)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold" style={{ color: "var(--magenta-core)" }}>
                        {money(p.gananciaTotal)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-base" style={{ color: margenColor(p.margenPorcentaje) }}>
                        {p.margenPorcentaje.toFixed(1)}%
                      </td>
                      <td className="p-3 text-center">
                        <Dot color={margenColor(p.margenPorcentaje)} title={`Margen ${p.margenPorcentaje.toFixed(1)}%`} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot className="border-t-2 border-[var(--slate-gray)]">
              <tr>
                <td colSpan={3} className="p-3 text-[var(--text-primary)] font-bold uppercase text-xs tracking-wide">
                  Total general
                </td>
                <td className="p-3 text-right font-mono tabular-nums font-bold text-[var(--text-secondary)]">
                  {money(metricasMensuales.totalIngresos)}
                </td>
                <td className="p-3 text-right font-mono tabular-nums font-bold" style={{ color: "var(--magenta-core)" }}>
                  {money(metricasMensuales.gananciaLimpia)}
                </td>
                <td className="p-3 text-right font-mono tabular-nums font-bold text-base" style={{ color: margenColor(metricasMensuales.margenPorcentaje) }}>
                  {metricasMensuales.margenPorcentaje.toFixed(1)}%
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {todosLosMes.length === 0 && (
          <EmptyState>No hay datos de productos en el último mes</EmptyState>
        )}
      </Panel>

      {/* Recomendaciones basadas en margen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 más rentables */}
        <Panel title="Top 5 más rentables" accent="cyan">
          <div className="space-y-3">
            {masRentables.map((p, i) => (
              <div key={i} className="border-b border-[var(--slate-gray)] pb-2 last:border-0">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)] font-mono mr-2">{i + 1}.</span>{p.nombre}
                  </span>
                  <span className="font-mono tabular-nums text-sm font-bold" style={{ color: "var(--success)" }}>
                    {money(p.gananciaTotal)}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">
                  Margen: {p.margenPorcentaje.toFixed(1)}% • Vendido: {p.cantidad}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Items con margen bajo que requieren atención */}
        <Panel title="Productos a revisar (margen bajo)" accent="cost">
          <div className="space-y-3">
            {menosRentables.map((p, i) => (
              <div key={i} className="border-b border-[var(--slate-gray)] pb-2 last:border-0">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-primary)]">{p.nombre}</span>
                  <span className="font-mono tabular-nums text-sm font-bold" style={{ color: margenColor(p.margenPorcentaje) }}>
                    {p.margenPorcentaje.toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">
                  Ganancia: {money(p.gananciaTotal)} • Vendido: {p.cantidad}
                </div>
                <div className="text-xs mt-1 flex items-center gap-1.5" style={{ color: p.margenPorcentaje < 15 ? "var(--error)" : "var(--warning)" }}>
                  <Dot color={p.margenPorcentaje < 15 ? "var(--error)" : "var(--warning)"} />
                  {p.margenPorcentaje < 15 ? 'Crítico: aumentar precio o cambiar proveedor' : 'Revisar costos'}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

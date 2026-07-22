import type { ProductAnalysis } from "@/lib/services/dashboardAnalytics";
import { Panel, EmptyState, TH, TROW, money, margenColor } from "../dashboardUi";

export function EstrategicoTab({
  insights,
  menosRentables,
  horariosPico,
  productosMes,
}: {
  insights: string[];
  menosRentables: ProductAnalysis[];
  horariosPico: [number, number][];
  productosMes: ProductAnalysis[];
}) {
  return (
    <div className="space-y-6">
      {/* Insights y recomendaciones */}
      <Panel title="Ideas para mejorar ingresos" accent="magenta">
        <div className="space-y-3">
          {insights.length === 0 ? (
            <EmptyState>Sin sugerencias por ahora</EmptyState>
          ) : (
            insights.map((insight, i) => (
              <div
                key={i}
                className="rounded-r-lg p-4 bg-white/[0.02]"
                style={{ borderLeft: "4px solid var(--magenta-mid)" }}
              >
                <p className="text-[var(--text-primary)]">{insight}</p>
              </div>
            ))
          )}
        </div>
      </Panel>

      {/* Análisis de rentabilidad */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Items a reajustar (bajo margen)" accent="cost">
          <div className="space-y-3">
            {menosRentables.map((p, i) => (
              <div key={i} className="border-b border-[var(--slate-gray)] pb-2 last:border-0">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-primary)]">{p.nombre}</span>
                  <span className="font-mono tabular-nums text-sm font-bold" style={{ color: margenColor(p.margenPorcentaje) }}>{p.margenPorcentaje.toFixed(1)}%</span>
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">
                  Ganancia total: {money(p.gananciaTotal)}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Horarios pico */}
        <Panel title="Horarios pico de venta" accent="cyan">
          <div className="space-y-3">
            {horariosPico.map(([hora, ventas], i) => (
              <div key={i} className="flex justify-between items-center border-b border-[var(--slate-gray)] pb-2 last:border-0">
                <span className="text-[var(--text-primary)]">{hora}:00 – {hora + 1}:00 hs</span>
                <span className="font-mono tabular-nums font-bold text-[var(--text-primary)]">{ventas} ventas</span>
              </div>
            ))}
          </div>
          {horariosPico.length === 0 && <EmptyState>Sin datos suficientes</EmptyState>}
        </Panel>
      </div>

      {/* Comparativa volumen vs ganancia */}
      <Panel title="Análisis: volumen vs rentabilidad" accent="magenta">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--slate-gray)]">
              <tr>
                <th className={`${TH} text-left`}>Producto</th>
                <th className={`${TH} text-right`}>Cantidad</th>
                <th className={`${TH} text-right`}>Ingresos</th>
                <th className={`${TH} text-right`}>Ganancia</th>
                <th className={`${TH} text-right`}>Margen %</th>
              </tr>
            </thead>
            <tbody>
              {productosMes.sort((a, b) => b.gananciaTotal - a.gananciaTotal).slice(0, 10).map((p, i) => (
                <tr key={i} className={TROW}>
                  <td className="p-3 text-[var(--text-primary)]">{p.nombre}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{p.cantidad}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{money(p.ingresoTotal)}</td>
                  <td className="p-3 text-right font-mono tabular-nums font-bold" style={{ color: "var(--magenta-core)" }}>{money(p.gananciaTotal)}</td>
                  <td className="p-3 text-right font-mono tabular-nums font-bold" style={{ color: margenColor(p.margenPorcentaje) }}>
                    {p.margenPorcentaje.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

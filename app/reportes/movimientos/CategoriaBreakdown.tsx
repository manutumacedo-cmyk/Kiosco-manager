import type { CategoriaSalida } from "@/types";
import { CATEGORIA_LABEL, CATEGORIA_TIPO_GASTO, TIPO_GASTO_LABEL, money } from "@/lib/format";
import { Panel, Dot, TH, TROW } from "@/app/reportes/hoy/dashboardUi";

const CATEGORIAS_ORDEN: CategoriaSalida[] = ["restock", "proveedor", "funcionario", "gasto_personal", "otro"];

const TIPO_GASTO_COLOR: Record<"fijo" | "variable" | "sin_clasificar", string> = {
  fijo: "var(--warning)",
  variable: "var(--cyan-core)",
  sin_clasificar: "var(--slate-gray)",
};

/**
 * Desglose de salidas por categoría (del período filtrado), con la clasificación
 * fijo/variable de cada una. El gasto variable (restock, proveedor) se puede ajustar
 * rápido si cae la venta; el fijo (funcionario, gasto_personal) sigue igual aunque
 * la venta baje — es el que más pesa en un mes flojo.
 */
export function CategoriaBreakdown({
  salidasPorCategoria,
  totalSalidasBrl,
}: {
  salidasPorCategoria: Record<CategoriaSalida, number>;
  /** Salidas en BRL del mismo período — no entran en la tabla/clasificación de abajo
   *  (que solo suma UYU, igual que el resto del dashboard) para no mezclar monedas. */
  totalSalidasBrl?: number;
}) {
  const totalFijo = CATEGORIAS_ORDEN
    .filter((c) => CATEGORIA_TIPO_GASTO[c] === "fijo")
    .reduce((sum, c) => sum + salidasPorCategoria[c], 0);
  const totalVariable = CATEGORIAS_ORDEN
    .filter((c) => CATEGORIA_TIPO_GASTO[c] === "variable")
    .reduce((sum, c) => sum + salidasPorCategoria[c], 0);
  const totalGeneral = totalFijo + totalVariable + (salidasPorCategoria.otro ?? 0);

  return (
    <Panel title="Salidas por categoría — fijo vs. variable (en UYU)" accent="cost">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]">
          <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Dot color={TIPO_GASTO_COLOR.fijo} /> Gasto fijo (funcionarios + personal)
          </span>
          <span className="font-mono font-bold" style={{ color: TIPO_GASTO_COLOR.fijo }}>{money(totalFijo)}</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]">
          <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Dot color={TIPO_GASTO_COLOR.variable} /> Gasto variable (restock + proveedor)
          </span>
          <span className="font-mono font-bold" style={{ color: TIPO_GASTO_COLOR.variable }}>{money(totalVariable)}</span>
        </div>
      </div>
      {totalGeneral > 0 && (
        <p className="text-xs text-[var(--text-muted)] mb-4">
          El gasto fijo no baja aunque la venta caiga un mes — es el que más pesa en un mes flojo. El variable se
          puede ajustar más rápido (comprar menos restock, negociar con el proveedor).
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--slate-gray)]">
            <tr>
              <th className={`${TH} text-left`}>Categoría</th>
              <th className={`${TH} text-left`}>Tipo</th>
              <th className={`${TH} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIAS_ORDEN.map((c) => (
              <tr key={c} className={TROW}>
                <td className="p-3 text-[var(--text-primary)]">{CATEGORIA_LABEL[c]}</td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <Dot color={TIPO_GASTO_COLOR[CATEGORIA_TIPO_GASTO[c]]} />
                    {TIPO_GASTO_LABEL[CATEGORIA_TIPO_GASTO[c]]}
                  </span>
                </td>
                <td className="p-3 text-right font-mono tabular-nums font-bold text-[var(--warning)]">
                  {money(salidasPorCategoria[c])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!totalSalidasBrl && totalSalidasBrl > 0 && (
        <p className="text-xs text-[var(--text-muted)] mt-3">
          + Salidas en BRL: R${totalSalidasBrl.toFixed(2)} (no incluidas arriba — esta clasificación es solo en
          pesos, ver el detalle de movimientos para el gasto en reales)
        </p>
      )}
    </Panel>
  );
}

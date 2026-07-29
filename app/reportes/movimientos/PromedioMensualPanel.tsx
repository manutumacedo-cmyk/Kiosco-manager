import type { CategoriaSalida } from "@/types";
import { CATEGORIA_LABEL, money } from "@/lib/format";
import { Panel } from "@/app/reportes/hoy/dashboardUi";

const CATEGORIAS_ORDEN: CategoriaSalida[] = ["restock", "proveedor", "funcionario", "gasto_personal", "otro"];

/**
 * "Burn rate" bruto por categoría: promedio mensual de los últimos ~3 meses de historia
 * (no depende del filtro de fecha de la tabla — es una foto de ritmo histórico, no del
 * período que se está mirando). Sirve para proyectar cuánto vas a necesitar el mes que
 * viene en cada categoría.
 */
export function PromedioMensualPanel({ promedios }: { promedios: Record<CategoriaSalida, number> }) {
  return (
    <Panel title="Promedio mensual por categoría en UYU (últimos ~3 meses)" accent="magenta">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {CATEGORIAS_ORDEN.map((c) => (
          <div key={c}>
            <div className="text-[var(--text-muted)] text-xs uppercase tracking-wider">{CATEGORIA_LABEL[c]}</div>
            <div className="text-xl font-bold mt-1 font-mono tabular-nums text-[var(--text-primary)]">
              {money(promedios[c])}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--text-muted)] mt-4">
        Es el ritmo histórico ("burn rate"), no el gasto del período que estás filtrando abajo — sirve para
        planificar cuánto vas a necesitar mes a mes en cada categoría.
      </p>
    </Panel>
  );
}

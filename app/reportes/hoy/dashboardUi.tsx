import type { ReactNode } from "react";
import type { CategoriaSalida } from "@/types";
import { CATEGORIA_LABEL, money } from "@/lib/format";

export { CATEGORIA_LABEL, money };

// ========== LENGUAJE VISUAL (legibilidad primero) ==========
// Glow reservado a marca/activo/acción (ver globals.css). Los datos van limpios:
// color sólido, sin text-shadow, sin pulsos. El color comunica rol, no decora.
export type Accent = "cyan" | "magenta" | "cost" | "neutral";

export const ACCENT: Record<Accent, string> = {
  cyan: "var(--cyan-core)",        // informativo / neutro
  magenta: "var(--magenta-core)",  // ganancia / héroe
  cost: "var(--warning)",          // costos
  neutral: "var(--slate-gray)",    // sin énfasis
};

export const margenColor = (m: number) =>
  m > 40 ? "var(--success)" : m > 20 ? "var(--warning)" : "var(--error)";

export const TH = "p-3 text-[var(--text-muted)] uppercase text-[11px] tracking-wider font-semibold";
export const TROW = "border-t border-[var(--slate-gray)] hover:bg-white/[0.03] transition-colors";

/** Tarjeta de métrica: etiqueta chica → valor grande sólido → contexto. Barra de
 *  acento a la izquierda para el rol; `hero` colorea el valor (única jerarquía fuerte). */
export function MetricCard({
  label,
  value,
  sub,
  accent = "neutral",
  hero = false,
  valueColor,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: Accent;
  hero?: boolean;
  valueColor?: string;
}) {
  const color = valueColor ?? (hero ? ACCENT[accent] : "var(--text-primary)");
  return (
    <div className="data-card" style={{ borderLeftWidth: 4, borderLeftColor: ACCENT[accent] }}>
      <div className="text-[var(--text-muted)] text-xs uppercase tracking-wider">{label}</div>
      <div className="text-4xl font-bold mt-2 leading-tight tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[var(--text-secondary)] text-sm mt-2 font-mono">{sub}</div>}
    </div>
  );
}

/** Panel de sección: superficie calma + título sobrio con una fina barra de acento.
 *  Reemplaza los `data-card neon-outline-*` con header brillante. */
export function Panel({
  title,
  accent = "cyan",
  right,
  children,
}: {
  title?: string;
  accent?: Accent;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="data-card">
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="inline-block w-1 h-5 rounded-full shrink-0"
              style={{ background: ACCENT[accent] }}
            />
            {title && (
              <h2 className="text-[var(--text-primary)] font-bold text-lg uppercase tracking-wide truncate">
                {title}
              </h2>
            )}
          </div>
          {right && <div className="shrink-0 text-sm text-[var(--text-secondary)]">{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="text-center py-8 text-[var(--text-muted)] font-mono text-sm">{children}</div>;
}

/** Marcador mnemónico sobrio: punto de color en la paleta de marca, sin emoji decorativo. */
export function Dot({ color, title }: { color: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-block w-2 h-2 rounded-full align-middle"
      style={{ background: color }}
    />
  );
}

/** Desglose de "Ganancia real": Ventas − Costo mercadería − Salidas (por categoría) = Ganancia real.
 *  Las entradas (plata que no es venta) y las salidas en BRL se muestran aparte, informativas. */
export function GananciaRealBreakdown({
  ingresos,
  costoMercaderia,
  salidasPorCategoria,
  totalSalidasUyu,
  totalSalidasBrl,
  gananciaReal,
  ocultoPorFiltro,
}: {
  ingresos: number;
  costoMercaderia: number;
  salidasPorCategoria: Record<CategoriaSalida, number>;
  totalSalidasUyu: number;
  totalSalidasBrl: number;
  gananciaReal: number;
  /** Nombre del método de pago si las salidas no se muestran por estar filtrando (ej. "pix"). */
  ocultoPorFiltro?: string;
}) {
  const categoriasConSalida = (Object.keys(salidasPorCategoria) as CategoriaSalida[]).filter(
    (c) => salidasPorCategoria[c] > 0
  );

  return (
    <Panel title="Cómo se arma la ganancia real" accent="magenta">
      <div className="space-y-1.5 font-mono text-sm">
        <div className="flex justify-between text-[var(--text-secondary)]">
          <span>Ventas</span>
          <span>{money(ingresos)}</span>
        </div>
        <div className="flex justify-between text-[var(--text-secondary)]">
          <span>− Costo mercadería</span>
          <span>−{money(costoMercaderia)}</span>
        </div>
        {totalSalidasUyu > 0 ? (
          <>
            <div className="flex justify-between font-semibold" style={{ color: "var(--warning)" }}>
              <span>− Salidas de caja</span>
              <span>−{money(totalSalidasUyu)}</span>
            </div>
            {categoriasConSalida.map((c) => (
              <div key={c} className="flex justify-between text-xs text-[var(--text-muted)] pl-3">
                <span>{CATEGORIA_LABEL[c]}</span>
                <span>−{money(salidasPorCategoria[c])}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="flex justify-between text-[var(--text-muted)] text-xs">
            <span>− Salidas de caja</span>
            <span>{ocultoPorFiltro ? `no aplica (filtrado por ${ocultoPorFiltro})` : "sin salidas registradas"}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-[var(--slate-gray)] pt-2 mt-1 font-bold text-base" style={{ color: "var(--magenta-core)" }}>
          <span>= Ganancia real</span>
          <span>{money(gananciaReal)}</span>
        </div>
        {totalSalidasBrl > 0 && (
          <div className="text-xs text-[var(--text-muted)] pt-1">
            + Salidas en BRL: R${totalSalidasBrl.toFixed(2)} (no incluidas arriba — sin tasa de cambio registrada por movimiento)
          </div>
        )}
      </div>
    </Panel>
  );
}

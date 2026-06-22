"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import type { Sale, SaleItemWithProduct, Product } from "@/types";
import { fetchDiarioReport, fetchSesionesReport, type SaleWithItems, type ComboSaleData } from "@/lib/services/reports";
import { useToast } from "@/components/ui/Toast";

type TabView = "diario" | "semanal" | "mensual" | "estrategico" | "margen";

interface ProductAnalysis {
  nombre: string;
  cantidad: number;
  gananciaTotal: number;
  margenPorcentaje: number;
  ingresoTotal: number;
  esCombo?: boolean;
}

// ========== LENGUAJE VISUAL (legibilidad primero) ==========
// Glow reservado a marca/activo/acción (ver globals.css). Los datos van limpios:
// color sólido, sin text-shadow, sin pulsos. El color comunica rol, no decora.
type Accent = "cyan" | "magenta" | "cost" | "neutral";

const ACCENT: Record<Accent, string> = {
  cyan: "var(--cyan-core)",        // informativo / neutro
  magenta: "var(--magenta-core)",  // ganancia / héroe
  cost: "var(--warning)",          // costos
  neutral: "var(--slate-gray)",    // sin énfasis
};

const money = (n: number) => `$${Number(n).toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;

const margenColor = (m: number) =>
  m > 40 ? "var(--success)" : m > 20 ? "var(--warning)" : "var(--error)";

const TH = "p-3 text-[var(--text-muted)] uppercase text-[11px] tracking-wider font-semibold";
const TROW = "border-t border-[var(--slate-gray)] hover:bg-white/[0.03] transition-colors";

/** Tarjeta de métrica: etiqueta chica → valor grande sólido → contexto. Barra de
 *  acento a la izquierda para el rol; `hero` colorea el valor (única jerarquía fuerte). */
function MetricCard({
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
function Panel({
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

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="text-center py-8 text-[var(--text-muted)] font-mono text-sm">{children}</div>;
}

export default function DashboardPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabView>("diario");
  const [loading, setLoading] = useState(true);

  // Datos por período
  const [dailyData, setDailyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; salesWithItems: SaleWithItems[]; comboItems: ComboSaleData[] }>({ sales: [], items: [], salesWithItems: [], comboItems: [] });
  const [weeklyData, setWeeklyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; products: Product[]; comboItems: ComboSaleData[] }>({ sales: [], items: [], products: [], comboItems: [] });
  const [monthlyData, setMonthlyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; products: Product[]; comboItems: ComboSaleData[] }>({ sales: [], items: [], products: [], comboItems: [] });

  async function loadAllData() {
    setLoading(true);
    try {
      const [today, week, month] = await Promise.all([
        fetchDiarioReport(),
        fetchSesionesReport(7),
        fetchSesionesReport(30),
      ]);

      setDailyData({ sales: today.sales, items: today.items, salesWithItems: today.salesWithItems, comboItems: today.comboItems });
      setWeeklyData({ sales: week.sales, items: week.items, products: week.products, comboItems: week.comboItems });
      setMonthlyData({ sales: month.sales, items: month.items, products: month.products, comboItems: month.comboItems });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAllData(); }, []);

  // ========== CÁLCULOS GENERALES ==========
  const calcularMetricas = (sales: Sale[], items: SaleItemWithProduct[]) => {
    const totalIngresos = sales.reduce((a, s) => a + Number(s.total), 0);
    const totalCostos = items.reduce((acc, it) => {
      const costo = it.products?.costo ?? 0;
      return acc + (costo * Number(it.cantidad || 0));
    }, 0);
    const gananciaLimpia = totalIngresos - totalCostos;
    const margenPorcentaje = totalIngresos > 0 ? (gananciaLimpia / totalIngresos) * 100 : 0;

    return { totalIngresos, totalCostos, gananciaLimpia, margenPorcentaje, ventasCount: sales.length };
  };

  const analizarProductos = (items: SaleItemWithProduct[]): ProductAnalysis[] => {
    const productMap = new Map<string, ProductAnalysis>();

    // Solo productos individuales (precio_unitario > 0); los componentes de combos tienen precio 0
    items.filter(it => Number(it.precio_unitario) > 0).forEach(it => {
      const nombre = it.products?.nombre ?? "Desconocido";
      const cantidad = Number(it.cantidad || 0);
      const precioVenta = Number(it.precio_unitario || 0);
      const costo = it.products?.costo ?? 0;
      const gananciaUnitaria = precioVenta - costo;
      const gananciaTotal = gananciaUnitaria * cantidad;
      const ingresoTotal = precioVenta * cantidad;

      if (productMap.has(nombre)) {
        const existing = productMap.get(nombre)!;
        existing.cantidad += cantidad;
        existing.gananciaTotal += gananciaTotal;
        existing.ingresoTotal += ingresoTotal;
        existing.margenPorcentaje = existing.ingresoTotal > 0 ? (existing.gananciaTotal / existing.ingresoTotal) * 100 : 0;
      } else {
        productMap.set(nombre, {
          nombre,
          cantidad,
          gananciaTotal,
          ingresoTotal,
          margenPorcentaje: ingresoTotal > 0 ? (gananciaTotal / ingresoTotal) * 100 : 0,
        });
      }
    });

    return Array.from(productMap.values());
  };

  const analizarCombos = (comboItems: ComboSaleData[]): ProductAnalysis[] => {
    const comboMap = new Map<string, ProductAnalysis>();

    comboItems.forEach(c => {
      const nombre = c.combo_nombre;
      const cantidad = Number(c.cantidad || 0);
      const precioVenta = Number(c.precio_unitario || 0);
      const costo = Number(c.costo_unitario || 0);
      const gananciaTotal = (precioVenta - costo) * cantidad;
      const ingresoTotal = precioVenta * cantidad;

      if (comboMap.has(nombre)) {
        const existing = comboMap.get(nombre)!;
        existing.cantidad += cantidad;
        existing.gananciaTotal += gananciaTotal;
        existing.ingresoTotal += ingresoTotal;
        existing.margenPorcentaje = existing.ingresoTotal > 0 ? (existing.gananciaTotal / existing.ingresoTotal) * 100 : 0;
      } else {
        comboMap.set(nombre, {
          nombre,
          cantidad,
          gananciaTotal,
          ingresoTotal,
          margenPorcentaje: ingresoTotal > 0 ? (gananciaTotal / ingresoTotal) * 100 : 0,
          esCombo: true,
        });
      }
    });

    return Array.from(comboMap.values());
  };

  const analizarHorarios = (sales: Sale[]) => {
    const horarios = new Map<number, number>();
    sales.forEach(s => {
      const hora = new Date(s.fecha).getHours();
      horarios.set(hora, (horarios.get(hora) || 0) + 1);
    });
    return Array.from(horarios.entries()).sort((a, b) => b[1] - a[1]);
  };

  // Métricas por tab
  const metricasDiarias = useMemo(() => calcularMetricas(dailyData.sales, dailyData.items), [dailyData]);
  const metricasSemanales = useMemo(() => calcularMetricas(weeklyData.sales, weeklyData.items), [weeklyData]);
  const metricasMensuales = useMemo(() => calcularMetricas(monthlyData.sales, monthlyData.items), [monthlyData]);

  // Agrupar ventas semanales por día
  const ventasPorDia = useMemo(() => {
    const grupos = new Map<string, { fecha: Date; total: number; cantidad: number }>();

    weeklyData.sales.forEach(sale => {
      const fecha = new Date(sale.fecha);
      const fechaKey = fecha.toISOString().split('T')[0]; // YYYY-MM-DD

      if (grupos.has(fechaKey)) {
        const existing = grupos.get(fechaKey)!;
        existing.total += Number(sale.total);
        existing.cantidad += 1;
      } else {
        grupos.set(fechaKey, {
          fecha,
          total: Number(sale.total),
          cantidad: 1,
        });
      }
    });

    return Array.from(grupos.entries())
      .map(([_, data]) => data)
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }, [weeklyData.sales]);

  // Análisis de productos (excluye componentes de combos)
  const productosMes = useMemo(() => analizarProductos(monthlyData.items), [monthlyData.items]);
  // Análisis de combos
  const combosMes = useMemo(() => analizarCombos(monthlyData.comboItems), [monthlyData.comboItems]);
  // Todos juntos para rankings
  const todosLosMes = useMemo(() => [...productosMes, ...combosMes], [productosMes, combosMes]);
  const masRentables = useMemo(() => [...todosLosMes].sort((a, b) => b.gananciaTotal - a.gananciaTotal).slice(0, 5), [todosLosMes]);
  const masVendidos = useMemo(() => [...todosLosMes].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5), [todosLosMes]);
  const menosRentables = useMemo(() => [...todosLosMes].sort((a, b) => a.margenPorcentaje - b.margenPorcentaje).slice(0, 5), [todosLosMes]);

  // Análisis de horarios
  const horariosPico = useMemo(() => analizarHorarios(monthlyData.sales).slice(0, 3), [monthlyData.sales]);

  // Insights estratégicos
  const generarInsights = () => {
    const insights: string[] = [];

    // Análisis de margen
    if (metricasMensuales.margenPorcentaje < 30) {
      insights.push("⚠️ Tu margen de ganancia mensual es bajo (<30%). Considerá revisar costos o aumentar precios.");
    } else if (metricasMensuales.margenPorcentaje > 50) {
      insights.push("✅ Excelente margen de ganancia (>50%). Mantené esta estrategia de precios.");
    }

    // Análisis de productos
    if (masRentables.length > 0 && masVendidos.length > 0) {
      const topRentable = masRentables[0];
      const topVendido = masVendidos[0];

      if (topRentable.nombre !== topVendido.nombre) {
        insights.push(`💡 "${topVendido.nombre}" se vende mucho pero "${topRentable.nombre}" genera más ganancia. Promové productos rentables.`);
      }
    }

    // Análisis de horarios
    if (horariosPico.length > 0) {
      const [horaPico] = horariosPico[0];
      insights.push(`⏰ Tu hora pico es a las ${horaPico}:00hs. Asegurate de tener suficiente stock y personal en ese horario.`);
    }

    // Productos con bajo margen
    if (menosRentables.length > 0 && menosRentables[0].margenPorcentaje < 20) {
      insights.push(`📉 "${menosRentables[0].nombre}" tiene margen muy bajo (<20%). Considerá ajustar precio o costos.`);
    }

    // Ideas para mejorar ingresos
    if (metricasMensuales.ventasCount < 50) {
      insights.push("📈 Pocas ventas este mes. Sugerencia: lanzá promociones 2x1 o descuentos en redes sociales.");
    }

    if (masVendidos.length > 0) {
      insights.push(`🎁 Creá un combo con "${masVendidos[0].nombre}" (tu best-seller) + otro producto para aumentar ticket promedio.`);
    }

    return insights;
  };

  const insights = useMemo(() => generarInsights(), [metricasMensuales, masRentables, masVendidos, menosRentables, horariosPico]);

  // ========== RENDER ==========
  return (
    <div className="min-h-screen bg-[var(--deep-dark)] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image src="/logo.png" alt="24 SIETE" width={40} height={40} className="cursor-pointer" />
          </Link>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--cyan-core)" }}>
            Dashboard
          </h1>
        </div>
        <div className="flex gap-3">
          <button onClick={loadAllData} className="cyber-button" disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>
      </div>

      {/* Tabs de navegación */}
      <div className="flex gap-3 flex-wrap">
        {[
          { id: "diario" as TabView, label: "Diario", icon: "☀️" },
          { id: "semanal" as TabView, label: "Semanal", icon: "📅" },
          { id: "mensual" as TabView, label: "Mensual", icon: "📆" },
          { id: "margen" as TabView, label: "Margen", icon: "💰" },
          { id: "estrategico" as TabView, label: "Info Estratégica", icon: "🎯" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-lg font-bold text-sm uppercase tracking-wide transition-all duration-300 ${
              activeTab === tab.id
                ? "neon-outline-magenta bg-[var(--magenta-glow)] text-[var(--neon-magenta)]"
                : "border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)]"
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="data-card text-center py-12">
          <div className="text-[var(--text-secondary)] text-lg font-mono">Analizando datos…</div>
        </div>
      ) : (
        <>
          {/* REPORTE DIARIO */}
          {activeTab === "diario" && (
            <div className="space-y-6">
              {/* Total Acumulado del Día */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <MetricCard
                  accent="cyan"
                  label="Ingresos hoy"
                  value={money(metricasDiarias.totalIngresos)}
                  sub={`${metricasDiarias.ventasCount} ventas`}
                />
                <MetricCard
                  accent="magenta"
                  hero
                  label="Ganancia limpia"
                  value={money(metricasDiarias.gananciaLimpia)}
                  sub={`Margen ${metricasDiarias.margenPorcentaje.toFixed(1)}%`}
                />
                <MetricCard
                  accent="cost"
                  label="Costos hoy"
                  value={money(metricasDiarias.totalCostos)}
                />
              </div>

              {/* Tabla de Ventas Detallada */}
              <Panel title="Detalle de ventas del día" accent="cyan">
                {dailyData.salesWithItems.length === 0 ? (
                  <EmptyState>Sin ventas hoy</EmptyState>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-[var(--slate-gray)]">
                        <tr>
                          <th className={`${TH} text-left`}>Ticket</th>
                          <th className={`${TH} text-left`}>Hora</th>
                          <th className={`${TH} text-left`}>Items</th>
                          <th className={`${TH} text-left`}>Método</th>
                          <th className={`${TH} text-right`}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyData.salesWithItems.map((sale) => {
                          const fecha = new Date(sale.fecha);
                          const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                          const items = sale.sale_items || [];
                          const itemsText = items.map(item =>
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
          )}

          {/* REPORTE SEMANAL */}
          {activeTab === "semanal" && (
            <div className="space-y-6">
              {/* Totales Semanales */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <MetricCard
                  accent="cyan"
                  label="Ingresos (7 sesiones)"
                  value={money(metricasSemanales.totalIngresos)}
                  sub={`${metricasSemanales.ventasCount} ventas`}
                />
                <MetricCard
                  accent="magenta"
                  hero
                  label="Ganancia"
                  value={money(metricasSemanales.gananciaLimpia)}
                  sub={`Margen ${metricasSemanales.margenPorcentaje.toFixed(1)}%`}
                />
                <MetricCard
                  accent="neutral"
                  label="Promedio por día"
                  value={money(metricasSemanales.totalIngresos / 7)}
                />
              </div>

              {/* Tabla Comparativa por Día */}
              <Panel title="Comparativa día por día" accent="magenta">
                {ventasPorDia.length === 0 ? (
                  <EmptyState>Sin datos esta semana</EmptyState>
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
                          const porcentaje = (dia.total / metricasSemanales.totalIngresos) * 100;
                          const esMejorDia = dia.total === Math.max(...ventasPorDia.map(d => d.total));

                          return (
                            <tr
                              key={index}
                              className={TROW}
                              style={esMejorDia ? { background: "rgba(255,255,255,0.04)" } : undefined}
                            >
                              <td className="p-3 text-[var(--text-primary)] font-semibold capitalize" style={esMejorDia ? { borderLeft: "3px solid var(--magenta-core)" } : undefined}>
                                {diaSemana}
                                {esMejorDia && <span className="ml-2" title="Mejor día">🏆</span>}
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
          )}

          {/* REPORTE MENSUAL */}
          {activeTab === "mensual" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <MetricCard accent="cyan" label="Ingresos del mes" value={money(metricasMensuales.totalIngresos)} />
                <MetricCard accent="magenta" hero label="Ganancia mensual" value={money(metricasMensuales.gananciaLimpia)} />
                <MetricCard accent="cost" label="Costos del mes" value={money(metricasMensuales.totalCostos)} valueColor="var(--warning)" />
                <MetricCard
                  accent="cyan"
                  label="Margen de ganancia"
                  value={`${metricasMensuales.margenPorcentaje.toFixed(1)}%`}
                  valueColor={margenColor(metricasMensuales.margenPorcentaje)}
                />
              </div>

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
          )}

          {/* INFORMACIÓN ESTRATÉGICA */}
          {activeTab === "estrategico" && (
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
          )}

          {/* TAB: MARGEN */}
          {activeTab === "margen" && (
            <div className="space-y-6">
              {/* Resumen general de margen */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  accent="cyan"
                  label="Margen promedio"
                  value={`${metricasMensuales.margenPorcentaje.toFixed(1)}%`}
                  valueColor={margenColor(metricasMensuales.margenPorcentaje)}
                  sub={metricasMensuales.margenPorcentaje > 40 ? "✅ Excelente" : metricasMensuales.margenPorcentaje > 25 ? "⚠️ Bueno" : "❌ Bajo"}
                />
                <MetricCard
                  accent="magenta"
                  hero
                  label="Ganancia total (mes)"
                  value={money(metricasMensuales.gananciaLimpia)}
                  sub={`Ingresos: ${money(metricasMensuales.totalIngresos)}`}
                />
                <MetricCard
                  accent="cost"
                  label="Costos totales"
                  value={money(metricasMensuales.totalCostos)}
                  valueColor="var(--warning)"
                  sub={metricasMensuales.totalIngresos > 0 ? `${((metricasMensuales.totalCostos / metricasMensuales.totalIngresos) * 100).toFixed(1)}% de ingresos` : undefined}
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
                          const margenIcon = p.margenPorcentaje > 40
                            ? '🟢'
                            : p.margenPorcentaje > 20
                            ? '🟡'
                            : '🔴';

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
                              <td className="p-3 text-center">{margenIcon}</td>
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
                        <div className="text-xs mt-1" style={{ color: "var(--warning)" }}>
                          {p.margenPorcentaje < 15 ? '🔴 Crítico: aumentar precio o cambiar proveedor' : '🟡 Revisar costos'}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}

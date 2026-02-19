"use client";

import { useEffect, useMemo, useState } from "react";
import type { Sale, SaleItemWithProduct, Product, CierreCaja } from "@/types";
import { fetchTodayReport, fetchWeeklyReport, fetchMonthlyReport, type SaleWithItems } from "@/lib/services/reports";
import { useToast } from "@/components/ui/Toast";
import { closeCashRegister, getCierreHoy } from "@/lib/services/cashRegister";

type TabView = "diario" | "semanal" | "mensual" | "estrategico";

interface ProductAnalysis {
  nombre: string;
  cantidad: number;
  gananciaTotal: number;
  margenPorcentaje: number;
  ingresoTotal: number;
}

export default function DashboardPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabView>("diario");
  const [loading, setLoading] = useState(true);

  // Datos por período
  const [dailyData, setDailyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; salesWithItems: SaleWithItems[] }>({ sales: [], items: [], salesWithItems: [] });
  const [weeklyData, setWeeklyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; products: Product[] }>({ sales: [], items: [], products: [] });
  const [monthlyData, setMonthlyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; products: Product[] }>({ sales: [], items: [], products: [] });

  // Cierre de caja
  const [showCierreModal, setShowCierreModal] = useState(false);
  const [cierreHoy, setCierreHoy] = useState<CierreCaja | null>(null);
  const [closingCaja, setClosingCaja] = useState(false);

  async function loadAllData() {
    setLoading(true);
    try {
      const [today, week, month, cierre] = await Promise.all([
        fetchTodayReport(),
        fetchWeeklyReport(),
        fetchMonthlyReport(),
        getCierreHoy(),
      ]);

      setDailyData({ sales: today.sales, items: today.items, salesWithItems: today.salesWithItems });
      setWeeklyData({ sales: week.sales, items: week.items, products: week.products });
      setMonthlyData({ sales: month.sales, items: month.items, products: month.products });
      setCierreHoy(cierre);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAllData(); }, []);

  async function handleCloseCaja() {
    if (cierreHoy) {
      toast.warning("Ya se cerró la caja hoy");
      return;
    }

    if (dailyData.sales.length === 0) {
      toast.warning("No hay ventas registradas para cerrar la caja");
      return;
    }

    setClosingCaja(true);
    try {
      const cierre = await closeCashRegister();
      setCierreHoy(cierre);
      setShowCierreModal(false);
      toast.success("✅ Caja cerrada exitosamente");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cerrar la caja");
    } finally {
      setClosingCaja(false);
    }
  }

  // ========== CÁLCULOS GENERALES ==========
  const calcularMetricas = (sales: Sale[], items: SaleItemWithProduct[]) => {
    const totalIngresos = sales.reduce((a, s) => a + Number(s.total), 0);
    const totalCostos = items.reduce((acc, it) => {
      const prod = Array.isArray(it.products) ? it.products[0] : it.products;
      const costo = prod?.costo ?? 0;
      return acc + (costo * Number(it.cantidad || 0));
    }, 0);
    const gananciaLimpia = totalIngresos - totalCostos;
    const margenPorcentaje = totalIngresos > 0 ? (gananciaLimpia / totalIngresos) * 100 : 0;

    return { totalIngresos, totalCostos, gananciaLimpia, margenPorcentaje, ventasCount: sales.length };
  };

  const analizarProductos = (items: SaleItemWithProduct[]): ProductAnalysis[] => {
    const productMap = new Map<string, ProductAnalysis>();

    items.forEach(it => {
      const prod = Array.isArray(it.products) ? it.products[0] : it.products;
      const nombre = prod?.nombre ?? "Desconocido";
      const cantidad = Number(it.cantidad || 0);
      const precioVenta = Number(it.precio_unitario || 0);
      const costo = prod?.costo ?? 0;
      const gananciaUnitaria = precioVenta - costo;
      const gananciaTotal = gananciaUnitaria * cantidad;
      const ingresoTotal = precioVenta * cantidad;

      if (productMap.has(nombre)) {
        const existing = productMap.get(nombre)!;
        existing.cantidad += cantidad;
        existing.gananciaTotal += gananciaTotal;
        existing.ingresoTotal += ingresoTotal;
        existing.margenPorcentaje = ingresoTotal > 0 ? (existing.gananciaTotal / ingresoTotal) * 100 : 0;
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

  // Análisis de productos
  const productosMes = useMemo(() => analizarProductos(monthlyData.items), [monthlyData.items]);
  const masRentables = useMemo(() => [...productosMes].sort((a, b) => b.gananciaTotal - a.gananciaTotal).slice(0, 5), [productosMes]);
  const masVendidos = useMemo(() => [...productosMes].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5), [productosMes]);
  const menosRentables = useMemo(() => [...productosMes].sort((a, b) => a.margenPorcentaje - b.margenPorcentaje).slice(0, 5), [productosMes]);

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
          <div className="h-10 w-10 rounded-full neon-border-cyan animate-pulse-cyan" />
          <h1 className="text-3xl font-bold neon-text-cyan">DASHBOARD ESTRATÉGICO</h1>
          <div className="text-2xl">📊</div>
          {cierreHoy && (
            <div className="px-4 py-2 rounded-lg bg-[var(--neon-cyan)] bg-opacity-20 border border-[var(--neon-cyan)] text-[var(--neon-cyan)] text-sm font-bold uppercase tracking-wide">
              ✓ Caja Cerrada
            </div>
          )}
        </div>
        <div className="flex gap-3">
          {!cierreHoy && dailyData.sales.length > 0 && (
            <button
              onClick={() => setShowCierreModal(true)}
              className="cyber-button bg-[var(--magenta-glow)] hover:bg-[var(--magenta-glow)] text-[var(--neon-magenta)] border-[var(--neon-magenta)]"
              disabled={loading}
            >
              💰 Cerrar Caja
            </button>
          )}
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
          <div className="neon-text-cyan text-xl font-mono animate-glow">Analizando datos...</div>
        </div>
      ) : (
        <>
          {/* REPORTE DIARIO */}
          {activeTab === "diario" && (
            <div className="space-y-6">
              {/* Total Acumulado del Día */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Ingresos hoy</div>
                  <div className="text-4xl font-bold mt-2 neon-text-cyan">${metricasDiarias.totalIngresos.toFixed(2)}</div>
                  <div className="text-[var(--text-secondary)] text-sm mt-3 font-mono">{metricasDiarias.ventasCount} ventas</div>
                </div>

                <div className="data-card neon-outline-magenta animate-pulse-magenta bg-[var(--magenta-glow)]">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Ganancia limpia</div>
                  <div className="text-4xl font-bold mt-2 neon-text-magenta">${metricasDiarias.gananciaLimpia.toFixed(2)}</div>
                  <div className="text-[var(--text-secondary)] text-xs mt-3 font-mono">
                    Margen: {metricasDiarias.margenPorcentaje.toFixed(1)}%
                  </div>
                </div>

                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Costos hoy</div>
                  <div className="text-4xl font-bold mt-2 neon-text-cyan">${metricasDiarias.totalCostos.toFixed(2)}</div>
                </div>
              </div>

              {/* Tabla de Ventas Detallada */}
              <div className="data-card neon-outline-cyan">
                <div className="text-[var(--neon-cyan)] font-bold text-xl uppercase tracking-wide mb-4">
                  📋 Detalle de Ventas del Día
                </div>

                {dailyData.salesWithItems.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-muted)] font-mono">
                    Sin ventas hoy
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--carbon-gray)] border-b-2 border-[var(--neon-cyan)]">
                        <tr>
                          <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Ticket</th>
                          <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Hora</th>
                          <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Items</th>
                          <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Método</th>
                          <th className="p-3 text-right text-[var(--text-secondary)] uppercase text-xs tracking-wide">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyData.salesWithItems.map((sale) => {
                          const fecha = new Date(sale.fecha);
                          const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                          const items = sale.sale_items || [];
                          const itemsText = items.map(item => {
                            const prod = Array.isArray(item.products) ? item.products[0] : item.products;
                            return `${item.cantidad}x ${prod?.nombre || 'Desconocido'}`;
                          }).join(', ');

                          return (
                            <tr key={sale.id} className="border-t border-[var(--slate-gray)] hover:bg-[var(--carbon-gray)]">
                              <td className="p-3 text-[var(--text-primary)] font-mono text-xs">
                                #{sale.id.slice(0, 8)}
                              </td>
                              <td className="p-3 text-[var(--neon-cyan)] font-mono">
                                {hora}
                              </td>
                              <td className="p-3 text-[var(--text-secondary)] max-w-xs truncate">
                                {itemsText || 'Sin items'}
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-[var(--cyan-glow)] text-[var(--neon-cyan)] border border-[var(--neon-cyan)]">
                                  {sale.metodo_pago}
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-[var(--neon-magenta)]">
                                ${Number(sale.total).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* REPORTE SEMANAL */}
          {activeTab === "semanal" && (
            <div className="space-y-6">
              {/* Totales Semanales */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Ingresos (7 días)</div>
                  <div className="text-4xl font-bold mt-2 neon-text-cyan">${metricasSemanales.totalIngresos.toFixed(2)}</div>
                  <div className="text-[var(--text-secondary)] text-sm mt-3 font-mono">{metricasSemanales.ventasCount} ventas</div>
                </div>

                <div className="data-card neon-outline-magenta animate-pulse-magenta bg-[var(--magenta-glow)]">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Ganancia semanal</div>
                  <div className="text-4xl font-bold mt-2 neon-text-magenta">${metricasSemanales.gananciaLimpia.toFixed(2)}</div>
                  <div className="text-[var(--text-secondary)] text-xs mt-3 font-mono">
                    Margen: {metricasSemanales.margenPorcentaje.toFixed(1)}%
                  </div>
                </div>

                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Promedio por día</div>
                  <div className="text-4xl font-bold mt-2 neon-text-cyan">
                    ${(metricasSemanales.totalIngresos / 7).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Tabla Comparativa por Día */}
              <div className="data-card neon-outline-magenta">
                <div className="text-[var(--neon-magenta)] font-bold text-xl uppercase tracking-wide mb-4">
                  📊 Comparativa Día por Día
                </div>

                {ventasPorDia.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-muted)] font-mono">
                    Sin datos esta semana
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--carbon-gray)] border-b-2 border-[var(--neon-magenta)]">
                        <tr>
                          <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Día</th>
                          <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Fecha</th>
                          <th className="p-3 text-right text-[var(--text-secondary)] uppercase text-xs tracking-wide">Cant. Ventas</th>
                          <th className="p-3 text-right text-[var(--text-secondary)] uppercase text-xs tracking-wide">Total Vendido</th>
                          <th className="p-3 text-right text-[var(--text-secondary)] uppercase text-xs tracking-wide">% del Total</th>
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
                              className={`border-t border-[var(--slate-gray)] hover:bg-[var(--carbon-gray)] ${
                                esMejorDia ? 'bg-[var(--magenta-glow)] animate-pulse-magenta' : ''
                              }`}
                            >
                              <td className="p-3 text-[var(--text-primary)] font-bold capitalize">
                                {diaSemana}
                                {esMejorDia && <span className="ml-2">🏆</span>}
                              </td>
                              <td className="p-3 text-[var(--text-secondary)] font-mono">
                                {fechaFormato}
                              </td>
                              <td className="p-3 text-right font-mono text-[var(--neon-cyan)]">
                                {dia.cantidad}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-[var(--neon-magenta)]">
                                ${dia.total.toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-mono text-[var(--text-secondary)]">
                                {porcentaje.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {ventasPorDia.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--neon-magenta)] text-center">
                    <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                      🏆 El mejor día aparece resaltado
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* REPORTE MENSUAL */}
          {activeTab === "mensual" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Ingresos del mes</div>
                  <div className="text-4xl font-bold mt-2 neon-text-cyan">${metricasMensuales.totalIngresos.toFixed(2)}</div>
                </div>

                <div className="data-card neon-outline-magenta animate-pulse-magenta bg-[var(--magenta-glow)]">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Ganancia mensual</div>
                  <div className="text-4xl font-bold mt-2 neon-text-magenta">${metricasMensuales.gananciaLimpia.toFixed(2)}</div>
                </div>

                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Costos del mes</div>
                  <div className="text-3xl font-bold mt-2 text-[var(--error)]">${metricasMensuales.totalCostos.toFixed(2)}</div>
                </div>

                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--text-muted)] text-sm uppercase tracking-wide">Margen de ganancia</div>
                  <div className="text-4xl font-bold mt-2 neon-text-cyan">{metricasMensuales.margenPorcentaje.toFixed(1)}%</div>
                </div>
              </div>

              {/* Top productos del mes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--neon-cyan)] font-bold text-lg uppercase tracking-wide mb-4">🏆 Más vendidos (cantidad)</div>
                  <div className="space-y-3">
                    {masVendidos.map((p, i) => (
                      <div key={i} className="flex justify-between items-center border-b border-[var(--slate-gray)] pb-2">
                        <span className="text-[var(--text-primary)]">{i + 1}. {p.nombre}</span>
                        <span className="font-mono font-bold text-[var(--neon-cyan)]">{p.cantidad} u.</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="data-card neon-outline-magenta">
                  <div className="text-[var(--neon-magenta)] font-bold text-lg uppercase tracking-wide mb-4">💰 Más rentables (ganancia)</div>
                  <div className="space-y-3">
                    {masRentables.map((p, i) => (
                      <div key={i} className="flex justify-between items-center border-b border-[var(--slate-gray)] pb-2">
                        <span className="text-[var(--text-primary)]">{i + 1}. {p.nombre}</span>
                        <span className="font-mono font-bold text-[var(--neon-magenta)]">${p.gananciaTotal.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* INFORMACIÓN ESTRATÉGICA */}
          {activeTab === "estrategico" && (
            <div className="space-y-6">
              {/* Insights y recomendaciones */}
              <div className="data-card neon-outline-magenta">
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-3xl">💡</div>
                  <div className="text-[var(--neon-magenta)] font-bold text-xl uppercase tracking-wide">
                    Ideas para mejorar ingresos
                  </div>
                </div>
                <div className="space-y-4">
                  {insights.map((insight, i) => (
                    <div key={i} className="border-l-4 border-[var(--neon-magenta)] bg-[var(--magenta-glow)] rounded-r-lg p-4">
                      <p className="text-[var(--text-primary)] font-medium">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Análisis de rentabilidad */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--neon-cyan)] font-bold text-lg uppercase tracking-wide mb-4">📉 Items a reajustar (bajo margen)</div>
                  <div className="space-y-3">
                    {menosRentables.map((p, i) => (
                      <div key={i} className="border-b border-[var(--slate-gray)] pb-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[var(--text-primary)]">{p.nombre}</span>
                          <span className="font-mono text-sm text-[var(--error)] font-bold">{p.margenPorcentaje.toFixed(1)}%</span>
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">
                          Ganancia total: ${p.gananciaTotal.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Horarios pico */}
                <div className="data-card neon-outline-cyan">
                  <div className="text-[var(--neon-cyan)] font-bold text-lg uppercase tracking-wide mb-4">⏰ Horarios pico de venta</div>
                  <div className="space-y-3">
                    {horariosPico.map(([hora, ventas], i) => (
                      <div key={i} className="flex justify-between items-center border-b border-[var(--slate-gray)] pb-2">
                        <span className="text-[var(--text-primary)]">{hora}:00 - {hora + 1}:00 hs</span>
                        <span className="font-mono font-bold text-[var(--neon-cyan)]">{ventas} ventas</span>
                      </div>
                    ))}
                  </div>
                  {horariosPico.length === 0 && (
                    <div className="text-center py-6 text-[var(--text-muted)] font-mono">
                      Sin datos suficientes
                    </div>
                  )}
                </div>
              </div>

              {/* Comparativa volumen vs ganancia */}
              <div className="data-card neon-outline-magenta">
                <div className="text-[var(--neon-magenta)] font-bold text-xl uppercase tracking-wide mb-4">
                  📊 Análisis: Volumen vs Rentabilidad
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--carbon-gray)] border-b-2 border-[var(--neon-magenta)]">
                      <tr>
                        <th className="p-3 text-left text-[var(--text-secondary)] uppercase text-xs tracking-wide">Producto</th>
                        <th className="p-3 text-right text-[var(--text-secondary)] uppercase text-xs tracking-wide">Cantidad</th>
                        <th className="p-3 text-right text-[var(--text-secondary)] uppercase text-xs tracking-wide">Ingresos</th>
                        <th className="p-3 text-right text-[var(--text-secondary)] uppercase text-xs tracking-wide">Ganancia</th>
                        <th className="p-3 text-right text-[var(--text-secondary)] uppercase text-xs tracking-wide">Margen %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosMes.sort((a, b) => b.gananciaTotal - a.gananciaTotal).slice(0, 10).map((p, i) => (
                        <tr key={i} className="border-t border-[var(--slate-gray)] hover:bg-[var(--carbon-gray)]">
                          <td className="p-3 text-[var(--text-primary)]">{p.nombre}</td>
                          <td className="p-3 text-right font-mono text-[var(--neon-cyan)]">{p.cantidad}</td>
                          <td className="p-3 text-right font-mono text-[var(--neon-cyan)]">${p.ingresoTotal.toFixed(2)}</td>
                          <td className="p-3 text-right font-mono text-[var(--neon-magenta)]">${p.gananciaTotal.toFixed(2)}</td>
                          <td className="p-3 text-right font-mono font-bold" style={{
                            color: p.margenPorcentaje > 40 ? 'var(--success)' : p.margenPorcentaje > 20 ? 'var(--warning)' : 'var(--error)'
                          }}>
                            {p.margenPorcentaje.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de Cierre de Caja */}
      {showCierreModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
          <div className="data-card neon-outline-magenta max-w-2xl w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold neon-text-magenta">💰 Cierre de Caja</h2>
              <button
                onClick={() => setShowCierreModal(false)}
                className="text-[var(--text-secondary)] hover:text-[var(--neon-cyan)] text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Resumen de ventas */}
              <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)]">
                <div className="text-[var(--text-secondary)] text-sm uppercase tracking-wide mb-3">
                  Resumen del día
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[var(--text-muted)] text-xs">Total ventas</div>
                    <div className="text-2xl font-bold neon-text-cyan">{dailyData.sales.length}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)] text-xs">Monto total</div>
                    <div className="text-2xl font-bold neon-text-cyan">${metricasDiarias.totalIngresos.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* Desglose por método de pago */}
              <div className="data-card bg-[var(--carbon-gray)] border border-[var(--slate-gray)]">
                <div className="text-[var(--text-secondary)] text-sm uppercase tracking-wide mb-3">
                  Por método de pago
                </div>
                <div className="space-y-2">
                  {["efectivo", "debito", "débito", "transferencia"].map(metodo => {
                    const ventas = dailyData.sales.filter(s => s.metodo_pago?.toLowerCase() === metodo.toLowerCase());
                    const total = ventas.reduce((acc, v) => acc + Number(v.total), 0);
                    if (total === 0 && ventas.length === 0) return null;
                    return (
                      <div key={metodo} className="flex justify-between items-center">
                        <span className="text-[var(--text-primary)] capitalize">{metodo}</span>
                        <span className="font-mono text-[var(--neon-cyan)]">
                          ${total.toFixed(2)} <span className="text-[var(--text-muted)] text-sm">({ventas.length})</span>
                        </span>
                      </div>
                    );
                  })}
                  {(() => {
                    const ventasBRL = dailyData.sales.filter(s => s.moneda === "BRL");
                    const totalBRL = ventasBRL.reduce((acc, v) => acc + Number(v.total), 0);
                    if (totalBRL === 0) return null;
                    return (
                      <div className="flex justify-between items-center border-t border-[var(--slate-gray)] pt-2 mt-2">
                        <span className="text-[var(--text-primary)]">BRL (Real)</span>
                        <span className="font-mono text-[var(--neon-magenta)]">
                          R$ {totalBRL.toFixed(2)} <span className="text-[var(--text-muted)] text-sm">({ventasBRL.length})</span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Advertencia */}
              <div className="p-4 border border-[var(--warning)] bg-[var(--warning)] bg-opacity-10 rounded-lg">
                <div className="flex gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <div className="font-bold text-[var(--warning)] mb-1">Advertencia</div>
                    <div className="text-sm text-[var(--text-secondary)]">
                      Una vez cerrada la caja, no podrás cerrarla nuevamente hoy. Verificá que todos los datos sean correctos.
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => setShowCierreModal(false)}
                  className="px-6 py-3 rounded-lg border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-all"
                  disabled={closingCaja}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCloseCaja}
                  className="cyber-button bg-[var(--magenta-glow)] text-[var(--neon-magenta)] border-[var(--neon-magenta)]"
                  disabled={closingCaja}
                >
                  {closingCaja ? "Cerrando..." : "✓ Confirmar Cierre"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

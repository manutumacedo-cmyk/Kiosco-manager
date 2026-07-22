"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { Sale, SaleItemWithProduct, Product } from "@/types";
import {
  fetchDiarioReport,
  fetchSesionesReport,
  fetchPromediosPorCategoria,
  calcularGananciaReal,
  type SaleWithItems,
  type ComboSaleData,
} from "@/lib/services/reports";
import type { OutflowCategoryTotal } from "@/lib/services/cashSessions";
import {
  calcularMetricas,
  analizarProductos,
  analizarCombos,
  analizarHorarios,
  generarInsights,
} from "@/lib/services/dashboardAnalytics";
import { useToast } from "@/components/ui/Toast";
import { Dot } from "./dashboardUi";
import { METODO_FILTER_CYCLE, ITEMS_ORDER_CYCLE, type TabView, type MetodoFilter, type ItemsOrder } from "./types";
import { DiarioTab } from "./tabs/DiarioTab";
import { SemanalTab } from "./tabs/SemanalTab";
import { MensualTab } from "./tabs/MensualTab";
import { EstrategicoTab } from "./tabs/EstrategicoTab";
import { MargenTab } from "./tabs/MargenTab";

export default function DashboardPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabView>("diario");
  const [loading, setLoading] = useState(true);

  // Datos por período
  const [dailyData, setDailyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; salesWithItems: SaleWithItems[]; comboItems: ComboSaleData[]; outflows: OutflowCategoryTotal[] }>({ sales: [], items: [], salesWithItems: [], comboItems: [], outflows: [] });
  const [weeklyData, setWeeklyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; products: Product[]; comboItems: ComboSaleData[]; costoPorVenta: Map<string, number>; outflows: OutflowCategoryTotal[] }>({ sales: [], items: [], products: [], comboItems: [], costoPorVenta: new Map(), outflows: [] });
  const [monthlyData, setMonthlyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; products: Product[]; comboItems: ComboSaleData[]; costoPorVenta: Map<string, number>; outflows: OutflowCategoryTotal[] }>({ sales: [], items: [], products: [], comboItems: [], costoPorVenta: new Map(), outflows: [] });
  const [restockPromedioMensual, setRestockPromedioMensual] = useState(0);

  async function loadAllData() {
    setLoading(true);
    try {
      const [today, week, month, promedios] = await Promise.all([
        fetchDiarioReport(),
        fetchSesionesReport(7),
        fetchSesionesReport(30),
        fetchPromediosPorCategoria(),
      ]);

      setDailyData({ sales: today.sales, items: today.items, salesWithItems: today.salesWithItems, comboItems: today.comboItems, outflows: today.outflows });
      setWeeklyData({ sales: week.sales, items: week.items, products: week.products, comboItems: week.comboItems, costoPorVenta: week.costoPorVenta, outflows: week.outflows });
      setMonthlyData({ sales: month.sales, items: month.items, products: month.products, comboItems: month.comboItems, costoPorVenta: month.costoPorVenta, outflows: month.outflows });
      setRestockPromedioMensual(promedios.restock);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAllData(); }, []);

  const metricasMensuales = useMemo(() => calcularMetricas(monthlyData.sales, monthlyData.items), [monthlyData]);

  // ========== TABLA "DETALLE DE VENTAS DEL DÍA" — headers clickeables ==========
  // Un solo eje de orden compartido entre Hora y Total (como una tabla clásica de
  // "click header to sort"): Hora alterna entre 2 estados (reciente/antigua), Total
  // cicla por 3 (mayor→menor, menor→mayor, sin filtro = vuelve al orden por hora).
  const [sortDiario, setSortDiario] = useState<{ column: "hora" | "total"; direction: "asc" | "desc" }>({
    column: "hora",
    direction: "desc",
  });
  const [metodoFilterDiario, setMetodoFilterDiario] = useState<MetodoFilter>("todos");
  const [itemsOrderDiario, setItemsOrderDiario] = useState<ItemsOrder>("original");

  function toggleSortHora() {
    setSortDiario((prev) =>
      prev.column === "hora" ? { column: "hora", direction: prev.direction === "desc" ? "asc" : "desc" } : { column: "hora", direction: "desc" }
    );
  }
  function toggleSortTotal() {
    setSortDiario((prev) => {
      if (prev.column !== "total") return { column: "total", direction: "desc" };
      if (prev.direction === "desc") return { column: "total", direction: "asc" };
      return { column: "hora", direction: "desc" }; // 3er click: sin filtro, vuelve al orden original
    });
  }
  function cycleMetodoFilter() {
    setMetodoFilterDiario((prev) => {
      const i = METODO_FILTER_CYCLE.indexOf(prev);
      return METODO_FILTER_CYCLE[(i + 1) % METODO_FILTER_CYCLE.length];
    });
  }
  function cycleItemsOrder() {
    setItemsOrderDiario((prev) => {
      const i = ITEMS_ORDER_CYCLE.indexOf(prev);
      return ITEMS_ORDER_CYCLE[(i + 1) % ITEMS_ORDER_CYCLE.length];
    });
  }

  // Costo por producto (para recalcular Ganancia/Costos filtrados por método).
  // dailyData.items no trae sale_id, pero sí product_id + costo — alcanza para
  // reconstruir el costo de cada sale_item de salesWithItems.
  const costoPorProducto = useMemo(() => {
    const map = new Map<string, number>();
    dailyData.items.forEach((it) => {
      if (!map.has(it.product_id)) map.set(it.product_id, it.products?.costo ?? 0);
    });
    return map;
  }, [dailyData.items]);

  const ventasDiarioFiltradas = useMemo(() => {
    if (metodoFilterDiario === "todos") return dailyData.salesWithItems;
    return dailyData.salesWithItems.filter((s) => s.metodo_pago === metodoFilterDiario);
  }, [dailyData.salesWithItems, metodoFilterDiario]);

  // Mismo alcance que calcularMetricas (no incluye costo de combos, que no traen
  // sale_id en este reporte) — solo se agrega el filtro por método.
  const metricasDiariasFiltradas = useMemo(() => {
    const totalIngresos = ventasDiarioFiltradas.reduce((a, s) => a + Number(s.total), 0);
    const totalCostos = ventasDiarioFiltradas.reduce((acc, s) => {
      const items = s.sale_items || [];
      return acc + items.reduce((a2, it) => a2 + (costoPorProducto.get(it.product_id) ?? 0) * Number(it.cantidad || 0), 0);
    }, 0);
    const gananciaLimpia = totalIngresos - totalCostos;
    const margenPorcentaje = totalIngresos > 0 ? (gananciaLimpia / totalIngresos) * 100 : 0;
    return { totalIngresos, totalCostos, gananciaLimpia, margenPorcentaje, ventasCount: ventasDiarioFiltradas.length };
  }, [ventasDiarioFiltradas, costoPorProducto]);

  // Ganancia real = ingresos filtrados − costo − salidas de caja. Las salidas son plata física
  // que sale de la caja entera, no de un método de pago puntual — no tiene sentido prorratearlas
  // por método. Por eso solo se restan cuando el filtro es "todos"; filtrado por un método
  // específico (ej. "pix"), restar el total de salidas del período daría un número inventado
  // (ej. "ganancia real" negativa por Pix aunque las salidas se hayan pagado en efectivo).
  const gananciaRealDiaria = useMemo(
    () => calcularGananciaReal(
      metricasDiariasFiltradas.totalIngresos,
      metricasDiariasFiltradas.totalCostos,
      metodoFilterDiario === "todos" ? dailyData.outflows : []
    ),
    [metricasDiariasFiltradas, dailyData.outflows, metodoFilterDiario]
  );

  const ventasDiarioOrdenadas = useMemo(() => {
    const arr = [...ventasDiarioFiltradas];
    if (sortDiario.column === "hora") {
      arr.sort((a, b) => {
        const diff = new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
        return sortDiario.direction === "desc" ? -diff : diff;
      });
    } else {
      arr.sort((a, b) => {
        const diff = Number(a.total) - Number(b.total);
        return sortDiario.direction === "desc" ? -diff : diff;
      });
    }
    return arr;
  }, [ventasDiarioFiltradas, sortDiario]);

  // ========== FILTRO POR MÉTODO — tabs Semanal y Mensual ==========
  // Mismo ciclo que en Diario, pero acá solo filtra (no hay tabla por ticket
  // que ordenar): recalcula las tarjetas de ingresos/ganancia/costos.
  const [metodoFilterSemanal, setMetodoFilterSemanal] = useState<MetodoFilter>("todos");
  const [metodoFilterMensual, setMetodoFilterMensual] = useState<MetodoFilter>("todos");

  function cycleMetodoFilterSemanal() {
    setMetodoFilterSemanal((prev) => {
      const i = METODO_FILTER_CYCLE.indexOf(prev);
      return METODO_FILTER_CYCLE[(i + 1) % METODO_FILTER_CYCLE.length];
    });
  }
  function cycleMetodoFilterMensual() {
    setMetodoFilterMensual((prev) => {
      const i = METODO_FILTER_CYCLE.indexOf(prev);
      return METODO_FILTER_CYCLE[(i + 1) % METODO_FILTER_CYCLE.length];
    });
  }

  const ventasSemanalFiltradas = useMemo(() => {
    if (metodoFilterSemanal === "todos") return weeklyData.sales;
    return weeklyData.sales.filter((s) => s.metodo_pago === metodoFilterSemanal);
  }, [weeklyData.sales, metodoFilterSemanal]);

  const metricasSemanalesFiltradas = useMemo(() => {
    const totalIngresos = ventasSemanalFiltradas.reduce((a, s) => a + Number(s.total), 0);
    const totalCostos = ventasSemanalFiltradas.reduce((acc, s) => acc + (weeklyData.costoPorVenta.get(s.id) ?? 0), 0);
    const gananciaLimpia = totalIngresos - totalCostos;
    const margenPorcentaje = totalIngresos > 0 ? (gananciaLimpia / totalIngresos) * 100 : 0;
    return { totalIngresos, totalCostos, gananciaLimpia, margenPorcentaje, ventasCount: ventasSemanalFiltradas.length };
  }, [ventasSemanalFiltradas, weeklyData.costoPorVenta]);

  // Mismo criterio que en Diario: las salidas no se prorratean por método de pago.
  const gananciaRealSemanal = useMemo(
    () => calcularGananciaReal(
      metricasSemanalesFiltradas.totalIngresos,
      metricasSemanalesFiltradas.totalCostos,
      metodoFilterSemanal === "todos" ? weeklyData.outflows : []
    ),
    [metricasSemanalesFiltradas, weeklyData.outflows, metodoFilterSemanal]
  );

  const ventasMensualFiltradas = useMemo(() => {
    if (metodoFilterMensual === "todos") return monthlyData.sales;
    return monthlyData.sales.filter((s) => s.metodo_pago === metodoFilterMensual);
  }, [monthlyData.sales, metodoFilterMensual]);

  const metricasMensualesFiltradas = useMemo(() => {
    const totalIngresos = ventasMensualFiltradas.reduce((a, s) => a + Number(s.total), 0);
    const totalCostos = ventasMensualFiltradas.reduce((acc, s) => acc + (monthlyData.costoPorVenta.get(s.id) ?? 0), 0);
    const gananciaLimpia = totalIngresos - totalCostos;
    const margenPorcentaje = totalIngresos > 0 ? (gananciaLimpia / totalIngresos) * 100 : 0;
    return { totalIngresos, totalCostos, gananciaLimpia, margenPorcentaje, ventasCount: ventasMensualFiltradas.length };
  }, [ventasMensualFiltradas, monthlyData.costoPorVenta]);

  // Mismo criterio que en Diario: las salidas no se prorratean por método de pago.
  const gananciaRealMensual = useMemo(
    () => calcularGananciaReal(
      metricasMensualesFiltradas.totalIngresos,
      metricasMensualesFiltradas.totalCostos,
      metodoFilterMensual === "todos" ? monthlyData.outflows : []
    ),
    [metricasMensualesFiltradas, monthlyData.outflows, metodoFilterMensual]
  );

  // Para el tab Margen (no tiene filtro por método, usa el total mensual sin filtrar).
  const gananciaRealMensualSinFiltro = useMemo(
    () => calcularGananciaReal(metricasMensuales.totalIngresos, metricasMensuales.totalCostos, monthlyData.outflows),
    [metricasMensuales, monthlyData.outflows]
  );

  // Agrupar ventas semanales por día (respeta el filtro por método)
  const ventasPorDia = useMemo(() => {
    const grupos = new Map<string, { fecha: Date; total: number; cantidad: number }>();

    ventasSemanalFiltradas.forEach(sale => {
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
  }, [ventasSemanalFiltradas]);

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

  const insights = useMemo(
    () => generarInsights({
      ventas: monthlyData.sales,
      totalRev: metricasMensuales.totalIngresos,
      products: monthlyData.products,
      masVendidos,
      masRentables,
      menosRentables,
      gananciaReal: gananciaRealMensualSinFiltro,
    }),
    [monthlyData, metricasMensuales, masRentables, masVendidos, menosRentables, gananciaRealMensualSinFiltro]
  );

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
          { id: "diario" as TabView, label: "Diario", color: "var(--cyan-core)" },
          { id: "semanal" as TabView, label: "Semanal", color: "var(--magenta-core)" },
          { id: "mensual" as TabView, label: "Mensual", color: "var(--warning)" },
          { id: "margen" as TabView, label: "Margen", color: "var(--success)" },
          { id: "estrategico" as TabView, label: "Info Estratégica", color: "var(--magenta-mid)" },
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
            <Dot color={tab.color} />
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
          {activeTab === "diario" && (
            <DiarioTab
              metricasDiariasFiltradas={metricasDiariasFiltradas}
              gananciaRealDiaria={gananciaRealDiaria}
              metodoFilterDiario={metodoFilterDiario}
              onCycleMetodoFilter={cycleMetodoFilter}
              sortDiario={sortDiario}
              onToggleSortHora={toggleSortHora}
              onToggleSortTotal={toggleSortTotal}
              itemsOrderDiario={itemsOrderDiario}
              onCycleItemsOrder={cycleItemsOrder}
              ventasDiarioOrdenadas={ventasDiarioOrdenadas}
            />
          )}

          {activeTab === "semanal" && (
            <SemanalTab
              metricasSemanalesFiltradas={metricasSemanalesFiltradas}
              gananciaRealSemanal={gananciaRealSemanal}
              metodoFilterSemanal={metodoFilterSemanal}
              onCycleMetodoFilter={cycleMetodoFilterSemanal}
              ventasPorDia={ventasPorDia}
            />
          )}

          {activeTab === "mensual" && (
            <MensualTab
              metricasMensualesFiltradas={metricasMensualesFiltradas}
              gananciaRealMensual={gananciaRealMensual}
              metodoFilterMensual={metodoFilterMensual}
              onCycleMetodoFilter={cycleMetodoFilterMensual}
              restockPromedioMensual={restockPromedioMensual}
              masVendidos={masVendidos}
              masRentables={masRentables}
              combosMes={combosMes}
            />
          )}

          {activeTab === "estrategico" && (
            <EstrategicoTab
              insights={insights}
              menosRentables={menosRentables}
              horariosPico={horariosPico}
              productosMes={productosMes}
            />
          )}

          {activeTab === "margen" && (
            <MargenTab
              gananciaRealMensualSinFiltro={gananciaRealMensualSinFiltro}
              metricasMensuales={metricasMensuales}
              productosMes={productosMes}
              combosMes={combosMes}
              todosLosMes={todosLosMes}
              masRentables={masRentables}
              menosRentables={menosRentables}
            />
          )}
        </>
      )}
    </div>
  );
}

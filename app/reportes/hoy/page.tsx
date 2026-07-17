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
  const [weeklyData, setWeeklyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; products: Product[]; comboItems: ComboSaleData[]; costoPorVenta: Map<string, number> }>({ sales: [], items: [], products: [], comboItems: [], costoPorVenta: new Map() });
  const [monthlyData, setMonthlyData] = useState<{ sales: Sale[]; items: SaleItemWithProduct[]; products: Product[]; comboItems: ComboSaleData[]; costoPorVenta: Map<string, number> }>({ sales: [], items: [], products: [], comboItems: [], costoPorVenta: new Map() });

  async function loadAllData() {
    setLoading(true);
    try {
      const [today, week, month] = await Promise.all([
        fetchDiarioReport(),
        fetchSesionesReport(7),
        fetchSesionesReport(30),
      ]);

      setDailyData({ sales: today.sales, items: today.items, salesWithItems: today.salesWithItems, comboItems: today.comboItems });
      setWeeklyData({ sales: week.sales, items: week.items, products: week.products, comboItems: week.comboItems, costoPorVenta: week.costoPorVenta });
      setMonthlyData({ sales: month.sales, items: month.items, products: month.products, comboItems: month.comboItems, costoPorVenta: month.costoPorVenta });
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

  // ========== TABLA "DETALLE DE VENTAS DEL DÍA" — headers clickeables ==========
  // Un solo eje de orden compartido entre Hora y Total (como una tabla clásica de
  // "click header to sort"): Hora alterna entre 2 estados (reciente/antigua), Total
  // cicla por 3 (mayor→menor, menor→mayor, sin filtro = vuelve al orden por hora).
  const METODO_FILTER_CYCLE = ["todos", "efectivo", "debito", "credito", "transferencia", "pix"] as const;
  const ITEMS_ORDER_CYCLE = ["original", "az", "za"] as const;

  const [sortDiario, setSortDiario] = useState<{ column: "hora" | "total"; direction: "asc" | "desc" }>({
    column: "hora",
    direction: "desc",
  });
  const [metodoFilterDiario, setMetodoFilterDiario] = useState<(typeof METODO_FILTER_CYCLE)[number]>("todos");
  const [itemsOrderDiario, setItemsOrderDiario] = useState<(typeof ITEMS_ORDER_CYCLE)[number]>("original");

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
  const [metodoFilterSemanal, setMetodoFilterSemanal] = useState<(typeof METODO_FILTER_CYCLE)[number]>("todos");
  const [metodoFilterMensual, setMetodoFilterMensual] = useState<(typeof METODO_FILTER_CYCLE)[number]>("todos");

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

  // ========== INSIGHTS ESPECIALIZADOS EN EL RUBRO ==========
  // Kiosco nocturno en la frontera Rivera (UY) / Sant'Ana (BR): cobra en UYU y BRL,
  // trabaja de noche/madrugada. Los consejos son específicos y cuantificados, no genéricos.
  // Nota: `total` está en UYU (el POS convierte BRL al guardar). El período es "últimas 30
  // sesiones" (~1 mes), por eso los ritmos se expresan "al ritmo del último mes".
  const generarInsights = () => {
    const insights: string[] = [];
    const ventas = monthlyData.sales;
    if (ventas.length === 0) return insights;

    const totalRev = metricasMensuales.totalIngresos;

    // 1) Exposición cambiaria: cuánto de la facturación entró en reales (único de la frontera).
    const brlRev = ventas
      .filter((s) => s.moneda === "BRL")
      .reduce((a, s) => a + Number(s.total), 0);
    const pctBrl = totalRev > 0 ? (brlRev / totalRev) * 100 : 0;
    if (brlRev > 0 && pctBrl >= 5) {
      const impacto5 = brlRev * 0.05;
      insights.push(
        `💱 El ${pctBrl.toFixed(0)}% de tu facturación entró en reales (${money(brlRev)} de ${money(totalRev)}). ` +
        `Si el real se mueve 5%, tu resultado en pesos cambia ~${money(impacto5)}. Revisá que la tasa que cargás en el POS siga a la del mercado.`
      );
    }

    // 2) Patrón nocturno por tramos: dónde se concentra la plata en la noche.
    const tramos = [
      { n: "tarde (18–21h)", lo: 18, hi: 21 },
      { n: "noche (21–00h)", lo: 21, hi: 24 },
      { n: "madrugada (00–04h)", lo: 0, hi: 4 },
      { n: "amanecer (04–08h)", lo: 4, hi: 8 },
    ].map((t) => ({
      ...t,
      rev: ventas
        .filter((s) => {
          const h = new Date(s.fecha).getHours();
          return h >= t.lo && h < t.hi;
        })
        .reduce((a, s) => a + Number(s.total), 0),
    }));
    const tramosConVenta = tramos.filter((t) => t.rev > 0);
    if (tramosConVenta.length >= 2) {
      const fuerte = tramosConVenta.reduce((a, b) => (b.rev > a.rev ? b : a));
      const pctFuerte = totalRev > 0 ? (fuerte.rev / totalRev) * 100 : 0;
      insights.push(
        `🌙 Tu franja más fuerte es la ${fuerte.n}: ${money(fuerte.rev)} (${pctFuerte.toFixed(0)}% de la facturación). ` +
        `Asegurate de tener stock, cambio en ambas monedas y personal cubriendo ese tramo.`
      );
    }

    // 3) Día más fuerte de la semana (concentrá recursos ahí).
    const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const porDia = new Array(7).fill(0) as number[];
    ventas.forEach((s) => { porDia[new Date(s.fecha).getDay()] += Number(s.total); });
    const maxDiaRev = Math.max(...porDia);
    if (maxDiaRev > 0) {
      const maxDia = porDia.indexOf(maxDiaRev);
      const pctDia = totalRev > 0 ? (maxDiaRev / totalRev) * 100 : 0;
      insights.push(
        `📅 El ${DIAS[maxDia]} es tu día más fuerte (${pctDia.toFixed(0)}% de la facturación del mes). ` +
        `Reforzá compra y caja para ese día.`
      );
    }

    // 4) Quiebre de stock de tu best-seller (sin reposición de madrugada = venta perdida).
    const stockPorNombre = new Map(monthlyData.products.map((p) => [p.nombre, p]));
    const topVendidoProd = masVendidos.find((p) => !p.esCombo);
    if (topVendidoProd) {
      const prod = stockPorNombre.get(topVendidoProd.nombre);
      if (prod && Number(prod.stock) > 0 && topVendidoProd.cantidad > 0) {
        const ritmoDiario = topVendidoProd.cantidad / 30; // ~30 sesiones ≈ 1 mes
        const diasCobertura = Number(prod.stock) / ritmoDiario;
        if (diasCobertura < 5) {
          insights.push(
            `📦 "${topVendidoProd.nombre}" es tu más vendido y te quedan ${prod.stock} u. (cobertura ~${diasCobertura.toFixed(1)} días al ritmo del último mes). ` +
            `Reponé antes de abrir: si se agota de madrugada no hay proveedor y perdés esas ventas.`
          );
        }
      }
    }

    // 5) Best-seller vs producto más rentable (mover el foco hacia lo que deja).
    if (masRentables.length > 0 && masVendidos.length > 0) {
      const topRentable = masRentables[0];
      const topVendido = masVendidos[0];
      if (topRentable.nombre !== topVendido.nombre) {
        insights.push(
          `💡 "${topVendido.nombre}" es lo que más sale, pero "${topRentable.nombre}" es lo que más ganancia deja (${money(topRentable.gananciaTotal)} en el mes). ` +
          `Ponelo a la vista en el mostrador y ofrecelo al cobrar.`
        );
      }
    }

    // 6) Margen bajo cuantificado: cuánto ganarías subiéndolo al 25%.
    const bajo = menosRentables.find((p) => p.margenPorcentaje < 20 && !p.esCombo);
    if (bajo && bajo.ingresoTotal > 0) {
      const gananciaActual = bajo.gananciaTotal;
      const gananciaA25 = bajo.ingresoTotal * 0.25;
      const delta = gananciaA25 - gananciaActual;
      if (delta > 0) {
        insights.push(
          `📉 "${bajo.nombre}" rinde apenas ${bajo.margenPorcentaje.toFixed(1)}% de margen. ` +
          `Llevándolo al 25% (subir precio o cambiar proveedor) sumarías ~${money(delta)}/mes a igual volumen.`
        );
      }
    }

    return insights;
  };

  const insights = useMemo(() => generarInsights(), [monthlyData, metricasMensuales, masRentables, masVendidos, menosRentables]);

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
                  value={money(metricasDiariasFiltradas.totalIngresos)}
                  sub={`${metricasDiariasFiltradas.ventasCount} ventas${metodoFilterDiario !== "todos" ? ` · ${metodoFilterDiario}` : ""}`}
                />
                <MetricCard
                  accent="magenta"
                  hero
                  label="Ganancia limpia"
                  value={money(metricasDiariasFiltradas.gananciaLimpia)}
                  sub={`Margen ${metricasDiariasFiltradas.margenPorcentaje.toFixed(1)}%`}
                />
                <MetricCard
                  accent="cost"
                  label="Costos hoy"
                  value={money(metricasDiariasFiltradas.totalCostos)}
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
                          <th className={`${TH} text-left`}>
                            <button onClick={toggleSortHora} className="flex items-center gap-1 uppercase tracking-wider hover:text-[var(--neon-cyan)] transition-colors">
                              Hora {sortDiario.column === "hora" ? (sortDiario.direction === "desc" ? "↓" : "↑") : ""}
                            </button>
                          </th>
                          <th className={`${TH} text-left`}>
                            <button onClick={cycleItemsOrder} className="flex items-center gap-1 uppercase tracking-wider hover:text-[var(--neon-cyan)] transition-colors">
                              Items {itemsOrderDiario === "az" ? "A-Z" : itemsOrderDiario === "za" ? "Z-A" : ""}
                            </button>
                          </th>
                          <th className={`${TH} text-left`}>
                            <button onClick={cycleMetodoFilter} className="flex items-center gap-1 uppercase tracking-wider hover:text-[var(--neon-cyan)] transition-colors">
                              Método {metodoFilterDiario !== "todos" ? `· ${metodoFilterDiario}` : ""}
                            </button>
                          </th>
                          <th className={`${TH} text-right`}>
                            <button onClick={toggleSortTotal} className="flex items-center gap-1 uppercase tracking-wider hover:text-[var(--neon-cyan)] transition-colors ml-auto">
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
          )}

          {/* REPORTE SEMANAL */}
          {activeTab === "semanal" && (
            <div className="space-y-6">
              {/* Filtro por método de pago */}
              <div className="flex justify-end">
                <button
                  onClick={cycleMetodoFilterSemanal}
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-colors"
                >
                  Método: {metodoFilterSemanal === "todos" ? "Todos" : metodoFilterSemanal}
                </button>
              </div>

              {/* Totales Semanales */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <MetricCard
                  accent="cyan"
                  label="Ingresos (7 sesiones)"
                  value={money(metricasSemanalesFiltradas.totalIngresos)}
                  sub={`${metricasSemanalesFiltradas.ventasCount} ventas`}
                />
                <MetricCard
                  accent="magenta"
                  hero
                  label="Ganancia"
                  value={money(metricasSemanalesFiltradas.gananciaLimpia)}
                  sub={`Margen ${metricasSemanalesFiltradas.margenPorcentaje.toFixed(1)}%`}
                />
                <MetricCard
                  accent="neutral"
                  label="Promedio por día"
                  value={money(metricasSemanalesFiltradas.totalIngresos / 7)}
                />
              </div>

              {/* Tabla Comparativa por Día */}
              <Panel title="Comparativa día por día" accent="magenta">
                {ventasPorDia.length === 0 ? (
                  <EmptyState>
                    {metodoFilterSemanal === "todos" ? "Sin datos esta semana" : `Sin ventas con método "${metodoFilterSemanal}" esta semana`}
                  </EmptyState>
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
                          const porcentaje = (dia.total / metricasSemanalesFiltradas.totalIngresos) * 100;
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
              {/* Filtro por método de pago */}
              <div className="flex justify-end">
                <button
                  onClick={cycleMetodoFilterMensual}
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg border border-[var(--slate-gray)] text-[var(--text-secondary)] hover:border-[var(--neon-cyan)] hover:text-[var(--neon-cyan)] transition-colors"
                >
                  Método: {metodoFilterMensual === "todos" ? "Todos" : metodoFilterMensual}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <MetricCard accent="cyan" label="Ingresos del mes" value={money(metricasMensualesFiltradas.totalIngresos)} sub={`${metricasMensualesFiltradas.ventasCount} ventas`} />
                <MetricCard accent="magenta" hero label="Ganancia mensual" value={money(metricasMensualesFiltradas.gananciaLimpia)} />
                <MetricCard accent="cost" label="Costos del mes" value={money(metricasMensualesFiltradas.totalCostos)} valueColor="var(--warning)" />
                <MetricCard
                  accent="cyan"
                  label="Margen de ganancia"
                  value={`${metricasMensualesFiltradas.margenPorcentaje.toFixed(1)}%`}
                  valueColor={margenColor(metricasMensualesFiltradas.margenPorcentaje)}
                />
              </div>
              {metodoFilterMensual !== "todos" && (
                <p className="text-xs text-[var(--text-muted)] -mt-4">
                  Los productos, combos y horarios de abajo no están filtrados por método (solo las tarjetas de arriba).
                </p>
              )}

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

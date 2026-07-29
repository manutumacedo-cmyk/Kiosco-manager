import type { Sale, SaleItemWithProduct, Product, CategoriaSalida } from "@/types";
import type { ComboSaleData } from "./reports";
import type { GananciaReal } from "./reports";
import { money, CATEGORIA_LABEL } from "@/lib/format";

export interface ProductAnalysis {
  nombre: string;
  cantidad: number;
  gananciaTotal: number;
  margenPorcentaje: number;
  ingresoTotal: number;
  esCombo?: boolean;
}

export interface MetricasPeriodo {
  totalIngresos: number;
  totalCostos: number;
  gananciaLimpia: number;
  margenPorcentaje: number;
  ventasCount: number;
}

export function calcularMetricas(sales: Sale[], items: SaleItemWithProduct[]): MetricasPeriodo {
  const totalIngresos = sales.reduce((a, s) => a + Number(s.total), 0);
  const totalCostos = items.reduce((acc, it) => {
    const costo = it.products?.costo ?? 0;
    return acc + (costo * Number(it.cantidad || 0));
  }, 0);
  const gananciaLimpia = totalIngresos - totalCostos;
  const margenPorcentaje = totalIngresos > 0 ? (gananciaLimpia / totalIngresos) * 100 : 0;

  return { totalIngresos, totalCostos, gananciaLimpia, margenPorcentaje, ventasCount: sales.length };
}

/** Solo productos individuales (precio_unitario > 0); los componentes de combos tienen precio 0. */
export function analizarProductos(items: SaleItemWithProduct[]): ProductAnalysis[] {
  const productMap = new Map<string, ProductAnalysis>();

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
}

export function analizarCombos(comboItems: ComboSaleData[]): ProductAnalysis[] {
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
}

export function analizarHorarios(sales: Sale[]): [number, number][] {
  const horarios = new Map<number, number>();
  sales.forEach(s => {
    const hora = new Date(s.fecha).getHours();
    horarios.set(hora, (horarios.get(hora) || 0) + 1);
  });
  return Array.from(horarios.entries()).sort((a, b) => b[1] - a[1]);
}

/**
 * Insights especializados en el rubro: kiosco nocturno en la frontera Rivera (UY) /
 * Sant'Ana (BR), cobra en UYU y BRL, trabaja de noche/madrugada. Los consejos son
 * específicos y cuantificados, no genéricos.
 * Nota: `total` está en UYU (el POS convierte BRL al guardar). El período es "últimas 30
 * sesiones" (~1 mes), por eso los ritmos se expresan "al ritmo del último mes".
 */
export function generarInsights(params: {
  ventas: Sale[];
  totalRev: number;
  products: Product[];
  masVendidos: ProductAnalysis[];
  masRentables: ProductAnalysis[];
  menosRentables: ProductAnalysis[];
  gananciaReal: GananciaReal;
}): string[] {
  const { ventas, totalRev, products, masVendidos, masRentables, menosRentables, gananciaReal } = params;
  const insights: string[] = [];
  if (ventas.length === 0) return insights;

  // 1) Exposición cambiaria: cuánto de la facturación entró en reales (único de la frontera).
  const brlRev = ventas
    .filter((s) => s.moneda === "BRL")
    .reduce((a, s) => a + Number(s.total), 0);
  const pctBrl = totalRev > 0 ? (brlRev / totalRev) * 100 : 0;
  if (brlRev > 0 && pctBrl >= 5) {
    const impacto5 = brlRev * 0.05;
    insights.push(
      `El ${pctBrl.toFixed(0)}% de tu facturación entró en reales (${money(brlRev)} de ${money(totalRev)}). ` +
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
      `Tu franja más fuerte es la ${fuerte.n}: ${money(fuerte.rev)} (${pctFuerte.toFixed(0)}% de la facturación). ` +
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
      `El ${DIAS[maxDia]} es tu día más fuerte (${pctDia.toFixed(0)}% de la facturación del mes). ` +
      `Reforzá compra y caja para ese día.`
    );
  }

  // 4) Quiebre de stock de tu best-seller (sin reposición de madrugada = venta perdida).
  const stockPorNombre = new Map(products.map((p) => [p.nombre, p]));
  const topVendidoProd = masVendidos.find((p) => !p.esCombo);
  if (topVendidoProd) {
    const prod = stockPorNombre.get(topVendidoProd.nombre);
    if (prod && Number(prod.stock) > 0 && topVendidoProd.cantidad > 0) {
      const ritmoDiario = topVendidoProd.cantidad / 30; // ~30 sesiones ≈ 1 mes
      const diasCobertura = Number(prod.stock) / ritmoDiario;
      if (diasCobertura < 5) {
        insights.push(
          `"${topVendidoProd.nombre}" es tu más vendido y te quedan ${prod.stock} u. (cobertura ~${diasCobertura.toFixed(1)} días al ritmo del último mes). ` +
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
        `"${topVendido.nombre}" es lo que más sale, pero "${topRentable.nombre}" es lo que más ganancia deja (${money(topRentable.gananciaTotal)} en el mes). ` +
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
        `"${bajo.nombre}" rinde apenas ${bajo.margenPorcentaje.toFixed(1)}% de margen. ` +
        `Llevándolo al 25% (subir precio o cambiar proveedor) sumarías ~${money(delta)}/mes a igual volumen.`
      );
    }
  }

  // 7) Peso de las salidas de caja sobre la ganancia (lo que "ganancia limpia" ocultaba).
  const salidasUyu = gananciaReal.totalSalidasUyu;
  if (salidasUyu > 0 && totalRev > 0) {
    const pctSalidas = (salidasUyu / totalRev) * 100;
    const categoriaTop = (Object.entries(gananciaReal.salidasPorCategoria) as [CategoriaSalida, number][])
      .sort((a, b) => b[1] - a[1])[0];
    insights.push(
      `Las salidas de caja del mes suman ${money(salidasUyu)} (${pctSalidas.toFixed(0)}% de la facturación), ` +
      `la mayor parte en "${CATEGORIA_LABEL[categoriaTop[0]]}" (${money(categoriaTop[1])}). Sin restarlas, la ganancia se ve más alta de lo que realmente es.`
    );
  }

  return insights;
}

/**
 * ================================================================
 * MOTOR DE INTELIGENCIA ESTRATÉGICA DINÁMICA
 * ================================================================
 * Sistema que aprende de cada venta y genera insights accionables
 */

import { supabase } from "@/lib/supabaseClient";

// ========== TIPOS ==========
export interface StrategicInsight {
  id: string;
  tipo: InsightType;
  titulo: string;
  mensaje: string;
  prioridad: 1 | 2 | 3; // 1=Alta, 2=Media, 3=Baja
  accion_sugerida: string | null;
  mostrado: boolean;
  created_at: string;
  context_data: any;
}

export type InsightType =
  | "margen_bajo"
  | "producto_estancado"
  | "hora_muerta"
  | "combo_sugerido"
  | "precio_optimizar"
  | "stock_critico"
  | "tendencia_alcista"
  | "oportunidad_upsell";

interface SaleContext {
  sale_id: string;
  items: Array<{
    product_id: string;
    cantidad: number;
    precio_unitario: number;
  }>;
  total: number;
  fecha: Date;
}

interface ProductMetrics {
  id: string;
  nombre: string;
  categoria: string | null;
  precio: number;
  costo: number;
  stock: number;
  ventasUltimos7Dias: number;
  gananciaUltimos7Dias: number;
  margenPromedio: number;
  velocidadVenta: number; // ventas por día
}

// ========== CONFIGURACIÓN ==========
const INSIGHT_ROTATION_INTERVAL = 3; // Cambiar tipo de insight cada 3 ventas
const MAX_INSIGHTS_STORED = 20;
const MARGEN_MINIMO_ACEPTABLE = 25; // %
const VELOCIDAD_MINIMA_ACEPTABLE = 1; // ventas por semana

// ========== MOTOR PRINCIPAL ==========

/**
 * Hook principal que se ejecuta después de cada venta
 */
export async function generatePostSaleInsights(context: SaleContext): Promise<void> {
  try {
    // Ejecutar de forma asíncrona sin bloquear la venta
    setTimeout(async () => {
      const insights: Omit<StrategicInsight, 'id' | 'created_at'>[] = [];

      // 1. Obtener métricas actualizadas
      const metrics = await calculateCurrentMetrics();

      // 2. Analizar la venta actual
      const saleAnalysis = await analyzeSale(context, metrics);

      // 3. Generar insights basados en análisis
      if (saleAnalysis.bajoMargen) {
        insights.push(generateMargenBajoInsight(saleAnalysis.bajoMargen));
      }

      if (saleAnalysis.productosEstancados.length > 0) {
        insights.push(generateProductoEstancadoInsight(saleAnalysis.productosEstancados[0]));
      }

      if (saleAnalysis.horaMuerta) {
        insights.push(generateHoraMuertaInsight(saleAnalysis.horaMuerta));
      }

      if (saleAnalysis.comboSugerido) {
        insights.push(generateComboInsight(saleAnalysis.comboSugerido));
      }

      if (saleAnalysis.oportunidadPrecio) {
        insights.push(generatePrecioOptimizarInsight(saleAnalysis.oportunidadPrecio));
      }

      // 4. Rotar insights para evitar repetición
      const rotatedInsights = await rotateInsights(insights);

      // 5. Almacenar en BD
      if (rotatedInsights.length > 0) {
        await storeInsights(rotatedInsights);
      }

      // 6. Limpiar insights antiguos
      await cleanOldInsights();
    }, 100); // Delay mínimo para no bloquear
  } catch (error) {
    console.error('[Strategic Insights] Error generando insights:', error);
    // No lanzar error para no afectar la venta
  }
}

// ========== ANÁLISIS DE MÉTRICAS ==========

async function calculateCurrentMetrics(): Promise<ProductMetrics[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Obtener productos con sus ventas de los últimos 7 días
  const { data: products } = await supabase
    .from('products')
    .select('id, nombre, categoria, precio, costo, stock')
    .eq('activo', true);

  if (!products) return [];

  const metrics: ProductMetrics[] = [];

  for (const product of products) {
    // Ventas del producto en los últimos 7 días
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('cantidad, precio_unitario, created_at')
      .eq('product_id', product.id)
      .gte('created_at', sevenDaysAgo.toISOString());

    const ventasUltimos7Dias = saleItems?.reduce((sum, item) => sum + item.cantidad, 0) || 0;
    const ingresoTotal = saleItems?.reduce((sum, item) => sum + (item.cantidad * item.precio_unitario), 0) || 0;
    const costoTotal = ventasUltimos7Dias * product.costo;
    const gananciaUltimos7Dias = ingresoTotal - costoTotal;
    const margenPromedio = ingresoTotal > 0 ? (gananciaUltimos7Dias / ingresoTotal) * 100 : 0;
    const velocidadVenta = ventasUltimos7Dias / 7;

    metrics.push({
      id: product.id,
      nombre: product.nombre,
      categoria: product.categoria,
      precio: product.precio,
      costo: product.costo,
      stock: product.stock,
      ventasUltimos7Dias,
      gananciaUltimos7Dias,
      margenPromedio,
      velocidadVenta,
    });
  }

  return metrics;
}

interface SaleAnalysis {
  bajoMargen: ProductMetrics | null;
  productosEstancados: ProductMetrics[];
  horaMuerta: { hora: number; ventasPromedio: number } | null;
  comboSugerido: { producto1: string; producto2: string } | null;
  oportunidadPrecio: ProductMetrics | null;
}

async function analyzeSale(context: SaleContext, metrics: ProductMetrics[]): Promise<SaleAnalysis> {
  const analysis: SaleAnalysis = {
    bajoMargen: null,
    productosEstancados: [],
    horaMuerta: null,
    comboSugerido: null,
    oportunidadPrecio: null,
  };

  // Analizar productos de esta venta
  for (const item of context.items) {
    const productMetric = metrics.find(m => m.id === item.product_id);
    if (!productMetric) continue;

    // Detectar bajo margen
    if (productMetric.margenPromedio < MARGEN_MINIMO_ACEPTABLE && !analysis.bajoMargen) {
      analysis.bajoMargen = productMetric;
    }

    // Detectar oportunidad de subir precio (mucha demanda, buen margen)
    if (productMetric.velocidadVenta > 3 && productMetric.margenPromedio > 40 && !analysis.oportunidadPrecio) {
      analysis.oportunidadPrecio = productMetric;
    }
  }

  // Detectar productos estancados (bajo movimiento)
  analysis.productosEstancados = metrics
    .filter(m => m.velocidadVenta < VELOCIDAD_MINIMA_ACEPTABLE && m.stock > 0)
    .sort((a, b) => a.velocidadVenta - b.velocidadVenta)
    .slice(0, 3);

  // Analizar horas muertas
  const horaMuerta = await detectHoraMuerta();
  if (horaMuerta) {
    analysis.horaMuerta = horaMuerta;
  }

  // Sugerir combo (productos que se compran juntos pero no en el mismo ticket)
  const combo = await detectComboOpportunity(metrics);
  if (combo) {
    analysis.comboSugerido = combo;
  }

  return analysis;
}

async function detectHoraMuerta(): Promise<{ hora: number; ventasPromedio: number } | null> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: sales } = await supabase
    .from('sales')
    .select('fecha')
    .gte('fecha', sevenDaysAgo.toISOString());

  if (!sales || sales.length === 0) return null;

  // Contar ventas por hora
  const ventasPorHora = new Map<number, number>();
  for (let h = 0; h < 24; h++) {
    ventasPorHora.set(h, 0);
  }

  sales.forEach(sale => {
    const hora = new Date(sale.fecha).getHours();
    ventasPorHora.set(hora, (ventasPorHora.get(hora) || 0) + 1);
  });

  // Encontrar la hora con menos ventas (excluyendo horas de cierre típicas)
  let horaMuerta = -1;
  let minVentas = Infinity;

  for (let h = 8; h < 20; h++) { // Solo horario comercial
    const ventas = ventasPorHora.get(h) || 0;
    if (ventas < minVentas) {
      minVentas = ventas;
      horaMuerta = h;
    }
  }

  const promedioVentas = Array.from(ventasPorHora.values()).reduce((a, b) => a + b, 0) / 24;

  if (minVentas < promedioVentas * 0.5) { // Si es menos del 50% del promedio
    return { hora: horaMuerta, ventasPromedio: minVentas / 7 };
  }

  return null;
}

async function detectComboOpportunity(metrics: ProductMetrics[]): Promise<{ producto1: string; producto2: string } | null> {
  // Simplificado: sugerir combo entre el más vendido y uno de buen margen
  const masVendido = metrics.sort((a, b) => b.ventasUltimos7Dias - a.ventasUltimos7Dias)[0];
  const mejorMargen = metrics
    .filter(m => m.id !== masVendido?.id && m.margenPromedio > 30)
    .sort((a, b) => b.margenPromedio - a.margenPromedio)[0];

  if (masVendido && mejorMargen) {
    return {
      producto1: masVendido.nombre,
      producto2: mejorMargen.nombre,
    };
  }

  return null;
}

// ========== GENERADORES DE INSIGHTS ==========

function generateMargenBajoInsight(producto: ProductMetrics): Omit<StrategicInsight, 'id' | 'created_at'> {
  const incrementoSugerido = Math.ceil((MARGEN_MINIMO_ACEPTABLE - producto.margenPromedio) / producto.margenPromedio * producto.precio);

  return {
    tipo: 'margen_bajo',
    titulo: `Margen bajo en "${producto.nombre}"`,
    mensaje: `Estás vendiendo "${producto.nombre}" con un margen del ${producto.margenPromedio.toFixed(1)}% (debajo del ${MARGEN_MINIMO_ACEPTABLE}% recomendado). Aunque tenés volumen, tu ganancia neta es baja.`,
    accion_sugerida: `Considerá subir el precio $${incrementoSugerido} o buscar un proveedor más económico. Esto aumentaría tu margen al ${MARGEN_MINIMO_ACEPTABLE}%.`,
    prioridad: 1,
    mostrado: false,
    context_data: {
      product_id: producto.id,
      margen_actual: producto.margenPromedio,
      precio_actual: producto.precio,
      incremento_sugerido: incrementoSugerido,
    },
  };
}

function generateProductoEstancadoInsight(producto: ProductMetrics): Omit<StrategicInsight, 'id' | 'created_at'> {
  return {
    tipo: 'producto_estancado',
    titulo: `"${producto.nombre}" está estancado`,
    mensaje: `El producto "${producto.nombre}" tiene una velocidad de venta de ${producto.velocidadVenta.toFixed(2)} unidades/día (muy bajo). Tenés ${producto.stock} unidades en stock que no se están moviendo.`,
    accion_sugerida: `Lanzá una promoción "Descuento Flash" del 15-20% o creá un combo con un producto estrella para acelerar la rotación antes de que expire o quede obsoleto.`,
    prioridad: 2,
    mostrado: false,
    context_data: {
      product_id: producto.id,
      velocidad_actual: producto.velocidadVenta,
      stock_actual: producto.stock,
    },
  };
}

function generateHoraMuertaInsight(horaMuerta: { hora: number; ventasPromedio: number }): Omit<StrategicInsight, 'id' | 'created_at'> {
  return {
    tipo: 'hora_muerta',
    titulo: `Hora muerta detectada: ${horaMuerta.hora}:00 - ${horaMuerta.hora + 1}:00`,
    mensaje: `Entre las ${horaMuerta.hora}:00 y ${horaMuerta.hora + 1}:00 tus ventas caen significativamente (solo ${horaMuerta.ventasPromedio.toFixed(1)} ventas/día vs el promedio general).`,
    accion_sugerida: `Creá una "Promo de Horario" exclusiva para ese rango (ej: 2x1 en bebidas de ${horaMuerta.hora}:00 a ${horaMuerta.hora + 1}:00). Promocioná en redes sociales con countdown.`,
    prioridad: 2,
    mostrado: false,
    context_data: {
      hora_inicio: horaMuerta.hora,
      ventas_promedio: horaMuerta.ventasPromedio,
    },
  };
}

function generateComboInsight(combo: { producto1: string; producto2: string }): Omit<StrategicInsight, 'id' | 'created_at'> {
  return {
    tipo: 'combo_sugerido',
    titulo: `Oportunidad de Combo: ${combo.producto1} + ${combo.producto2}`,
    mensaje: `"${combo.producto1}" es tu best-seller, pero "${combo.producto2}" tiene excelente margen. Los clientes no los compran juntos frecuentemente.`,
    accion_sugerida: `Creá un combo "${combo.producto1} + ${combo.producto2}" con 10% de descuento. Esto aumenta tu ticket promedio y mejora el margen general. Exhibí el combo en punto de venta.`,
    prioridad: 1,
    mostrado: false,
    context_data: {
      producto1: combo.producto1,
      producto2: combo.producto2,
    },
  };
}

function generatePrecioOptimizarInsight(producto: ProductMetrics): Omit<StrategicInsight, 'id' | 'created_at'> {
  const incremento = Math.ceil(producto.precio * 0.05); // 5% de incremento

  return {
    tipo: 'precio_optimizar',
    titulo: `Oportunidad de optimizar precio: "${producto.nombre}"`,
    mensaje: `"${producto.nombre}" se vende muy bien (${producto.velocidadVenta.toFixed(1)} u/día) y tiene buen margen (${producto.margenPromedio.toFixed(1)}%). La demanda es alta, podés optimizar el precio.`,
    accion_sugerida: `Probá subir el precio $${incremento} (5%). Con esta demanda, la elasticidad es baja y podés aumentar ingresos sin perder clientes. Monitoreá ventas por 3 días.`,
    prioridad: 2,
    mostrado: false,
    context_data: {
      product_id: producto.id,
      precio_actual: producto.precio,
      incremento_sugerido: incremento,
      velocidad_actual: producto.velocidadVenta,
    },
  };
}

// ========== ROTACIÓN Y ALMACENAMIENTO ==========

async function rotateInsights(newInsights: Omit<StrategicInsight, 'id' | 'created_at'>[]): Promise<Omit<StrategicInsight, 'id' | 'created_at'>[]> {
  if (newInsights.length === 0) return [];

  // Obtener últimos insights almacenados
  const { data: existingInsights } = await supabase
    .from('strategic_insights')
    .select('tipo')
    .eq('mostrado', false)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentTypes = new Set(existingInsights?.map(i => i.tipo) || []);

  // Filtrar insights que no se hayan mostrado recientemente
  const freshInsights = newInsights.filter(insight => !recentTypes.has(insight.tipo));

  // Si todos están repetidos, tomar solo uno del tipo menos reciente
  if (freshInsights.length === 0 && newInsights.length > 0) {
    return [newInsights[0]];
  }

  // Priorizar por importancia
  return freshInsights.sort((a, b) => a.prioridad - b.prioridad).slice(0, 2);
}

async function storeInsights(insights: Omit<StrategicInsight, 'id' | 'created_at'>[]): Promise<void> {
  if (insights.length === 0) return;

  const { error } = await supabase
    .from('strategic_insights')
    .insert(insights);

  if (error) {
    console.error('[Strategic Insights] Error almacenando insights:', error);
  }
}

async function cleanOldInsights(): Promise<void> {
  // Mantener solo los últimos MAX_INSIGHTS_STORED
  const { data: allInsights } = await supabase
    .from('strategic_insights')
    .select('id, created_at')
    .order('created_at', { ascending: false });

  if (!allInsights || allInsights.length <= MAX_INSIGHTS_STORED) return;

  const toDelete = allInsights.slice(MAX_INSIGHTS_STORED).map(i => i.id);

  await supabase
    .from('strategic_insights')
    .delete()
    .in('id', toDelete);
}

// ========== API PARA DASHBOARD ==========

/**
 * Obtiene los insights más recientes para mostrar en el dashboard
 */
export async function getLatestInsights(limit: number = 5): Promise<StrategicInsight[]> {
  const { data, error } = await supabase
    .from('strategic_insights')
    .select('*')
    .eq('mostrado', false)
    .order('prioridad', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Strategic Insights] Error obteniendo insights:', error);
    return [];
  }

  return (data || []) as StrategicInsight[];
}

/**
 * Marca un insight como mostrado
 */
export async function markInsightAsShown(insightId: string): Promise<void> {
  await supabase
    .from('strategic_insights')
    .update({ mostrado: true })
    .eq('id', insightId);
}

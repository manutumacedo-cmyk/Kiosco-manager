/** Modelos que reflejan las tablas de Supabase (schema public) */

export interface Product {
  id: string;
  nombre: string;
  categoria: string | null;
  precio: number;
  costo: number;
  stock: number;
  stock_minimo: number;
  activo: boolean;
  created_at: string;
}

/** Versión reducida para selects / dropdowns */
export interface ProductMini {
  id: string;
  nombre: string;
}

export interface RestockSource {
  id: string;
  product_id: string;
  lugar: string;
  precio_compra: number;
  moneda: string;
  presentacion: string | null;
  contacto: string | null;
  url: string | null;
  notas: string | null;
  created_at: string;
}

export interface RestockPurchase {
  id: string;
  fecha: string;
  product_id: string;
  source_id: string;
  cantidad: number;
  precio_unitario: number;
  moneda: string;
  costo_total: number;
  notas: string | null;
  created_at: string;
}

export interface CashSession {
  id: string;
  cajero: string;
  apertura_at: string;
  monto_inicial: number;
  monto_inicial_brl: number;
  estado: 'abierta' | 'cerrada';
  cerrado_por: string | null;
  user_id: string | null;            // cuenta real que abrió el turno (verificada por JWT)
  cerrado_por_user_id: string | null; // cuenta real que cerró el turno (puede diferir de user_id)
  cierre_at: string | null;
  notas_cierre: string | null;
  total_ventas: number | null;
  total_efectivo_uyu: number | null;
  total_efectivo_brl: number | null; // BRL neto: Σ(pagado BRL) − Σ(vuelto BRL)
  total_digital: number | null;
  cantidad_ventas: number | null;
  efectivo_contado_uyu: number | null;  // arqueo: pesos contados al cierre (B28)
  efectivo_contado_brl: number | null;  // arqueo: reales contados al cierre
  total_salidas_uyu: number | null;     // snapshot al cierre: salidas del local en pesos
  total_salidas_brl: number | null;     // snapshot al cierre: salidas del local en reales
  total_entradas_uyu: number | null;    // snapshot al cierre: entradas de plata en pesos (B32)
  total_entradas_brl: number | null;    // snapshot al cierre: entradas de plata en reales (B32)
  diferencia_uyu: number | null;        // contado − esperado (pesos); >0 sobra, <0 falta
  diferencia_brl: number | null;        // contado − esperado (reales)
  // Anulaciones POSTERIORES al cierre (B26). El snapshot de arriba es el arqueo de
  // esa noche y no se reescribe nunca; el total real es snapshot − ajuste.
  ajuste_ventas_post_cierre: number;
  ajuste_efectivo_uyu_post_cierre: number;
  ajuste_efectivo_brl_post_cierre: number;
  ajuste_digital_post_cierre: number;
  cantidad_anuladas_post_cierre: number;
  created_at: string;
}

export type CategoriaSalida = 'restock' | 'proveedor' | 'gasto_personal' | 'funcionario' | 'otro';

export interface CashOutflow {
  id: string;
  session_id: string;
  monto: number;
  moneda: 'UYU' | 'BRL';
  tipo: 'entrada' | 'salida';
  motivo: string;
  categoria: CategoriaSalida | null; // null para 'entrada'; obligatoria para 'salida'
  created_at: string;
}

export interface Sale {
  id: string;
  fecha: string;
  metodo_pago: string;
  total: number;
  nota: string | null;
  moneda: string;
  pagado: number | null;
  vuelto: number | null;
  vuelto_moneda: 'UYU' | 'BRL' | null; // NULL = UYU (default); 'BRL' cuando el vuelto se dio en reales
  estado: string; // 'activa' | 'anulada'
  anulada_por: string | null;  // quién anuló la venta (B30)
  anulada_at: string | null;   // cuándo se anuló (B30)
  session_id: string | null;
  // Si el turno del POS ya estaba cerrado al cobrar, la venta se reasigna al turno
  // vigente y acá queda el original (B27). NULL en el caso normal.
  session_id_original: string | null;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  cantidad: number;
  precio_unitario: number;
  created_at: string;
}

/** Tipo para sale_items con datos de producto resueltos en TypeScript (sin FK a products) */
export interface SaleItemWithProduct {
  product_id: string;
  cantidad: number;
  precio_unitario: number;
  products: { nombre: string; costo: number } | null;
}

/** Cierre de caja con totales por método de pago */
export interface CierreCaja {
  id: string;
  fecha_cierre: string;
  total_efectivo: number;
  total_debito: number;
  total_transferencia: number;
  total_brl: number;
  cantidad_ventas: number;
  monto_total: number;
  notas: string | null;
  created_at: string;
}

export interface FxRate {
  fecha: string;
  brl_to_uyu: number;
  created_at: string;
}

/** Combos personalizados */
export interface Combo {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/** Items que componen un combo */
export interface ComboItem {
  id: string;
  combo_id: string;
  product_id: string;
  cantidad: number;
  created_at: string;
}

/** Combo con sus productos incluidos */
export interface ComboWithProducts extends Combo {
  items: Array<{
    product_id: string;
    cantidad: number;
    nombre: string;
    precio: number;
  }>;
}

/** Configuración de tasas de cambio */
export interface ExchangeRateConfig {
  id: string;
  currency_from: string;
  currency_to: string;
  rate: number;
  updated_at: string;
}

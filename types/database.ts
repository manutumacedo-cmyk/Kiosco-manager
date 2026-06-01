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
  estado: 'abierta' | 'cerrada';
  cerrado_por: string | null;
  cierre_at: string | null;
  notas_cierre: string | null;
  total_ventas: number | null;
  total_efectivo_uyu: number | null;
  total_efectivo_brl: number | null; // BRL neto: Σ(pagado BRL) − Σ(vuelto BRL)
  total_digital: number | null;
  cantidad_ventas: number | null;
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
  session_id: string | null;
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

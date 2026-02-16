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

export interface Sale {
  id: string;
  fecha: string;
  metodo_pago: string;
  total: number;
  nota: string | null;
  moneda: string;
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

/** Tipo para sale_items con join a products (usado en reportes) */
export interface SaleItemWithProduct {
  cantidad: number;
  precio_unitario: number;
  products: { nombre: string; costo: number } | { nombre: string; costo: number }[] | null;
}

export interface FxRate {
  fecha: string;
  brl_to_uyu: number;
  created_at: string;
}

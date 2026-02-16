/** Tipos de UI usados en los componentes */

export interface CartItem {
  product_id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  stock_actual: number;
}

export interface ProductDraft {
  precio: string;
  costo: string;
  stock: string;
  stock_minimo: string;
  categoria: string | null;
}

export type SortMode = "az" | "stock" | "reponer";
export type TabMode = "listado" | "reposicion";
export type PaymentMethod =
  | "efectivo"
  | "debito"
  | "credito"
  | "transferencia"
  | "mercadopago";

export type CategoryType = "Bebidas" | "Alimento" | "Vasos" | "Otros";

export const CATEGORIES: CategoryType[] = ["Bebidas", "Alimento", "Vasos", "Otros"];

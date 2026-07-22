import type { CategoriaSalida } from "@/types";

export const CATEGORIA_LABEL: Record<CategoriaSalida, string> = {
  restock: "Restock",
  proveedor: "Proveedor",
  gasto_personal: "Gasto personal",
  otro: "Otro",
};

export const money = (n: number) => `$${Number(n).toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;

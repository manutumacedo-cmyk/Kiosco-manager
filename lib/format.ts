import type { CategoriaSalida } from "@/types";

export const CATEGORIA_LABEL: Record<CategoriaSalida, string> = {
  restock: "Restock",
  proveedor: "Proveedor",
  gasto_personal: "Gasto personal",
  funcionario: "Pago a funcionario",
  otro: "Otro",
};

export const money = (n: number) => `$${Number(n).toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;

/**
 * Clasificación gasto fijo / variable por categoría de salida. "Variable" son las que
 * escalan con el volumen de venta (restock y pagos a proveedores de mercadería, ej. el
 * sodero); "fijo" son recurrentes independientemente de cuánto se vende (sueldos, gastos
 * del dueño). Referencia: un gasto variable se puede ajustar rápido si cae la venta; el
 * fijo es el riesgo real en un mes flojo porque no baja solo.
 */
export type TipoGasto = "fijo" | "variable" | "sin_clasificar";

export const CATEGORIA_TIPO_GASTO: Record<CategoriaSalida, TipoGasto> = {
  restock: "variable",
  proveedor: "variable",
  funcionario: "fijo",
  gasto_personal: "fijo",
  otro: "sin_clasificar",
};

export const TIPO_GASTO_LABEL: Record<TipoGasto, string> = {
  fijo: "Fijo",
  variable: "Variable",
  sin_clasificar: "Sin clasificar",
};

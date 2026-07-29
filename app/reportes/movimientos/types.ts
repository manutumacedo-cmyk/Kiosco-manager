export type DateFilter = "today" | "week" | "month" | "custom";

export const CATEGORIA_FILTER_OPTIONS = ["todas", "restock", "proveedor", "funcionario", "gasto_personal", "otro"] as const;
export type CategoriaFilter = (typeof CATEGORIA_FILTER_OPTIONS)[number];

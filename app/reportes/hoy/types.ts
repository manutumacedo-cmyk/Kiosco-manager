export type TabView = "diario" | "semanal" | "mensual" | "estrategico" | "margen";

// Un solo eje de orden compartido entre Hora y Total (como una tabla clásica de
// "click header to sort"): Hora alterna entre 2 estados (reciente/antigua), Total
// cicla por 3 (mayor→menor, menor→mayor, sin filtro = vuelve al orden por hora).
export const METODO_FILTER_CYCLE = ["todos", "efectivo", "debito", "credito", "transferencia", "pix"] as const;
export type MetodoFilter = (typeof METODO_FILTER_CYCLE)[number];

export const ITEMS_ORDER_CYCLE = ["original", "az", "za"] as const;
export type ItemsOrder = (typeof ITEMS_ORDER_CYCLE)[number];

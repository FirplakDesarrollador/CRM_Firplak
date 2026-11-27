// Va en un archivo aparte (sin "use client"): lo usan la página del servidor y la gráfica del navegador.

/** Acumulado al cierre de cada día del periodo: lo facturado hasta ese día y lo que ya se espera facturar hasta él. */
export type RealDay = { date: string; invoiced: number; backlog: number; opportunities: number };

/** Las tres capas del pronóstico, de abajo hacia arriba: lo más seguro primero. */
export const REAL_LAYERS = [
  { key: "invoiced", label: "Facturado", color: "var(--success)" },
  { key: "backlog", label: "Pedidos y entregas abiertos", color: "var(--info)" },
  { key: "opportunities", label: "Oportunidades", color: "var(--warning)" },
] as const;

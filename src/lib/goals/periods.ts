import { todayISO } from "@/lib/format";

export type GoalPeriodType = "month" | "quarter" | "year";
export type GoalMetric = "won_amount" | "won_count" | "new_opportunities" | "new_leads" | "activities_completed" | "invoiced_amount";

export const GOAL_METRICS: { key: GoalMetric; label: string; money?: boolean }[] = [
  { key: "won_amount", label: "Ventas ganadas", money: true },
  // Facturación neta que trae el agente de SAP (facturas menos notas crédito).
  { key: "invoiced_amount", label: "Ventas facturadas (SAP)", money: true },
  { key: "won_count", label: "Negocios ganados" },
  { key: "new_opportunities", label: "Oportunidades nuevas" },
  { key: "new_leads", label: "Prospectos nuevos" },
  { key: "activities_completed", label: "Actividades completadas" },
];

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Inicio normalizado del periodo que contiene `date`. */
export function periodStart(type: GoalPeriodType, date: string) {
  const [y, m] = date.split("-").map(Number);
  if (type === "year") return `${y}-01-01`;
  if (type === "quarter") return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function shiftPeriod(type: GoalPeriodType, start: string, delta: number) {
  const [y, m] = start.split("-").map(Number);
  const months = type === "year" ? 12 : type === "quarter" ? 3 : 1;
  const d = new Date(Date.UTC(y, m - 1 + months * delta, 1));
  return d.toISOString().slice(0, 10);
}

export function periodEnd(type: GoalPeriodType, start: string) {
  const next = shiftPeriod(type, start, 1);
  const d = new Date(Date.parse(`${next}T00:00:00Z`) - 86400000);
  return d.toISOString().slice(0, 10);
}

export function periodLabel(type: GoalPeriodType, start: string, locale: "es" | "en" = "es") {
  const [y, m] = start.split("-").map(Number);
  if (type === "year") return String(y);
  if (type === "quarter") return `${locale === "en" ? "Q" : "T"}${Math.floor((m - 1) / 3) + 1} ${y}`;
  return `${(locale === "en" ? MONTHS_EN : MONTHS)[m - 1]} ${y}`;
}

/** Fracción del periodo transcurrida (0–1) según la fecha de hoy en Colombia. */
export function elapsedFraction(type: GoalPeriodType, start: string) {
  const today = todayISO();
  const end = periodEnd(type, start);
  if (today < start) return 0;
  if (today > end) return 1;
  const total = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  const done = (Date.parse(today) - Date.parse(start)) / 86400000 + 1;
  return done / total;
}

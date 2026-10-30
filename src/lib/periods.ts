import { addDaysISO, todayISO } from "@/lib/format";
import { dateRange } from "@/lib/records/filters";

export const PERIODS: Record<string, string> = {
  this_month: "Este mes",
  last_month: "Mes anterior",
  this_quarter: "Este trimestre",
  this_year: "Este año",
  last_12: "Últimos 12 meses",
  custom: "Personalizado",
};

export function resolvePeriod(period: string, from?: string, to?: string): { from: string; to: string; period: string } {
  const today = todayISO();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (period === "custom" && from && to && iso.test(from) && iso.test(to) && from <= to) return { from, to, period };
  if (period === "last_month") {
    const [y, m] = today.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 2, 1));
    const end = new Date(Date.UTC(y, m - 1, 0));
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), period };
  }
  if (period === "last_12") {
    const [y, m] = today.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { from: start, to: end, period };
  }
  const key = ["this_month", "this_quarter", "this_year"].includes(period) ? period : "this_year";
  const range = dateRange(key as "this_month", "") ?? [addDaysISO(today, -30), today];
  return { from: range[0], to: range[1], period: key };
}

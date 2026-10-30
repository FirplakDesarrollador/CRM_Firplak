import type { FieldDef, Filter } from "@/lib/objects";

export type DateGrouping = "month" | "quarter" | "year";
export type AggregateFn = "count" | "sum" | "avg";

export type ReportDefinition = {
  filters?: Filter[];
  scope?: "all" | "mine";
  groupBy?: string;
  groupBy2?: string;
  dateGrouping?: DateGrouping;
  aggregate?: { fn: AggregateFn; field?: string };
  chart?: "bar" | "column" | "table";
};

const GROUPABLE = new Set(["select", "user", "lookup", "stage", "checkbox", "date", "datetime"]);
const GROUPABLE_TEXT = new Set([
  "billing_city", "billing_state", "shipping_city", "city", "state", "mailing_city", "mailing_state", "department", "title", "family",
]);
const NUMERIC = new Set(["currency", "number", "percent"]);

/** Campos por los que se puede agrupar: listas, relaciones, fechas y algunos textos útiles. */
export function groupableFields(fields: FieldDef[]) {
  return fields.filter((f) => GROUPABLE.has(f.type) || (f.type === "text" && GROUPABLE_TEXT.has(f.name)));
}

export function numericFields(fields: FieldDef[]) {
  return fields.filter((f) => NUMERIC.has(f.type));
}

export function parseDefinition(raw: unknown): ReportDefinition {
  if (!raw) return {};
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    return d && typeof d === "object" ? (d as ReportDefinition) : {};
  } catch {
    return {};
  }
}

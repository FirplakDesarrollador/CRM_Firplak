import { fieldValue, type Filter, type ObjectDef } from "@/lib/objects";
import { dateRange, VALUELESS_OPS } from "@/lib/records/filters";
import { todayISO } from "@/lib/format";

const NUMERIC = new Set(["number", "currency", "percent"]);

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function asDate(v: unknown, type: string) {
  if (isEmpty(v)) return null;
  const s = String(v);
  return type === "datetime" ? new Date(Date.parse(s) - 5 * 3600000).toISOString().slice(0, 10) : s.slice(0, 10);
}

/** Evalúa una condición (mismos operadores que los filtros de lista) sobre un registro en memoria. */
export function matchesCondition(def: ObjectDef, row: Record<string, unknown>, cond: Filter, userId: string): boolean {
  const field = def.fields.find((f) => f.name === cond.field);
  if (!field) return false;
  const value = fieldValue(row, field.name);
  const target = cond.value ?? "";
  const numeric = NUMERIC.has(field.type);
  const isDate = field.type === "date" || field.type === "datetime";

  switch (cond.op) {
    case "empty":
      return isEmpty(value);
    case "not_empty":
      return !isEmpty(value);
    case "me":
      return value === userId;
    case "eq":
      if (field.type === "checkbox") return Boolean(value) === (target === "true");
      if (numeric) return !isEmpty(value) && Number(value) === Number(target);
      if (isDate) return asDate(value, field.type) === target;
      return String(value ?? "").toLowerCase() === target.toLowerCase();
    case "neq":
      if (field.type === "checkbox") return Boolean(value) !== (target === "true");
      if (numeric) return isEmpty(value) || Number(value) !== Number(target);
      return String(value ?? "").toLowerCase() !== target.toLowerCase();
    case "contains":
      if (Array.isArray(value)) return value.map(String).includes(target);
      return String(value ?? "").toLowerCase().includes(target.toLowerCase());
    case "starts":
      return String(value ?? "").toLowerCase().startsWith(target.toLowerCase());
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (isEmpty(value) && !numeric) return false;
      const a = numeric ? Number(value ?? 0) : asDate(value, field.type) ?? String(value);
      const b = numeric ? Number(target) : target;
      if (cond.op === "gt") return a > b;
      if (cond.op === "gte") return a >= b;
      if (cond.op === "lt") return a < b;
      return a <= b;
    }
    case "overdue": {
      const d = asDate(value, field.type);
      return d !== null && d < todayISO();
    }
    default: {
      const range = dateRange(cond.op, target);
      const d = asDate(value, field.type);
      return Boolean(range && d && d >= range[0] && d <= range[1]);
    }
  }
}

/** true si el registro cumple TODAS las condiciones (lista vacía = siempre). */
export function matchesAll(def: ObjectDef, row: Record<string, unknown>, conditions: Filter[], userId: string) {
  return conditions.every((c) => matchesCondition(def, row, c, userId));
}

export function describeConditions(def: ObjectDef, conditions: Filter[], labels: Record<string, string>) {
  return conditions
    .map((c) => {
      const field = def.fields.find((f) => f.name === c.field);
      const needsValue = !VALUELESS_OPS.includes(c.op);
      const value = field?.type === "checkbox" ? (c.value === "true" ? "Sí" : "No") : c.value;
      return `${field?.label ?? c.field} ${labels[c.op] ?? c.op}${needsValue ? ` “${value}”` : ""}`;
    })
    .join(" y ");
}

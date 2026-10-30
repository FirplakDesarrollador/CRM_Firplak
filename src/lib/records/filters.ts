import { TEAM_OBJECTS, type TeamObject } from "@/lib/teams/config";
import { addDaysISO, todayISO } from "@/lib/format";
import { columnFor, type FieldDef, type Filter, type FilterOp, type ListDefinition, type ObjectDef } from "@/lib/objects";

export const OP_LABELS: Record<FilterOp, string> = {
  eq: "es igual a",
  neq: "no es igual a",
  contains: "contiene",
  starts: "empieza por",
  empty: "está vacío",
  not_empty: "no está vacío",
  gt: "mayor que",
  gte: "mayor o igual que",
  lt: "menor que",
  lte: "menor o igual que",
  today: "es hoy",
  this_week: "esta semana",
  this_month: "este mes",
  this_quarter: "este trimestre",
  this_year: "este año",
  last_n_days: "últimos N días",
  next_n_days: "próximos N días",
  overdue: "vencida",
  me: "soy yo",
};

export const VALUELESS_OPS: FilterOp[] = [
  "empty", "not_empty", "today", "this_week", "this_month", "this_quarter", "this_year", "overdue", "me",
];

export function opsForField(field: FieldDef): FilterOp[] {
  switch (field.type) {
    case "number":
    case "currency":
    case "percent":
      return field.custom ? ["eq", "neq", "empty", "not_empty"] : ["eq", "neq", "gt", "gte", "lt", "lte", "empty", "not_empty"];
    case "date":
    case "datetime":
      return field.custom
        ? ["eq", "empty", "not_empty"]
        : ["today", "this_week", "this_month", "this_quarter", "this_year", "last_n_days", "next_n_days", "overdue", "gt", "lt", "eq", "empty", "not_empty"];
    case "select":
    case "stage":
      return ["eq", "neq", "empty", "not_empty"];
    case "multiselect":
      return ["contains", "empty", "not_empty"];
    case "checkbox":
      return ["eq"];
    case "user":
      return ["me", "eq", "empty", "not_empty"];
    case "lookup":
      return ["eq", "empty", "not_empty"];
    default:
      return ["contains", "eq", "neq", "starts", "empty", "not_empty"];
  }
}

function startOfWeek(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // lunes = 0
  return addDaysISO(iso, -day);
}

export function dateRange(op: FilterOp, value: string): [string, string] | null {
  const today = todayISO();
  const [y, m] = today.split("-").map(Number);
  switch (op) {
    case "today":
      return [today, today];
    case "this_week": {
      const s = startOfWeek(today);
      return [s, addDaysISO(s, 6)];
    }
    case "this_month": {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return [`${y}-${String(m).padStart(2, "0")}-01`, `${y}-${String(m).padStart(2, "0")}-${last}`];
    }
    case "this_quarter": {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      const last = new Date(Date.UTC(y, qStart + 2, 0)).getUTCDate();
      return [`${y}-${String(qStart).padStart(2, "0")}-01`, `${y}-${String(qStart + 2).padStart(2, "0")}-${last}`];
    }
    case "this_year":
      return [`${y}-01-01`, `${y}-12-31`];
    case "last_n_days":
      return [addDaysISO(today, -Math.max(1, Number(value) || 30)), today];
    case "next_n_days":
      return [today, addDaysISO(today, Math.max(1, Number(value) || 30))];
    default:
      return null;
  }
}

// Interfaz mínima del query builder de PostgREST que usamos aquí.
type Q = {
  eq(c: string, v: unknown): Q;
  neq(c: string, v: unknown): Q;
  gt(c: string, v: unknown): Q;
  gte(c: string, v: unknown): Q;
  lt(c: string, v: unknown): Q;
  lte(c: string, v: unknown): Q;
  ilike(c: string, v: string): Q;
  is(c: string, v: null): Q;
  not(c: string, op: string, v: unknown): Q;
  filter(c: string, op: string, v: unknown): Q;
  or(filters: string): Q;
};

const sanitize = (s: string) => s.replace(/[,()"'\\%*]/g, " ").trim();

export function applyFilter<T>(query: T, def: ObjectDef, filter: Filter, userId: string): T {
  const field = def.fields.find((f) => f.name === filter.field);
  if (!field) return query;
  const q = query as unknown as Q;
  const col = columnFor(field.name);
  const isDateTime = field.type === "datetime";
  const v = filter.value;

  switch (filter.op) {
    case "eq":
      if (field.type === "checkbox") return q.eq(col, v === "true") as unknown as T;
      if (isDateTime) return q.gte(col, `${v}T00:00:00-05:00`).lte(col, `${v}T23:59:59-05:00`) as unknown as T;
      return q.eq(col, v) as unknown as T;
    case "neq":
      return q.or(`${col}.neq.${sanitize(v)},${col}.is.null`) as unknown as T;
    case "contains":
      if (field.type === "multiselect") return q.filter(`custom_fields->${field.name.slice(3)}`, "cs", JSON.stringify([v])) as unknown as T;
      return q.ilike(col, `%${sanitize(v)}%`) as unknown as T;
    case "starts":
      return q.ilike(col, `${sanitize(v)}%`) as unknown as T;
    case "empty":
      return (field.custom ? q.or(`${col}.is.null,${col}.eq.`) : q.is(col, null)) as unknown as T;
    case "not_empty":
      return (field.custom ? q.not(col, "is", null).neq(col, "") : q.not(col, "is", null)) as unknown as T;
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      if (v === "") return query;
      return q[filter.op](col, isDateTime ? `${v}T${filter.op.startsWith("g") ? "23:59:59" : "00:00:00"}-05:00` : v) as unknown as T;
    case "me":
      return q.eq(col, userId) as unknown as T;
    case "overdue":
      return q.lt(col, todayISO()) as unknown as T;
    default: {
      const range = dateRange(filter.op, v);
      if (!range) return query;
      if (isDateTime) return q.gte(col, `${range[0]}T00:00:00-05:00`).lte(col, `${range[1]}T23:59:59-05:00`) as unknown as T;
      return q.gte(col, range[0]).lte(col, range[1]) as unknown as T;
    }
  }
}

export function applySearch<T>(query: T, def: ObjectDef, term: string): T {
  const clean = sanitize(term);
  if (!clean) return query;
  const q = query as unknown as Q;
  return q.or(def.searchColumns.map((c) => `${c}.ilike.%${clean}%`).join(",")) as unknown as T;
}

export type ListParams = {
  q: string;
  viewId: string | null;
  filters: Filter[];
  columns: string[];
  sort: { field: string; dir: "asc" | "desc" };
  scope: "mine" | "team" | "all";
  /** Oportunidades donde este usuario tiene parte del valor (reparto de ingresos o propietario). */
  credit: string | null;
  page: number;
  pageSize: number;
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function decodeFilters(raw: string): Filter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((f) => f && typeof f.field === "string" && typeof f.op === "string").map((f) => ({
          field: f.field, op: f.op, value: String(f.value ?? ""),
        }))
      : [];
  } catch {
    return [];
  }
}

/** Combina la vista guardada (si hay) con los parámetros de la URL. */
export function parseListParams(def: ObjectDef & { listCustom?: string[] }, sp: SP, view: ListDefinition | null, pageSize: number): ListParams {
  const fieldNames = new Set(def.fields.map((f) => f.name));
  const urlFilters = decodeFilters(one(sp.f));
  const hasUrlFilters = one(sp.f) !== "";
  const filters = (hasUrlFilters ? urlFilters : view?.filters ?? []).filter((f) => fieldNames.has(f.field));

  const urlCols = one(sp.cols).split(",").filter((c) => fieldNames.has(c));
  const columns = urlCols.length
    ? urlCols
    : view?.columns?.filter((c) => fieldNames.has(c)) ?? [...def.defaultColumns, ...(def.listCustom ?? [])];

  const sortField = one(sp.sort) || view?.sort?.field || def.defaultSort.field;
  const dir = (one(sp.dir) || view?.sort?.dir || def.defaultSort.dir) === "desc" ? "desc" : "asc";
  const rawScope = one(sp.scope) || view?.scope || "all";
  // «Equipo»: registros donde el usuario está en el equipo (solo cuentas y oportunidades).
  const scope = rawScope === "mine" ? "mine" : rawScope === "team" && TEAM_OBJECTS.includes(def.key as TeamObject) ? "team" : "all";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  return {
    q: one(sp.q),
    viewId: one(sp.view) || null,
    filters,
    columns,
    sort: { field: sortField, dir },
    scope,
    credit: def.key === "opportunities" && /^[0-9a-f-]{36}$/i.test(one(sp.credito)) ? one(sp.credito) : null,
    page,
    pageSize,
  };
}

import "server-only";
import { fieldValue, type FieldDef, type ObjectDef } from "@/lib/objects";
import { listRecords, type Row } from "@/lib/records/data";
import type { ListParams } from "@/lib/records/filters";
import { formatMonth } from "@/lib/format";
import type { DateGrouping, ReportDefinition } from "./types";

export type GroupKey = { key: string; label: string; order: number | string };
export type ReportGroup = GroupKey & { value: number; count: number; cells: Record<string, { value: number; count: number }> };
export type ReportResult = {
  groups: ReportGroup[];
  columns: GroupKey[];
  total: number;
  count: number;
  rows: Row[];
  truncated: boolean;
  error: string | null;
  measureLabel: string;
  isMoney: boolean;
};

const EMPTY: GroupKey = { key: "∅", label: "(Sin valor)", order: "~" };
const MAX_ROWS = 5000;

function groupKey(field: FieldDef, row: Row, dateGrouping: DateGrouping): GroupKey {
  const rel = field.relation ? (row[field.relation] as { id?: string; name?: string; full_name?: string; sort_order?: number } | null) : null;
  switch (field.type) {
    case "user":
    case "lookup":
    case "stage":
      if (!rel?.id) return EMPTY;
      return { key: rel.id, label: rel.name ?? rel.full_name ?? "—", order: field.type === "stage" ? rel.sort_order ?? 0 : rel.name ?? rel.full_name ?? "" };
    case "checkbox": {
      const v = fieldValue(row, field.name) === true;
      return { key: String(v), label: v ? "Sí" : "No", order: v ? 0 : 1 };
    }
    case "date":
    case "datetime": {
      const raw = fieldValue(row, field.name);
      if (!raw) return EMPTY;
      const iso = field.type === "datetime" ? new Date(Date.parse(String(raw)) - 5 * 3600000).toISOString() : String(raw);
      const y = iso.slice(0, 4);
      const m = Number(iso.slice(5, 7));
      if (dateGrouping === "year") return { key: y, label: y, order: y };
      if (dateGrouping === "quarter") {
        const q = Math.ceil(m / 3);
        return { key: `${y}-T${q}`, label: `T${q} ${y}`, order: `${y}-${q}` };
      }
      const key = iso.slice(0, 7);
      return { key, label: formatMonth(key), order: key };
    }
    default: {
      const v = fieldValue(row, field.name);
      if (v === null || v === undefined || v === "") return EMPTY;
      const label = field.optionLabels?.[String(v)] ?? String(v);
      const optIndex = field.options?.indexOf(String(v)) ?? -1;
      return { key: String(v), label, order: optIndex >= 0 ? optIndex : label };
    }
  }
}

const compare = (a: number | string, b: number | string) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es");

export async function runReport(def: ObjectDef, report: ReportDefinition, userId: string): Promise<ReportResult> {
  const params: ListParams = {
    q: "",
    viewId: null,
    filters: (report.filters ?? []).filter((f) => def.fields.some((x) => x.name === f.field)),
    columns: def.defaultColumns,
    sort: def.defaultSort,
    scope: report.scope === "mine" ? "mine" : "all",
    credit: null,
    page: 1,
    pageSize: MAX_ROWS,
  };
  const { rows, count, error } = await listRecords(def, params, userId, { all: true });

  const g1 = def.fields.find((f) => f.name === report.groupBy);
  const g2 = def.fields.find((f) => f.name === report.groupBy2 && f.name !== report.groupBy);
  const fn = report.aggregate?.fn ?? "count";
  const measureField = fn === "count" ? undefined : def.fields.find((f) => f.name === report.aggregate?.field);
  const dateGrouping = report.dateGrouping ?? "month";
  const measure = (row: Row) => (measureField ? Number(fieldValue(row, measureField.name) ?? 0) || 0 : 1);

  const groups = new Map<string, ReportGroup & { sum: number }>();
  const columns = new Map<string, GroupKey>();
  let totalSum = 0;

  for (const row of rows) {
    const k1 = g1 ? groupKey(g1, row, dateGrouping) : { key: "total", label: "Total", order: 0 };
    const value = measure(row);
    totalSum += value;
    const group = groups.get(k1.key) ?? { ...k1, value: 0, count: 0, sum: 0, cells: {} };
    group.sum += value;
    group.count += 1;
    if (g2) {
      const k2 = groupKey(g2, row, dateGrouping);
      columns.set(k2.key, k2);
      const cell = group.cells[k2.key] ?? { value: 0, count: 0 };
      cell.value += value;
      cell.count += 1;
      group.cells[k2.key] = cell;
    }
    groups.set(k1.key, group);
  }

  const finalize = (sum: number, n: number) => (fn === "avg" ? (n ? sum / n : 0) : fn === "sum" ? sum : n);
  const list: ReportGroup[] = [...groups.values()].map((g) => ({
    key: g.key, label: g.label, order: g.order, count: g.count, value: finalize(g.sum, g.count),
    cells: Object.fromEntries(Object.entries(g.cells).map(([k, c]) => [k, { count: c.count, value: finalize(c.value, c.count) }])),
  }));
  // Fechas y etapas en su orden natural; el resto, de mayor a menor.
  const natural = g1 && ["date", "datetime", "stage", "checkbox"].includes(g1.type);
  list.sort((a, b) => (a.key === "∅" ? 1 : b.key === "∅" ? -1 : natural ? compare(a.order, b.order) : b.value - a.value));
  const cols = [...columns.values()].sort((a, b) => (a.key === "∅" ? 1 : b.key === "∅" ? -1 : compare(a.order, b.order)));

  const measureLabel = fn === "count" ? "Registros" : `${fn === "sum" ? "Suma" : "Promedio"} de ${measureField?.label.toLowerCase() ?? "valor"}`;
  return {
    groups: list,
    columns: cols,
    total: finalize(totalSum, rows.length),
    count: rows.length,
    rows,
    truncated: count > rows.length,
    error,
    measureLabel,
    isMoney: measureField?.type === "currency",
  };
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getObjectDef, untypedClient } from "@/lib/records/data";
import { getLocale, getValueLabel } from "@/lib/i18n/server";
import { OBJECTS, isObjectKey, type FieldDef, type ObjectKey } from "@/lib/objects";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from "@/lib/format";

import { Tr } from "@/components/ui/Tr";
import { Fmt } from "@/components/ui/Fmt";
type HistoryRow = {
  id: number; object: string; record_id: string; field: string; old_value: string | null; new_value: string | null;
  operation: "insert" | "update" | "delete"; changed_at: string; by: { full_name: string } | null;
};

function display(field: FieldDef | undefined, raw: string | null, names: Map<string, string>, locale: "es" | "en") {
  if (raw === null || raw === "") return <span className="text-muted">—</span>;
  if (!field) return raw;
  if (["user", "lookup", "stage"].includes(field.type) || field.name === "pipeline_id") return names.get(raw) ?? "(registro eliminado o sin acceso)";
  switch (field.type) {
    case "currency": return formatCurrency(Number(raw));
    case "number": return formatNumber(Number(raw));
    case "percent": return formatPercent(Number(raw));
    case "date": return formatDate(raw, locale);
    case "datetime": return formatDateTime(raw, locale);
    case "checkbox": return raw === "true" ? (locale === "en" ? "Yes" : "Sí") : "No";
    case "multiselect": {
      try { return (JSON.parse(raw) as string[]).map((o) => field.optionLabels?.[o] ?? o).join(", "); } catch { return raw; }
    }
    case "select": return field.optionLabels?.[raw] ?? raw;
    default: return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
  }
}

/** Historial de cambios por campo (de un registro o global para auditoría). */
export async function FieldHistory({ object, recordId, limit = 150, global = false, userId }: {
  object?: ObjectKey; recordId?: string; limit?: number; global?: boolean; userId?: string;
}) {
  const supabase = await createClient();
  const [locale, value] = await Promise.all([getLocale(), getValueLabel()]);
  let query = supabase
    .from("field_history")
    .select("id, object, record_id, field, old_value, new_value, operation, changed_at, by:profiles!field_history_changed_by_fkey(full_name)")
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (object) query = query.eq("object", object);
  if (recordId) query = query.eq("record_id", recordId);
  if (userId) query = query.eq("changed_by", userId);
  const { data } = await query;
  const rows = (data ?? []) as unknown as HistoryRow[];

  const objects = [...new Set(rows.map((r) => r.object))].filter(isObjectKey);
  const defs = new Map(await Promise.all(objects.map(async (o) => [o, await getObjectDef(o)] as const)));
  const fieldOf = (r: HistoryRow) => defs.get(r.object as ObjectKey)?.fields.find((f) => f.name === r.field);

  // Resolver nombres de usuarios, etapas y registros relacionados en lote.
  const wanted = new Map<string, Set<string>>();
  const want = (table: string, id: string | null) => {
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    wanted.set(table, (wanted.get(table) ?? new Set()).add(id));
  };
  for (const r of rows) {
    const f = fieldOf(r);
    if (!f) continue;
    const table = f.type === "user" ? "profiles" : f.type === "stage" ? "pipeline_stages" : f.name === "pipeline_id" ? "pipelines"
      : f.type === "lookup" && f.lookup ? OBJECTS[f.lookup].table : null;
    if (table) { want(table, r.old_value); want(table, r.new_value); }
  }
  const nameCol: Record<string, string> = { profiles: "full_name", pipeline_stages: "name", pipelines: "name", contacts: "full_name", leads: "full_name", cases: "subject", activities: "subject" };
  const names = new Map<string, string>();
  const db = await untypedClient();
  await Promise.all([...wanted.entries()].map(async ([table, ids]) => {
    const col = nameCol[table] ?? "name";
    const { data: found } = await db.from(table).select(`id, ${col}`).in("id", [...ids]);
    // Pipelines y etapas se muestran con su nombre en inglés si lo tienen.
    const translate = table === "pipelines" || table === "pipeline_stages";
    for (const row of (found ?? []) as unknown as Record<string, string>[]) names.set(row.id, translate ? value(row[col]) : row[col]);
  }));

  if (!rows.length) return <section className="card px-4 py-8 text-center text-sm text-muted"><Tr>Sin cambios registrados.</Tr></section>;

  return (
    <section className="card overflow-hidden">
      <div className="card-header"><h2 className="card-title"><Tr>Historial de cambios</Tr> <span className="badge">{rows.length}</span></h2></div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th><Tr>Fecha</Tr></th>
              {global && <th><Tr>Registro</Tr></th>}
              <th><Tr>Campo</Tr></th><th><Tr>Antes</Tr></th><th><Tr>Después</Tr></th><th><Tr>Usuario</Tr></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const f = fieldOf(r);
              const objectDef = isObjectKey(r.object) ? OBJECTS[r.object] : null;
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap"><Fmt datetime={r.changed_at} /></td>
                  {global && (
                    <td>
                      {objectDef && r.operation !== "delete"
                        ? <Link className="link" href={`${objectDef.path}/${r.record_id}`}>{objectDef.label}</Link>
                        : <span>{objectDef?.label ?? r.object}</span>}
                    </td>
                  )}
                  {r.operation === "insert" ? (
                    <td colSpan={3}><span className="badge badge-success"><Tr>Registro creado</Tr></span></td>
                  ) : r.operation === "delete" ? (
                    <td colSpan={3}><span className="badge badge-danger"><Tr>Registro eliminado</Tr></span> {r.old_value}</td>
                  ) : (
                    <>
                      <td className="font-medium">{f?.label ?? r.field}</td>
                      <td className="max-w-64 text-ink-2">{display(f, r.old_value, names, locale)}</td>
                      <td className="max-w-64">{display(f, r.new_value, names, locale)}</td>
                    </>
                  )}
                  <td className="whitespace-nowrap">{r.by?.full_name ?? "Sistema"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

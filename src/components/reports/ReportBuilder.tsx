"use client";

import { useActionState, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Columns3, Play, Plus, Save, Table2 } from "lucide-react";
import type { FieldDef, Filter, ObjectKey } from "@/lib/objects";
import { opsForField } from "@/lib/records/filters";
import type { PipelineWithStages, UserOption } from "@/lib/records/data";
import { FilterRow } from "@/components/records/ListToolbar";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { saveReport } from "@/lib/reports/actions";
import { groupableFields, numericFields, type ReportDefinition } from "@/lib/reports/types";

import { Tr } from "@/components/ui/Tr";
type Meta = { name: string; folder: string; description: string; isShared: boolean };

export function ReportBuilder({
  object, fields, initial, users, pipelines, reportId, meta, canShare, canSaveExisting,
}: {
  object: ObjectKey;
  fields: FieldDef[];
  initial: ReportDefinition;
  users: UserOption[];
  pipelines: PipelineWithStages[];
  reportId: string | null;
  meta: Meta;
  canShare: boolean;
  canSaveExisting: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [def, setDef] = useState<ReportDefinition>({ chart: "bar", aggregate: { fn: "count" }, ...initial });
  const [saving, setSaving] = useState(false);
  const [state, action] = useActionState(saveReport.bind(null, reportId), {});
  const groupable = groupableFields(fields);
  const numeric = numericFields(fields);
  const filterable = fields.filter((f) => f.type !== "textarea");
  const set = (patch: Partial<ReportDefinition>) => setDef((d) => ({ ...d, ...patch }));
  const isDate = (name?: string) => ["date", "datetime"].includes(fields.find((f) => f.name === name)?.type ?? "");
  const filters = def.filters ?? [];

  const run = () => {
    const qs = new URLSearchParams({ def: JSON.stringify(def) });
    if (!reportId) qs.set("objeto", object);
    router.push(`${pathname}?${qs}`);
  };

  return (
    <section className="glass space-y-4 p-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="eyebrow"><Tr>Filtros</Tr></p>
          {filters.length === 0 && <p className="text-sm text-muted"><Tr>Sin filtros: incluye todos los registros visibles.</Tr></p>}
          {filters.map((f, i) => (
            <FilterRow key={i} filter={f} fields={filterable} ctx={{ users, pipelines }}
              onChange={(nf: Filter) => set({ filters: filters.map((x, j) => (j === i ? nf : x)) })}
              onRemove={() => set({ filters: filters.filter((_, j) => j !== i) })} />
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-sm" onClick={() => {
              const f = filterable[0];
              set({ filters: [...filters, { field: f.name, op: opsForField(f)[0], value: "" }] });
            }}><Plus size={14} /> <Tr>Agregar filtro</Tr></button>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={def.scope === "mine"} onChange={(e) => set({ scope: e.target.checked ? "mine" : "all" })} className="accent-[var(--brand)]" />
              Solo mis registros
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rb-g1"><Tr>Agrupar filas por</Tr></label>
            <select id="rb-g1" className="select" value={def.groupBy ?? ""} onChange={(e) => set({ groupBy: e.target.value || undefined })}>
              <option value="">— Sin agrupar —</option>
              {groupable.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rb-g2"><Tr>Agrupar columnas por</Tr></label>
            <select id="rb-g2" className="select" value={def.groupBy2 ?? ""} onChange={(e) => set({ groupBy2: e.target.value || undefined })} disabled={!def.groupBy}>
              <option value="">— Ninguna —</option>
              {groupable.filter((f) => f.name !== def.groupBy).map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
            </select>
          </div>
          {(isDate(def.groupBy) || isDate(def.groupBy2)) && (
            <div>
              <label className="label" htmlFor="rb-date"><Tr>Agrupar fechas por</Tr></label>
              <select id="rb-date" className="select" value={def.dateGrouping ?? "month"} onChange={(e) => set({ dateGrouping: e.target.value as ReportDefinition["dateGrouping"] })}>
                <option value="month">Mes</option>
                <option value="quarter">Trimestre</option>
                <option value="year">Año</option>
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="rb-fn"><Tr>Medida</Tr></label>
            <div className="flex gap-2">
              <select id="rb-fn" className="select w-32" value={def.aggregate?.fn ?? "count"}
                onChange={(e) => {
                  const fn = e.target.value as "count" | "sum" | "avg";
                  set({ aggregate: { fn, field: fn === "count" ? undefined : def.aggregate?.field ?? numeric[0]?.name } });
                }}>
                <option value="count">Contar</option>
                {numeric.length > 0 && <option value="sum">Sumar</option>}
                {numeric.length > 0 && <option value="avg">Promedio</option>}
              </select>
              {def.aggregate?.fn && def.aggregate.fn !== "count" && (
                <select aria-label="Campo de la medida" className="select" value={def.aggregate.field ?? ""}
                  onChange={(e) => set({ aggregate: { fn: def.aggregate!.fn, field: e.target.value } })}>
                  {numeric.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="sm:col-span-2">
            <span className="label"><Tr>Visualización</Tr></span>
            <div className="inline-flex rounded-[10px] border border-line-strong p-0.5">
              {([["bar", "Barras", BarChart3], ["column", "Columnas", Columns3], ["table", "Solo tabla", Table2]] as const).map(([k, label, Icon]) => (
                <button key={k} type="button" onClick={() => set({ chart: k })} aria-pressed={def.chart === k}
                  className={`btn btn-sm border-0 ${def.chart === k ? "bg-brand text-[var(--brand-contrast)] hover:bg-brand" : "btn-ghost"}`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <button type="button" className="btn" onClick={() => setSaving((v) => !v)}><Save size={15} /> <Tr>Guardar…</Tr></button>
        <button type="button" className="btn btn-primary" onClick={run}><Play size={15} /> <Tr>Ejecutar informe</Tr></button>
      </div>

      {saving && (
        <form action={action} className="grid gap-3 rounded-[16px] border border-line bg-surface p-4 sm:grid-cols-2">
          <input type="hidden" name="object" value={object} />
          <input type="hidden" name="definition" value={JSON.stringify(def)} />
          <div>
            <label className="label" htmlFor="rs-name"><Tr>Nombre</Tr></label>
            <input id="rs-name" name="name" className="input" defaultValue={meta.name} />
            {state.errors?.name && <p className="error-text">{state.errors.name}</p>}
          </div>
          <div>
            <label className="label" htmlFor="rs-folder"><Tr>Carpeta</Tr></label>
            <input id="rs-folder" name="folder" className="input" defaultValue={meta.folder} list="report-folders" />
            <datalist id="report-folders">
              {["Mis informes", "Ventas", "Mercadeo", "Servicio", "Actividad comercial"].map((f) => <option key={f} value={f} />)}
            </datalist>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="rs-desc"><Tr>Descripción</Tr></label>
            <input id="rs-desc" name="description" className="input" defaultValue={meta.description} />
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            {canShare && (
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="is_shared" defaultChecked={meta.isShared} className="accent-[var(--brand)]" /> <Tr>Compartir con todos</Tr></label>
            )}
            {reportId && canSaveExisting && (
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="save_as" value="new" className="accent-[var(--brand)]" /> <Tr>Guardar como informe nuevo</Tr></label>
            )}
            {reportId && !canSaveExisting && <input type="hidden" name="save_as" value="new" />}
            <SubmitButton className="btn btn-primary ml-auto" pendingText="Guardando…"><Tr>Guardar informe</Tr></SubmitButton>
          </div>
          {state.message && <p className="error-text sm:col-span-2">{state.message}</p>}
        </form>
      )}
    </section>
  );
}

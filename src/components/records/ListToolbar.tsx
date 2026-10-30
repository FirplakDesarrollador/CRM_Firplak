"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Columns3, Download, Filter as FilterIcon, ListFilter, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { FieldDef, Filter, FilterOp, ListDefinition } from "@/lib/objects";
import { OP_LABELS, VALUELESS_OPS, opsForField } from "@/lib/records/filters";
import { deleteListView, saveListView } from "@/lib/records/actions";
import { Dropdown, menuItemClass } from "@/components/ui/Dropdown";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { UserOption, PipelineWithStages } from "@/lib/records/data";
import type { FormState } from "@/lib/records/form";
import { useLocale, useT } from "@/lib/i18n/client";
import { opLabels } from "@/lib/i18n";

import { Tr } from "@/components/ui/Tr";
type View = { id: string; name: string; owner_id: string | null; is_shared: boolean; definition: ListDefinition };

type Props = {
  object: string;
  fields: FieldDef[];
  views: View[];
  currentViewId: string | null;
  userId: string;
  canShare: boolean;
  canExport: boolean;
  q: string;
  scope: "mine" | "team" | "all";
  /** Muestra el alcance «Equipo» (cuentas y oportunidades). */
  teamScope?: boolean;
  filters: Filter[];
  columns: string[];
  sort: { field: string; dir: "asc" | "desc" };
  users: UserOption[];
  pipelines: PipelineWithStages[];
  defaultViewName: string;
  hasOwner?: boolean;
  exportHref: string;
};

export function ListToolbar(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const OPS = opLabels(useLocale(), OP_LABELS);
  const [panel, setPanel] = useState<"filters" | "columns" | "save" | null>(null);
  const [draft, setDraft] = useState<Filter[]>(props.filters);
  const [cols, setCols] = useState<string[]>(props.columns);
  const [search, setSearch] = useState(props.q);
  const currentView = props.views.find((v) => v.id === props.currentViewId) ?? null;

  const push = (patch: Record<string, string | null>) => {
    const qs = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") qs.delete(k);
      else qs.set(k, v);
    }
    qs.delete("page");
    router.push(`${pathname}?${qs}`);
  };

  const filterable = useMemo(() => props.fields.filter((f) => f.type !== "textarea"), [props.fields]);
  const definition: ListDefinition = { filters: props.filters, columns: props.columns, sort: props.sort, scope: props.scope };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          label="Vistas de lista"
          align="left"
          className="btn"
          trigger={<><ListFilter size={15} /> <span className="max-w-48 truncate">{currentView?.name ?? props.defaultViewName}</span> <ChevronDown size={14} /></>}
        >
          <Link href={pathname} className={menuItemClass}>
            {!props.currentViewId ? <Check size={14} /> : <span className="w-3.5" />} {props.defaultViewName}
          </Link>
          {props.views.length > 0 && <hr className="my-1 border-line" />}
          {props.views.map((v) => (
            <Link key={v.id} href={`${pathname}?view=${v.id}`} className={menuItemClass}>
              {v.id === props.currentViewId ? <Check size={14} /> : <span className="w-3.5" />}
              <span className="flex-1 truncate">{v.name}</span>
              {v.is_shared && <span className="badge">{t("Compartida")}</span>}
            </Link>
          ))}
        </Dropdown>

        <form
          className="relative min-w-48 flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            push({ q: search.trim() || null });
          }}
        >
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8" placeholder={t("Buscar en esta lista…")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>

        {props.hasOwner !== false && <div className="inline-flex rounded-lg border border-line-strong p-0.5" role="group" aria-label="Alcance">
          {(props.teamScope ? (["all", "mine", "team"] as const) : (["all", "mine"] as const)).map((s) => (
            <button key={s} type="button" onClick={() => push({ scope: s === "all" ? null : s })}
              title={s === "team" ? t("Registros en los que estás en el equipo") : undefined}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${props.scope === s ? "bg-brand text-[var(--brand-contrast)]" : "text-muted hover:text-ink"}`}>
              {s === "all" ? t("Todos") : s === "mine" ? t("Míos") : t("Mi equipo")}
            </button>
          ))}
        </div>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="btn" aria-expanded={panel === "filters"} onClick={() => setPanel(panel === "filters" ? null : "filters")}>
            <FilterIcon size={15} /> {t("Filtros")}{props.filters.length ? ` (${props.filters.length})` : ""}
          </button>
          <button type="button" className="btn btn-icon sm:w-auto sm:px-3" aria-label="Columnas" onClick={() => setPanel(panel === "columns" ? null : "columns")}>
            <Columns3 size={15} /> <span className="hidden sm:inline">{t("Columnas")}</span>
          </button>
          <button type="button" className="btn btn-icon sm:w-auto sm:px-3" aria-label="Guardar vista" onClick={() => setPanel(panel === "save" ? null : "save")}>
            <Save size={15} /> <span className="hidden sm:inline">{t("Guardar vista")}</span>
          </button>
          {props.canExport && (
            <a className="btn btn-icon" href={props.exportHref} aria-label="Exportar CSV" title="Exportar CSV"><Download size={15} /></a>
          )}
        </div>
      </div>

      {props.filters.length > 0 && panel !== "filters" && (
        <div className="flex flex-wrap items-center gap-1.5">
          {props.filters.map((f, i) => {
            const field = props.fields.find((x) => x.name === f.field);
            return (
              <span key={i} className="badge badge-brand py-1">
                {field?.label} {OPS[f.op]} {VALUELESS_OPS.includes(f.op) ? "" : `“${t(displayValue(field, f.value, props))}”`}
                <button type="button" aria-label="Quitar filtro" onClick={() => push({ f: JSON.stringify(props.filters.filter((_, j) => j !== i)) || null })}>
                  <X size={12} />
                </button>
              </span>
            );
          })}
          <button type="button" className="text-xs font-semibold text-muted hover:text-danger" onClick={() => push({ f: "[]" })}>{t("Quitar todos")}</button>
        </div>
      )}

      {panel === "filters" && (
        <div className="card p-4">
          <div className="space-y-2">
            {draft.length === 0 && <p className="text-sm text-muted">{t("Sin filtros. Agrega uno para acotar la lista.")}</p>}
            {draft.map((f, i) => (
              <FilterRow key={i} filter={f} fields={filterable} ctx={props}
                onChange={(nf) => setDraft(draft.map((d, j) => (j === i ? nf : d)))}
                onRemove={() => setDraft(draft.filter((_, j) => j !== i))} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <button type="button" className="btn btn-sm" onClick={() => {
              const first = filterable[0];
              setDraft([...draft, { field: first.name, op: opsForField(first)[0], value: "" }]);
            }}>
              <Plus size={14} /> {t("Agregar filtro")}
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => { setDraft(props.filters); setPanel(null); }}>{t("Cancelar")}</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { push({ f: JSON.stringify(draft) }); setPanel(null); }}>
                {t("Aplicar filtros")}
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === "columns" && (
        <div className="card p-4">
          <p className="mb-2 text-sm font-semibold">{t("Columnas visibles (la primera enlaza al registro)")}</p>
          <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {props.fields.filter((f) => f.type !== "textarea").map((f) => (
              <label key={f.name} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-[var(--brand)]" checked={cols.includes(f.name)}
                  onChange={(e) => setCols(e.target.checked ? [...cols, f.name] : cols.filter((c) => c !== f.name))} />
                {f.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setPanel(null)}>{t("Cancelar")}</button>
            <button type="button" className="btn btn-sm btn-primary" disabled={!cols.length}
              onClick={() => { push({ cols: cols.join(",") }); setPanel(null); }}>{t("Aplicar")}</button>
          </div>
        </div>
      )}

      {panel === "save" && (
        <SaveViewPanel object={props.object} definition={definition} view={currentView} userId={props.userId}
          canShare={props.canShare} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}

function displayValue(field: FieldDef | undefined, value: string, ctx: Pick<Props, "users" | "pipelines">) {
  if (!field) return value;
  if (field.type === "user") return ctx.users.find((u) => u.id === value)?.full_name ?? value;
  if (field.type === "stage") return ctx.pipelines.flatMap((p) => p.stages).find((s) => s.id === value)?.name ?? value;
  if (field.type === "checkbox") return value === "true" ? "Sí" : "No";
  return field.optionLabels?.[value] ?? value;
}

export function FilterRow({ filter, fields, ctx, onChange, onRemove }: {
  filter: Filter; fields: FieldDef[]; ctx: { users: UserOption[]; pipelines: PipelineWithStages[] };
  onChange: (f: Filter) => void; onRemove: () => void;
}) {
  const field = fields.find((f) => f.name === filter.field) ?? fields[0];
  const ops = opsForField(field);
  const t = useT();
  const OPS = opLabels(useLocale(), OP_LABELS);
  const needsValue = !VALUELESS_OPS.includes(filter.op);

  let valueInput: React.ReactNode = null;
  if (needsValue) {
    const set = (value: string) => onChange({ ...filter, value });
    if (field.type === "select" || field.type === "multiselect") {
      valueInput = (
        <select className="select" value={filter.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t("Selecciona…")}</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{field.optionLabels?.[o] ?? o}</option>)}
        </select>
      );
    } else if (field.type === "checkbox") {
      valueInput = (
        <select className="select" value={filter.value || "true"} onChange={(e) => set(e.target.value)}>
          <option value="true">{t("Sí")}</option>
          <option value="false">{t("No")}</option>
        </select>
      );
    } else if (field.type === "user") {
      valueInput = (
        <select className="select" value={filter.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t("Selecciona…")}</option>
          {ctx.users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      );
    } else if (field.type === "stage") {
      valueInput = (
        <select className="select" value={filter.value} onChange={(e) => set(e.target.value)}>
          <option value="">{t("Selecciona…")}</option>
          {ctx.pipelines.map((p) => (
            <optgroup key={p.id} label={t(p.name)}>
              {p.stages.map((s) => <option key={s.id} value={s.id}>{t(s.name)}</option>)}
            </optgroup>
          ))}
        </select>
      );
    } else if ((field.type === "date" || field.type === "datetime") && !["last_n_days", "next_n_days"].includes(filter.op)) {
      valueInput = <input type="date" className="input" value={filter.value} onChange={(e) => set(e.target.value)} />;
    } else if (["last_n_days", "next_n_days"].includes(filter.op)) {
      valueInput = <input type="number" min={1} className="input" placeholder={t("Días")} value={filter.value} onChange={(e) => set(e.target.value)} />;
    } else {
      valueInput = <input className="input" value={filter.value} onChange={(e) => set(e.target.value)} placeholder={t("Valor")} />;
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <select className="select" value={field.name} aria-label="Campo"
        onChange={(e) => {
          const nf = fields.find((f) => f.name === e.target.value)!;
          onChange({ field: nf.name, op: opsForField(nf)[0], value: "" });
        }}>
        {fields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
      </select>
      <select className="select" value={filter.op} aria-label="Operador" onChange={(e) => onChange({ ...filter, op: e.target.value as FilterOp })}>
        {ops.map((op) => <option key={op} value={op}>{OPS[op]}</option>)}
      </select>
      <div>{valueInput}</div>
      <button type="button" className="btn btn-ghost btn-icon text-danger" aria-label="Quitar filtro" onClick={onRemove}><Trash2 size={15} /></button>
    </div>
  );
}

function SaveViewPanel({ object, definition, view, userId, canShare, onClose }: {
  object: string; definition: ListDefinition; view: View | null; userId: string; canShare: boolean; onClose: () => void;
}) {
  const ownsView = view && (view.owner_id === userId || (view.is_shared && canShare));
  const [mode, setMode] = useState<"new" | "update">(ownsView ? "update" : "new");
  const [state, action] = useActionState(saveListView.bind(null, object), {});
  const [delState, delAction] = useActionState(
    async (): Promise<FormState> => (view ? deleteListView(object, view.id) : {}),
    {} as FormState,
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const t = useT();

  return (
    <form action={action} className="card space-y-3 p-4">
      <input type="hidden" name="definition" value={JSON.stringify(definition)} />
      {mode === "update" && view && <input type="hidden" name="id" value={view.id} />}
      {ownsView && (
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "update"} onChange={() => setMode("update")} /> Actualizar “{view!.name}”</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "new"} onChange={() => { setMode("new"); nameRef.current?.focus(); }} /> <Tr>Guardar como nueva</Tr></label>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="view-name">{t("Nombre de la vista")}</label>
          <input ref={nameRef} id="view-name" name="name" className="input" key={mode}
            defaultValue={mode === "update" ? view?.name : ""} placeholder="Ej. Constructoras de Antioquia" />
          {state.errors?.name && <p className="error-text">{state.errors.name}</p>}
        </div>
        {canShare && (
          <label className="flex items-center gap-2 pb-2 text-sm font-medium">
            <input type="checkbox" name="is_shared" defaultChecked={mode === "update" && view?.is_shared} className="accent-[var(--brand)]" />
            Compartir con todos
          </label>
        )}
      </div>
      {(state.message || delState.message) && <p className="error-text">{state.message ?? delState.message}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        {ownsView ? (
          <button type="submit" formAction={delAction} className="btn btn-sm btn-danger"
            onClick={(e) => { if (!confirm(`¿Eliminar la vista “${view!.name}”?`)) e.preventDefault(); }}>
            <Trash2 size={14} /> {t("Eliminar vista")}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm" onClick={onClose}>{t("Cancelar")}</button>
          <SubmitButton className="btn btn-sm btn-primary" pendingText={t("Guardando…")}>{t("Guardar")}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

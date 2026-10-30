import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConditionsEditor } from "@/components/rules/ConditionsEditor";
import { ActionsEditor } from "@/components/rules/ActionsEditor";
import { ObjectTabs } from "@/components/rules/ObjectTabs";
import { createClient } from "@/lib/supabase/server";
import { getObjectDef, getPipelines, getUsers } from "@/lib/records/data";
import { type Filter, type ObjectKey } from "@/lib/objects";
import { OP_LABELS } from "@/lib/records/filters";
import { describeConditions } from "@/lib/rules/evaluate";
import type { AutomationAction } from "@/lib/rules/automation-types";
import { canSystem } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { deleteAutomationRule, saveAutomationRule } from "../actions";

export const metadata: Metadata = { title: "Automatizaciones" };

const OBJECTS_WITH_AUTOMATION: ObjectKey[] = ["leads", "accounts", "contacts", "opportunities", "quotes", "cases", "campaigns"];
const TRIGGERS = { create: "Al crear", update: "Al actualizar", create_or_update: "Al crear o actualizar" };
const ACTION_LABELS: Record<string, string> = { create_task: "crear tarea", notify: "notificar", assign_owner: "asignar propietario", set_field: "actualizar campo" };

type Rule = {
  id: string; name: string; description: string | null; trigger_on: keyof typeof TRIGGERS; watch_field: string | null;
  conditions: Filter[]; actions: AutomationAction[]; sort_order: number; is_active: boolean; run_count: number; last_run_at: string | null;
};

export default async function AutomationsPage({ searchParams }: PageProps<"/configuracion/automatizaciones">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const object = (OBJECTS_WITH_AUTOMATION.includes(sp.objeto as ObjectKey) ? sp.objeto : "leads") as ObjectKey;
  const supabase = await createClient();
  const [def, users, pipelines, { data }] = await Promise.all([
    getObjectDef(object), getUsers(), getPipelines(),
    supabase.from("automation_rules").select("*").eq("object", object).order("sort_order"),
  ]);
  const rules = (data ?? []) as unknown as Rule[];
  const watchable = def.fields.filter((f) => !["datetime"].includes(f.type) && f.type !== "textarea");

  const fields = (r?: Rule) => {
    const k = r?.id ?? "new";
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
          <div><label className="label" htmlFor={`an-${k}`}>Nombre</label><input id={`an-${k}`} name="name" className="input" defaultValue={r?.name} /></div>
          <div><label className="label" htmlFor={`ad-${k}`}>Descripción</label><input id={`ad-${k}`} name="description" className="input" defaultValue={r?.description ?? ""} /></div>
          <div><label className="label" htmlFor={`ao-${k}`}>Orden</label><input id={`ao-${k}`} name="sort_order" type="number" className="input" defaultValue={r?.sort_order ?? rules.length + 1} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`at-${k}`}>Cuándo se ejecuta</label>
            <select id={`at-${k}`} name="trigger_on" className="select" defaultValue={r?.trigger_on ?? "create"}>
              {Object.entries(TRIGGERS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`aw-${k}`}>Al actualizar, solo si cambia</label>
            <select id={`aw-${k}`} name="watch_field" className="select" defaultValue={r?.watch_field ?? ""}>
              <option value="">Cualquier cambio</option>
              {watchable.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <span className="label">Condiciones (todas deben cumplirse)</span>
          <ConditionsEditor name="conditions" fields={def.fields} users={users} pipelines={pipelines} initial={r?.conditions ?? []} />
        </div>
        <div>
          <span className="label">Acciones</span>
          <ActionsEditor name="actions" fields={def.fields} users={users} initial={r?.actions ?? []} hasOwner={def.hasOwner !== false} />
        </div>
      </>
    );
  };

  return (
    <>
      <div>
        <h1 className="text-xl font-medium">Automatizaciones</h1>
        <p className="text-sm text-muted">Asignación de registros, tareas de seguimiento, notificaciones y actualización de campos cuando un registro cumple condiciones.</p>
      </div>
      <ObjectTabs base="/configuracion/automatizaciones" active={object} objects={OBJECTS_WITH_AUTOMATION} />
      <section className="glass p-5">
        <h2 className="card-title">Nueva automatización para {def.plural.toLowerCase()}</h2>
        <ActionForm key={object} action={saveAutomationRule.bind(null, object, null)} className="mt-3 space-y-4">
          {fields()}
          <div className="flex justify-end"><SubmitButton pendingText="Creando…">Crear automatización</SubmitButton></div>
        </ActionForm>
      </section>
      {rules.map((r) => (
        <details key={r.id} className="card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-3">
            <span>
              <span className="font-medium">{r.name}</span>
              <span className="block text-xs text-muted">
                {TRIGGERS[r.trigger_on]}{r.watch_field ? ` (si cambia ${def.fields.find((f) => f.name === r.watch_field)?.label.toLowerCase() ?? r.watch_field})` : ""}
                {r.conditions?.length ? ` · si ${describeConditions(def, r.conditions, OP_LABELS)}` : ""} → {(r.actions ?? []).map((a) => ACTION_LABELS[a.type]).join(", ")}
              </span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              <span className="badge">{r.run_count} ejecuciones{r.last_run_at ? ` · última ${formatDateTime(r.last_run_at)}` : ""}</span>
              <span className={`badge ${r.is_active ? "badge-success" : ""}`}>{r.is_active ? "Activa" : "Inactiva"}</span>
            </span>
          </summary>
          <div className="border-t border-line p-5">
            <ActionForm action={saveAutomationRule.bind(null, object, r.id)} className="space-y-4">
              {fields(r)}
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="is_active" defaultChecked={r.is_active} className="accent-[var(--brand)]" /> Activa</label>
                <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
              </div>
            </ActionForm>
            <ActionForm action={deleteAutomationRule.bind(null, r.id)} className="mt-3 flex flex-col items-end">
              <ConfirmSubmit message={`¿Eliminar la automatización “${r.name}”?`}><Trash2 size={14} /> Eliminar</ConfirmSubmit>
            </ActionForm>
          </div>
        </details>
      ))}
      {rules.length === 0 && <p className="text-sm text-muted">No hay automatizaciones para este objeto.</p>}
    </>
  );
}

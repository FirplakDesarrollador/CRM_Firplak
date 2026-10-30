import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConditionsEditor } from "@/components/rules/ConditionsEditor";
import { ActionsEditor } from "@/components/rules/ActionsEditor";
import { ObjectTabs } from "@/components/rules/ObjectTabs";
import { TriggerFields } from "@/components/rules/TriggerFields";
import { createClient } from "@/lib/supabase/server";
import { getObjectDef, getPipelines, getUsers } from "@/lib/records/data";
import { type Filter, type ObjectKey } from "@/lib/objects";
import { OP_LABELS } from "@/lib/records/filters";
import { describeConditions } from "@/lib/rules/evaluate";
import { TRIGGERS, type AutomationAction } from "@/lib/rules/automation-types";
import { canSystem } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getLocale } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";
import { deleteAutomationRule, runScheduledAutomationsNow, saveAutomationRule } from "../actions";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Automatizaciones" };

const OBJECTS_WITH_AUTOMATION: ObjectKey[] = ["leads", "accounts", "contacts", "opportunities", "quotes", "orders", "cases", "campaigns"];
const ACTION_LABELS: Record<string, string> = { create_task: "crear tarea", notify: "notificar", assign_owner: "asignar propietario", set_field: "actualizar campo" };

type Rule = {
  id: string; name: string; description: string | null; trigger_on: keyof typeof TRIGGERS; watch_field: string | null;
  schedule_field: string | null; schedule_offset_days: number;
  conditions: Filter[]; actions: AutomationAction[]; sort_order: number; is_active: boolean; run_count: number; last_run_at: string | null;
};

export default async function AutomationsPage({ searchParams }: PageProps<"/configuracion/automatizaciones">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const locale = await getLocale();
  const t = makeT(locale);
  const object = (OBJECTS_WITH_AUTOMATION.includes(sp.objeto as ObjectKey) ? sp.objeto : "leads") as ObjectKey;
  const supabase = await createClient();
  const [def, users, pipelines, { data }, { data: channelRows }] = await Promise.all([
    getObjectDef(object), getUsers(), getPipelines(),
    supabase.from("automation_rules").select("*").eq("object", object).order("sort_order"),
    supabase.from("teams_channels").select("id, name").order("name"),
  ]);
  const channels = channelRows ?? [];
  const rules = (data ?? []) as unknown as Rule[];
  const watchable = def.fields.filter((f) => !["datetime"].includes(f.type) && f.type !== "textarea").map((f) => ({ name: f.name, label: f.label }));
  const dateFields = def.fields.filter((f) => f.type === "date" || f.type === "datetime").map((f) => ({ name: f.name, label: f.label }));
  const fieldLabel = (name: string | null) => t(def.fields.find((f) => f.name === name)?.label ?? name ?? "");
  const whenText = (r: Rule) => {
    if (r.trigger_on !== "scheduled") {
      return `${t(TRIGGERS[r.trigger_on])}${r.watch_field ? ` (${t("si cambia")} ${fieldLabel(r.watch_field).toLowerCase()})` : ""}`;
    }
    const d = r.schedule_offset_days;
    const field = fieldLabel(r.schedule_field).toLowerCase();
    return d === 0 ? `${t("El día de")} ${field}` : `${Math.abs(d)} ${t(d < 0 ? "días antes de" : "días después de")} ${field}`;
  };

  const fields = (r?: Rule) => {
    const k = r?.id ?? "new";
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
          <div><label className="label" htmlFor={`an-${k}`}><Tr>Nombre</Tr></label><input id={`an-${k}`} name="name" className="input" defaultValue={r?.name} /></div>
          <div><label className="label" htmlFor={`ad-${k}`}><Tr>Descripción</Tr></label><input id={`ad-${k}`} name="description" className="input" defaultValue={r?.description ?? ""} /></div>
          <div><label className="label" htmlFor={`ao-${k}`}><Tr>Orden</Tr></label><input id={`ao-${k}`} name="sort_order" type="number" className="input" defaultValue={r?.sort_order ?? rules.length + 1} /></div>
        </div>
        <TriggerFields id={k} trigger={r?.trigger_on ?? "create"} watchField={r?.watch_field ?? null} scheduleField={r?.schedule_field ?? null}
          offsetDays={r?.schedule_offset_days ?? 0} watchable={watchable} dateFields={dateFields} />
        <div>
          <span className="label"><Tr>Condiciones (todas deben cumplirse)</Tr></span>
          <ConditionsEditor name="conditions" fields={def.fields} users={users} pipelines={pipelines} initial={r?.conditions ?? []} />
        </div>
        <div>
          <span className="label"><Tr>Acciones</Tr></span>
          <ActionsEditor name="actions" fields={def.fields} users={users} initial={r?.actions ?? []} hasOwner={def.hasOwner !== false} channels={channels} />
        </div>
      </>
    );
  };

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Automatizaciones</Tr></h1>
        <p className="text-sm text-muted"><Tr>Asignación de registros, tareas de seguimiento, notificaciones y actualización de campos cuando un registro cumple condiciones.</Tr></p>
      </div>
      <section className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="max-w-2xl text-sm text-muted">
          <Tr>Las reglas programadas se revisan cada día a las 6:30 a. m. (con pg_cron activo en Supabase) y se disparan una sola vez por registro y fecha.</Tr>
        </p>
        <ActionForm action={runScheduledAutomationsNow} className="flex flex-col items-end gap-1">
          <SubmitButton className="btn" pendingText="Ejecutando…"><Tr>Ejecutar programadas ahora</Tr></SubmitButton>
        </ActionForm>
      </section>
      <ObjectTabs base="/configuracion/automatizaciones" active={object} objects={OBJECTS_WITH_AUTOMATION} />
      <section className="glass p-5">
        <h2 className="card-title">{t("Nueva automatización para")} {t(def.plural).toLowerCase()}</h2>
        <ActionForm key={object} action={saveAutomationRule.bind(null, object, null)} className="mt-3 space-y-4">
          {fields()}
          <div className="flex justify-end"><SubmitButton pendingText="Creando…"><Tr>Crear automatización</Tr></SubmitButton></div>
        </ActionForm>
      </section>
      {rules.map((r) => (
        <details key={r.id} className="card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-3">
            <span>
              <span className="font-medium">{r.name}</span>
              <span className="block text-xs text-muted">
                {whenText(r)}
                {r.conditions?.length ? ` · ${t("si")} ${describeConditions(def, r.conditions, OP_LABELS)}` : ""} → {(r.actions ?? []).map((a) => t(ACTION_LABELS[a.type])).join(", ")}
              </span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              <span className="badge">{r.run_count} {t("ejecuciones")}{r.last_run_at ? ` · ${t("última")} ${formatDateTime(r.last_run_at, locale)}` : ""}</span>
              {r.trigger_on === "scheduled" && <span className="badge badge-info"><Tr>Programada</Tr></span>}
              <span className={`badge ${r.is_active ? "badge-success" : ""}`}><Tr>{r.is_active ? "Activa" : "Inactiva"}</Tr></span>
            </span>
          </summary>
          <div className="border-t border-line p-5">
            <ActionForm action={saveAutomationRule.bind(null, object, r.id)} className="space-y-4">
              {fields(r)}
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="is_active" defaultChecked={r.is_active} className="accent-[var(--brand)]" /> <Tr>Activa</Tr></label>
                <SubmitButton pendingText="Guardando…"><Tr>Guardar</Tr></SubmitButton>
              </div>
            </ActionForm>
            <ActionForm action={deleteAutomationRule.bind(null, r.id)} className="mt-3 flex flex-col items-end">
              <ConfirmSubmit message={`${t("¿Eliminar la automatización?")} “${r.name}”`}><Trash2 size={14} /> <Tr>Eliminar</Tr></ConfirmSubmit>
            </ActionForm>
          </div>
        </details>
      ))}
      {rules.length === 0 && <p className="text-sm text-muted"><Tr>No hay automatizaciones para este objeto.</Tr></p>}
    </>
  );
}

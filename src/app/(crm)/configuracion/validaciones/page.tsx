import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConditionsEditor } from "@/components/rules/ConditionsEditor";
import { ObjectTabs } from "@/components/rules/ObjectTabs";
import { createClient } from "@/lib/supabase/server";
import { getObjectDef, getPipelines, getUsers } from "@/lib/records/data";
import { isObjectKey, type Filter, type ObjectKey } from "@/lib/objects";
import { OP_LABELS } from "@/lib/records/filters";
import { describeConditions } from "@/lib/rules/evaluate";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { deleteValidationRule, saveValidationRule } from "../actions";

export const metadata: Metadata = { title: "Reglas de validación" };

type Rule = { id: string; name: string; description: string | null; conditions: Filter[]; error_message: string; error_field: string | null; is_active: boolean };

export default async function ValidationRulesPage({ searchParams }: PageProps<"/configuracion/validaciones">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const object: ObjectKey = typeof sp.objeto === "string" && isObjectKey(sp.objeto) ? sp.objeto : "opportunities";
  const supabase = await createClient();
  const [def, users, pipelines, { data }] = await Promise.all([
    getObjectDef(object), getUsers(), getPipelines(),
    supabase.from("validation_rules").select("*").eq("object", object).order("name"),
  ]);
  const rules = (data ?? []) as unknown as Rule[];
  const editableFields = def.fields.filter((f) => !f.readOnly && !f.formHidden);

  const fields = (r?: Rule) => (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`vn-${r?.id ?? "new"}`}>Nombre</label><input id={`vn-${r?.id ?? "new"}`} name="name" className="input" defaultValue={r?.name} /></div>
        <div><label className="label" htmlFor={`vd-${r?.id ?? "new"}`}>Descripción</label><input id={`vd-${r?.id ?? "new"}`} name="description" className="input" defaultValue={r?.description ?? ""} /></div>
      </div>
      <div>
        <span className="label">Bloquear el guardado cuando se cumplan todas estas condiciones</span>
        <ConditionsEditor name="conditions" fields={def.fields} users={users} pipelines={pipelines} initial={r?.conditions ?? []} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div><label className="label" htmlFor={`vm-${r?.id ?? "new"}`}>Mensaje de error</label><input id={`vm-${r?.id ?? "new"}`} name="error_message" className="input" defaultValue={r?.error_message} /></div>
        <div>
          <label className="label" htmlFor={`vf-${r?.id ?? "new"}`}>Mostrar junto al campo</label>
          <select id={`vf-${r?.id ?? "new"}`} name="error_field" className="select" defaultValue={r?.error_field ?? ""}>
            <option value="">Arriba del formulario</option>
            {editableFields.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
          </select>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div>
        <h1 className="text-xl font-medium">Reglas de validación</h1>
        <p className="text-sm text-muted">Se aplican al guardar desde formularios, el pipeline y las rutas de estado. Si el registro cumple todas las condiciones, no se guarda y se muestra el mensaje.</p>
      </div>
      <ObjectTabs base="/configuracion/validaciones" active={object} />
      <section className="glass p-5">
        <h2 className="card-title">Nueva regla para {def.plural.toLowerCase()}</h2>
        <ActionForm key={object} action={saveValidationRule.bind(null, object, null)} className="mt-3 space-y-3">
          {fields()}
          <div className="flex justify-end"><SubmitButton pendingText="Creando…">Crear regla</SubmitButton></div>
        </ActionForm>
      </section>
      {rules.map((r) => (
        <details key={r.id} className="card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-3">
            <span>
              <span className="font-medium">{r.name}</span>
              <span className="block text-xs text-muted">Si {describeConditions(def, r.conditions ?? [], OP_LABELS)} → “{r.error_message}”</span>
            </span>
            <span className={`badge ${r.is_active ? "badge-success" : ""}`}>{r.is_active ? "Activa" : "Inactiva"}</span>
          </summary>
          <div className="border-t border-line p-5">
            <ActionForm action={saveValidationRule.bind(null, object, r.id)} className="space-y-3">
              {fields(r)}
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="is_active" defaultChecked={r.is_active} className="accent-[var(--brand)]" /> Activa</label>
                <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
              </div>
            </ActionForm>
            <ActionForm action={deleteValidationRule.bind(null, r.id)} className="mt-3 flex flex-col items-end">
              <ConfirmSubmit message={`¿Eliminar la regla “${r.name}”?`}><Trash2 size={14} /> Eliminar</ConfirmSubmit>
            </ActionForm>
          </div>
        </details>
      ))}
      {rules.length === 0 && <p className="text-sm text-muted">No hay reglas para este objeto.</p>}
    </>
  );
}

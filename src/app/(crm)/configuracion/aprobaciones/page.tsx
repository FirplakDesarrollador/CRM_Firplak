import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConditionsEditor } from "@/components/rules/ConditionsEditor";
import { ActionsEditor } from "@/components/rules/ActionsEditor";
import { ObjectTabs } from "@/components/rules/ObjectTabs";
import { Tr } from "@/components/ui/Tr";
import { Opt } from "@/components/ui/Opt";
import { createClient } from "@/lib/supabase/server";
import { getObjectDef, getPipelines, getUsers } from "@/lib/records/data";
import type { Filter, ObjectKey } from "@/lib/objects";
import { OP_LABELS } from "@/lib/records/filters";
import { describeConditions } from "@/lib/rules/evaluate";
import type { AutomationAction } from "@/lib/rules/automation-types";
import { canSystem } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getLocale } from "@/lib/i18n/server";
import { makeT } from "@/lib/i18n";
import { deleteApprovalProcess, saveApprovalProcess } from "../actions";

export const metadata: Metadata = { title: "Procesos de aprobación" };

const OBJECTS_WITH_APPROVAL: ObjectKey[] = ["quotes", "opportunities", "accounts", "leads", "cases", "campaigns", "contacts", "products"];

type Process = {
  id: string; name: string; description: string | null; conditions: Filter[];
  approver_type: "manager" | "user"; approver_id: string | null; lock_record: boolean;
  submit_updates: AutomationAction[]; approve_updates: AutomationAction[]; reject_updates: AutomationAction[];
  sort_order: number; is_active: boolean;
};

export default async function ApprovalProcessesPage({ searchParams }: PageProps<"/configuracion/aprobaciones">) {
  const [me, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(me.access, "customize")) redirect("/configuracion");
  const locale = await getLocale();
  const t = makeT(locale);
  const object = (OBJECTS_WITH_APPROVAL.includes(sp.objeto as ObjectKey) ? sp.objeto : "quotes") as ObjectKey;
  const supabase = await createClient();
  const [def, users, pipelines, { data }, { count: pending }] = await Promise.all([
    getObjectDef(object), getUsers(), getPipelines(),
    supabase.from("approval_processes").select("*").eq("object", object).order("sort_order"),
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("object", object).eq("status", "pending"),
  ]);
  // Las actualizaciones se guardan como { field, value }; el editor las maneja como acciones «set_field».
  const asUpdates = (list: unknown): AutomationAction[] =>
    (Array.isArray(list) ? list : []).map((u: { field?: string; value?: string }) => ({ type: "set_field", field: String(u.field ?? ""), value: String(u.value ?? "") }));
  const processes = ((data ?? []) as unknown as Process[]).map((p) => ({
    ...p,
    submit_updates: asUpdates(p.submit_updates),
    approve_updates: asUpdates(p.approve_updates),
    reject_updates: asUpdates(p.reject_updates),
  }));
  const activeUsers = users.filter((u) => u.is_active);
  const userName = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? "—";
  const updatesText = (list: AutomationAction[]) =>
    list
      .filter((a): a is Extract<AutomationAction, { type: "set_field" }> => a.type === "set_field")
      .map((a) => `${t(def.fields.find((f) => f.name === a.field)?.label ?? a.field)} = ${a.value || "—"}`)
      .join(", ");

  const fields = (p?: Process) => {
    const k = p?.id ?? "new";
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
          <div><label className="label" htmlFor={`pn-${k}`}><Tr>Nombre</Tr></label><input id={`pn-${k}`} name="name" className="input" defaultValue={p?.name} /></div>
          <div><label className="label" htmlFor={`pd-${k}`}><Tr>Descripción</Tr></label><input id={`pd-${k}`} name="description" className="input" defaultValue={p?.description ?? ""} /></div>
          <div><label className="label" htmlFor={`po-${k}`}><Tr>Orden</Tr></label><input id={`po-${k}`} name="sort_order" type="number" className="input" defaultValue={p?.sort_order ?? processes.length + 1} /></div>
        </div>
        <div>
          <span className="label"><Tr>Entra al proceso si cumple (todas las condiciones)</Tr></span>
          <ConditionsEditor name="conditions" fields={def.fields} users={users} pipelines={pipelines} initial={p?.conditions ?? []} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`pa-${k}`}><Tr>Quién aprueba</Tr></label>
            <select id={`pa-${k}`} name="approver_type" className="select" defaultValue={p?.approver_type ?? "manager"}>
              <Opt value="manager">Jefe directo del propietario</Opt>
              <Opt value="user">Un usuario específico</Opt>
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`pu-${k}`}><Tr>Usuario que aprueba</Tr></label>
            <select id={`pu-${k}`} name="approver_id" className="select" defaultValue={p?.approver_id ?? ""}>
              <Opt value="">Solo si aprueba un usuario específico…</Opt>
              {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="lock_record" defaultChecked={p?.lock_record ?? true} className="accent-[var(--brand)]" />
          <Tr>Bloquear el registro mientras espera aprobación (solo lo edita el aprobador o administración)</Tr>
        </label>
        <div className="grid gap-4 xl:grid-cols-3">
          {([
            ["submit_updates", "Al enviar"],
            ["approve_updates", "Al aprobar"],
            ["reject_updates", "Al rechazar o retirar"],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <span className="label"><Tr>{label}</Tr></span>
              <ActionsEditor name={key} fields={def.fields} users={users} initial={p?.[key] ?? []} hasOwner={false}
                types={["set_field"]} emptyText="Sin cambios de campos." />
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <>
      <div>
        <h1 className="text-xl font-medium"><Tr>Procesos de aprobación</Tr></h1>
        <p className="text-sm text-muted">
          <Tr>Los registros que cumplen las condiciones se envían desde su ficha al aprobador. Si varios procesos aplican, se usa el de menor orden.</Tr>
        </p>
      </div>
      <ObjectTabs base="/configuracion/aprobaciones" active={object} objects={OBJECTS_WITH_APPROVAL} />
      {Boolean(pending) && (
        <p className="text-sm text-muted">{pending} {t("solicitudes pendientes en este objeto.")}</p>
      )}
      <section className="glass p-5">
        <h2 className="card-title">{t("Nuevo proceso para")} {t(def.plural).toLowerCase()}</h2>
        <ActionForm key={object} action={saveApprovalProcess.bind(null, object, null)} className="mt-3 space-y-4">
          {fields()}
          <div className="flex justify-end"><SubmitButton pendingText="Creando…"><Tr>Crear proceso</Tr></SubmitButton></div>
        </ActionForm>
      </section>
      {processes.map((p) => (
        <details key={p.id} className="card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-3">
            <span>
              <span className="font-medium">{p.name}</span>
              <span className="block text-xs text-muted">
                {p.conditions?.length ? `${t("Si")} ${describeConditions(def, p.conditions, OP_LABELS)}` : t("Todos los registros")}
                {" → "}{p.approver_type === "manager" ? t("Jefe directo del propietario") : userName(p.approver_id)}
                {p.approve_updates?.length ? ` · ${t("Al aprobar")}: ${updatesText(p.approve_updates)}` : ""}
              </span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              {p.lock_record && <span className="badge"><Tr>Bloquea el registro</Tr></span>}
              <span className={`badge ${p.is_active ? "badge-success" : ""}`}>{t(p.is_active ? "Activo" : "Inactivo")}</span>
            </span>
          </summary>
          <div className="border-t border-line p-5">
            <ActionForm action={saveApprovalProcess.bind(null, object, p.id)} className="space-y-4">
              {fields(p)}
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="is_active" defaultChecked={p.is_active} className="accent-[var(--brand)]" /> <Tr>Activo</Tr></label>
                <SubmitButton pendingText="Guardando…"><Tr>Guardar</Tr></SubmitButton>
              </div>
            </ActionForm>
            <ActionForm action={deleteApprovalProcess.bind(null, p.id)} className="mt-3 flex flex-col items-end">
              <ConfirmSubmit message={`${t("¿Eliminar el proceso?")} “${p.name}”`}><Trash2 size={14} /> <Tr>Eliminar</Tr></ConfirmSubmit>
            </ActionForm>
          </div>
        </details>
      ))}
      {processes.length === 0 && <p className="text-sm text-muted"><Tr>No hay procesos de aprobación para este objeto.</Tr></p>}
    </>
  );
}

"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FieldDef } from "@/lib/objects";
import type { UserOption } from "@/lib/records/data";
import type { AutomationAction } from "@/lib/rules/automation-types";
import { useT } from "@/lib/i18n/client";

import { Tr } from "@/components/ui/Tr";
import { Opt } from "@/components/ui/Opt";
const TYPES: Record<AutomationAction["type"], string> = {
  create_task: "Crear tarea",
  notify: "Enviar notificación",
  assign_owner: "Asignar propietario",
  set_field: "Actualizar campo",
};

const blank = (type: AutomationAction["type"]): AutomationAction =>
  type === "create_task" ? { type, subject: "", due_in_days: 1, assign_to: "owner", priority: "normal" }
    : type === "notify" ? { type, to: "owner", title: "", body: "" }
      : type === "assign_owner" ? { type, user_id: "" }
        : { type, field: "", value: "" };

export function ActionsEditor({ name, fields, users, initial = [], hasOwner, types, emptyText = "Sin acciones." }: {
  name: string; fields: FieldDef[]; users: UserOption[]; initial?: AutomationAction[]; hasOwner: boolean;
  /** Tipos de acción ofrecidos (por defecto, todos). */
  types?: AutomationAction["type"][]; emptyText?: string;
}) {
  const [actions, setActions] = useState<AutomationAction[]>(initial);
  const t = useT();
  const update = (i: number, patch: Partial<AutomationAction>) =>
    setActions(actions.map((a, j) => (j === i ? ({ ...a, ...patch } as AutomationAction) : a)));
  const settable = fields.filter((f) => !f.readOnly && !f.formHidden && ["select", "text", "checkbox"].includes(f.type));
  const activeUsers = users.filter((u) => u.is_active);
  const offered = (Object.keys(TYPES) as AutomationAction["type"][]).filter((k) => (hasOwner || k !== "assign_owner") && (!types || types.includes(k)));

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(actions)} />
      {actions.length === 0 && <p className="text-sm text-muted"><Tr>{emptyText}</Tr></p>}
      {actions.map((a, i) => (
        <div key={i} className={`grid gap-2 rounded-[10px] border border-line bg-surface p-3 ${offered.length > 1 ? "sm:grid-cols-[11rem_1fr_auto]" : "grid-cols-[1fr_auto]"}`}>
          {offered.length > 1 && (
            <select className="select" value={a.type} aria-label={t("Tipo de acción")} onChange={(e) => setActions(actions.map((x, j) => (j === i ? blank(e.target.value as AutomationAction["type"]) : x)))}>
              {offered.map((k) => <option key={k} value={k}>{t(TYPES[k])}</option>)}
            </select>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {a.type === "create_task" && (
              <>
                <input className="input sm:col-span-2" placeholder="Asunto de la tarea" value={a.subject} onChange={(e) => update(i, { subject: e.target.value })} />
                <label className="flex items-center gap-2 text-sm">Vence en
                  <input type="number" min={0} className="input h-8 w-20" value={a.due_in_days ?? 1} onChange={(e) => update(i, { due_in_days: Number(e.target.value) })} /> días
                </label>
                <select className="select" value={a.priority ?? "normal"} aria-label="Prioridad" onChange={(e) => update(i, { priority: e.target.value as "high" })}>
                  <Opt value="high">Prioridad alta</Opt><Opt value="normal">Prioridad normal</Opt><Opt value="low">Prioridad baja</Opt>
                </select>
                <select className="select sm:col-span-2" value={a.assign_to ?? "owner"} aria-label="Asignar a" onChange={(e) => update(i, { assign_to: e.target.value })}>
                  <Opt value="owner">Asignar al propietario del registro</Opt>
                  {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </>
            )}
            {a.type === "notify" && (
              <>
                <select className="select" value={a.to} aria-label="Destinatario" onChange={(e) => update(i, { to: e.target.value })}>
                  <Opt value="owner">Propietario del registro</Opt>
                  <Opt value="manager">Jefe directo del propietario</Opt>
                  {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
                <input className="input" placeholder="Título" value={a.title} onChange={(e) => update(i, { title: e.target.value })} />
                <input className="input sm:col-span-2" placeholder="Mensaje (opcional)" value={a.body ?? ""} onChange={(e) => update(i, { body: e.target.value })} />
              </>
            )}
            {a.type === "assign_owner" && (
              <select className="select sm:col-span-2" value={a.user_id} aria-label="Nuevo propietario" onChange={(e) => update(i, { user_id: e.target.value })}>
                <Opt value="">Selecciona un usuario…</Opt>
                {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            )}
            {a.type === "set_field" && (() => {
              const field = settable.find((f) => f.name === a.field);
              return (
                <>
                  <select className="select" value={a.field} aria-label="Campo" onChange={(e) => update(i, { field: e.target.value, value: "" })}>
                    <Opt value="">Campo…</Opt>
                    {settable.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
                  </select>
                  {field?.type === "select" ? (
                    <select className="select" value={a.value} aria-label="Valor" onChange={(e) => update(i, { value: e.target.value })}>
                      <Opt value="">— Vacío —</Opt>
                      {(field.options ?? []).map((o) => <option key={o} value={o}>{field.optionLabels?.[o] ?? o}</option>)}
                    </select>
                  ) : field?.type === "checkbox" ? (
                    <select className="select" value={a.value} aria-label="Valor" onChange={(e) => update(i, { value: e.target.value })}>
                      <Opt value="true">Sí</Opt><Opt value="false">No</Opt>
                    </select>
                  ) : (
                    <input className="input" placeholder="Valor" value={a.value} onChange={(e) => update(i, { value: e.target.value })} />
                  )}
                </>
              );
            })()}
          </div>
          <button type="button" className="btn btn-ghost btn-icon text-danger" aria-label="Quitar acción" onClick={() => setActions(actions.filter((_, j) => j !== i))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {offered.map((k) => (
          <button key={k} type="button" className="btn btn-sm" onClick={() => setActions([...actions, blank(k)])}><Plus size={14} /> {t(TYPES[k])}</button>
        ))}
      </div>
    </div>
  );
}

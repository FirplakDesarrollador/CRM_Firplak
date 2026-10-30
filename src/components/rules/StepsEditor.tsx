"use client";

import { useState } from "react";
import { ArrowUp, Plus, Trash2 } from "lucide-react";
import type { FieldDef, Filter } from "@/lib/objects";
import type { PipelineWithStages, UserOption } from "@/lib/records/data";
import { useT } from "@/lib/i18n/client";
import { ConditionsEditor } from "./ConditionsEditor";
import { Opt } from "@/components/ui/Opt";
import { Tr } from "@/components/ui/Tr";

export type ApprovalStep = {
  name: string;
  approver_type: "manager" | "previous_manager" | "user";
  approver_id: string | null;
  conditions: Filter[];
};
type Row = ApprovalStep & { key: string };

/**
 * Pasos ordenados de un proceso de aprobación. Los datos de cada paso viajan en el campo
 * oculto `steps`; sus condiciones, en `step_conditions_<key>` (editor de condiciones).
 */
export function StepsEditor({ initial, fields, users, pipelines }: {
  initial: ApprovalStep[]; fields: FieldDef[]; users: UserOption[]; pipelines: PipelineWithStages[];
}) {
  const t = useT();
  const [steps, setSteps] = useState<Row[]>(() =>
    (initial.length ? initial : [{ name: "Jefe directo", approver_type: "manager", approver_id: null, conditions: [] } as ApprovalStep])
      .map((s, i) => ({ ...s, key: `s${i}` })));
  const [next, setNext] = useState(steps.length);
  const update = (key: string, patch: Partial<ApprovalStep>) => setSteps(steps.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const activeUsers = users.filter((u) => u.is_active);

  return (
    <div className="space-y-2">
      <input type="hidden" name="steps" value={JSON.stringify(steps.map(({ key, name, approver_type, approver_id }) => ({ key, name, approver_type, approver_id })))} />
      {steps.map((s, i) => (
        <div key={s.key} className="space-y-3 rounded-[10px] border border-line bg-surface p-3">
          <div className="flex flex-wrap items-end gap-2">
            <span className="badge badge-brand">{t("Paso")} {i + 1}</span>
            <div className="min-w-[10rem] flex-1">
              <label className="label" htmlFor={`sn-${s.key}`}><Tr>Nombre del paso</Tr></label>
              <input id={`sn-${s.key}`} className="input" value={s.name} onChange={(e) => update(s.key, { name: e.target.value })} />
            </div>
            <div className="min-w-[12rem] flex-1">
              <label className="label" htmlFor={`st-${s.key}`}><Tr>Quién aprueba</Tr></label>
              <select id={`st-${s.key}`} className="select" value={s.approver_type}
                onChange={(e) => update(s.key, { approver_type: e.target.value as ApprovalStep["approver_type"] })}>
                <Opt value="manager">Jefe directo del propietario</Opt>
                <Opt value="previous_manager">Jefe del aprobador anterior</Opt>
                <Opt value="user">Un usuario específico</Opt>
              </select>
            </div>
            {s.approver_type === "user" && (
              <div className="min-w-[12rem] flex-1">
                <label className="label" htmlFor={`su-${s.key}`}><Tr>Usuario que aprueba</Tr></label>
                <select id={`su-${s.key}`} className="select" value={s.approver_id ?? ""} onChange={(e) => update(s.key, { approver_id: e.target.value || null })}>
                  <Opt value="">Selecciona un usuario…</Opt>
                  {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-1">
              {i > 0 && (
                <button type="button" className="btn btn-ghost btn-icon" aria-label={t("Subir paso")}
                  onClick={() => setSteps(steps.map((x, j) => (j === i - 1 ? steps[i] : j === i ? steps[i - 1] : x)))}>
                  <ArrowUp size={15} />
                </button>
              )}
              {steps.length > 1 && (
                <button type="button" className="btn btn-ghost btn-icon text-danger" aria-label={t("Quitar paso")}
                  onClick={() => setSteps(steps.filter((x) => x.key !== s.key))}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
          <div>
            <span className="label"><Tr>Aplica si (vacío = siempre; si no se cumple, el paso se omite)</Tr></span>
            <ConditionsEditor name={`step_conditions_${s.key}`} fields={fields} users={users} pipelines={pipelines} initial={s.conditions} />
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => {
        setSteps([...steps, { key: `s${next}`, name: "", approver_type: "previous_manager", approver_id: null, conditions: [] }]);
        setNext(next + 1);
      }}>
        <Plus size={14} /> <Tr>Agregar paso</Tr>
      </button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Building2, Target, UserRound } from "lucide-react";
import { convertLead } from "@/lib/records/phase2-actions";
import { LookupInput } from "@/components/records/LookupInput";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

type Props = {
  leadId: string;
  company: string;
  contactName: string;
  ownerId: string;
  matches: { id: string; name: string; city: string | null }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  defaultStage: string;
  defaultClose: string;
  users: { id: string; name: string }[];
};

export function ConvertForm(props: Props) {
  const [state, action] = useActionState(convertLead.bind(null, props.leadId), {});
  const [mode, setMode] = useState<"new" | "existing">(props.matches.length ? "existing" : "new");
  const [createOpp, setCreateOpp] = useState(true);

  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert tone="error">{state.message}</Alert>}

      <section className="glass p-5">
        <h2 className="card-title"><Building2 size={17} /> Cuenta</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="account_mode" value="new" checked={mode === "new"} onChange={() => setMode("new")} /> Crear cuenta nueva</label>
          <label className="flex items-center gap-2"><input type="radio" name="account_mode" value="existing" checked={mode === "existing"} onChange={() => setMode("existing")} /> Usar una cuenta existente</label>
        </div>
        {mode === "new" ? (
          <div className="mt-3">
            <label className="label" htmlFor="account_name">Nombre de la cuenta</label>
            <input id="account_name" name="account_name" className="input" defaultValue={props.company} />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {props.matches.length > 0 && <p className="text-xs text-muted">Posibles coincidencias: {props.matches.map((m) => m.name).join(", ")}</p>}
            <LookupInput name="account_id" object="accounts" invalid={Boolean(state.errors?.account_id)}
              initial={props.matches[0] ? { id: props.matches[0].id, label: props.matches[0].name } : null} />
            {state.errors?.account_id && <p className="error-text">{state.errors.account_id}</p>}
          </div>
        )}
      </section>

      <section className="glass p-5">
        <h2 className="card-title"><UserRound size={17} /> Contacto</h2>
        <p className="mt-2 text-sm text-ink-2">Se creará el contacto <strong className="font-medium">{props.contactName}</strong> con los datos del prospecto, y se le pasarán sus actividades y campañas.</p>
      </section>

      <section className="glass p-5">
        <label className="card-title cursor-pointer">
          <input type="checkbox" name="create_opportunity" checked={createOpp} onChange={(e) => setCreateOpp(e.target.checked)} className="accent-[var(--brand)]" />
          <Target size={17} /> Crear oportunidad
        </label>
        {createOpp && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="opportunity_name">Nombre de la oportunidad</label>
              <input id="opportunity_name" name="opportunity_name" className="input" defaultValue={`${props.company} · Nueva oportunidad`} />
            </div>
            <div>
              <label className="label" htmlFor="stage_id">Etapa</label>
              <select id="stage_id" name="stage_id" className="select" defaultValue={props.defaultStage}>
                {props.pipelines.map((p) => (
                  <optgroup key={p.id} label={p.name}>{p.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
                ))}
              </select>
              {state.errors?.stage_id && <p className="error-text">{state.errors.stage_id}</p>}
            </div>
            <div>
              <label className="label" htmlFor="amount">Valor estimado (COP)</label>
              <input id="amount" name="amount" inputMode="decimal" className="input num" placeholder="0" />
            </div>
            <div>
              <label className="label" htmlFor="close_date">Fecha de cierre</label>
              <input id="close_date" name="close_date" type="date" className="input" defaultValue={props.defaultClose} />
            </div>
          </div>
        )}
      </section>

      <section className="glass p-5">
        <label className="label" htmlFor="owner_id">Propietario de los registros</label>
        <select id="owner_id" name="owner_id" className="select" defaultValue={props.ownerId}>
          {props.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </section>

      <div className="flex justify-end gap-2">
        <Link href={`/prospectos/${props.leadId}`} className="btn">Cancelar</Link>
        <SubmitButton pendingText="Convirtiendo…">Convertir prospecto</SubmitButton>
      </div>
    </form>
  );
}

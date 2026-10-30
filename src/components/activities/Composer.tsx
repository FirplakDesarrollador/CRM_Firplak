"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createActivity } from "@/lib/records/actions";
import { ACTIVITY_ICONS } from "@/components/ui/icons";
import { CALL_RESULTS, PRIORITIES } from "@/lib/objects/picklists";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import type { UserOption } from "@/lib/records/data";

import { Tr } from "@/components/ui/Tr";
const TABS = [
  { key: "task", label: "Tarea" },
  { key: "call", label: "Llamada" },
  { key: "meeting", label: "Reunión" },
  { key: "email", label: "Correo" },
  { key: "note", label: "Nota" },
] as const;

type Related = { account_id?: string | null; contact_id?: string | null; opportunity_id?: string | null; lead_id?: string | null; case_id?: string | null };

export function Composer({ related, users, currentUserId }: { related: Related; users: UserOption[]; currentUserId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("task");
  const [state, action] = useActionState(createActivity, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  const placeholder: Record<string, string> = {
    task: "Ej. Enviar cotización ajustada",
    call: "Ej. Seguimiento a la propuesta",
    meeting: "Ej. Visita técnica a la obra",
    email: "Ej. Envío de catálogo de muebles de baño",
    note: "Ej. Preferencias del cliente",
  };

  return (
    <div>
      <div role="tablist" className="flex overflow-x-auto border-b border-line [scrollbar-width:none]">
        {TABS.map((t) => {
          const Icon = ACTIVITY_ICONS[t.key];
          return (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className="tab mr-3.5 text-sm" onClick={() => setTab(t.key)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
      <form ref={formRef} action={action} className="space-y-3 pt-3">
        <input type="hidden" name="activity_type" value={tab} />
        {related.account_id && <input type="hidden" name="account_id" value={related.account_id} />}
        {related.contact_id && <input type="hidden" name="contact_id" value={related.contact_id} />}
        {related.opportunity_id && <input type="hidden" name="opportunity_id" value={related.opportunity_id} />}
        {related.lead_id && <input type="hidden" name="lead_id" value={related.lead_id} />}
        {related.case_id && <input type="hidden" name="case_id" value={related.case_id} />}
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
        <div>
          <label className="label" htmlFor="act-subject"><Tr>Asunto</Tr></label>
          <input id="act-subject" name="subject" className="input" placeholder={placeholder[tab]} />
          {state.errors?.subject && <p className="error-text">{state.errors.subject}</p>}
        </div>
        {tab === "meeting" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="act-start"><Tr>Inicio</Tr></label>
              <input id="act-start" name="start_at" type="datetime-local" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="act-duration"><Tr>Duración</Tr></label>
              <select id="act-duration" name="duration_minutes" className="select" defaultValue="60">
                {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="act-location"><Tr>Lugar</Tr></label>
              <input id="act-location" name="location" className="input" placeholder="Obra, oficina del cliente, showroom, videollamada…" />
            </div>
          </div>
        )}
        {tab === "call" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="act-result"><Tr>Resultado</Tr></label>
              <select id="act-result" name="call_result" className="select">
                <option value="">—</option>
                {CALL_RESULTS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="act-mins"><Tr>Duración (min)</Tr></label>
              <input id="act-mins" name="duration_minutes" type="number" min={0} className="input" />
            </div>
          </div>
        )}
        {(tab === "task" || tab === "call") && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="act-due">{tab === "call" ? "Fecha" : "Fecha límite"}</label>
              <input id="act-due" name="due_date" type="date" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="act-priority"><Tr>Prioridad</Tr></label>
              <select id="act-priority" name="priority" className="select" defaultValue="normal">
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        )}
        <div>
          <label className="label" htmlFor="act-desc">{tab === "note" ? "Nota" : "Descripción"}</label>
          <textarea id="act-desc" name="description" className="textarea" rows={tab === "note" || tab === "email" ? 4 : 2} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {(tab === "task" || tab === "meeting") && (
              <select name="owner_id" className="select h-8 w-auto text-xs" defaultValue={currentUserId} aria-label="Asignar a">
                {users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.id === currentUserId ? "Asignada a mí" : u.full_name}</option>)}
              </select>
            )}
            {tab === "call" && (
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <input type="checkbox" name="completed" defaultChecked className="accent-[var(--brand)]" /> <Tr>Ya realizada</Tr>
              </label>
            )}
          </div>
          <SubmitButton className="btn btn-primary btn-sm" pendingText="Guardando…">
            <Tr>{tab === "note" ? "Guardar nota" : tab === "email" ? "Registrar correo" : "Guardar"}</Tr>
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

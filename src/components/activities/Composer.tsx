"use client";

import { useRef, useState } from "react";
import { createActivity } from "@/lib/records/actions";
import { ACTIVITY_ICONS } from "@/components/ui/icons";
import { CALL_RESULTS, PRIORITIES } from "@/lib/objects/picklists";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import type { UserOption } from "@/lib/records/data";
import { useT, useValueLabel } from "@/lib/i18n/client";
import { useFormDraft } from "@/components/records/useFormDraft";

import { Tr } from "@/components/ui/Tr";
import { AmountInput } from "@/components/ui/AmountInput";
const TABS = [
  { key: "task", label: "Tarea" },
  { key: "call", label: "Llamada" },
  { key: "meeting", label: "Reunión" },
  { key: "email", label: "Correo" },
  { key: "note", label: "Nota" },
] as const;

type Tab = (typeof TABS)[number]["key"];

/** Lo que se guarda como borrador en el dispositivo mientras se escribe. */
const DRAFT_FIELDS = ["activity_type", "subject", "description", "due_date", "priority", "start_at", "duration_minutes", "location", "call_result", "owner_id", "completed"];

type Related = { account_id?: string | null; contact_id?: string | null; opportunity_id?: string | null; lead_id?: string | null; case_id?: string | null };

export function Composer({ related, users, currentUserId }: { related: Related; users: UserOption[]; currentUserId: string }) {
  const t = useT();
  const value = useValueLabel();
  const formRef = useRef<HTMLFormElement>(null);
  // Lo escrito se guarda como borrador de esta ficha en el dispositivo; al guardar la actividad se borra y el
  // formulario se monta de nuevo, limpio.
  const { state, formAction, values, draft, discard, version } = useFormDraft({
    formRef, owner: currentUserId, names: DRAFT_FIELDS, withSearch: false, suffix: "#actividad", action: createActivity,
  });
  const [picked, setPicked] = useState<Tab | null>(null);
  const drafted = draft?.values.activity_type;
  const tab: Tab = picked ?? TABS.find((item) => item.key === drafted)?.key ?? "task";
  /** Valor inicial de un campo: el del último intento de guardar o el del borrador. */
  const initial = (name: string, fallback = "") => values?.[name] ?? fallback;

  const placeholder: Record<string, string> = {
    task: "Ej. Enviar cotización ajustada",
    call: "Ej. Seguimiento a la propuesta",
    meeting: "Ej. Visita técnica a la obra",
    email: "Ej. Envío de catálogo de muebles de baño",
    note: "Ej. Preferencias del cliente",
  };

  return (
    <div>
      {/* Los cinco tipos siempre a la vista (antes se cortaban «Correo» y «Nota»): ícono sobre la etiqueta. */}
      <div role="tablist" className="grid grid-cols-5 gap-1 border-b border-line pb-2">
        {TABS.map((item) => {
          const Icon = ACTIVITY_ICONS[item.key];
          return (
            <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
              className="tab m-0 min-h-11 flex-col justify-center gap-0.5 px-1 py-1.5 text-xs" onClick={() => setPicked(item.key)}>
              <Icon size={15} /> {t(item.label)}
            </button>
          );
        })}
      </div>
      <form key={version} ref={formRef} action={formAction} onSubmit={() => setPicked(tab)} className="space-y-3 pt-3">
        <input type="hidden" name="activity_type" value={tab} />
        {related.account_id && <input type="hidden" name="account_id" value={related.account_id} />}
        {related.contact_id && <input type="hidden" name="contact_id" value={related.contact_id} />}
        {related.opportunity_id && <input type="hidden" name="opportunity_id" value={related.opportunity_id} />}
        {related.lead_id && <input type="hidden" name="lead_id" value={related.lead_id} />}
        {related.case_id && <input type="hidden" name="case_id" value={related.case_id} />}
        {state.message && <Alert tone={state.offline ? "warning" : state.ok ? "success" : "error"}>{t(state.message)}</Alert>}
        {draft && !state.message && (
          <p className="help flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span><Tr>Recuperamos lo que estabas escribiendo y no alcanzaste a guardar.</Tr></span>
            <button type="button" className="link font-semibold" onClick={discard}><Tr>Descartar borrador</Tr></button>
          </p>
        )}
        <div>
          <label className="label" htmlFor="act-subject"><Tr>Asunto</Tr></label>
          <input id="act-subject" name="subject" className="input" defaultValue={initial("subject")} placeholder={t(placeholder[tab])} />
          {state.errors?.subject && <p className="error-text">{state.errors.subject}</p>}
        </div>
        {tab === "meeting" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="act-start"><Tr>Inicio</Tr></label>
              <input id="act-start" name="start_at" type="datetime-local" className="input" defaultValue={initial("start_at")} />
            </div>
            <div>
              <label className="label" htmlFor="act-duration"><Tr>Duración</Tr></label>
              <select key={initial("duration_minutes", "60")} id="act-duration" name="duration_minutes" className="select" defaultValue={initial("duration_minutes", "60")}>
                {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="act-location"><Tr>Lugar</Tr></label>
              <input id="act-location" name="location" className="input" defaultValue={initial("location")} placeholder={t("Obra, oficina del cliente, showroom, videollamada…")} />
            </div>
          </div>
        )}
        {tab === "call" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="act-result"><Tr>Resultado</Tr></label>
              <select key={initial("call_result")} id="act-result" name="call_result" className="select" defaultValue={initial("call_result")}>
                <option value="">—</option>
                {CALL_RESULTS.map((r) => <option key={r} value={r}>{value(r)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="act-mins"><Tr>Duración (min)</Tr></label>
              <AmountInput id="act-mins" name="duration_minutes" decimals={0} className="input num" defaultValue={initial("duration_minutes")} />
            </div>
          </div>
        )}
        {(tab === "task" || tab === "call") && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="act-due">{t(tab === "call" ? "Fecha" : "Fecha límite")}</label>
              <input id="act-due" name="due_date" type="date" className="input" defaultValue={initial("due_date")} />
            </div>
            <div>
              <label className="label" htmlFor="act-priority"><Tr>Prioridad</Tr></label>
              <select key={initial("priority", "normal")} id="act-priority" name="priority" className="select" defaultValue={initial("priority", "normal")}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{value(v)}</option>)}
              </select>
            </div>
          </div>
        )}
        <div>
          <label className="label" htmlFor="act-desc">{t(tab === "note" ? "Nota" : "Descripción")}</label>
          <textarea id="act-desc" name="description" className="textarea" defaultValue={initial("description")} rows={tab === "note" || tab === "email" ? 4 : 2} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {(tab === "task" || tab === "meeting") && (
              <select key={initial("owner_id", currentUserId)} name="owner_id" className="select h-8 w-auto text-xs" defaultValue={initial("owner_id", currentUserId)} aria-label={t("Asignar a")}>
                {users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.id === currentUserId ? t("Asignada a mí") : u.full_name}</option>)}
              </select>
            )}
            {tab === "call" && (
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <input type="checkbox" name="completed" defaultChecked={values?.completed === undefined || values.completed === "on"} className="accent-[var(--brand)]" /> <Tr>Ya realizada</Tr>
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

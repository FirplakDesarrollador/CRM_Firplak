"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { AmountInput } from "@/components/ui/AmountInput";
import { ACTIVITY_ICONS } from "@/components/ui/icons";
import { useT, useValueLabel } from "@/lib/i18n/client";
import { ACCOUNT_TYPES, CALL_RESULTS, INDUSTRIES, MARKETS, PRIORITIES } from "@/lib/objects/picklists";
import { newId } from "@/lib/offline/outbox";
import { addOutbox, requestSend, updateOutbox } from "@/lib/offline/store";
import type { OfflineAccount, OfflineOptions, OutboxItem } from "@/lib/offline/types";
import { closeForm, go } from "./route";
import { showNotice } from "./useOutbox";

// Formularios para crear sin señal. Lo que se guarda queda en la bandeja de salida del dispositivo con el mismo
// nombre de campo que usa el CRM: al volver la conexión, el servidor lo valida y lo guarda con sus reglas.

export type Errors = Record<string, string>;

/** Lo escrito en el formulario, sin espacios sobrantes ni campos vacíos. */
export function read(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form)) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) values[key] = text;
  }
  return values;
}

/** Lleva a la persona al primer campo con error. */
export function focusFirst(form: HTMLFormElement, errors: Errors) {
  const name = Object.keys(errors)[0];
  const field = name ? form.elements.namedItem(name) : null;
  if (field instanceof HTMLElement) field.focus();
}

/** Errores con que el CRM rechazó el registro, por campo. Los de campos que no están aquí van en `others`. */
export function serverErrors(item: OutboxItem | null, names: string[]) {
  const fields: Errors = {};
  const others: string[] = [];
  for (const error of item?.errors ?? []) {
    if (names.includes(error.field)) fields[error.field] = error.message;
    else others.push(`${error.label}: ${error.message}`);
  }
  return { fields, others };
}

export function savedNotice(t: (es: string) => string) {
  showNotice(navigator.onLine ? t("Guardado. Se está enviando al CRM.") : t("Guardado en este dispositivo. Se enviará cuando haya señal."));
}

/** Encabezado de un formulario. `bare`: el contenido trae sus propias tarjetas. */
export function Shell({ title, help, bare, children }: { title: string; help: string; bare?: boolean; children: React.ReactNode }) {
  const t = useT();
  return (
    <>
      <div>
        <button type="button" className="btn btn-sm btn-ghost -ml-2" onClick={closeForm}><ArrowLeft size={14} aria-hidden="true" /> {t("Volver")}</button>
        <h2 className="editorial mt-1 text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">{help}</p>
      </div>
      {bare ? children : <section className="card p-4">{children}</section>}
    </>
  );
}

export function Field({ id, label, error, required, className, children }: { id: string; label: string; error?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}{required && <span className="text-danger" aria-hidden="true"> *</span>}</label>
      {children}
      {error && <p id={`${id}-error`} className="error-text">{t(error)}</p>}
    </div>
  );
}

/** Atributos de un campo que puede tener error. */
export const invalid = (id: string, error: string | undefined) => ({ "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined });

export function Rejection({ item, others }: { item: OutboxItem | null; others: string[] }) {
  const t = useT();
  if (!item || item.status !== "rejected") return null;
  return (
    <Alert tone="error">
      <p>{t(item.reason ?? "El CRM no aceptó el registro.")}</p>
      {others.map((text) => <p key={text} className="mt-0.5 font-normal">{text}</p>)}
    </Alert>
  );
}

export function Actions({ saving, label }: { saving: boolean; label: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-1">
      <button type="button" className="btn" onClick={closeForm}>{t("Cancelar")}</button>
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t("Guardando…") : label}</button>
    </div>
  );
}

const CLIENT_FIELDS = ["name", "account_type", "industry", "market", "tax_id", "phone", "email", "billing_city", "billing_street", "description"];

export function OfflineClientForm({ userId, options, editing }: { userId: string; options: OfflineOptions | undefined; editing: OutboxItem | null }) {
  const t = useT();
  const label = useValueLabel();
  const rejected = serverErrors(editing, CLIENT_FIELDS);
  const [errors, setErrors] = useState<Errors>(rejected.fields);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const v = (name: string, fallback = "") => editing?.values[name] ?? fallback;
  const types = options?.account_type?.length ? options.account_type : ACCOUNT_TYPES;
  const channels = options?.industry?.length ? options.industry : INDUSTRIES;
  const markets = options?.market?.length ? options.market : MARKETS;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = read(form);
    const found: Errors = {};
    if (!values.name) found.name = "Escribe el nombre del cliente";
    if (!values.industry) found.industry = "Elige el canal";
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) found.email = "Revisa el correo: le falta algo";
    setErrors(found);
    if (Object.keys(found).length > 0) return focusFirst(form, found);
    setSaving(true);
    setFailed(false);
    try {
      if (editing) {
        await updateOutbox(editing.id, {
          values, title: values.name, status: "pending", reason: null, errors: undefined, duplicates: undefined, ignoreDuplicates: false,
        });
        requestSend();
        savedNotice(t);
        closeForm();
      } else {
        const id = newId();
        await addOutbox({
          id, userId, kind: "account", title: values.name, values, createdAt: Date.now(), status: "pending", reason: null, sentAt: null, attempts: 0, dependsOn: null,
        });
        requestSend();
        savedNotice(t);
        // Reemplaza el formulario por la ficha: «atrás» vuelve a la lista de clientes.
        go({ v: "clientes", c: id, f: null, e: null });
      }
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <Shell
      title={t(editing ? "Corregir cliente" : "Nuevo cliente")}
      help={t("Queda guardado en este dispositivo y se envía al CRM cuando haya conexión. Sus precios salen de la lista de su canal y mercado.")}
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(editing?.status === "rejected" || failed) && (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Rejection item={editing} others={rejected.others} />
            {failed && <Alert tone="error">{t("No se pudo guardar en este dispositivo. Revisa que el navegador tenga espacio y vuelve a intentar.")}</Alert>}
          </div>
        )}
        <Field id="sc-name" label={t("Nombre del cliente")} error={errors.name} required className="sm:col-span-2">
          <input id="sc-name" name="name" className="input" defaultValue={v("name")} autoComplete="off" maxLength={200} {...invalid("sc-name", errors.name)} />
        </Field>
        <Field id="sc-account_type" label={t("Tipo")} error={errors.account_type} required>
          <select id="sc-account_type" name="account_type" className="select" defaultValue={v("account_type", "Prospecto")} {...invalid("sc-account_type", errors.account_type)}>
            {types.map((option) => <option key={option} value={option}>{label(option)}</option>)}
          </select>
        </Field>
        <Field id="sc-industry" label={t("Canal")} error={errors.industry} required>
          <select id="sc-industry" name="industry" className="select" defaultValue={v("industry")} {...invalid("sc-industry", errors.industry)}>
            <option value="">{t("Elige un canal")}</option>
            {channels.map((option) => <option key={option} value={option}>{label(option)}</option>)}
          </select>
        </Field>
        <Field id="sc-market" label={t("Mercado")} error={errors.market}>
          <select id="sc-market" name="market" className="select" defaultValue={v("market", "Nacional")} {...invalid("sc-market", errors.market)}>
            {markets.map((option) => <option key={option} value={option}>{label(option)}</option>)}
          </select>
        </Field>
        <Field id="sc-tax_id" label="NIT" error={errors.tax_id}>
          <input id="sc-tax_id" name="tax_id" className="input num" defaultValue={v("tax_id")} autoComplete="off" maxLength={40} {...invalid("sc-tax_id", errors.tax_id)} />
        </Field>
        <Field id="sc-phone" label={t("Teléfono")} error={errors.phone}>
          <input id="sc-phone" name="phone" type="tel" inputMode="tel" className="input" defaultValue={v("phone")} autoComplete="off" maxLength={40} {...invalid("sc-phone", errors.phone)} />
        </Field>
        <Field id="sc-email" label={t("Correo")} error={errors.email}>
          <input id="sc-email" name="email" type="email" inputMode="email" className="input" defaultValue={v("email")} autoComplete="off" autoCapitalize="none" maxLength={200} {...invalid("sc-email", errors.email)} />
        </Field>
        <Field id="sc-billing_city" label={t("Ciudad")} error={errors.billing_city}>
          <input id="sc-billing_city" name="billing_city" className="input" defaultValue={v("billing_city")} autoComplete="off" maxLength={120} {...invalid("sc-billing_city", errors.billing_city)} />
        </Field>
        <Field id="sc-billing_street" label={t("Dirección")} error={errors.billing_street}>
          <input id="sc-billing_street" name="billing_street" className="input" defaultValue={v("billing_street")} autoComplete="off" maxLength={200} {...invalid("sc-billing_street", errors.billing_street)} />
        </Field>
        <Field id="sc-description" label={t("Notas")} error={errors.description} className="sm:col-span-2">
          <textarea id="sc-description" name="description" className="textarea" rows={3} defaultValue={v("description")} {...invalid("sc-description", errors.description)} />
        </Field>
        <div className="sm:col-span-2">
          <Actions saving={saving} label={t(editing ? "Guardar cambios" : "Guardar cliente")} />
        </div>
      </form>
    </Shell>
  );
}

const TABS = [
  { key: "task", label: "Tarea", placeholder: "Ej. Enviar cotización ajustada" },
  { key: "call", label: "Llamada", placeholder: "Ej. Seguimiento a la propuesta" },
  { key: "meeting", label: "Reunión", placeholder: "Ej. Visita técnica a la obra" },
  { key: "email", label: "Correo", placeholder: "Ej. Envío de catálogo de muebles de baño" },
  { key: "note", label: "Nota", placeholder: "Ej. Preferencias del cliente" },
] as const;

type Tab = (typeof TABS)[number]["key"];

const ACTIVITY_FIELDS = ["subject", "account_id", "start_at", "duration_minutes", "location", "call_result", "due_date", "priority", "description"];

export function OfflineActivityForm({ userId, accounts, outbox, editing, client }: {
  userId: string;
  /** Clientes entre los que se puede elegir: los descargados y los creados sin señal. */
  accounts: OfflineAccount[];
  outbox: OutboxItem[];
  editing: OutboxItem | null;
  /** Cliente desde cuya ficha se abrió el formulario. */
  client: string | null;
}) {
  const t = useT();
  const label = useValueLabel();
  const rejected = serverErrors(editing, ACTIVITY_FIELDS);
  const [errors, setErrors] = useState<Errors>(rejected.fields);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>(TABS.find((item) => item.key === editing?.values.activity_type)?.key ?? "task");
  const v = (name: string, fallback = "") => editing?.values[name] ?? fallback;
  const unsentClients = new Set(outbox.filter((item) => item.kind === "account" && item.status !== "sent").map((item) => item.id));
  const current = TABS.find((item) => item.key === tab)!;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = read(form);
    const found: Errors = {};
    if (!values.subject) found.subject = "Escribe un asunto";
    setErrors(found);
    if (Object.keys(found).length > 0) return focusFirst(form, found);
    // Si el cliente también está sin enviar, la actividad espera a que él llegue primero al CRM.
    const dependsOn = values.account_id && unsentClients.has(values.account_id) ? values.account_id : null;
    setSaving(true);
    setFailed(false);
    try {
      if (editing) {
        await updateOutbox(editing.id, { values, title: values.subject, status: "pending", reason: null, errors: undefined, duplicates: undefined, dependsOn });
      } else {
        await addOutbox({
          id: newId(), userId, kind: "activity", title: values.subject, values, createdAt: Date.now(), status: "pending", reason: null, sentAt: null, attempts: 0, dependsOn,
        });
      }
      requestSend();
      savedNotice(t);
      closeForm();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <Shell
      title={t(editing ? "Corregir actividad" : "Registrar actividad")}
      help={t("Queda guardada en este dispositivo y se envía al CRM cuando haya conexión.")}
    >
      {/* Los cinco tipos siempre a la vista, como en el CRM: ícono sobre la etiqueta. */}
      <div role="tablist" aria-label={t("Tipo de actividad")} className="grid grid-cols-5 gap-1 border-b border-line pb-2">
        {TABS.map((item) => {
          const Icon = ACTIVITY_ICONS[item.key];
          return (
            <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
              className="tab m-0 min-h-11 flex-col justify-center gap-0.5 px-1 py-1.5 text-xs" onClick={() => setTab(item.key)}>
              <Icon size={15} aria-hidden="true" /> {t(item.label)}
            </button>
          );
        })}
      </div>
      <form onSubmit={submit} noValidate className="space-y-3 pt-3">
        <input type="hidden" name="activity_type" value={tab} />
        <Rejection item={editing} others={rejected.others} />
        {failed && <Alert tone="error">{t("No se pudo guardar en este dispositivo. Revisa que el navegador tenga espacio y vuelve a intentar.")}</Alert>}
        <Field id="sa-subject" label={t("Asunto")} error={errors.subject} required>
          <input id="sa-subject" name="subject" className="input" defaultValue={v("subject")} placeholder={t(current.placeholder)} autoComplete="off" maxLength={200} {...invalid("sa-subject", errors.subject)} />
        </Field>
        <Field id="sa-account" label={t("Cliente")} error={errors.account_id}>
          <select id="sa-account" name="account_id" className="select" defaultValue={v("account_id", client ?? "")} {...invalid("sa-account", errors.account_id)}>
            <option value="">{t("Sin cliente")}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{unsentClients.has(a.id) ? ` · ${t("sin enviar")}` : ""}</option>)}
          </select>
        </Field>
        {tab === "meeting" && (
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field id="sa-start" label={t("Inicio")} error={errors.start_at}>
              <input id="sa-start" name="start_at" type="datetime-local" className="input" defaultValue={v("start_at")} {...invalid("sa-start", errors.start_at)} />
            </Field>
            <Field id="sa-duration" label={t("Duración")} error={errors.duration_minutes}>
              <select id="sa-duration" name="duration_minutes" className="select" defaultValue={v("duration_minutes", "60")}>
                {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
              </select>
            </Field>
            <Field id="sa-location" label={t("Lugar")} error={errors.location} className="col-span-2">
              <input id="sa-location" name="location" className="input" defaultValue={v("location")} placeholder={t("Obra, oficina del cliente, showroom, videollamada…")} autoComplete="off" />
            </Field>
          </div>
        )}
        {tab === "call" && (
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field id="sa-result" label={t("Resultado")} error={errors.call_result}>
              <select id="sa-result" name="call_result" className="select" defaultValue={v("call_result")}>
                <option value="">—</option>
                {CALL_RESULTS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
              </select>
            </Field>
            <Field id="sa-mins" label={t("Duración (min)")} error={errors.duration_minutes}>
              <AmountInput id="sa-mins" name="duration_minutes" decimals={0} className="input num" defaultValue={v("duration_minutes")} />
            </Field>
          </div>
        )}
        {(tab === "task" || tab === "call") && (
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <Field id="sa-due" label={t(tab === "call" ? "Fecha" : "Fecha límite")} error={errors.due_date}>
              <input id="sa-due" name="due_date" type="date" className="input" defaultValue={v("due_date")} {...invalid("sa-due", errors.due_date)} />
            </Field>
            <Field id="sa-priority" label={t("Prioridad")} error={errors.priority}>
              <select id="sa-priority" name="priority" className="select" defaultValue={v("priority", "normal")}>
                {Object.entries(PRIORITIES).map(([key, text]) => <option key={key} value={key}>{label(text)}</option>)}
              </select>
            </Field>
          </div>
        )}
        <Field id="sa-desc" label={t(tab === "note" ? "Nota" : "Descripción")} error={errors.description}>
          <textarea id="sa-desc" name="description" className="textarea" defaultValue={v("description")} rows={tab === "note" || tab === "email" ? 4 : 2} />
        </Field>
        {tab === "call" && (
          <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="completed" defaultChecked={!editing || editing.values.completed === "on"} className="h-4 w-4 accent-[var(--brand)]" /> {t("Ya realizada")}
          </label>
        )}
        <Actions saving={saving} label={t(tab === "note" ? "Guardar nota" : tab === "email" ? "Registrar correo" : "Guardar")} />
      </form>
    </Shell>
  );
}

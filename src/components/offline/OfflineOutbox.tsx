"use client";

import { useState } from "react";
import { Building2, ExternalLink, LogIn, Pencil, RotateCw, Send, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { ACTIVITY_ICONS } from "@/components/ui/icons";
import { formatDate, formatDateTime, plural } from "@/lib/format";
import { useLocale, useT, useValueLabel } from "@/lib/i18n/client";
import { ACTIVITY_TYPES } from "@/lib/objects/picklists";
import { unsent } from "@/lib/offline/outbox";
import { removeOutbox, requestSend, updateOutbox } from "@/lib/offline/store";
import { syncOutbox } from "@/lib/offline/sync";
import type { OutboxItem, OutboxStatus } from "@/lib/offline/types";
import { EmptyRow, Section, TYPE_TONE } from "./parts";
import { go } from "./route";

// La bandeja de salida: lo que se creó sin señal y su estado (pendiente, enviado o rechazado por el CRM).

const STATUS: Record<OutboxStatus, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "badge-warning" },
  sent: { label: "Enviado", cls: "badge-success" },
  rejected: { label: "Rechazado", cls: "badge-danger" },
};

export function StatusBadge({ status }: { status: OutboxStatus }) {
  const t = useT();
  return <span className={`badge ${STATUS[status].cls}`}>{t(STATUS[status].label)}</span>;
}

/** Marca de un registro que todavía no está en el CRM. Lo ya enviado no lleva marca. */
export function UnsentBadge({ item }: { item: OutboxItem | undefined }) {
  const t = useT();
  if (!item || item.status === "sent") return null;
  return item.status === "rejected" ? <StatusBadge status="rejected" /> : <span className="badge badge-warning">{t("Sin enviar")}</span>;
}

const edit = (item: OutboxItem) => go({ f: item.kind === "account" ? "cliente" : "actividad", e: item.id }, true);

/** Cuándo es la actividad, tal como la escribió la persona (las horas son de Colombia). */
function useWhen() {
  const t = useT();
  const locale = useLocale();
  return (item: OutboxItem) => {
    const { start_at: start, due_date: due } = item.values;
    if (start) return formatDateTime(`${start.length === 16 ? `${start}:00` : start}-05:00`, locale);
    if (due) return formatDate(due, locale);
    return `${t("Registrada")} ${formatDateTime(new Date(item.createdAt).toISOString(), locale)}`;
  };
}

/** Actividades registradas sin señal, para verlas en la agenda y en la ficha del cliente. */
export function LocalActivityList({ items, names, showClient = true }: { items: OutboxItem[]; names: Map<string, string>; showClient?: boolean }) {
  const t = useT();
  const when = useWhen();
  return (
    <ul className="divide-y divide-[var(--border)]">
      {items.map((item) => {
        const type = item.values.activity_type ?? "task";
        const Icon = ACTIVITY_ICONS[type as keyof typeof ACTIVITY_ICONS];
        const client = showClient && item.values.account_id ? names.get(item.values.account_id) : null;
        return (
          <li key={item.id} className="flex items-start gap-3 px-4 py-3">
            <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full ${TYPE_TONE[type] ?? TYPE_TONE.note}`}>
              {Icon && <Icon size={15} aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold [overflow-wrap:anywhere]">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted">{t(ACTIVITY_TYPES[type as keyof typeof ACTIVITY_TYPES] ?? type)} · {when(item)}</p>
              {item.values.description && <p className="mt-1 line-clamp-2 text-sm text-ink-2">{item.values.description}</p>}
              {client && <p className="mt-1 text-xs text-muted">{client}</p>}
            </div>
            <div className="flex flex-none flex-col items-end gap-1.5">
              <StatusBadge status={item.status} />
              {item.status !== "sent" && (
                <button type="button" className="link text-xs" onClick={() => edit(item)} aria-label={`${t("Editar")}: ${item.title}`}>{t("Editar")}</button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Row({ item, items, names, online }: { item: OutboxItem; items: OutboxItem[]; names: Map<string, string>; online: boolean }) {
  const t = useT();
  const label = useValueLabel();
  const when = useWhen();
  const [confirming, setConfirming] = useState(false);
  const type = item.values.activity_type ?? "task";
  const Icon = item.kind === "account" ? Building2 : ACTIVITY_ICONS[type as keyof typeof ACTIVITY_ICONS];
  const tone = item.kind === "account" ? "bg-brand-soft text-brand" : TYPE_TONE[type] ?? TYPE_TONE.note;
  const client = item.values.account_id ? names.get(item.values.account_id) : null;
  const detail = item.kind === "account"
    ? [t("Cliente nuevo"), item.values.industry ? label(item.values.industry) : null]
    : [t(ACTIVITY_TYPES[type as keyof typeof ACTIVITY_TYPES] ?? type), client, when(item)];
  const parent = item.dependsOn ? items.find((other) => other.id === item.dependsOn && other.status !== "sent") : undefined;
  const children = item.kind === "account" ? items.filter((other) => other.dependsOn === item.id && other.status !== "sent").length : 0;

  const retry = async (patch: Partial<OutboxItem>) => {
    await updateOutbox(item.id, { status: "pending", reason: null, errors: undefined, duplicates: undefined, ...patch });
    requestSend();
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full ${tone}`}>
          {Icon && <Icon size={15} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold [overflow-wrap:anywhere]">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted">{detail.filter(Boolean).join(" · ")}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      {item.status === "rejected" && (
        <div className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <p className="font-medium">{t(item.reason ?? "El CRM no aceptó el registro.")}</p>
          {item.errors?.map((error) => <p key={error.field}>{t(error.label)}: {t(error.message)}</p>)}
          {item.duplicates && item.duplicates.length > 0 && (
            <p>{t("Ya existe en el CRM")}: {item.duplicates.map((d) => d.label).join(", ")}</p>
          )}
        </div>
      )}
      {item.status === "pending" && parent && (
        <p className="mt-2 text-xs text-muted">
          {t(parent.status === "rejected" ? "Se enviará cuando se corrija y se envíe el cliente" : "Se enviará después del cliente")} «{parent.title}».
        </p>
      )}

      {item.status !== "sent" && !confirming && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={() => edit(item)}><Pencil size={13} aria-hidden="true" /> {t(item.status === "rejected" ? "Corregir" : "Editar")}</button>
          {item.status === "rejected" && item.duplicates && item.duplicates.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => void retry({ ignoreDuplicates: true })}><Send size={13} aria-hidden="true" /> {t("Enviar de todas formas")}</button>
          )}
          {item.status === "rejected" && !item.duplicates?.length && !item.errors?.length && (
            <button type="button" className="btn btn-sm" onClick={() => void retry({})}><RotateCw size={13} aria-hidden="true" /> {t("Reintentar")}</button>
          )}
          <button type="button" className="btn btn-sm btn-ghost text-danger" onClick={() => setConfirming(true)}><Trash2 size={13} aria-hidden="true" /> {t("Descartar")}</button>
        </div>
      )}
      {confirming && (
        <div className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2.5" role="group" aria-label={t("Descartar")}>
          <p className="text-sm font-medium">{t("¿Descartar este registro? No se enviará al CRM.")}</p>
          {children > 0 && (
            <p className="mt-0.5 text-sm text-muted">
              {t("También se descartará lo registrado para este cliente")}: {children} {t(plural(children, "actividad", "actividades"))}.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void removeOutbox(item.id)}>{t("Sí, descartar")}</button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>{t("Cancelar")}</button>
          </div>
        </div>
      )}
      {item.status === "sent" && item.kind === "account" && online && (
        <a className="link mt-2 inline-flex items-center gap-1 text-xs" href={`/cuentas/${item.id}`}><ExternalLink size={12} aria-hidden="true" /> {t("Ver en el CRM")}</a>
      )}
    </li>
  );
}

export function OfflineOutbox({ items, names, online, sessionUserId }: {
  items: OutboxItem[];
  /** Nombres de los clientes, descargados o creados aquí. */
  names: Map<string, string>;
  online: boolean;
  /** Quien tiene la sesión, confirmado por el servidor. Sin eso no se puede enviar. */
  sessionUserId: string | null;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const waiting = unsent(items);
  const pending = items.filter((item) => item.status === "pending");
  const rejected = items.filter((item) => item.status === "rejected");
  const sent = items.filter((item) => item.status === "sent").sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));

  const send = async () => {
    if (!sessionUserId) return;
    setBusy(true);
    try {
      const result = await syncOutbox(sessionUserId);
      setSignedOut(result.signedOut);
    } finally {
      setBusy(false);
    }
  };

  const group = (title: string, list: OutboxItem[]) => list.length > 0 && (
    <Section title={title} count={list.length}>
      <ul className="divide-y divide-[var(--border)]">
        {list.map((item) => <Row key={item.id} item={item} items={items} names={names} online={online} />)}
      </ul>
    </Section>
  );

  return (
    <>
      <section className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold">
            {waiting.length > 0
              ? `${waiting.length} ${t(plural(waiting.length, "registro sin enviar", "registros sin enviar"))}`
              : t(items.length > 0 ? "Todo está enviado." : "No hay nada por enviar.")}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {!online
              ? t("Sin señal: se enviarán solos cuando vuelva la conexión.")
              : t("Lo que creas sin señal se envía solo al CRM cuando hay conexión.")}
          </p>
        </div>
        {pending.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={busy || !online || !sessionUserId}>
            <Send size={15} aria-hidden="true" /> {busy ? t("Enviando…") : t("Enviar ahora")}
          </button>
        )}
      </section>
      {signedOut && (
        <>
          <Alert tone="warning">{t("Tu sesión se cerró. Inicia sesión para enviar lo pendiente: sigue guardado en este dispositivo.")}</Alert>
          <a href="/login" className="btn btn-primary self-start"><LogIn size={15} aria-hidden="true" /> {t("Iniciar sesión")}</a>
        </>
      )}
      {group(t("Rechazados"), rejected)}
      {group(t("Por enviar"), pending)}
      {group(t("Enviados"), sent)}
      {items.length === 0 && (
        <section className="card">
          <ul><EmptyRow>{t("Aquí verás los clientes y las actividades que crees sin señal, y si ya llegaron al CRM.")}</EmptyRow></ul>
        </section>
      )}
    </>
  );
}

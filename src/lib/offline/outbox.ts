// Ayudas para mostrar lo creado sin señal junto a lo descargado.

import { provisionalNumber, quoteTotals } from "./quotes";
import { addOutbox, removeOutbox, updateOutbox } from "./store";
import type { OfflineAccount, OfflineActivity, OutboxItem } from "./types";

/** Id para un registro nuevo. Es el que tendrá en el CRM, así reenviarlo no lo duplica. */
export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Un cliente creado sin señal, con la forma de los descargados. No tiene lista de precios propia: sus precios
 * salen de la lista de su canal y mercado, igual que en el CRM.
 */
export function accountFromOutbox(item: OutboxItem): OfflineAccount {
  const v = (name: string) => item.values[name] || null;
  return {
    id: item.id,
    name: item.values.name ?? item.title,
    account_number: null,
    account_type: v("account_type"),
    industry: v("industry"),
    market: v("market"),
    segment: null,
    tax_id: v("tax_id"),
    phone: v("phone"),
    email: v("email"),
    website: null,
    rating: null,
    payment_terms: null,
    price_book_id: null,
    sap_card_code: null,
    owner_id: item.userId,
    billing_street: v("billing_street"),
    billing_city: v("billing_city"),
    billing_state: null,
    billing_country: null,
    shipping_street: null,
    shipping_city: null,
    shipping_state: null,
    shipping_country: null,
  };
}

/** Lo que falta por enviar (pendiente o rechazado). */
export const unsent = (items: OutboxItem[]) => items.filter((item) => item.status !== "sent");

/** Número de una cotización hecha sin señal: el oficial si ya llegó al CRM; si no, el provisional. */
export const quoteNumber = (item: OutboxItem) => item.result?.number ?? provisionalNumber(item.id);

/** Totales de una cotización hecha sin señal, con los precios que se cotizaron. */
export const outboxQuoteTotals = (item: OutboxItem) => quoteTotals(item.lines ?? [], item.currency ?? "COP");

// ── Cambios a actividades que ya están en el CRM: completar y reprogramar sin señal ─────────────────────────

/**
 * El cambio vigente de cada actividad descargada. Uno ya enviado solo cuenta si se envió después de la descarga:
 * la descarga siguiente ya trae la actividad como quedó en el CRM.
 */
export function activityChanges(items: OutboxItem[], downloadedAt: number) {
  const changes = new Map<string, OutboxItem>();
  for (const item of items) {
    if (item.kind !== "change" || !item.values.activity_id) continue;
    if (item.status === "sent" && (item.sentAt ?? 0) <= downloadedAt) continue;
    changes.set(item.values.activity_id, item);
  }
  return changes;
}

/** Hora de Colombia escrita en un campo de fecha y hora («2026-11-20T09:30») como instante. */
const bogota = (local: string) => new Date(`${local.length === 16 ? `${local}:00` : local}-05:00`);

/** Las actividades descargadas como quedan con lo que la persona completó o reprogramó aquí. */
export function applyActivityChanges(activities: OfflineActivity[], changes: Map<string, OutboxItem>): OfflineActivity[] {
  if (changes.size === 0) return activities;
  return activities.map((activity) => {
    const change = changes.get(activity.id);
    if (!change) return activity;
    const next: OfflineActivity = { ...activity, local_change: change.status };
    if (change.values.complete === "true") next.status = "completed";
    if (change.values.due_date) next.due_date = change.values.due_date;
    if (change.values.start_at) {
      const start = bogota(change.values.start_at);
      // La reunión conserva su duración.
      if (activity.start_at && activity.end_at) {
        next.end_at = new Date(start.getTime() + (Date.parse(activity.end_at) - Date.parse(activity.start_at))).toISOString();
      }
      next.start_at = start.toISOString();
    }
    return next;
  });
}

/**
 * Guarda «completar» o «reprogramar» para una actividad descargada. Cada actividad tiene un solo cambio sin
 * enviar: el nuevo se suma al anterior (completar después de reprogramar conserva la fecha nueva).
 */
export async function saveActivityChange(
  userId: string,
  activity: Pick<OfflineActivity, "id" | "subject" | "activity_type" | "account_id">,
  patch: { complete?: true; due_date?: string; start_at?: string },
  previous: OutboxItem | undefined,
) {
  const fields: Record<string, string> = {};
  if (patch.complete) fields.complete = "true";
  if (patch.due_date) fields.due_date = patch.due_date;
  if (patch.start_at) fields.start_at = patch.start_at;
  if (previous && previous.status !== "sent") {
    await updateOutbox(previous.id, { values: { ...previous.values, ...fields }, status: "pending", reason: null, errors: undefined });
    return;
  }
  await addOutbox({
    id: newId(),
    userId,
    kind: "change",
    title: activity.subject,
    values: { activity_id: activity.id, activity_type: activity.activity_type, ...(activity.account_id ? { account_id: activity.account_id } : {}), ...fields },
    createdAt: Date.now(),
    status: "pending",
    reason: null,
    sentAt: null,
    attempts: 0,
    dependsOn: null,
  });
}

/** Deshace un cambio que todavía no se ha enviado. */
export const undoActivityChange = (change: OutboxItem) => removeOutbox(change.id);

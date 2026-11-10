// Ayudas para mostrar lo creado sin señal junto a lo descargado.

import { provisionalNumber, quoteTotals } from "./quotes";
import type { OfflineAccount, OutboxItem } from "./types";

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

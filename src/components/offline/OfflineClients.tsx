"use client";

import { useState } from "react";
import { ArrowLeft, ChevronRight, FileText, Mail, Pencil, Phone, Plus, Tags } from "lucide-react";
import { todayISO } from "@/lib/format";
import { useT, useValueLabel } from "@/lib/i18n/client";
import { defaultBook } from "@/lib/offline/prices";
import type { OfflineAccount, OfflineSnapshot, OutboxItem } from "@/lib/offline/types";
import { ActivityList, agendaGroups } from "./OfflineAgenda";
import { OpportunityList } from "./OfflineOpportunities";
import { LocalActivityList, UnsentBadge } from "./OfflineOutbox";
import { LocalQuoteList } from "./OfflineQuote";
import { EmptyRow, matches, SearchBox, Section } from "./parts";
import { go } from "./route";

const cityOf = (a: OfflineAccount) => a.billing_city ?? a.shipping_city;

function address(street: string | null, city: string | null, state: string | null, country: string | null) {
  return [street, [city, state].filter(Boolean).join(", "), country].filter(Boolean).join(" · ");
}

export function OfflineClients({ accounts, local }: {
  accounts: OfflineAccount[];
  /** Clientes creados sin señal en este dispositivo, por id. */
  local: Map<string, OutboxItem>;
}) {
  const t = useT();
  const label = useValueLabel();
  const [query, setQuery] = useState("");
  const found = accounts.filter((a) => matches(query, a.name, a.tax_id, a.sap_card_code, cityOf(a)));
  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-60">
          <SearchBox id="buscar-cliente" label={t("Buscar cliente por nombre, NIT o ciudad")} value={query} onChange={setQuery} />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => go({ f: "cliente", e: null }, true)}>
          <Plus size={15} aria-hidden="true" /> {t("Nuevo cliente")}
        </button>
      </div>
      <section className="card">
        <ul className="divide-y divide-[var(--border)]">
          {accounts.length === 0 && <EmptyRow>{t("Aún no tienes clientes asignados.")}</EmptyRow>}
          {accounts.length > 0 && found.length === 0 && <EmptyRow>{t("Ningún cliente coincide con la búsqueda.")}</EmptyRow>}
          {found.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                onClick={() => go({ c: a.id }, true)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{a.name}</span>
                  <span className="block truncate text-xs text-muted">{[a.industry ? label(a.industry) : null, cityOf(a)].filter(Boolean).join(" · ") || t("Sin canal ni ciudad")}</span>
                </span>
                <UnsentBadge item={local.get(a.id)} />
                <ChevronRight size={16} className="flex-none text-muted" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

export function OfflineClient({ account, snapshot, known, local, activities, quotes, names }: {
  account: OfflineAccount;
  snapshot: OfflineSnapshot;
  known: Set<string>;
  /** Si el cliente se creó sin señal en este dispositivo, su registro en la bandeja de salida. */
  local: OutboxItem | undefined;
  /** Actividades registradas sin señal para este cliente. */
  activities: OutboxItem[];
  /** Cotizaciones hechas sin señal para este cliente. */
  quotes: OutboxItem[];
  names: Map<string, string>;
}) {
  const t = useT();
  const label = useValueLabel();
  const contacts = snapshot.contacts.filter((c) => c.account_id === account.id);
  const opportunities = snapshot.opportunities.filter((o) => o.account_id === account.id);
  const groups = agendaGroups(snapshot.activities.filter((a) => a.account_id === account.id), todayISO());
  const book = defaultBook(account, snapshot.price_books);
  const billing = address(account.billing_street, account.billing_city, account.billing_state, account.billing_country);
  const shipping = address(account.shipping_street, account.shipping_city, account.shipping_state, account.shipping_country);
  const back = () => {
    // Si se llegó desde la lista u otra pestaña, «atrás» vuelve a ella; si se abrió directo, va a la lista.
    if ((window.history.state as { fp?: number } | null)?.fp) window.history.back();
    else go({ c: null });
  };
  return (
    <>
      <div>
        <button type="button" className="btn btn-sm btn-ghost -ml-2" onClick={back}><ArrowLeft size={14} aria-hidden="true" /> {t("Volver")}</button>
        <h2 className="editorial mt-1 text-2xl">{account.name}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {account.account_type && <span className="badge badge-brand">{label(account.account_type)}</span>}
          {account.industry && <span className="badge">{label(account.industry)}</span>}
          {account.market && <span className="badge">{label(account.market)}</span>}
          <UnsentBadge item={local} />
        </div>
        {local && local.status !== "sent" && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-sm text-muted">
              {t(local.status === "rejected" ? "El CRM no aceptó este cliente. Corrígelo para volver a enviarlo." : "Creado sin señal. Se enviará al CRM cuando haya conexión.")}
            </p>
            <button type="button" className="btn btn-sm" onClick={() => go({ f: "cliente", e: account.id }, true)}>
              <Pencil size={13} aria-hidden="true" /> {t(local.status === "rejected" ? "Corregir" : "Editar")}
            </button>
          </div>
        )}
      </div>

      <section className="card p-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {account.tax_id && <Field label="NIT"><span className="num">{account.tax_id}</span></Field>}
          {account.sap_card_code && <Field label={t("Código SAP")}><span className="num">{account.sap_card_code}</span></Field>}
          {account.phone && <Field label={t("Teléfono")}><a className="link" href={`tel:${account.phone}`}>{account.phone}</a></Field>}
          {account.email && <Field label={t("Correo")}><a className="link" href={`mailto:${account.email}`}>{account.email}</a></Field>}
          {account.payment_terms && <Field label={t("Condiciones de pago")}>{label(account.payment_terms)}</Field>}
          <Field label={t("Lista de precios")}>
            {book ? `${book.name} · ${book.currency}` : t("Sin lista de precios que le aplique")}
          </Field>
          {billing && <Field label={t("Dirección de facturación")}>{billing}</Field>}
          {shipping && <Field label={t("Dirección de entrega")}>{shipping}</Field>}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => go({ f: "actividad", e: null }, true)}>
            <Plus size={14} aria-hidden="true" /> {t("Registrar actividad")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => go({ f: "cotizacion", e: null }, true)}>
            <FileText size={14} aria-hidden="true" /> {t("Cotizar")}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => go({ v: "productos", p: `a:${account.id}`, c: null }, true)}>
            <Tags size={14} aria-hidden="true" /> {t("Ver precios de este cliente")}
          </button>
        </div>
      </section>

      {quotes.length > 0 && (
        <Section title={t("Cotizaciones hechas sin señal")} count={quotes.length}>
          <LocalQuoteList items={quotes} />
        </Section>
      )}

      {activities.length > 0 && (
        <Section title={t("Registradas sin señal")} count={activities.length}>
          <LocalActivityList items={activities} names={names} showClient={false} />
        </Section>
      )}

      <Section title={t("Contactos")} count={contacts.length}>
        <ul className="divide-y divide-[var(--border)]">
          {contacts.length === 0 && <EmptyRow>{t("Este cliente no tiene contactos.")}</EmptyRow>}
          {contacts.map((c) => {
            const phone = c.mobile ?? c.phone;
            return (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.full_name}</p>
                  {c.title && <p className="truncate text-xs text-muted">{c.title}</p>}
                  <p className="text-xs text-muted [overflow-wrap:anywhere]">{[phone, c.email].filter(Boolean).join(" · ") || (c.title ? null : t("Sin datos de contacto"))}</p>
                </div>
                {phone && <a className="btn btn-icon" href={`tel:${phone}`} aria-label={`${t("Llamar a")} ${c.full_name}`}><Phone size={16} /></a>}
                {c.email && <a className="btn btn-icon" href={`mailto:${c.email}`} aria-label={`${t("Escribir a")} ${c.full_name}`}><Mail size={16} /></a>}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t("Oportunidades abiertas")} count={opportunities.length}>
        <OpportunityList opportunities={opportunities} accounts={new Map()} showClient={false} empty={t("No tienes oportunidades abiertas con este cliente.")} />
      </Section>

      <Section title={t("Agenda")} count={groups.reduce((n, g) => n + g.items.length, 0)}>
        {groups.length === 0
          ? <ul><EmptyRow>{t("Nada pendiente con este cliente.")}</EmptyRow></ul>
          : <ActivityList groups={groups} known={known} showClient={false} />}
      </Section>
    </>
  );
}

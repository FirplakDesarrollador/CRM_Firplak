"use client";

import { ArrowLeft, ChevronRight, ExternalLink, Pencil } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import { outboxQuoteTotals, quoteNumber } from "@/lib/offline/outbox";
import { lineTotal, type QuoteTotals } from "@/lib/offline/quotes";
import type { OfflineSnapshot, OutboxItem, OutboxLine } from "@/lib/offline/types";
import { StatusBadge } from "./OfflineOutbox";
import { go } from "./route";

// Una cotización hecha sin señal, tal como la ve la persona antes y después de que llegue al CRM. Mientras no
// llega, lleva un número provisional: el oficial y el PDF salen del CRM.

/** De dónde salió el precio de una línea, cuando no es la lista propia del cliente. */
export function SourceBadge({ source }: { source: OutboxLine["source"] }) {
  const t = useT();
  if (source === "canal") return <span className="badge badge-info">{t("Precio de canal")}</span>;
  if (source === "manual") return <span className="badge badge-warning">{t("Precio manual")}</span>;
  return null;
}

/** Los totales, con la misma forma que en la cotización del CRM (sin flete: se agrega allá). */
export function QuoteTotalsBox({ totals, currency }: { totals: QuoteTotals; currency: string }) {
  const t = useT();
  const rows: [string, number, string?][] = [
    [t("Subtotal"), totals.subtotal],
    [t("Descuentos"), -totals.discount],
    [t("Total neto"), totals.net, "font-medium"],
    [`${t("IVA")} (${formatNumber(totals.taxRate)}%)`, totals.tax],
  ];
  return (
    <section className="glass p-5" aria-label={t("Totales")}>
      <p className="eyebrow">{t("Totales")}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {rows.map(([label, value, cls]) => (
          <div key={label} className={`flex justify-between gap-4 ${cls ?? ""}`}>
            <dt className="text-ink-2">{label}</dt>
            <dd className="num">{formatCurrency(value, currency)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line pt-3">
        <span className="text-sm text-ink-2">{t("Total con IVA")}</span>
        <span className="kpi-value kpi-value-sm">{formatCurrency(totals.total, currency)}</span>
      </div>
    </section>
  );
}

/** Cotizaciones hechas sin señal, para la ficha del cliente. */
export function LocalQuoteList({ items }: { items: OutboxItem[] }) {
  const t = useT();
  return (
    <ul className="divide-y divide-[var(--border)]">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
            onClick={() => go({ q: item.id }, true)}
            aria-label={`${t("Ver cotización")}: ${item.title}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold [overflow-wrap:anywhere]">{item.title}</span>
              <span className="num block text-xs text-muted">{quoteNumber(item)} · {formatCurrency(outboxQuoteTotals(item).total, item.currency ?? "COP")}</span>
            </span>
            <StatusBadge status={item.status} />
            <ChevronRight size={16} className="flex-none text-muted" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

const back = () => {
  // Si se llegó desde la ficha, la bandeja o el formulario, «atrás» vuelve allá; si se abrió directo, cierra.
  if ((window.history.state as { fp?: number } | null)?.fp) window.history.back();
  else go({ q: null });
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

export function OfflineQuote({ item, snapshot, names, online }: {
  item: OutboxItem | undefined;
  /** Lo descargado, para los nombres de la oportunidad y del contacto. Puede no haber. */
  snapshot: OfflineSnapshot | null;
  names: Map<string, string>;
  online: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  if (!item || item.kind !== "quote") {
    return (
      <>
        <Alert tone="info">{t("Esta cotización ya no está en este dispositivo.")}</Alert>
        <button type="button" className="btn self-start" onClick={back}><ArrowLeft size={14} aria-hidden="true" /> {t("Volver")}</button>
      </>
    );
  }
  const currency = item.currency ?? "COP";
  const lines = item.lines ?? [];
  const totals = outboxQuoteTotals(item);
  const sent = item.status === "sent";
  const official = item.result?.number ?? null;
  const changed = new Map((item.result?.changed ?? []).map((change) => [change.product_id, change]));
  const opportunity = item.values.opportunity_id ? snapshot?.opportunities.find((o) => o.id === item.values.opportunity_id)?.name : null;
  const contact = item.values.contact_id ? snapshot?.contacts.find((c) => c.id === item.values.contact_id)?.full_name : null;
  const waitsFor = item.dependsOn ? names.get(item.dependsOn) : null;
  const edit = () => go({ f: "cotizacion", e: item.id }, true);

  return (
    <>
      <div>
        <button type="button" className="btn btn-sm btn-ghost -ml-2" onClick={back}><ArrowLeft size={14} aria-hidden="true" /> {t("Volver")}</button>
        <h2 className="editorial mt-1 text-2xl [overflow-wrap:anywhere]">{item.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="badge num">{quoteNumber(item)}</span>
          {!official && <span className="badge">{t("Número provisional")}</span>}
          {sent ? <StatusBadge status="sent" /> : item.status === "rejected" ? <StatusBadge status="rejected" /> : <span className="badge badge-warning">{t("Sin enviar")}</span>}
        </div>
        {item.status === "pending" && (
          <p className="mt-2 text-sm text-muted">
            {t("Hecha sin señal. Cuando haya conexión se envía al CRM, que le pone el número oficial y genera el PDF.")}
            {waitsFor ? ` ${t("Se enviará después del cliente")} «${waitsFor}».` : ""}
          </p>
        )}
      </div>

      {item.status === "rejected" && (
        <Alert tone="error">
          <p>{t(item.reason ?? "El CRM no aceptó el registro.")}</p>
          {item.errors?.map((error) => <p key={error.field} className="mt-0.5 font-normal">{t(error.label)}: {t(error.message)}</p>)}
        </Alert>
      )}
      {sent && changed.size > 0 && (
        <Alert tone="warning">
          {t("Desde tu descarga cambió el precio de lista de")} {changed.size} {t(changed.size === 1 ? "producto" : "productos")}. {t("El CRM respetó el precio que cotizaste y dejó marcadas esas líneas.")}
        </Alert>
      )}

      <section className="card p-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label={t("Cliente")}>{names.get(item.values.account_id ?? "") ?? t("Cliente que ya no está descargado")}</Fact>
          <Fact label={t("Oportunidad")}>
            {item.values.opportunity_id
              ? opportunity ?? t("Oportunidad existente")
              : t(sent ? "Se creó una nueva con el nombre de la cotización" : "Se crea una nueva con el nombre de la cotización")}
          </Fact>
          {item.values.contact_id && <Fact label={t("Contacto")}>{contact ?? "—"}</Fact>}
          <Fact label={t("Moneda")}>{currency}</Fact>
          <Fact label={t("Hecha")}>{formatDateTime(new Date(item.createdAt).toISOString(), locale)}</Fact>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {!sent && (
            <button type="button" className="btn btn-sm btn-primary" onClick={edit}>
              <Pencil size={13} aria-hidden="true" /> {t(item.status === "rejected" ? "Corregir" : "Editar")}
            </button>
          )}
          {sent && online && (
            <a className="btn btn-sm btn-primary" href={`/cotizaciones/${item.id}`}><ExternalLink size={13} aria-hidden="true" /> {t("Ver en el CRM")}</a>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h3 className="card-title">{t("Productos")} <span className="badge num">{lines.length}</span></h3>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {lines.map((line) => {
            const change = changed.get(line.product_id);
            return (
              <li key={line.product_id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold [overflow-wrap:anywhere]">{line.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>{[line.code, line.unit].filter(Boolean).join(" · ")}</span>
                    <SourceBadge source={line.source} />
                  </p>
                  <p className="num mt-1 text-sm text-ink-2">
                    {formatNumber(line.quantity)} × {formatCurrency(line.unit_price, currency)}
                    {line.discount > 0 ? ` · ${t("Desc.")} ${formatNumber(line.discount)}%` : ""}
                  </p>
                  {change && (
                    <p className="mt-1 text-xs text-warning">
                      {t("Precio de lista al enviar")}: <span className="num">{formatCurrency(change.current, currency)}</span>. {t("Se respetó el cotizado.")}
                    </p>
                  )}
                </div>
                <span className="num flex-none font-semibold">{formatCurrency(lineTotal(line), currency)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <QuoteTotalsBox totals={totals} currency={currency} />

      {item.values.description && (
        <section className="card p-4">
          <p className="text-xs text-muted">{t("Observaciones")}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{item.values.description}</p>
        </section>
      )}
    </>
  );
}

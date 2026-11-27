"use client";

import { useActionState } from "react";
import { CalendarRange } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { moveDelivery, splitQuoteDeliveries } from "@/lib/records/phase2-actions";
import type { FormState } from "@/lib/records/form";
import type { QuoteLine } from "./QuoteLines";

/** Fecha de una entrega: al cambiarla, todas sus líneas pasan a la fecha nueva. */
function DeliveryRow({ quoteId, index, date, lines, total, units, currency, canEdit }: {
  quoteId: string; index: number; date: string; lines: number; total: number; units: number; currency: string; canEdit: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState(moveDelivery.bind(null, quoteId, date), {} as FormState);
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
      <p className="font-medium"><Tr>Entrega</Tr> {index}</p>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`entrega-${index}`}>{t("Fecha de la entrega")} {index}</label>
        <input id={`entrega-${index}`} type="date" name="delivery_date" defaultValue={date} disabled={!canEdit} className="input h-8 w-auto" required />
        {canEdit && <SubmitButton className="btn btn-sm" pendingText="…"><Tr>Cambiar fecha</Tr></SubmitButton>}
      </form>
      <p className="num text-sm text-muted">
        {formatNumber(units)} {t("unidades")} · {formatNumber(lines)} {t(lines === 1 ? "línea" : "líneas")} · <span className="font-medium text-ink">{formatCurrency(total, currency)}</span>
      </p>
      {state.message && <p className="error-text w-full">{t(state.message)}</p>}
    </li>
  );
}

/**
 * Entregas parciales de una cotización. El asesor cotiza las cantidades completas y, si el despacho va por partes,
 * parte toda la cotización en 2, 3 o 4 entregas con un clic: cada producto queda en una línea por entrega, con fechas
 * cada 30 días desde la «Entrega estimada» y el sobrante en la última. Después ajusta fechas (aquí, por entrega) y
 * cantidades (en cada línea). El pronóstico ubica cada entrega en su mes.
 */
export function PartialDeliveries({ quoteId, lines, quoteDate, canEdit, currency }: {
  quoteId: string; lines: QuoteLine[]; quoteDate: string | null; canEdit: boolean; currency: string;
}) {
  const t = useT();
  const [state, split] = useActionState(
    (_prev: FormState, fd: FormData) => splitQuoteDeliveries(quoteId, Number(fd.get("parts"))), {} as FormState);
  const byDate = new Map<string, { lines: number; total: number; units: number }>();
  for (const line of lines) {
    if (!line.delivery_date) continue;
    const current = byDate.get(line.delivery_date) ?? { lines: 0, total: 0, units: 0 };
    byDate.set(line.delivery_date, { lines: current.lines + 1, total: current.total + Number(line.line_total), units: current.units + Number(line.quantity) });
  }
  const deliveries = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const partial = deliveries.length > 0;
  if (!lines.length || (!canEdit && !partial)) return null;

  return (
    <section className="card overflow-hidden" aria-label={t("Entregas parciales")}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="card-title flex items-center gap-2"><CalendarRange size={16} /> <Tr>Entregas parciales</Tr>{partial && <span className="badge">{deliveries.length}</span>}</h2>
          <p className="text-xs text-muted">
            {partial
              ? t("Cada producto quedó en una línea por entrega. Cambia aquí la fecha de una entrega completa; la cantidad de cada entrega, en su línea.")
              : t("¿El despacho va por partes? Parte toda la cotización de una vez: las cantidades se reparten por igual (lo que sobra va a la última entrega) y las fechas quedan cada 30 días desde la entrega estimada.")}
          </p>
        </div>
        {canEdit && (
          <form action={split} className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">{partial ? t("Volver a partir en") : t("Partir en")}</span>
            {[2, 3, 4].map((n) => (
              <SubmitButton key={n} name="parts" value={String(n)} className="btn btn-sm" pendingText="…" aria-label={`${t("Partir en")} ${n} ${t("entregas")}`}>{n}</SubmitButton>
            ))}
            {partial && <SubmitButton name="parts" value="1" className="btn btn-sm btn-ghost" pendingText="…"><Tr>Una sola entrega</Tr></SubmitButton>}
          </form>
        )}
      </div>
      {state.message && <p className="error-text px-4 pb-3">{t(state.message)}</p>}
      {!partial && canEdit && !quoteDate && (
        <p className="border-t border-line px-4 py-2 text-xs text-muted"><Tr>Antes de partir, pon la «Entrega estimada» de la cotización (Editar): es la fecha de la primera entrega.</Tr></p>
      )}
      {partial && (
        <ul className="divide-y divide-[var(--border)] border-t border-line">
          {deliveries.map(([date, d], i) => (
            <DeliveryRow key={date} quoteId={quoteId} index={i + 1} date={date} lines={d.lines} total={d.total} units={d.units} currency={currency} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </section>
  );
}

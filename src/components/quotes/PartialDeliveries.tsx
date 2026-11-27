"use client";

import { useActionState } from "react";
import { CalendarRange, CheckCircle2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ConfirmSubmit } from "@/components/ui/ActionForm";
import { Tr } from "@/components/ui/Tr";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { moveDelivery, separateDelivery, splitQuoteDeliveries } from "@/lib/records/phase2-actions";
import type { FormState } from "@/lib/records/form";
import type { QuoteLine } from "./QuoteLines";

/** Máximo de entregas (el mismo de `public.split_quote_deliveries`). */
const MAX_PARTS = 12;

/** Fecha de una entrega: al cambiarla, todas sus líneas pasan a la fecha nueva. */
function DeliveryRow({ quoteId, index, date, lines, total, units, currency, canEdit, canSeparate }: {
  quoteId: string; index: number; date: string; lines: number; total: number; units: number; currency: string; canEdit: boolean;
  /** Hay más de una entrega y la cotización sigue abierta: esta se puede separar en su propia cotización. */
  canSeparate: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState(moveDelivery.bind(null, quoteId, date), {} as FormState);
  const [acceptState, accept] = useActionState(separateDelivery.bind(null, quoteId, date, true), {} as FormState);
  const [separateState, separate] = useActionState(separateDelivery.bind(null, quoteId, date, false), {} as FormState);
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
      {canSeparate && (
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <form action={separate}>
            <ConfirmSubmit className="btn btn-sm btn-ghost" message={`${t("¿Separar la entrega")} ${index} ${t("en otra cotización?")}`} confirmLabel="Separar"
              body="Sus líneas pasan a una cotización nueva con los mismos datos, precios y descuentos, en el mismo estado de esta. Esta queda con las demás entregas.">
              <Tr>Separar en otra cotización</Tr>
            </ConfirmSubmit>
          </form>
          <form action={accept}>
            <ConfirmSubmit className="btn btn-sm" message={`${t("¿El cliente aceptó la entrega")} ${index}?`} confirmLabel="Sí, la aceptó"
              body="Sus líneas pasan a una cotización nueva que queda Aceptada, lista para crear el pedido, y esa parte del negocio queda ganada. Esta cotización sigue abierta con las demás entregas.">
              <CheckCircle2 size={14} /> <Tr>El cliente aceptó esta entrega</Tr>
            </ConfirmSubmit>
          </form>
        </div>
      )}
      {(state.message || acceptState.message || separateState.message) && <p className="error-text w-full">{t(state.message ?? acceptState.message ?? separateState.message ?? "")}</p>}
    </li>
  );
}

/**
 * Entregas parciales de una cotización. El asesor cotiza las cantidades completas y, si el despacho va por partes,
 * parte toda la cotización en 2, 3 o 4 entregas con un clic (u otra cantidad, hasta 12): cada producto queda en una línea por entrega, con fechas
 * cada 30 días desde la «Entrega estimada» y el sobrante en la última. Después ajusta fechas (aquí, por entrega) y
 * cantidades (en cada línea). El pronóstico ubica cada entrega en su mes.
 */
export function PartialDeliveries({ quoteId, lines, quoteDate, canEdit, currency, status }: {
  quoteId: string; lines: QuoteLine[]; quoteDate: string | null; canEdit: boolean; currency: string; status: string;
}) {
  const t = useT();
  const [state, split] = useActionState(
    async (_prev: FormState, fd: FormData): Promise<FormState> => {
      // Los botones 2, 3 y 4 mandan su número; «Partir» manda el que se escribió en la casilla (hasta 12).
      const parts = fd.get("parts") === "custom" ? Number(fd.get("custom")) : Number(fd.get("parts"));
      if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) return { message: `Escribe un número de entregas entre 2 y ${MAX_PARTS}.` };
      return splitQuoteDeliveries(quoteId, parts);
    }, {} as FormState);
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
              <SubmitButton key={n} name="parts" value={String(n)} formNoValidate className="btn btn-sm" pendingText="…" aria-label={`${t("Partir en")} ${n} ${t("entregas")}`}>{n}</SubmitButton>
            ))}
            <span className="ml-1 text-xs text-muted">{t("u otra cantidad")}</span>
            <input type="number" name="custom" min={2} max={MAX_PARTS} step={1} inputMode="numeric" placeholder="5"
              className="input num h-8 w-16 px-2 text-center" aria-label={t("Otra cantidad de entregas")} />
            <SubmitButton name="parts" value="custom" className="btn btn-sm" pendingText="…"><Tr>Partir</Tr></SubmitButton>
            {partial && <SubmitButton name="parts" value="1" formNoValidate className="btn btn-sm btn-ghost" pendingText="…"><Tr>Una sola entrega</Tr></SubmitButton>}
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
            <DeliveryRow key={date} quoteId={quoteId} index={i + 1} date={date} lines={d.lines} total={d.total} units={d.units} currency={currency} canEdit={canEdit}
              canSeparate={canEdit && deliveries.length > 1 && ["Borrador", "Aprobada", "Presentada"].includes(status)} />
          ))}
        </ul>
      )}
    </section>
  );
}

import { Tr } from "@/components/ui/Tr";
import { formatCurrency } from "@/lib/format";
import type { QuoteLine } from "./QuoteLines";

/** Fecha en que se factura una entrega: la misma, o el mes siguiente si cae en el cierre de facturación del cliente o después (como `public.billing_date`). */
function billingMonth(delivery: string, cutoffDay: number | null) {
  const [y, m, d] = delivery.split("-").map(Number);
  const shift = cutoffDay !== null && d >= cutoffDay ? 1 : 0;
  const date = new Date(Date.UTC(y, m - 1 + shift, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * En qué meses cae esta cotización para el pronóstico: el valor de cada línea va al mes en que se entrega y factura
 * (su fecha o la de la cotización; corrido al mes siguiente si pasa del cierre de facturación del cliente).
 */
export function DeliveryMonths({ lines, quoteDate, cutoffDay, currency }: { lines: QuoteLine[]; quoteDate: string | null; cutoffDay: number | null; currency: string }) {
  const byMonth = new Map<string, number>();
  let undated = 0;
  for (const line of lines) {
    const date = line.delivery_date ?? quoteDate;
    if (!date) undated += Number(line.line_total);
    else byMonth.set(billingMonth(date, cutoffDay), (byMonth.get(billingMonth(date, cutoffDay)) ?? 0) + Number(line.line_total));
  }
  if (!lines.length) return null;
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  return (
    <section className="card p-4" aria-label="Pronóstico por mes de entrega">
      <p className="eyebrow"><Tr>Pronóstico por mes de entrega</Tr></p>
      <ul className="mt-2 space-y-1 text-sm">
        {months.map(([month, total]) => (
          <li key={month} className="flex items-baseline justify-between gap-3">
            <span className="capitalize">{MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</span>
            <span className="num font-medium">{formatCurrency(total, currency)}</span>
          </li>
        ))}
        {undated > 0 && (
          <li className="flex items-baseline justify-between gap-3 text-muted">
            <span><Tr>Sin fecha (va al cierre de la oportunidad)</Tr></span>
            <span className="num">{formatCurrency(undated, currency)}</span>
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-muted">
        <Tr>Valor neto, sin IVA, en el mes en que se entrega y factura.</Tr>
        {cutoffDay !== null && <> <Tr>El cliente cierra facturación el día</Tr> {cutoffDay}: <Tr>lo que se entrega ese día o después pasa al mes siguiente.</Tr></>}
      </p>
    </section>
  );
}

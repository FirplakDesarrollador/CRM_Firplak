import { formatCurrency, formatNumber } from "@/lib/format";

export function QuoteTotals({ q }: { q: Record<string, unknown> }) {
  const rows: [string, unknown, string?][] = [
    ["Subtotal", q.subtotal],
    ["Descuentos", -Number(q.discount_total ?? 0)],
    ["Total neto", q.net_total, "font-medium"],
    [`IVA (${formatNumber(Number(q.tax_rate ?? 0))}%)`, q.tax],
    ["Flete", q.shipping],
  ];
  return (
    <section className="glass p-5">
      <p className="eyebrow">Totales</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {rows.map(([label, value, cls]) => (
          <div key={label} className={`flex justify-between gap-4 ${cls ?? ""}`}>
            <dt className="text-ink-2">{label}</dt>
            <dd className="num">{formatCurrency(Number(value ?? 0))}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line pt-3">
        <span className="text-sm text-ink-2">Total</span>
        <span className="kpi-value text-[1.7rem]">{formatCurrency(Number(q.grand_total ?? 0))}</span>
      </div>
    </section>
  );
}

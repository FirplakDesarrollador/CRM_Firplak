import Link from "next/link";
import { Tr } from "@/components/ui/Tr";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { REAL_LAYERS } from "./real-layers";

export type BreakdownRow = { key: string; invoiced: number; backlog: number; opportunities: number };
export type BreakdownTab = { id: string; label: string; href: string; active: boolean };

const MAX_ROWS = 15;
const total = (r: BreakdownRow) => r.invoiced + r.backlog + r.opportunities;
const pct = (part: number, whole: number) => {
  if (!(whole > 0) || !(part > 0)) return "—";
  const p = (part / whole) * 100;
  return `${p >= 10 ? Math.round(p) : p.toFixed(1).replace(".", ",")} %`;
};

/**
 * El pronóstico real del periodo repartido por un corte (zona, canal, subgrupo o segmento, vendedor o país): cada fila
 * con sus tres capas en una barra y en cifras, su total y su participación. Las pestañas cambian el corte.
 */
export function RealBreakdown({ rows, tabs, note, t }: { rows: BreakdownRow[]; tabs: BreakdownTab[]; note?: string; t: (s: string) => string }) {
  const sorted = [...rows].sort((a, b) => total(b) - total(a));
  const shown = sorted.slice(0, MAX_ROWS);
  const rest = sorted.slice(MAX_ROWS);
  if (rest.length) {
    shown.push(rest.reduce<BreakdownRow>((acc, r) => ({ ...acc, invoiced: acc.invoiced + r.invoiced, backlog: acc.backlog + r.backlog, opportunities: acc.opportunities + r.opportunities }),
      { key: `${t("Otros")} (${rest.length})`, invoiced: 0, backlog: 0, opportunities: 0 }));
  }
  const whole = sorted.reduce((n, r) => n + Math.max(0, total(r)), 0);
  const max = Math.max(1, ...shown.map((r) => total(r)));
  const active = tabs.find((x) => x.active);
  return (
    <section id="composicion" className="card scroll-mt-24" aria-label={t("Composición del pronóstico")}>
      <div className="card-header flex-wrap gap-2">
        <h2 className="card-title"><Tr>Composición del pronóstico</Tr></h2>
        <nav aria-label={t("Corte")} className="segmented max-w-full flex-wrap">
          {tabs.map((tab) => (
            <Link key={tab.id} href={tab.href} scroll={false} aria-current={tab.active ? "page" : undefined}
              className={`btn btn-sm border-0 ${tab.active ? "bg-brand text-[var(--brand-contrast)] hover:bg-brand" : "btn-ghost"}`}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {shown.length === 0 ? <p className="p-6 text-center text-sm text-muted"><Tr>Sin datos en el periodo.</Tr></p> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{active?.label}</th>
                <th className="hidden min-w-40 sm:table-cell"><Tr>Composición</Tr></th>
                {REAL_LAYERS.map((l) => <th key={l.key} className="hidden text-right md:table-cell"><Tr>{l.label}</Tr></th>)}
                <th className="text-right"><Tr>Total</Tr></th>
                <th className="text-right"><Tr>Participación</Tr></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const sum = total(r);
                return (
                  <tr key={r.key}>
                    <td className="max-w-[11rem] truncate font-medium sm:max-w-56" title={r.key}>{r.key}</td>
                    <td className="hidden sm:table-cell">
                      <span className="flex h-3 gap-[2px]" role="img"
                        aria-label={REAL_LAYERS.map((l) => `${t(l.label)} ${formatCompactCurrency(r[l.key])}`).join(", ")}>
                        {REAL_LAYERS.map((l) => (r[l.key] > 0
                          ? <span key={l.key} className="h-full first:rounded-l-[3px] last:rounded-r-[3px]" style={{ width: `${(r[l.key] / max) * 100}%`, background: l.color }} />
                          : null))}
                      </span>
                    </td>
                    {REAL_LAYERS.map((l) => <td key={l.key} className="num hidden text-right md:table-cell" title={formatCurrency(r[l.key])}>{r[l.key] ? formatCompactCurrency(r[l.key]) : "—"}</td>)}
                    <td className="num text-right font-semibold" title={formatCurrency(sum)}>{formatCompactCurrency(sum)}</td>
                    <td className="num text-right text-ink-2">{pct(sum, whole)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {note && <p className="px-4 pb-3 pt-2 text-xs text-muted">{note}</p>}
    </section>
  );
}

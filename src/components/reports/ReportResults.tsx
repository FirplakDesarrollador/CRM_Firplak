import { BarList, ColumnChart, KpiTile } from "@/components/dashboard/Charts";
import { RelatedList } from "@/components/records/RelatedList";
import type { ObjectDef } from "@/lib/objects";
import type { ReportResult } from "@/lib/reports/engine";
import type { ReportDefinition } from "@/lib/reports/types";
import { formatCompactCurrency, formatCurrency, formatMillions, formatNumber, formatPercent } from "@/lib/format";
import { Alert } from "@/components/ui/Alert";

import { Tr } from "@/components/ui/Tr";
import { Val } from "@/components/ui/Val";
export function ReportResults({ def, report, result }: { def: ObjectDef; report: ReportDefinition; result: ReportResult }) {
  const fmtShort = (v: number) => (result.isMoney ? formatCompactCurrency(v) : formatNumber(Math.round(v * 10) / 10));
  const fmtLong = (v: number) => (result.isMoney ? formatCurrency(v) : formatNumber(Math.round(v * 100) / 100));
  const g1 = def.fields.find((f) => f.name === report.groupBy);
  const g2 = def.fields.find((f) => f.name === report.groupBy2);
  const items = result.groups.map((g) => ({ key: g.key, label: g.label, value: g.value }));
  const sumLike = (report.aggregate?.fn ?? "count") !== "avg";
  const detailColumns = def.defaultColumns.slice(0, 6);

  return (
    <div className="space-y-4">
      {result.error && <Alert tone="error">No se pudo ejecutar el informe: {result.error}</Alert>}
      {result.truncated && <Alert tone="warning">El informe usa los primeros {formatNumber(result.count)} registros. Agrega filtros para acotarlo.</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label={result.measureLabel} {...(result.isMoney ? formatMillions(result.total) : { value: formatNumber(Math.round(result.total * 10) / 10) })} />
        <KpiTile label="Registros" value={formatNumber(result.count)} />
        <KpiTile label="Grupos" value={g1 ? formatNumber(result.groups.length) : "—"} sub={g1 ? <><Tr>por</Tr> {g1.label.toLowerCase()}{g2 ? <> <Tr>y</Tr> {g2.label.toLowerCase()}</> : null}</> : "Sin agrupación"} />
      </div>

      {g1 && report.chart !== "table" && (
        <section className="glass">
          <div className="card-header"><h2 className="card-title"><Tr>{result.measureLabel}</Tr> <Tr>por</Tr> {g1.label.toLowerCase()}</h2></div>
          <div className="p-5">
            {report.chart === "column"
              ? <ColumnChart items={items} format={fmtShort} />
              : <BarList items={items.map((i) => ({ ...i, detail: `${i.label}: ${fmtLong(i.value)}` }))} format={fmtShort} />}
          </div>
        </section>
      )}

      {g1 && (
        <section className="card overflow-hidden">
          <div className="card-header"><h2 className="card-title"><Tr>Resumen</Tr></h2></div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{g1.label}</th>
                  {g2 && result.columns.map((c) => <th key={c.key} className="text-right"><Val>{c.label}</Val></th>)}
                  <th className="text-right">{g2 ? "Total" : result.measureLabel}</th>
                  <th className="text-right"><Tr>Registros</Tr></th>
                  {sumLike && <th className="text-right"><Tr>% del total</Tr></th>}
                </tr>
              </thead>
              <tbody>
                {result.groups.map((g) => (
                  <tr key={g.key}>
                    <td className="font-medium"><Val>{g.label}</Val></td>
                    {g2 && result.columns.map((c) => (
                      <td key={c.key} className="num text-right">{g.cells[c.key] ? fmtLong(g.cells[c.key].value) : <span className="text-muted">—</span>}</td>
                    ))}
                    <td className="num text-right font-medium">{fmtLong(g.value)}</td>
                    <td className="num text-right">{formatNumber(g.count)}</td>
                    {sumLike && <td className="num text-right">{result.total ? formatPercent((g.value / result.total) * 100) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-medium">
                  <td className="px-3 py-2"><Tr>Total</Tr></td>
                  {g2 && result.columns.map((c) => {
                    const cells = result.groups.map((g) => g.cells[c.key]).filter(Boolean);
                    const value = report.aggregate?.fn === "avg"
                      ? cells.reduce((s, x) => s + x.value * x.count, 0) / Math.max(1, cells.reduce((s, x) => s + x.count, 0))
                      : cells.reduce((s, x) => s + x.value, 0);
                    return <td key={c.key} className="num px-3 py-2 text-right">{fmtLong(value)}</td>;
                  })}
                  <td className="num px-3 py-2 text-right">{fmtLong(result.total)}</td>
                  <td className="num px-3 py-2 text-right">{formatNumber(result.count)}</td>
                  {sumLike && <td className="num px-3 py-2 text-right">100%</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <RelatedList def={def} title={`Registros${result.count > 50 ? " (primeros 50)" : ""}`} rows={result.rows.slice(0, 50)} columns={detailColumns}
        emptyText="Ningún registro cumple los filtros del informe." />
    </div>
  );
}

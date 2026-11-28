"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { AlVer } from "@/components/dashboard/AlVer";
import { Tr } from "@/components/ui/Tr";
import { useT } from "@/lib/i18n/client";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import type { SalesCountryCustomer, SalesSlice } from "@/lib/sap/sales";
import { groupName } from "./SapSalesExplorer";
import { Growth } from "./SapSalesTop";

/** Participación de una parte en un total, como «12,3 %» (sin decimales desde 10 %). Vacío si no hay total. */
export function share(part: number, whole: number) {
  if (!(whole > 0) || !(part > 0)) return "";
  const pct = (part / whole) * 100;
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1).replace(".", ",")} %`;
}

/**
 * Lista ordenada de un corte de las ventas (por asesor o por país): cada fila con su barra, su valor, su participación
 * en el total del corte y su crecimiento. Con `onOpen`, la fila se abre para ver su detalle.
 */
function SliceRows({ title, items, color, basis, detail }: {
  title: string; items: SalesSlice[]; color: string; basis: string;
  detail?: { open: Record<string, SalesCountryCustomer[] | "loading">; toggle: (key: string) => void };
}) {
  const t = useT();
  const total = items.reduce((n, i) => n + Math.max(0, Number(i.amount)), 0);
  const max = Math.max(1, ...items.map((i) => Number(i.amount)));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted"><Tr>Sin datos en el periodo.</Tr></p>;
  return (
    <AlVer><ul className={`gap-x-10 space-y-1.5 ${items.length > 6 ? "xl:columns-2" : ""}`} aria-label={title}>
      {items.map((item, i) => {
        const amount = Number(item.amount);
        const rows = detail?.open[item.key];
        const body = (
          <>
            {detail ? (rows ? <ChevronDown size={15} className="text-muted" /> : <ChevronRight size={15} className="text-muted" />) : <span className="num text-xs text-muted">{i + 1}</span>}
            <span className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium">{item.key}</span>
                <span className="shrink-0 text-xs text-muted">{item.customers} {t(item.customers === 1 ? "cliente" : "clientes")}</span>
              </span>
              <span className="chart-crece-x mt-1 block h-[6px] rounded-full" style={{ width: `${Math.max(amount > 0 ? 1.5 : 0, (Math.max(0, amount) / max) * 100)}%`, background: color, "--i": i } as React.CSSProperties} aria-hidden />
            </span>
            <span className="num whitespace-nowrap text-sm font-semibold" title={formatCurrency(amount)}>{formatCompactCurrency(amount)}</span>
            <span className="num whitespace-nowrap text-right text-xs font-medium text-ink-2" title={t("Participación")}>{share(amount, total)}</span>
            <span className="text-right"><Growth amount={amount} prev={item.prev === null ? null : Number(item.prev)} basis={basis} /></span>
          </>
        );
        const grid = "grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto_3rem_4rem] items-center gap-2 px-1 py-1 text-left";
        return (
          <li key={item.key} className="break-inside-avoid">
            {detail
              ? <button type="button" aria-expanded={Boolean(rows)} onClick={() => detail.toggle(item.key)} className={`${grid} rounded-lg hover:bg-[color-mix(in_srgb,var(--brand)_6%,transparent)]`}>{body}</button>
              : <div className={grid}>{body}</div>}
            {rows === "loading" && <p className="py-1 pl-8 text-xs text-muted"><Tr>Cargando…</Tr></p>}
            {Array.isArray(rows) && (
              <ul className="mb-2 ml-8 space-y-1 border-l border-line pl-3" aria-label={`${t("Principales clientes")} · ${item.key}`}>
                {rows.map((c) => (
                  <li key={c.key} className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-baseline gap-2 pr-1 text-sm">
                    <span className="truncate">{groupName(c.names ?? []) || c.key}{c.branches > 1 && <span className="ml-2 text-xs text-muted">{c.branches} {t("sucursales")}</span>}</span>
                    <span className="num whitespace-nowrap" title={formatCurrency(c.amount)}>{formatCompactCurrency(c.amount)}</span>
                    <span className="num whitespace-nowrap text-right text-xs text-ink-2">{share(c.amount, amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul></AlVer>
  );
}

/** Ventas por asesor: el vendedor de SAP de cada factura. */
export function SalesBySeller({ items, basis }: { items: SalesSlice[]; basis: string }) {
  const t = useT();
  return <SliceRows title={t("Ventas facturadas por asesor")} items={items} color="var(--brand)" basis={basis} />;
}

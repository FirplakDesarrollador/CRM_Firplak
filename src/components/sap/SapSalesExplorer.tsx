"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { ColumnChart } from "@/components/dashboard/Charts";
import { Tr } from "@/components/ui/Tr";
import { Fmt } from "@/components/ui/Fmt";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatCompactCurrency, formatCurrency, formatDate, formatMillions, formatMonth } from "@/lib/format";
import { loadSalesSummary, type SalesFilters, type SalesSummary } from "@/lib/sap/sales";
import { Growth, SapSalesTop, type SalesGroup } from "./SapSalesTop";

/** Nombre de un grupo de sucursales: lo que sus nombres de SAP tienen en común al principio («ALMACENES ACME S A S»). */
export function groupName(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  const words = names.map((n) => n.trim().split(/\s+/));
  const common: string[] = [];
  for (let i = 0; i < words[0].length; i++) {
    if (words.every((w) => w[i]?.toUpperCase() === words[0][i].toUpperCase())) common.push(words[0][i]); else break;
  }
  return common.length ? common.join(" ") : names[0];
}

/** Barras que se pueden tocar para filtrar: lo elegido queda marcado y lo demás, atenuado. */
function PickBars({ title, items, picked, onToggle, color }: {
  title: string; items: { key: string; amount: number }[]; picked: string[]; onToggle: (key: string) => void; color: string;
}) {
  const t = useT();
  const max = Math.max(1, ...items.map((i) => Number(i.amount)));
  if (!items.length) return <p className="py-6 text-center text-sm text-muted"><Tr>Sin datos en el periodo.</Tr></p>;
  return (
    <ul className="space-y-1" aria-label={title}>
      {items.map((item) => {
        const on = picked.includes(item.key);
        const dim = picked.length > 0 && !on;
        return (
          <li key={item.key}>
            <button type="button" aria-pressed={on} onClick={() => onToggle(item.key)} title={`${formatCurrency(Number(item.amount))} · ${t(on ? "Toca para quitar el filtro" : "Toca para filtrar")}`}
              className={`grid w-full grid-cols-[minmax(6rem,11rem)_1fr] items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-opacity hover:bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] ${on ? "bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]" : ""} ${dim ? "opacity-45" : ""}`}>
              <span className={`truncate text-sm ${on ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>{item.key}</span>
              <span className="flex items-center gap-2">
                <span className="h-[18px] rounded-r-[4px]" style={{ width: `${Math.max(Number(item.amount) > 0 ? 1.5 : 0, (Math.max(0, Number(item.amount)) / max) * 82)}%`, background: color }} />
                <span className="num whitespace-nowrap text-xs font-semibold text-ink">{formatCompactCurrency(Number(item.amount))}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ventas reales de SAP con gráficos que se filtran entre sí: al tocar un canal o una zona, lo demás
 * (meses, zonas o canales, y clientes que más compraron) muestra solo lo de esa selección.
 */
export function SapSalesExplorer({ initial, from, to, owner }: { initial: SalesSummary; from: string; to: string; owner: string | null }) {
  const t = useT();
  const locale = useLocale();
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState<SalesFilters>({ channels: [], zones: [] });
  const [loading, start] = useTransition();

  const apply = (next: SalesFilters) => {
    setFilters(next);
    start(async () => {
      const fresh = await loadSalesSummary(from, to, owner, next).catch(() => null);
      if (fresh) setData(fresh);
    });
  };
  const toggle = (dimension: keyof SalesFilters, key: string) => {
    const current = filters[dimension];
    apply({ ...filters, [dimension]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key] });
  };
  const active = [...filters.channels.map((k) => ({ dimension: "channels" as const, key: k })), ...filters.zones.map((k) => ({ dimension: "zones" as const, key: k }))];

  const c = data.compare;
  // Contra qué se compara el crecimiento, dicho en una línea.
  const basis = !c.available ? t("Sin datos del periodo de comparación")
    : c.mode === "average" ? `${t("Frente al promedio mensual de")} ${c.from.slice(0, 4)}`
      : `${t("Frente al mismo periodo del año anterior")} (${formatDate(c.from, locale)} – ${formatDate(c.to, locale)})`;
  const groups: SalesGroup[] = data.top.map((g) => ({
    key: g.key, amount: Number(g.amount), prev: g.prev === null ? null : Number(g.prev), branches: g.branches,
    name: g.crm_name ?? (groupName(g.names ?? []) || g.key),
  }));
  const total = formatMillions(Number(data.total));
  // La lista se vuelve a montar con cada selección: las filas abiertas eran de la selección anterior.
  const topKey = `${filters.channels.join("|")}/${filters.zones.join("|")}`;

  return (
    <section className="space-y-4" aria-label={t("Ventas reales (SAP)")} aria-busy={loading}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-medium"><Tr>Ventas reales (SAP)</Tr></h2>
        <p className="text-xs text-muted"><Tr>Facturación neta: facturas menos notas crédito, sin IVA.</Tr> · <Tr>Actualizado</Tr> <Fmt datetime={data.loaded_at} /></p>
      </div>
      <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm" aria-live="polite">
        {active.length === 0 ? <span className="text-muted"><Tr>Toca un canal o una zona para ver solo sus ventas; puedes elegir varios.</Tr></span> : (
          <>
            <span className="text-muted"><Tr>Viendo solo</Tr>:</span>
            {active.map((f) => (
              <button key={`${f.dimension}:${f.key}`} type="button" className="badge badge-info inline-flex items-center gap-1" onClick={() => toggle(f.dimension, f.key)}
                aria-label={`${t("Quitar filtro")} ${f.key}`}>{f.key} <X size={12} aria-hidden /></button>
            ))}
            <button type="button" className="link text-sm" onClick={() => apply({ channels: [], zones: [] })}><Tr>Quitar filtros</Tr></button>
          </>
        )}
      </div>
      <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="glass">
            <div className="card-header flex-wrap gap-2">
              <h3 className="card-title"><Tr>Ventas facturadas por mes</Tr></h3>
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span><span className="num text-lg font-medium">{total.value}</span> <span className="text-muted">{total.unit} · {data.invoices} {t("facturas")} · {data.customers} {t("clientes")}</span></span>
                <Growth amount={Number(data.total)} prev={data.total_prev === null ? null : Number(data.total_prev)} basis={basis} />
              </p>
            </div>
            <div className="p-4">
              <ColumnChart format={formatCompactCurrency} items={data.by_month.map((m) => ({ key: m.month, label: formatMonth(m.month, locale), value: Math.max(0, Number(m.amount)) }))} />
            </div>
          </section>
          <section className="card">
            <div className="card-header"><h3 className="card-title"><Tr>Ventas facturadas por canal</Tr></h3></div>
            <div className="p-3"><PickBars title={t("Ventas facturadas por canal")} items={data.by_channel} picked={filters.channels} onToggle={(k) => toggle("channels", k)} color="var(--brand)" /></div>
          </section>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="card">
            <div className="card-header flex-wrap gap-2">
              <h3 className="card-title"><Tr>Clientes que más compraron</Tr></h3>
              <span className="text-xs text-muted">{basis}</span>
            </div>
            <div className="p-4">
              <SapSalesTop key={topKey} groups={groups} from={from} to={to} owner={owner} filters={filters} basis={basis} />
              <p className="mt-3 text-xs text-muted"><Tr>Las sucursales de un mismo cliente van sumadas; abre una fila para ver cada una.</Tr></p>
            </div>
          </section>
          <section className="card">
            <div className="card-header"><h3 className="card-title"><Tr>Ventas facturadas por zona</Tr></h3></div>
            <div className="p-3"><PickBars title={t("Ventas facturadas por zona")} items={data.by_zone} picked={filters.zones} onToggle={(k) => toggle("zones", k)} color="var(--accent)" /></div>
          </section>
        </div>
      </div>
    </section>
  );
}

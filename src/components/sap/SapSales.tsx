import { BarList, ColumnChart } from "@/components/dashboard/Charts";
import { Fmt } from "@/components/ui/Fmt";
import { Tr } from "@/components/ui/Tr";
import { createClient } from "@/lib/supabase/server";
import { formatCompactCurrency, formatCurrency, formatMillions, formatMonth } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { SapSalesTop, type SalesGroup } from "./SapSalesTop";

type Summary = {
  total: number; invoices: number; customers: number; loaded_at: string | null;
  by_month: { month: string; amount: number }[];
  by_channel: { key: string; amount: number }[];
  by_zone: { key: string; amount: number }[];
  top: { key: string; amount: number; branches: number; names: string[] | null; crm_name: string | null }[];
};

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

/** Ventas reales de SAP (facturación neta) del periodo: total, por mes, por canal, por zona y los clientes que más compraron. */
export async function SapSalesSection({ from, to, owner }: { from: string; to: string; owner: string | null }) {
  const [supabase, t, locale] = await Promise.all([createClient(), getT(), getLocale()]);
  const { data } = await supabase.rpc("sap_sales_summary", { p_from: from, p_to: to, p_top: 15, p_owner: owner ?? undefined });
  const s = data as unknown as Summary | null;
  // Sin ninguna carga del agente no hay nada que mostrar.
  if (!s?.loaded_at) return null;
  const groups: SalesGroup[] = s.top.map((g) => ({ key: g.key, amount: Number(g.amount), branches: g.branches, name: g.crm_name ?? (groupName(g.names ?? []) || g.key) }));
  const total = formatMillions(Number(s.total));

  return (
    <section className="space-y-4" aria-label={t("Ventas reales (SAP)")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-medium"><Tr>Ventas reales (SAP)</Tr></h2>
        <p className="text-xs text-muted"><Tr>Facturación neta: facturas menos notas crédito, sin IVA.</Tr> · <Tr>Actualizado</Tr> <Fmt datetime={s.loaded_at} /></p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="glass">
          <div className="card-header flex-wrap gap-2">
            <h3 className="card-title"><Tr>Ventas facturadas por mes</Tr></h3>
            <p className="text-sm"><span className="num text-lg font-medium">{total.value}</span> <span className="text-muted">{total.unit} · {s.invoices} {t("facturas")} · {s.customers} {t("clientes")}</span></p>
          </div>
          <div className="p-4">
            <ColumnChart format={formatCompactCurrency} items={s.by_month.map((m) => ({ key: m.month, label: formatMonth(m.month, locale), value: Math.max(0, Number(m.amount)) }))} />
          </div>
        </section>
        <section className="card">
          <div className="card-header"><h3 className="card-title"><Tr>Ventas facturadas por canal</Tr></h3></div>
          <div className="p-4"><BarList items={s.by_channel.map((c) => ({ key: c.key, label: c.key, value: Math.max(0, Number(c.amount)), detail: formatCurrency(Number(c.amount)) }))} /></div>
        </section>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card">
          <div className="card-header flex-wrap gap-2">
            <h3 className="card-title"><Tr>Clientes que más compraron</Tr></h3>
            <span className="text-xs text-muted"><Tr>Las sucursales de un mismo cliente van sumadas; abre una fila para ver cada una.</Tr></span>
          </div>
          <div className="p-4"><SapSalesTop groups={groups} from={from} to={to} owner={owner} /></div>
        </section>
        <section className="card">
          <div className="card-header"><h3 className="card-title"><Tr>Ventas facturadas por zona</Tr></h3></div>
          <div className="p-4"><BarList items={s.by_zone.map((z) => ({ key: z.key, label: z.key, value: Math.max(0, Number(z.amount)), color: "var(--accent)", detail: formatCurrency(Number(z.amount)) }))} /></div>
        </section>
      </div>
    </section>
  );
}

/** Ventas de una cuenta en los últimos doce meses; una cuenta principal suma las de sus sucursales. */
export async function SapAccountSales({ accountId }: { accountId: string }) {
  const [supabase, t, locale] = await Promise.all([createClient(), getT(), getLocale()]);
  const { data } = await supabase.rpc("sap_account_sales", { p_account: accountId });
  const rows = (data ?? []).map((r) => ({ month: r.month, amount: Number(r.amount), branches: Number(r.branches) }));
  if (!rows.length) return null;
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const branches = Math.max(...rows.map((r) => r.branches));
  return (
    <section className="card overflow-hidden">
      <div className="card-header flex-wrap gap-2">
        <h2 className="card-title"><Tr>Ventas facturadas, últimos 12 meses</Tr></h2>
        <span className="text-sm"><span className="num font-medium">{formatCurrency(total)}</span>{branches > 1 && <span className="text-muted"> · {t("suma de")} {branches} {t("sucursales")}</span>}</span>
      </div>
      <div className="p-4">
        <ColumnChart format={formatCompactCurrency} items={rows.map((r) => ({ key: r.month, label: formatMonth(r.month, locale), value: Math.max(0, r.amount) }))} />
      </div>
    </section>
  );
}

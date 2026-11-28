import { ColumnChart } from "@/components/dashboard/Charts";
import { Tr } from "@/components/ui/Tr";
import { createClient } from "@/lib/supabase/server";
import { formatCompactCurrency, formatCurrency, formatMonth } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { loadSalesSummary, type SalesMarket } from "@/lib/sap/sales";
import { SapSalesExplorer } from "./SapSalesExplorer";

/** Ventas reales de SAP (facturación neta) del periodo; los gráficos se filtran entre sí (ver SapSalesExplorer). */
export async function SapSalesSection({ from, to, owner, market = null }: { from: string; to: string; owner: string | null; market?: SalesMarket }) {
  const summary = await loadSalesSummary(from, to, owner, { channels: [], zones: [] }, market);
  // Sin ninguna carga del agente no hay nada que mostrar.
  if (!summary?.loaded_at) return null;
  // La clave reinicia la selección cuando cambia el periodo o el asesor.
  return <SapSalesExplorer key={`${from}/${to}/${owner ?? ""}/${market ?? ""}`} initial={summary} from={from} to={to} owner={owner} market={market} />;
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

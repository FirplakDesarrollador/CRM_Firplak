import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ObjectIcon } from "@/components/ui/icons";
import { BarList, Funnel, KpiCell, KpiGroup, KpiTile, MonthlyColumns } from "@/components/dashboard/Charts";
import { StageBadge } from "@/components/records/FieldValue";
import { createClient } from "@/lib/supabase/server";
import { getUsers } from "@/lib/records/data";
import { canSystem } from "@/lib/permissions";
import { ACTIVITY_TYPES } from "@/lib/objects/picklists";
import { addDaysISO, formatCompactCurrency, formatCurrency, formatMillions, formatNumber, formatPercent, plural, todayISO } from "@/lib/format";
import { PERIODS, resolvePeriod } from "@/lib/periods";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { DashboardFilters } from "./DashboardFilters";
import { GoalSummary } from "@/components/goals/GoalSummary";
import { SapSalesSection } from "@/components/sap/SapSales";
import type { GoalPeriodType } from "@/lib/goals/periods";

import { Tr } from "@/components/ui/Tr";
import { Fmt } from "@/components/ui/Fmt";
import { Val } from "@/components/ui/Val";
export const metadata: Metadata = { title: "Indicadores" };

type FunnelStage = Dashboard["funnel"][number];
/** Un embudo por pipeline: cada canal de venta el suyo (crm_funnels). */
type PipelineFunnel = { id: string; name: string; channel: string | null; market: string; is_default: boolean; stages: FunnelStage[] };

type Dashboard = {
  kpis: Record<string, number | null>;
  funnel: { id: string; name: string; color: string; category: string; count: number; amount: number; probability: number; sort_order: number }[];
  by_owner: { owner_id: string; owner_name: string; won_amount: number; won_count: number; open_amount: number; open_count: number; lost_count: number }[];
  by_month: { month: string; won_amount: number; won_count: number; created_amount: number }[];
  by_source: { source: string; count: number; amount: number }[];
  activities_by_type: { activity_type: string; count: number }[];
  pipeline_id: string;
};

export default async function DashboardPage({ searchParams }: PageProps<"/indicadores">) {
  const t = await getT();
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  if (!canSystem(user.access, "view_dashboards")) redirect("/inicio");
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const { from, to, period } = resolvePeriod(one(sp.periodo) || "this_year", one(sp.desde), one(sp.hasta));
  const owner = one(sp.asesor) || null;

  const users = await getUsers();

  const supabase = await createClient();
  const today = todayISO();
  let closingQuery = supabase
    .from("opportunities")
    .select("id, name, amount, close_date, account:accounts!opportunities_account_id_fkey(name), stage:pipeline_stages!opportunities_stage_id_fkey(name, color, category), owner:profiles!opportunities_owner_id_fkey(full_name)")
    .eq("is_closed", false)
    .lte("close_date", addDaysISO(today, 30))
    .order("amount", { ascending: false })
    .limit(8);
  if (owner) closingQuery = closingQuery.eq("owner_id", owner);

  const [{ data: raw, error }, { data: closing }, { data: extraRaw }, { data: funnelsRaw }] = await Promise.all([
    supabase.rpc("crm_dashboard", { p_from: from, p_to: to, p_owner: owner ?? undefined }),
    closingQuery,
    supabase.rpc("crm_dashboard_extra", { p_from: from, p_to: to, p_owner: owner ?? undefined }),
    supabase.rpc("crm_funnels", { p_from: from, p_to: to, p_owner: owner ?? undefined }),
  ]);
  // Los pipelines de un canal siempre; uno sin canal solo si tiene oportunidades.
  const funnels = ((funnelsRaw ?? []) as unknown as PipelineFunnel[])
    .filter((f) => f.channel || f.stages.some((s) => Number(s.count) > 0));
  // Un embudo sin oportunidades abiertas ni ganadas se resume en una línea en vez de etapas en $0.
  const funnelTitle = (f: PipelineFunnel) => (f.channel ? `${f.channel} · ${t(f.market)}` : f.name);
  const activeFunnels = funnels.filter((f) => f.stages.some((s) => Number(s.count) > 0));
  const emptyFunnels = funnels.filter((f) => !activeFunnels.includes(f));
  const x = (extraRaw ?? {}) as Record<string, number | null>;
  const xn = (key: string) => Number(x[key] ?? 0);
  const d = raw as unknown as Dashboard | null;
  const k = d?.kpis ?? {};
  const n = (key: string) => Number(k[key] ?? 0);
  const canPickOwner = user.access.isAdmin || Boolean(user.access.permissions.opportunities?.view_all) || Boolean(user.roleId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object="dashboard" />
          <div>
            <h1 className="text-xl font-medium">{t("Indicadores")} · {t(PERIODS[period])} · <Fmt date={from} /> – <Fmt date={to} /></h1>
          </div>
        </div>
        <DashboardFilters period={period} from={from} to={to} owner={owner ?? "all"}
          users={users.filter((u) => u.is_active).map((u) => ({ id: u.id, name: u.full_name }))} canPickOwner={canPickOwner} />
      </div>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">No se pudieron calcular los indicadores: {error.message}</p>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Ventas ganadas" {...formatMillions(n("won_amount"))} sub={`${n("won_count")} ${t(plural(n("won_count"), "oportunidad ganada", "oportunidades ganadas"))}`} tone="success" />
        <KpiTile label="Pipeline abierto" {...formatMillions(n("open_amount"))}
          sub={`${n("open_count")} ${t(plural(n("open_count"), "abierta · ponderado", "abiertas · ponderado"))} ${formatCompactCurrency(n("weighted_amount"))}`} />
        <KpiTile label="Tasa de éxito" value={k.win_rate === null || k.win_rate === undefined ? "—" : formatPercent(k.win_rate)}
          sub={`${n("won_count")} ${t(plural(n("won_count"), "ganada /", "ganadas /"))} ${n("lost_count")} ${t(plural(n("lost_count"), "perdida", "perdidas"))}`} />
        <KpiTile label="Ticket promedio" {...formatMillions(n("avg_deal"))}
          sub={k.avg_cycle_days ? `${t("Ciclo de venta:")} ${formatNumber(k.avg_cycle_days)} ${t(plural(k.avg_cycle_days, "día", "días"))}` : t("Sin cierres en el periodo")} />
      </div>

      {(() => {
        const goalType: GoalPeriodType | null = period === "this_month" || period === "last_month" ? "month"
          : period === "this_quarter" ? "quarter" : period === "this_year" ? "year" : null;
        return goalType ? <GoalSummary type={goalType} start={from} userId={owner ?? undefined} perUser={!owner} /> : null;
      })()}

      <KpiGroup id="seguimiento" title="Seguimiento comercial" className="xl:grid-cols-4">
        <KpiCell label="Nuevas oportunidades" value={formatNumber(n("new_count"))} sub={`${formatCompactCurrency(n("new_amount"))} ${t("creadas en el periodo")}`} />
        <KpiCell label="Cierran en el periodo" value={formatNumber(n("closing_this_period"))}
          sub={n("overdue_close") ? `${n("overdue_close")} ${t("con fecha de cierre vencida")}` : t("Ninguna con cierre vencido")} tone={n("overdue_close") ? "danger" : undefined} />
        <KpiCell label="Actividades completadas" value={formatNumber(n("activities_completed"))} sub={`${n("meetings_upcoming")} ${t(plural(n("meetings_upcoming"), "reunión en los próximos 7 días", "reuniones en los próximos 7 días"))}`} />
        <KpiCell label="Tareas vencidas" value={formatNumber(n("tasks_overdue"))} sub={n("tasks_overdue") ? "Requieren seguimiento" : "Al día"}
          tone={n("tasks_overdue") ? "warning" : "success"} />
      </KpiGroup>

      <KpiGroup id="antes-y-despues" title="Prospectos, cotizaciones, pedidos y casos" className="sm:grid-cols-3 xl:grid-cols-5">
        <KpiCell label="Prospectos nuevos" value={formatNumber(xn("leads_new"))} sub={`${xn("leads_open")} ${t(plural(xn("leads_open"), "prospecto abierto en total", "prospectos abiertos en total"))}`} />
        <KpiCell label="Conversión de prospectos" value={x.lead_conversion_rate === null || x.lead_conversion_rate === undefined ? "—" : formatPercent(x.lead_conversion_rate)}
          sub={`${xn("leads_converted")} ${t(plural(xn("leads_converted"), "convertido en el periodo", "convertidos en el periodo"))}`} />
        <KpiCell label="Cotizaciones abiertas" {...formatMillions(xn("quotes_open_amount"))} sub={`${xn("quotes_open")} ${t(plural(xn("quotes_open"), "cotización ·", "cotizaciones ·"))} ${xn("quotes_accepted")} ${t(plural(xn("quotes_accepted"), "aceptada en el periodo", "aceptadas en el periodo"))}`} />
        <KpiCell label="Pedidos en curso" {...formatMillions(xn("orders_in_progress_amount"))}
          sub={`${xn("orders_in_progress")} ${t(plural(xn("orders_in_progress"), "pedido ·", "pedidos ·"))} ${xn("orders_delivered")} ${t(plural(xn("orders_delivered"), "entregado en el periodo", "entregados en el periodo"))}`} />
        <KpiCell label="Casos abiertos" value={formatNumber(xn("cases_open"))}
          sub={xn("cases_high") ? `${xn("cases_high")} ${t("de prioridad alta")}` : x.avg_resolution_days ? `${t("Resolución promedio:")} ${formatNumber(x.avg_resolution_days)} ${t(plural(x.avg_resolution_days, "día", "días"))}` : t("Sin casos de prioridad alta")}
          tone={xn("cases_high") ? "warning" : undefined} />
      </KpiGroup>

      <section aria-labelledby="embudos" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="embudos" className="text-base font-medium"><Tr>Embudos de ventas por mercado y canal</Tr></h2>
          <p className="text-xs text-muted"><Tr>Etapas abiertas: oportunidades actuales. Ganada: cerradas en el periodo.</Tr></p>
        </div>
        {funnels.length === 0 && <p className="glass p-6 text-center text-sm text-muted"><Tr>Sin pipelines activos.</Tr></p>}
        <div className={`grid gap-4 ${activeFunnels.length > 1 ? "lg:grid-cols-2" : ""} ${activeFunnels.length > 2 && activeFunnels.length % 2 ? "2xl:grid-cols-3" : ""}`}>
          {activeFunnels.map((f) => (
            <section key={f.id} className="glass" aria-label={`${t("Embudo")} ${funnelTitle(f)}`}>
              <div className="card-header">
                <h3 className="card-title">{f.channel ? <><Val>{f.channel}</Val> · <Val>{f.market}</Val></> : <Val>{f.name}</Val>}</h3>
                {f.channel && <span className="text-xs text-muted"><Val>{f.name}</Val></span>}
              </div>
              <div className="p-4"><Funnel stages={f.stages} /></div>
            </section>
          ))}
        </div>
        {emptyFunnels.length > 0 && (
          <div className="grid gap-2 pt-2 lg:grid-cols-2">
            {emptyFunnels.map((f) => (
              <section key={f.id} className="glass flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3" aria-label={`${t("Embudo")} ${funnelTitle(f)}`}>
                <h3 className="card-title">{f.channel ? <><Val>{f.channel}</Val> · <Val>{f.market}</Val></> : <Val>{f.name}</Val>}</h3>
                <p className="text-sm text-muted"><Tr>Sin oportunidades abiertas ni ganadas en el periodo</Tr></p>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="glass">
        <div className="card-header"><h2 className="card-title"><Tr>Ventas ganadas por mes</Tr></h2></div>
        <div className="p-4"><MonthlyColumns data={d?.by_month ?? []} /></div>
      </section>

      {/* Ventas reales de SAP (si el agente ya las cargó): lo facturado, frente a lo que el CRM da por ganado. */}
      <SapSalesSection from={from} to={to} owner={owner} />

      <section className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title"><Tr>Ventas por asesor</Tr></h2></div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th><Tr>Asesor</Tr></th><th className="w-[28%]"><Tr>Ganado en el periodo</Tr></th><th className="text-right"><Tr>Ganadas</Tr></th><th className="text-right"><Tr>Perdidas</Tr></th>
                <th className="text-right"><Tr>Tasa de éxito</Tr></th><th className="text-right"><Tr>Pipeline abierto</Tr></th><th className="text-right"><Tr>Abiertas</Tr></th>
              </tr>
            </thead>
            <tbody>
              {(d?.by_owner ?? []).length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted"><Tr>Sin datos para el periodo.</Tr></td></tr>}
              {(() => {
                const max = Math.max(1, ...(d?.by_owner ?? []).map((o) => Number(o.won_amount)));
                return (d?.by_owner ?? []).map((o) => {
                  const closed = o.won_count + o.lost_count;
                  return (
                    <tr key={o.owner_id}>
                      <td className="font-semibold">
                        <Link className="link" href={`/indicadores?${new URLSearchParams({ ...(sp as Record<string, string>), asesor: o.owner_id })}`}>{o.owner_name}</Link>
                      </td>
                      <td>
                        <span className="flex items-center gap-2" title={formatCurrency(o.won_amount)}>
                          <span className="h-[14px] rounded-r-[4px] bg-success" style={{ width: `${Math.max(o.won_amount ? 2 : 0, (o.won_amount / max) * 70)}%` }} />
                          <span className="num text-xs font-semibold">{formatCompactCurrency(o.won_amount)}</span>
                        </span>
                      </td>
                      <td className="num text-right">{o.won_count}</td>
                      <td className="num text-right">{o.lost_count}</td>
                      <td className="num text-right">{closed ? formatPercent((o.won_count / closed) * 100) : "—"}</td>
                      <td className="num text-right">{formatCompactCurrency(o.open_amount)}</td>
                      <td className="num text-right">{o.open_count}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="card xl:col-span-2 xl:self-start">
          <div className="card-header">
            <h2 className="card-title"><Tr>Oportunidades que cierran en 30 días</Tr></h2>
            <Link href="/oportunidades/pipeline" className="btn btn-sm btn-ghost"><Tr>Ver pipeline</Tr></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th><Tr>Oportunidad</Tr></th><th><Tr>Etapa</Tr></th><th className="text-right"><Tr>Valor</Tr></th><th><Tr>Cierre</Tr></th><th><Tr>Asesor</Tr></th></tr></thead>
              <tbody>
                {(closing ?? []).length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted"><Tr>Ninguna oportunidad abierta cierra en los próximos 30 días.</Tr></td></tr>}
                {(closing ?? []).map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/oportunidades/${o.id}`} className="link">{o.name}</Link><p className="text-xs text-muted">{o.account?.name}</p></td>
                    <td><StageBadge stage={o.stage as never} /></td>
                    <td className="num text-right">{formatCurrency(o.amount)}</td>
                    <td className={o.close_date < today ? "font-semibold text-danger" : undefined}><Fmt date={o.close_date} /></td>
                    <td>{o.owner?.full_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="space-y-4">
          <section className="card">
            <div className="card-header"><h2 className="card-title"><Tr>Ventas por origen</Tr></h2></div>
            <div className="p-4">
              <BarList items={(d?.by_source ?? []).map((s) => ({ key: s.source, label: s.source, value: Number(s.amount), detail: `${s.count} ganadas · ${formatCurrency(s.amount)}` }))} />
            </div>
          </section>
          <section className="card">
            <div className="card-header"><h2 className="card-title"><Tr>Actividades completadas</Tr></h2></div>
            <div className="p-4">
              <BarList format={(v) => formatNumber(v)} emptyText="Sin actividades completadas en el periodo."
                items={(d?.activities_by_type ?? []).sort((a, b) => b.count - a.count).map((a) => ({
                  key: a.activity_type, label: ACTIVITY_TYPES[a.activity_type] ?? a.activity_type, value: Number(a.count), color: "var(--accent)",
                }))} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

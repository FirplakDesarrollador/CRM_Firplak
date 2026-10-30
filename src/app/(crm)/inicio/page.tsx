import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { KpiTile } from "@/components/dashboard/Charts";
import { ActivityItem } from "@/components/activities/ActivityItem";
import { getMyOpenActivities, getUpcomingMeetings } from "@/components/activities/data";
import { StageBadge } from "@/components/records/FieldValue";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, formatCompactCurrency, formatCurrency, formatDate, formatDateTime, formatMillions, todayISO } from "@/lib/format";
import { resolvePeriod } from "@/lib/periods";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { GoalSummary } from "@/components/goals/GoalSummary";
import { periodStart } from "@/lib/goals/periods";

import { Tr } from "@/components/ui/Tr";
export const metadata: Metadata = { title: "Inicio" };

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("es-CO", { hour: "numeric", hour12: false, timeZone: "America/Bogota" }).format(new Date()));
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function HomePage() {
  const t = await getT();
  const user = await requireUser();
  const today = todayISO();
  const month = resolvePeriod("this_month");
  const supabase = await createClient();

  const [{ data: dash }, tasks, meetings, { data: opps }, { data: recent }] = await Promise.all([
    supabase.rpc("crm_dashboard", { p_from: month.from, p_to: month.to, p_owner: user.id }),
    getMyOpenActivities(user.id, { until: addDaysISO(today, 1), limit: 12 }),
    getUpcomingMeetings(user.id, new Date().toISOString(), `${addDaysISO(today, 7)}T23:59:59-05:00`),
    supabase
      .from("opportunities")
      .select("id, name, amount, close_date, account:accounts!opportunities_account_id_fkey(name), stage:pipeline_stages!opportunities_stage_id_fkey(name, color, category)")
      .eq("owner_id", user.id)
      .eq("is_closed", false)
      .order("close_date")
      .limit(8),
    supabase
      .from("accounts")
      .select("id, name, account_type, billing_city, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);
  const k = ((dash as { kpis?: Record<string, number> } | null)?.kpis ?? {}) as Record<string, number>;
  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow"><Tr>Inicio</Tr></p>
        <h1 className="editorial mt-1 text-3xl">{greeting()}, {firstName}</h1>
        <p className="text-sm text-muted">Este es tu resumen de {new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`))}.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Mis ventas del mes" {...formatMillions(k.won_amount ?? 0)} sub={`${k.won_count ?? 0} ${t("oportunidades ganadas")}`} tone="success" />
        <KpiTile label="Mi pipeline abierto" {...formatMillions(k.open_amount ?? 0)} sub={`${k.open_count ?? 0} ${t("oportunidades · ponderado")} ${formatCompactCurrency(k.weighted_amount ?? 0)}`} />
        <KpiTile label="Cierran este mes" value={String(k.closing_this_period ?? 0)} sub={k.overdue_close ? `${k.overdue_close} ${t("con cierre vencido")}` : t("Ninguna vencida")} tone={k.overdue_close ? "danger" : undefined} />
        <KpiTile label="Tareas vencidas" value={String(k.tasks_overdue ?? 0)} sub={`${k.meetings_upcoming ?? 0} ${t("reuniones esta semana")}`} tone={k.tasks_overdue ? "warning" : "success"} />
      </div>

      <GoalSummary type="month" start={periodStart("month", today)} userId={user.id} />

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="card xl:col-span-2">
          <div className="card-header">
            <h2 className="card-title"><Tr>Mis oportunidades abiertas</Tr></h2>
            <Link href="/oportunidades/pipeline?owner=me" className="btn btn-sm btn-ghost"><Tr>Pipeline</Tr> <ArrowRight size={14} /></Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th><Tr>Oportunidad</Tr></th><th><Tr>Etapa</Tr></th><th className="text-right"><Tr>Valor</Tr></th><th><Tr>Cierre</Tr></th></tr></thead>
              <tbody>
                {(opps ?? []).length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-muted"><Tr>No tienes oportunidades abiertas.</Tr> <Link href="/oportunidades/nueva" className="link"><Tr>Crea una</Tr></Link>.</td></tr>
                )}
                {(opps ?? []).map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/oportunidades/${o.id}`} className="link">{o.name}</Link><p className="text-xs text-muted">{o.account?.name}</p></td>
                    <td><StageBadge stage={o.stage as never} /></td>
                    <td className="num text-right">{formatCurrency(o.amount)}</td>
                    <td className={o.close_date < today ? "font-semibold text-danger" : undefined}>{formatDate(o.close_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title"><Tr>Para hoy</Tr></h2>
            <Link href="/actividades" className="btn btn-sm btn-ghost"><Tr>Agenda</Tr> <ArrowRight size={14} /></Link>
          </div>
          <ul className="divide-y divide-[var(--border)] px-4">
            {tasks.length === 0 && <li className="py-8 text-center text-sm text-muted"><Tr>Nada pendiente para hoy.</Tr></li>}
            {tasks.map((a) => <ActivityItem key={a.id} activity={a} />)}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card">
          <div className="card-header"><h2 className="card-title"><Tr>Próximas reuniones</Tr></h2></div>
          <ul className="divide-y divide-[var(--border)]">
            {meetings.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted"><Tr>Sin reuniones en los próximos 7 días.</Tr></li>}
            {meetings.slice(0, 6).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.subject}</p>
                  <p className="truncate text-xs text-muted">{m.location ?? m.account?.name ?? ""}</p>
                </div>
                <span className="badge badge-accent whitespace-nowrap">{formatDateTime(m.start_at)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <div className="card-header">
            <h2 className="card-title"><Tr>Mis cuentas recientes</Tr></h2>
            <Link href="/cuentas?scope=mine" className="btn btn-sm btn-ghost"><Tr>Ver todas</Tr> <ArrowRight size={14} /></Link>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {(recent ?? []).length === 0 && <li className="px-4 py-8 text-center text-sm text-muted"><Tr>Aún no tienes cuentas asignadas.</Tr></li>}
            {(recent ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <Link href={`/cuentas/${a.id}`} className="link">{a.name}</Link>
                  <p className="text-xs text-muted">{[a.account_type, a.billing_city].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="text-xs text-muted">{formatDate(a.updated_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

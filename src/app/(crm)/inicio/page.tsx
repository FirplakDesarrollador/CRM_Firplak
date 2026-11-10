import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { KpiTile } from "@/components/dashboard/Charts";
import { ObjectIcon } from "@/components/ui/icons";
import { ActivityItem } from "@/components/activities/ActivityItem";
import { getMyOpenActivities, getUpcomingMeetings } from "@/components/activities/data";
import { StageBadge } from "@/components/records/FieldValue";
import { after } from "next/server";
import { createClient, mcpSession } from "@/lib/supabase/server";
import { ms365Configured } from "@/lib/ms365/config";
import { getConnection } from "@/lib/ms365/graph";
import { syncIsDue, syncUser } from "@/lib/ms365/sync";
import { addDaysISO, formatCompactCurrency, formatCurrency, formatMillions, plural, todayISO } from "@/lib/format";
import { resolvePeriod } from "@/lib/periods";
import { requireUser } from "@/lib/session";
import { getLocale, getT } from "@/lib/i18n/server";
import { GoalSummary } from "@/components/goals/GoalSummary";
import { periodStart } from "@/lib/goals/periods";

import { Tr } from "@/components/ui/Tr";
import { Fmt } from "@/components/ui/Fmt";
import { InstallBanner } from "@/components/pwa/InstallApp";
import { PrepareDayCard } from "@/components/offline/PrepareDayCard";
export const metadata: Metadata = { title: "Inicio" };

function greeting(locale: "es" | "en") {
  const hour = Number(new Intl.DateTimeFormat("es-CO", { hour: "numeric", hour12: false, timeZone: "America/Bogota" }).format(new Date()));
  if (locale === "en") return hour < 12 ? "Good morning" : hour < 19 ? "Good afternoon" : "Good evening";
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function HomePage() {
  const t = await getT();
  const locale = await getLocale();
  const user = await requireUser();
  const today = todayISO();
  const month = resolvePeriod("this_month");
  const supabase = await createClient();

  // Microsoft 365: si toca, se sincroniza después de enviar la página (no la hace esperar).
  if (ms365Configured() && syncIsDue(await getConnection(user.id))) {
    const { data: session } = await supabase.auth.getSession();
    const accessToken = session.session?.access_token;
    if (accessToken) {
      after(() => mcpSession.run({ accessToken }, () => syncUser(user.id))
        .catch((e) => console.error("Microsoft 365: sincronización en segundo plano", (e as Error).message)));
    }
  }

  const [{ data: dash }, tasks, meetings, { data: opps }, { data: recent }, { count: approvals }] = await Promise.all([
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
    supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("approver_id", user.id).eq("status", "pending"),
  ]);
  const k = ((dash as { kpis?: Record<string, number> } | null)?.kpis ?? {}) as Record<string, number>;
  const firstName = user.fullName.split(" ")[0];

  // En el celular el asesor llega entre visitas: primero lo que hay que hacer hoy, después las cifras. Las
  // secciones van en una columna flexible con orden propio; desde xl vuelven a su grilla y su orden de siempre.
  return (
    <div className="flex flex-col gap-5">
      <InstallBanner />
      <div>
        <h1 className="editorial text-3xl">{greeting(locale)}, {firstName}</h1>
        <p className="text-sm text-muted">{t("Este es tu resumen de")} {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { month: "long", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`))}.</p>
      </div>
      <PrepareDayCard linkToOffline />

      {Boolean(approvals) && (
        <Link href="/aprobaciones" className="glass flex items-center justify-between gap-3 px-5 py-3 no-underline hover:text-ink">
          <span className="flex items-center gap-3">
            <ObjectIcon object="approvals" size={16} />
            <span className="font-semibold">{approvals} {t(approvals === 1 ? "solicitud espera tu aprobación" : "solicitudes esperan tu aprobación")}</span>
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold text-brand"><Tr>Revisar</Tr> <ArrowRight size={14} /></span>
        </Link>
      )}

      <div className="order-2 grid grid-cols-2 gap-3 xl:order-none xl:grid-cols-4">
        <KpiTile label="Mis ventas del mes" {...formatMillions(k.won_amount ?? 0)} sub={`${k.won_count ?? 0} ${t(plural(k.won_count, "oportunidad ganada", "oportunidades ganadas"))}`} tone="success" />
        <KpiTile label="Mi pipeline abierto" {...formatMillions(k.open_amount ?? 0)} sub={`${k.open_count ?? 0} ${t(plural(k.open_count, "oportunidad · ponderado", "oportunidades · ponderado"))} ${formatCompactCurrency(k.weighted_amount ?? 0)}`} />
        <KpiTile label="Cierran este mes" value={String(k.closing_this_period ?? 0)} sub={k.overdue_close ? `${k.overdue_close} ${t("con cierre vencido")}` : t("Ninguna vencida")} tone={k.overdue_close ? "danger" : undefined} />
        <KpiTile label="Tareas vencidas" value={String(k.tasks_overdue ?? 0)} sub={k.tasks_overdue ? t("Requieren seguimiento") : t("Al día")} tone={k.tasks_overdue ? "warning" : "success"} />
      </div>

      <div className="order-3 xl:order-none"><GoalSummary type="month" start={periodStart("month", today)} userId={user.id} /></div>

      <div className="contents xl:grid xl:grid-cols-3 xl:gap-4">
        <section className="card order-4 xl:order-none xl:col-span-2">
          <div className="card-header">
            <h2 className="card-title"><Tr>Mis oportunidades abiertas</Tr></h2>
            <Link href="/oportunidades/pipeline?owner=me" className="btn btn-sm btn-ghost"><Tr>Pipeline</Tr> <ArrowRight size={14} /></Link>
          </div>
          {/* En el celular, una lista: nombre y cuenta, etapa, valor y cierre sin desplazar la tabla de lado. */}
          <ul className="divide-y divide-[var(--border)] md:hidden">
            {(opps ?? []).length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted"><Tr>No tienes oportunidades abiertas.</Tr> <Link href="/oportunidades/nueva" className="link"><Tr>Crea una</Tr></Link>.</li>
            )}
            {(opps ?? []).map((o) => (
              <li key={o.id} className="space-y-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/oportunidades/${o.id}`} className="link">{o.name}</Link>
                    <p className="text-xs text-muted">{o.account?.name}</p>
                  </div>
                  <p className="num shrink-0 font-medium">{formatCurrency(o.amount)}</p>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <StageBadge stage={o.stage as never} />
                  <span className={o.close_date < today ? "font-semibold text-danger" : "text-muted"}><Fmt date={o.close_date} /></span>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
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
                    <td className={o.close_date < today ? "font-semibold text-danger" : undefined}><Fmt date={o.close_date} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card order-1 xl:order-none">
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

      <div className="order-5 grid grid-cols-1 gap-4 xl:order-none xl:grid-cols-2">
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
                <span className="badge badge-accent whitespace-nowrap"><Fmt datetime={m.start_at} /></span>
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
                <span className="text-xs text-muted"><Fmt date={a.updated_at} /></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

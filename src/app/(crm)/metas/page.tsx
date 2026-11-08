import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { GoalMeter } from "@/components/goals/GoalMeter";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { createClient } from "@/lib/supabase/server";
import { getUsers } from "@/lib/records/data";
import { canSystem } from "@/lib/permissions";
import { formatCurrency, formatMillions, formatNumber, formatPercent, todayISO } from "@/lib/format";
import { GOAL_METRICS, elapsedFraction, periodLabel, periodStart, shiftPeriod, type GoalMetric, type GoalPeriodType } from "@/lib/goals/periods";
import { saveGoals } from "@/lib/goals/actions";
import { getLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/session";
import { AmountInput } from "@/components/ui/AmountInput";

export const metadata: Metadata = { title: "Metas" };

type Progress = { goal_id: string; user_id: string | null; user_name: string; metric: GoalMetric; target: number; actual: number };

export default async function GoalsPage({ searchParams }: PageProps<"/metas">) {
  const [user, sp, users, locale] = await Promise.all([requireUser(), searchParams, getUsers(), getLocale()]);
  if (!canSystem(user.access, "view_dashboards")) redirect("/inicio");
  const type: GoalPeriodType = sp.tipo === "quarter" || sp.tipo === "year" ? sp.tipo : "month";
  const start = periodStart(type, typeof sp.inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.inicio) ? sp.inicio : todayISO());
  const elapsed = elapsedFraction(type, start);

  const supabase = await createClient();
  const { data } = await supabase.rpc("goal_progress", { p_period_type: type, p_period_start: start });
  const progress = ((data ?? []) as Progress[]).map((p) => ({ ...p, target: Number(p.target), actual: Number(p.actual) }));
  const company = progress.filter((p) => p.user_id === null);
  const byUser = new Map<string, { name: string; goals: Map<GoalMetric, Progress> }>();
  for (const p of progress.filter((x) => x.user_id)) {
    const entry = byUser.get(p.user_id!) ?? { name: p.user_name, goals: new Map() };
    entry.goals.set(p.metric, p);
    byUser.set(p.user_id!, entry);
  }

  // Usuarios cuyas metas puede definir quien consulta.
  const manageable = (
    await Promise.all(users.filter((u) => u.is_active).map(async (u) => {
      const { data: ok } = await supabase.rpc("can_manage_goal", { p_user: u.id });
      return ok ? u : null;
    }))
  ).filter((u): u is NonNullable<typeof u> => Boolean(u));
  const canCompany = canSystem(user.access, "manage_users");
  const canEdit = canCompany || manageable.length > 0;

  const fmt = (metric: GoalMetric, v: number) => (GOAL_METRICS.find((m) => m.key === metric)?.money ? formatCurrency(v) : formatNumber(v));
  const qs = (patch: Record<string, string>) => `/metas?${new URLSearchParams({ tipo: type, inicio: start, ...patch })}`;
  const targetOf = (userId: string | null, metric: GoalMetric) =>
    progress.find((p) => p.user_id === userId && p.metric === metric)?.target;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object="dashboard" />
          <div>
            <h1 className="text-xl font-medium"><Tr>Metas</Tr> · {periodLabel(type, start, locale)}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented">
            {(["month", "quarter", "year"] as const).map((t) => (
              <Link key={t} href={qs({ tipo: t, inicio: periodStart(t, start) })} aria-current={type === t ? "page" : undefined}
                className={`btn btn-sm border-0 ${type === t ? "bg-brand text-[var(--brand-contrast)] hover:bg-brand" : "btn-ghost"}`}>
                <Tr>{t === "month" ? "Mes" : t === "quarter" ? "Trimestre" : "Año"}</Tr>
              </Link>
            ))}
          </div>
          <Link href={qs({ inicio: shiftPeriod(type, start, -1) })} className="btn btn-icon" aria-label="Anterior"><ChevronLeft size={16} /></Link>
          <Link href={qs({ inicio: periodStart(type, todayISO()) })} className="btn"><Tr>Actual</Tr></Link>
          <Link href={qs({ inicio: shiftPeriod(type, start, 1) })} className="btn btn-icon" aria-label="Siguiente"><ChevronRight size={16} /></Link>
        </div>
      </div>
      <p className="text-sm text-muted">
        <Tr>Transcurrido del periodo:</Tr> {formatPercent(elapsed * 100)} · <Tr>La línea vertical marca el ritmo esperado a la fecha.</Tr>
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {company.length === 0 && <p className="text-sm text-muted"><Tr>No hay metas de compañía para este periodo.</Tr></p>}
        {company.map((g) => {
          const money = GOAL_METRICS.find((m) => m.key === g.metric)?.money;
          const gap = g.target - g.actual;
          return (
            <section key={g.goal_id} className="glass space-y-3 p-5">
              <p className="eyebrow"><Tr>{GOAL_METRICS.find((m) => m.key === g.metric)!.label}</Tr> · <Tr>Compañía</Tr></p>
              <p className="kpi-value">
                {g.target ? formatPercent((g.actual / g.target) * 100) : "—"}
                <span className="kpi-unit"><Tr>cumplimiento</Tr></span>
              </p>
              <GoalMeter actual={g.actual} target={g.target} elapsed={elapsed} />
              <p className="text-xs text-muted">
                {money ? `${formatMillions(g.actual).value} / ${formatMillions(g.target).value} M` : `${formatNumber(g.actual)} / ${formatNumber(g.target)}`}
                {" · "}<Tr>Brecha</Tr>: {gap > 0 ? fmt(g.metric, gap) : `(${fmt(g.metric, -gap)})`}
              </p>
            </section>
          );
        })}
      </div>

      <section className="card overflow-hidden">
        <div className="card-header"><h2 className="card-title"><Tr>Cumplimiento por asesor</Tr></h2></div>
        {byUser.size === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted"><Tr>No hay metas individuales visibles para este periodo.</Tr></p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th><Tr>Asesor</Tr></th>
                  {GOAL_METRICS.map((m) => <th key={m.key} className="min-w-44"><Tr>{m.label}</Tr></th>)}
                </tr>
              </thead>
              <tbody>
                {[...byUser.entries()].map(([id, u]) => (
                  <tr key={id}>
                    <td className="font-medium">{u.name}</td>
                    {GOAL_METRICS.map((m) => {
                      const g = u.goals.get(m.key);
                      if (!g) return <td key={m.key} className="text-muted">—</td>;
                      return (
                        <td key={m.key}>
                          <div className="mb-1 flex justify-between gap-2 text-xs">
                            <span className="num">{m.money ? formatMillions(g.actual).value : formatNumber(g.actual)} / {m.money ? `${formatMillions(g.target).value} M` : formatNumber(g.target)}</span>
                            <span className="num font-medium">{g.target ? formatPercent((g.actual / g.target) * 100) : "—"}</span>
                          </div>
                          <GoalMeter actual={g.actual} target={g.target} elapsed={elapsed} compact />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEdit && (
        <details className="card">
          <summary className="cursor-pointer list-none px-5 py-3 font-medium text-brand"><Tr>Definir metas del periodo</Tr></summary>
          <ActionForm key={`${type}-${start}`} action={saveGoals.bind(null, type, start)} className="space-y-3 border-t border-line p-4">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th><Tr>Asesor</Tr></th>{GOAL_METRICS.map((m) => <th key={m.key}><Tr>{m.label}</Tr>{m.money ? " (COP)" : ""}</th>)}</tr>
                </thead>
                <tbody>
                  {[...(canCompany ? [{ id: "company", full_name: "Compañía (total)" }] : []), ...manageable].map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium">{u.id === "company" ? <Tr>Compañía (total)</Tr> : u.full_name}</td>
                      {GOAL_METRICS.map((m) => (
                        <td key={m.key}>
                          {m.money ? (
                            <AmountInput name={`g:${u.id}:${m.key}`} className="input num h-8 min-w-28 text-right"
                              aria-label={`${u.full_name} · ${m.label}`}
                              defaultValue={targetOf(u.id === "company" ? null : u.id, m.key) ?? null} />
                          ) : (
                            <input name={`g:${u.id}:${m.key}`} inputMode="decimal" className="input num h-8 min-w-28 text-right"
                              aria-label={`${u.full_name} · ${m.label}`}
                              defaultValue={targetOf(u.id === "company" ? null : u.id, m.key) ?? ""} />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted"><Tr>Deja un campo vacío para quitar esa meta. Los gerentes definen las metas de su equipo; nadie define la propia.</Tr></p>
            <div className="flex justify-end"><SubmitButton pendingText="Guardando…"><Tr>Guardar metas</Tr></SubmitButton></div>
          </ActionForm>
        </details>
      )}
    </div>
  );
}

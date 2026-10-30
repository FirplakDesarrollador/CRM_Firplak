import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { KpiTile } from "@/components/dashboard/Charts";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { createClient } from "@/lib/supabase/server";
import { canSystem } from "@/lib/permissions";
import { formatCompactCurrency, formatCurrency, formatMillions, formatPercent, todayISO } from "@/lib/format";
import { periodEnd, periodLabel, periodStart, shiftPeriod, type GoalPeriodType } from "@/lib/goals/periods";
import { saveForecastAdjustment } from "@/lib/goals/actions";
import { makeT } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pronóstico" };

type Row = {
  user_id: string; user_name: string; closed: number; commit_amount: number; best_case: number; pipeline: number;
  open_count: number; quota: number | null; adjustment: number | null; adjustment_note: string | null; can_adjust: boolean;
};

// Colores de las categorías (tonos del design system; leyenda siempre visible).
const SEGMENTS = [
  { key: "closed", label: "Cerrado", color: "var(--success)" },
  { key: "commit_amount", label: "Compromiso", color: "var(--navy-700)" },
  { key: "best_case", label: "Mejor caso", color: "var(--sage-500)" },
] as const;

export default async function ForecastPage({ searchParams }: PageProps<"/pronostico">) {
  const [user, sp, locale] = await Promise.all([requireUser(), searchParams, getLocale()]);
  const t = makeT(locale);
  if (!canSystem(user.access, "view_dashboards")) redirect("/inicio");
  const type: GoalPeriodType = sp.tipo === "month" || sp.tipo === "year" ? sp.tipo : "quarter";
  const start = periodStart(type, typeof sp.inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.inicio) ? sp.inicio : todayISO());
  const end = periodEnd(type, start);

  const supabase = await createClient();
  const [{ data, error }, { data: companyGoal }] = await Promise.all([
    supabase.rpc("forecast_summary", { p_period_type: type, p_period_start: start }),
    supabase.from("sales_goals").select("target").is("user_id", null).eq("metric", "won_amount").eq("period_type", type).eq("period_start", start).maybeSingle(),
  ]);
  const rows = ((data ?? []) as Row[]).map((r) => ({
    ...r,
    closed: Number(r.closed), commit_amount: Number(r.commit_amount), best_case: Number(r.best_case), pipeline: Number(r.pipeline),
    quota: r.quota === null ? null : Number(r.quota), adjustment: r.adjustment === null ? null : Number(r.adjustment),
  }));
  const forecastOf = (r: (typeof rows)[number]) => r.adjustment ?? r.closed + r.commit_amount;
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totals = {
    closed: sum((r) => r.closed), commit: sum((r) => r.commit_amount), best: sum((r) => r.best_case), pipeline: sum((r) => r.pipeline),
    forecast: sum(forecastOf), quota: companyGoal ? Number(companyGoal.target) : sum((r) => r.quota ?? 0),
  };
  const scaleMax = Math.max(1, ...rows.map((r) => Math.max(r.closed + r.commit_amount + r.best_case, r.quota ?? 0, r.adjustment ?? 0)));

  const qs = (patch: Record<string, string>) => `/pronostico?${new URLSearchParams({ tipo: type, inicio: start, ...patch })}`;
  const drill = (ownerId: string, extra: { field: string; op: string; value: string }[]) => {
    const f = [
      { field: "owner_id", op: "eq", value: ownerId },
      { field: "close_date", op: "gt", value: shiftDay(start, -1) },
      { field: "close_date", op: "lt", value: shiftDay(end, 1) },
      ...extra,
    ];
    return `/oportunidades?f=${encodeURIComponent(JSON.stringify(f))}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object="dashboard" />
          <div>
            <p className="eyebrow"><Tr>Pronóstico de ventas</Tr></p>
            <h1 className="text-xl font-medium first-letter:uppercase">{periodLabel(type, start, locale)}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-[10px] border border-line-strong p-0.5">
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
      {error && <p className="error-text">{error.message}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile label="Cerrado" {...formatMillions(totals.closed)} tone="success" />
        <KpiTile label="Compromiso" {...formatMillions(totals.commit)} />
        <KpiTile label="Mejor caso" {...formatMillions(totals.best)} sub={`Pipeline: ${formatCompactCurrency(totals.pipeline)}`} />
        <KpiTile label="Pronóstico" {...formatMillions(totals.forecast)} sub="Cerrado + compromiso, o el ajuste del gerente" />
        <KpiTile label="Meta" {...formatMillions(totals.quota)}
          sub={totals.quota ? `${formatPercent((totals.forecast / totals.quota) * 100)} ${t("pronosticado")}` : t("Sin meta definida")}
          tone={totals.quota ? (totals.forecast >= totals.quota ? "success" : "warning") : undefined} />
      </div>

      <section className="card overflow-hidden">
        <div className="card-header flex-wrap">
          <h2 className="card-title"><Tr>Pronóstico por asesor</Tr></h2>
          <ul className="flex flex-wrap gap-3 text-xs text-ink-2" aria-label="Leyenda">
            {SEGMENTS.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /><Tr>{s.label}</Tr></li>
            ))}
            <li className="flex items-center gap-1.5"><span className="h-3 w-0.5 rounded bg-ink" /><Tr>Meta</Tr></li>
          </ul>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted"><Tr>No hay oportunidades que cierren en este periodo ni metas definidas.</Tr></p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th><Tr>Asesor</Tr></th>
                  <th className="min-w-56"><Tr>Composición</Tr></th>
                  <th className="text-right"><Tr>Cerrado</Tr></th>
                  <th className="text-right"><Tr>Compromiso</Tr></th>
                  <th className="text-right"><Tr>Mejor caso</Tr></th>
                  <th className="text-right"><Tr>Pipeline</Tr></th>
                  <th className="text-right"><Tr>Meta</Tr></th>
                  <th className="min-w-64"><Tr>Pronóstico final</Tr></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const final = forecastOf(r);
                  return (
                    <tr key={r.user_id}>
                      <td className="font-medium">{r.user_name}<p className="text-xs text-muted">{r.open_count} <Tr>abiertas</Tr></p></td>
                      <td>
                        <div className="relative flex h-3.5 gap-[2px]" title={`${formatCurrency(r.closed)} · ${formatCurrency(r.commit_amount)} · ${formatCurrency(r.best_case)}`}>
                          {SEGMENTS.map((s) => {
                            const v = r[s.key];
                            return v > 0 ? <span key={s.key} className="h-full first:rounded-l-[4px] last:rounded-r-[4px]" style={{ width: `${(v / scaleMax) * 100}%`, background: s.color }} /> : null;
                          })}
                          {r.quota ? <span className="absolute -top-1 h-5.5 w-0.5 rounded bg-ink" style={{ left: `${Math.min(100, (r.quota / scaleMax) * 100)}%` }} /> : null}
                        </div>
                      </td>
                      <td className="num whitespace-nowrap text-right"><Link className="link" href={drill(r.user_id, [{ field: "is_won", op: "eq", value: "true" }])}>{formatCompactCurrency(r.closed)}</Link></td>
                      <td className="num whitespace-nowrap text-right"><Link className="link" href={drill(r.user_id, [{ field: "forecast_category", op: "eq", value: "commit" }, { field: "is_closed", op: "eq", value: "false" }])}>{formatCompactCurrency(r.commit_amount)}</Link></td>
                      <td className="num whitespace-nowrap text-right"><Link className="link" href={drill(r.user_id, [{ field: "forecast_category", op: "eq", value: "best_case" }, { field: "is_closed", op: "eq", value: "false" }])}>{formatCompactCurrency(r.best_case)}</Link></td>
                      <td className="num whitespace-nowrap text-right"><Link className="link" href={drill(r.user_id, [{ field: "forecast_category", op: "eq", value: "pipeline" }, { field: "is_closed", op: "eq", value: "false" }])}>{formatCompactCurrency(r.pipeline)}</Link></td>
                      <td className="num whitespace-nowrap text-right">{r.quota ? formatCompactCurrency(r.quota) : "—"}</td>
                      <td>
                        {r.can_adjust ? (
                          <ActionForm action={saveForecastAdjustment.bind(null, r.user_id, type, start)} className="flex flex-wrap items-center gap-1.5">
                            <input name="amount" inputMode="decimal" className="input num h-8 w-32 text-right" aria-label={`${t("Ajuste de")} ${r.user_name}`}
                              defaultValue={r.adjustment ?? ""} placeholder={String(Math.round(r.closed + r.commit_amount))} />
                            <input name="note" className="input h-8 w-36" placeholder={t("Nota")} aria-label={t("Nota del ajuste")} defaultValue={r.adjustment_note ?? ""} />
                            <SubmitButton className="btn btn-sm" pendingText="…">Ajustar</SubmitButton>
                          </ActionForm>
                        ) : (
                          <span className="num font-medium">{formatCompactCurrency(final)}</span>
                        )}
                        <p className="mt-1 text-xs text-muted">
                          {r.adjustment !== null ? <><Tr>Ajustado por el gerente</Tr>{r.adjustment_note ? ` · ${r.adjustment_note}` : ""}</> : <Tr>Cerrado + compromiso</Tr>}
                          {r.quota ? ` · ${formatPercent((final / r.quota) * 100)}` : ""}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-medium">
                  <td className="px-3 py-2"><Tr>Total</Tr></td><td />
                  <td className="num whitespace-nowrap px-3 py-2 text-right">{formatCompactCurrency(totals.closed)}</td>
                  <td className="num whitespace-nowrap px-3 py-2 text-right">{formatCompactCurrency(totals.commit)}</td>
                  <td className="num whitespace-nowrap px-3 py-2 text-right">{formatCompactCurrency(totals.best)}</td>
                  <td className="num whitespace-nowrap px-3 py-2 text-right">{formatCompactCurrency(totals.pipeline)}</td>
                  <td className="num whitespace-nowrap px-3 py-2 text-right">{totals.quota ? formatCompactCurrency(totals.quota) : "—"}</td>
                  <td className="num whitespace-nowrap px-3 py-2">{formatCompactCurrency(totals.forecast)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-muted">
        <Tr>La categoría de pronóstico viene de la etapa de cada oportunidad (Configuración → Pipelines y etapas) y se puede cambiar en la oportunidad.</Tr>
      </p>
    </div>
  );
}

function shiftDay(iso: string, days: number) {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000);
  return d.toISOString().slice(0, 10);
}

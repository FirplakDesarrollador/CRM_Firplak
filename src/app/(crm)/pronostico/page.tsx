import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { ObjectIcon } from "@/components/ui/icons";
import { KpiTile } from "@/components/dashboard/Charts";
import { ActionForm } from "@/components/ui/ActionForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Tr } from "@/components/ui/Tr";
import { Fmt } from "@/components/ui/Fmt";
import { AmountInput } from "@/components/ui/AmountInput";
import { TrendChart, type TrendPoint } from "@/components/forecast/TrendChart";
import { getUsers } from "@/lib/records/data";
import { createClient } from "@/lib/supabase/server";
import { canSystem } from "@/lib/permissions";
import { formatCompactCurrency, formatCurrency, formatDate, formatMillions, formatPercent, todayISO } from "@/lib/format";
import { periodEnd, periodLabel, periodStart, shiftPeriod, type GoalPeriodType } from "@/lib/goals/periods";
import { saveForecastAdjustment, takeForecastSnapshot } from "@/lib/goals/actions";
import { makeT } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { requireUser } from "@/lib/session";

import { Val } from "@/components/ui/Val";
export const metadata: Metadata = { title: "Pronóstico" };

type Row = {
  user_id: string; user_name: string; closed: number; commit_amount: number; best_case: number; pipeline: number;
  open_count: number; quota: number | null; adjustment: number | null; adjustment_note: string | null; can_adjust: boolean;
};

// Colores de las categorías (tonos del design system; leyenda siempre visible).
const SEGMENTS = [
  { key: "closed", label: "Cerrado", color: "var(--success)" },
  { key: "commit_amount", label: "Compromiso", color: "var(--chart-commit)" },
  { key: "best_case", label: "Mejor caso", color: "var(--chart-best)" },
] as const;

export default async function ForecastPage({ searchParams }: PageProps<"/pronostico">) {
  const [user, sp, locale] = await Promise.all([requireUser(), searchParams, getLocale()]);
  const t = makeT(locale);
  if (!canSystem(user.access, "view_dashboards")) redirect("/inicio");
  const type: GoalPeriodType = sp.tipo === "month" || sp.tipo === "year" ? sp.tipo : "quarter";
  const start = periodStart(type, typeof sp.inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.inicio) ? sp.inicio : todayISO());
  const end = periodEnd(type, start);

  const supabase = await createClient();
  const [{ data, error }, { data: companyGoal }, { data: trendData }, users] = await Promise.all([
    supabase.rpc("forecast_summary", { p_period_type: type, p_period_start: start }),
    supabase.from("sales_goals").select("target").is("user_id", null).eq("metric", "won_amount").eq("period_type", type).eq("period_start", start).maybeSingle(),
    supabase.rpc("forecast_trend", { p_period_type: type, p_period_start: start }),
    getUsers(),
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
  // Historial: instantáneas del periodo y la fecha con la que se compara (por defecto,
  // la última anterior a hoy).
  const today = todayISO();
  const trend = (trendData ?? []).map((s) => ({
    date: s.taken_on, closed: Number(s.closed), commit: Number(s.commit_amount), best: Number(s.best_case),
    forecast: Number(s.forecast), quota: s.quota === null ? null : Number(s.quota),
  }));
  const pastDates = trend.map((s) => s.date).filter((d) => d < today);
  const compareDate = typeof sp.comparar === "string" && pastDates.includes(sp.comparar) ? sp.comparar : pastDates.at(-1) ?? null;
  const before = trend.find((s) => s.date === compareDate);
  const points: TrendPoint[] = trend.map((s) => ({ date: s.date, closed: s.closed, forecast: s.forecast, potential: s.closed + s.commit + s.best, quota: totals.quota || s.quota }));
  if (!trend.some((s) => s.date === today)) {
    points.push({ date: today, closed: totals.closed, forecast: totals.forecast, potential: totals.closed + totals.commit + totals.best, quota: totals.quota || null, live: true });
  }
  const { data: changes } = compareDate
    ? await supabase.rpc("pipeline_changes", { p_since: compareDate, p_period_type: type, p_period_start: start })
    : { data: [] };
  const userName = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? "—";
  const canSnapshot = canSystem(user.access, "customize") || canSystem(user.access, "manage_users");
  const delta = (now: number, prev: number | undefined) => {
    if (prev === undefined || !compareDate) return null;
    const d = now - prev;
    return (
      <span className={`block ${d > 0 ? "text-success" : d < 0 ? "text-danger" : "text-muted"}`}>
        {d === 0 ? t("Sin cambio") : d > 0 ? `+${formatCompactCurrency(d)}` : `(${formatCompactCurrency(-d)})`} {t("vs.")} <Fmt date={compareDate} />
      </span>
    );
  };

  const scaleMax = Math.max(1, ...rows.map((r) => Math.max(r.closed + r.commit_amount + r.best_case, r.quota ?? 0, r.adjustment ?? 0)));

  const qs = (patch: Record<string, string>) => `/pronostico?${new URLSearchParams({ tipo: type, inicio: start, ...patch })}`;
  const drill = (ownerId: string, extra: { field: string; op: string; value: string }[]) => {
    // Por crédito (propietario o parte del reparto), no solo por propietario.
    const f = [
      { field: "close_date", op: "gt", value: shiftDay(start, -1) },
      { field: "close_date", op: "lt", value: shiftDay(end, 1) },
      ...extra,
    ];
    return `/oportunidades?credito=${ownerId}&f=${encodeURIComponent(JSON.stringify(f))}`;
  };

  type ForecastRow = (typeof rows)[number];
  const figures = (r: ForecastRow) => [
    { label: "Cerrado", value: r.closed, href: drill(r.user_id, [{ field: "is_won", op: "eq", value: "true" }]) },
    { label: "Compromiso", value: r.commit_amount, href: drill(r.user_id, [{ field: "forecast_category", op: "eq", value: "commit" }, { field: "is_closed", op: "eq", value: "false" }]) },
    { label: "Mejor caso", value: r.best_case, href: drill(r.user_id, [{ field: "forecast_category", op: "eq", value: "best_case" }, { field: "is_closed", op: "eq", value: "false" }]) },
    { label: "Pipeline", value: r.pipeline, href: drill(r.user_id, [{ field: "forecast_category", op: "eq", value: "pipeline" }, { field: "is_closed", op: "eq", value: "false" }]) },
  ];
  const composition = (r: ForecastRow) => (
    <div className="relative flex h-3.5 gap-[2px]" role="img"
      aria-label={`${t("Cerrado")} ${formatCompactCurrency(r.closed)}, ${t("Compromiso")} ${formatCompactCurrency(r.commit_amount)}, ${t("Mejor caso")} ${formatCompactCurrency(r.best_case)}${r.quota ? `, ${t("Meta")} ${formatCompactCurrency(r.quota)}` : ""}`}
      title={`${formatCurrency(r.closed)} · ${formatCurrency(r.commit_amount)} · ${formatCurrency(r.best_case)}`}>
      {SEGMENTS.map((s) => {
        const v = r[s.key];
        return v > 0 ? <span key={s.key} className="h-full first:rounded-l-[4px] last:rounded-r-[4px]" style={{ width: `${(v / scaleMax) * 100}%`, background: s.color }} /> : null;
      })}
      {r.quota ? <span className="absolute -top-1 h-5.5 w-0.5 rounded bg-ink" style={{ left: `${Math.min(100, (r.quota / scaleMax) * 100)}%` }} /> : null}
    </div>
  );
  // Pronóstico final con su origen; quien puede ajustar edita aquí mismo el valor.
  const finalForecast = (r: ForecastRow, fieldCls: string, noteCls: string) => {
    const final = forecastOf(r);
    return (
      <>
        <p className="num mb-1 font-medium">{formatCompactCurrency(final)}{r.quota ? <span className="ml-1.5 text-xs font-normal text-muted">{formatPercent((final / r.quota) * 100)}</span> : null}</p>
        {r.can_adjust && (
          <ActionForm action={saveForecastAdjustment.bind(null, r.user_id, type, start)} className="flex flex-wrap items-center gap-1.5">
            <AmountInput name="amount" className={`input num text-right ${fieldCls}`} aria-label={`${t("Ajuste de")} ${r.user_name}`}
              defaultValue={r.adjustment} placeholder={Math.round(r.closed + r.commit_amount)} />
            <input name="note" className={`input ${noteCls}`} placeholder={t("Nota")} aria-label={t("Nota del ajuste")} defaultValue={r.adjustment_note ?? ""} />
            <SubmitButton className="btn btn-sm" pendingText="…">Ajustar</SubmitButton>
          </ActionForm>
        )}
        <p className="mt-1 text-xs text-muted">
          {r.adjustment !== null ? <><Tr>Ajustado por el gerente</Tr>{r.adjustment_note ? ` · ${r.adjustment_note}` : ""}</> : <Tr>Cerrado + compromiso</Tr>}
        </p>
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ObjectIcon object="dashboard" />
          <div>
            <h1 className="text-xl font-medium"><Tr>Pronóstico</Tr> · {periodLabel(type, start, locale)}</h1>
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
      {error && <p className="error-text">{error.message}</p>}

      <div className="grid gap-3 sm:grid-cols-2 sm:max-xl:[&>*:last-child]:col-span-2 xl:grid-cols-5">
        <KpiTile label="Cerrado" {...formatMillions(totals.closed)} sub={delta(totals.closed, before?.closed)} />
        <KpiTile label="Compromiso" {...formatMillions(totals.commit)} sub={delta(totals.commit, before?.commit)} />
        <KpiTile label="Mejor caso" {...formatMillions(totals.best)}
          sub={<>{t("Pipeline:")} {formatCompactCurrency(totals.pipeline)}{delta(totals.best, before?.best)}</>} />
        <KpiTile label="Pronóstico" {...formatMillions(totals.forecast)}
          sub={<>{t("Cerrado + compromiso, o el ajuste del gerente")}{delta(totals.forecast, before?.forecast)}</>} />
        <KpiTile label="Meta" {...formatMillions(totals.quota)}
          sub={totals.quota ? `${formatPercent((totals.forecast / totals.quota) * 100)} ${t("pronosticado")}` : t("Sin meta definida")}
          tone={totals.quota ? (totals.forecast >= totals.quota ? "success" : "warning") : undefined} />
      </div>

      <section className="glass p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="card-title"><Tr>Tendencia del pronóstico</Tr></h2>
            <p className="text-xs text-muted"><Tr>Una instantánea cada lunes a las 6:00 a. m. (con pg_cron) más el valor de hoy en vivo.</Tr></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pastDates.length > 0 && (
              <form method="get" action="/pronostico" className="flex items-center gap-1.5">
                <input type="hidden" name="tipo" value={type} />
                <input type="hidden" name="inicio" value={start} />
                <label className="text-xs text-muted" htmlFor="comparar"><Tr>Comparar con</Tr></label>
                <select id="comparar" name="comparar" className="select h-8 w-auto" defaultValue={compareDate ?? ""}>
                  {[...pastDates].reverse().map((d) => <option key={d} value={d}>{formatDate(d, locale)}</option>)}
                </select>
                <button type="submit" className="btn btn-sm"><Tr>Ver</Tr></button>
              </form>
            )}
            {canSnapshot && (
              <ActionForm action={takeForecastSnapshot} className="flex flex-col items-end gap-1">
                <SubmitButton className="btn btn-sm" pendingText="Guardando…"><Camera size={14} /> <Tr>Tomar instantánea</Tr></SubmitButton>
              </ActionForm>
            )}
          </div>
        </div>
        <TrendChart points={points} />
        {trend.length === 0 && (
          <p className="mt-2 text-xs text-muted"><Tr>Aún no hay instantáneas de este periodo: la tendencia se irá formando semana a semana.</Tr></p>
        )}
      </section>

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
          <>
            {/* La tabla necesita unos 1030 px; por debajo, una tarjeta por asesor para ver las cifras sin desplazarse. */}
            <ul className="grid gap-3 p-3 md:grid-cols-2 xl:hidden">
              {rows.map((r) => (
                <li key={r.user_id} className="min-w-0 space-y-3 rounded-[10px] border border-line p-3">
                  <div>
                    <p className="font-medium">{r.user_name}</p>
                    <p className="text-xs text-muted">{r.open_count} <Tr>abiertas</Tr></p>
                  </div>
                  {composition(r)}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {figures(r).map((f) => (
                      <div key={f.label}>
                        <dt className="text-xs text-muted"><Tr>{f.label}</Tr></dt>
                        <dd className="num"><Link className="link" href={f.href}>{formatCompactCurrency(f.value)}</Link></dd>
                      </div>
                    ))}
                    <div className="col-span-2">
                      <dt className="text-xs text-muted"><Tr>Meta</Tr></dt>
                      <dd className="num">{r.quota ? formatCompactCurrency(r.quota) : "—"}</dd>
                    </div>
                  </dl>
                  <div className="border-t border-line pt-3">
                    <p className="text-xs text-muted"><Tr>Pronóstico final</Tr></p>
                    {finalForecast(r, "h-10 min-w-0 flex-1 basis-32", "h-10 min-w-0 flex-1 basis-32")}
                  </div>
                </li>
              ))}
              <li className="min-w-0 rounded-[10px] bg-surface-2 p-3 md:col-span-2">
                <p className="mb-2 font-medium"><Tr>Total</Tr></p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {[["Cerrado", totals.closed], ["Compromiso", totals.commit], ["Mejor caso", totals.best], ["Pipeline", totals.pipeline], ["Meta", totals.quota], ["Pronóstico final", totals.forecast]].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted"><Tr>{label as string}</Tr></dt>
                      <dd className="num font-medium">{value ? formatCompactCurrency(value) : label === "Meta" ? "—" : formatCompactCurrency(0)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            </ul>
            <div className="hidden overflow-x-auto xl:block">
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
                  {rows.map((r) => (
                    <tr key={r.user_id}>
                      <td className="font-medium">{r.user_name}<p className="text-xs text-muted">{r.open_count} <Tr>abiertas</Tr></p></td>
                      <td>{composition(r)}</td>
                      {figures(r).map((f) => (
                        <td key={f.label} className="num whitespace-nowrap text-right"><Link className="link" href={f.href}>{formatCompactCurrency(f.value)}</Link></td>
                      ))}
                      <td className="num whitespace-nowrap text-right">{r.quota ? formatCompactCurrency(r.quota) : "—"}</td>
                      <td>{finalForecast(r, "h-8 w-32", "h-8 w-36")}</td>
                    </tr>
                  ))}
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
          </>
        )}
      </section>
      {compareDate && (
        <section className="card overflow-hidden">
          <div className="card-header flex-wrap">
            <h2 className="card-title"><Tr>Cambios en el pipeline desde</Tr> <Fmt date={compareDate} /> <span className="badge">{changes?.length ?? 0}</span></h2>
          </div>
          {(changes ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted"><Tr>Sin cambios en las oportunidades del periodo.</Tr></p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th><Tr>Oportunidad</Tr></th>
                    <th><Tr>Cambio</Tr></th>
                    <th className="text-right"><Tr>Valor</Tr></th>
                    <th><Tr>Fecha de cierre</Tr></th>
                    <th><Tr>Etapa</Tr></th>
                  </tr>
                </thead>
                <tbody>
                  {(changes ?? []).slice(0, 50).map((c) => {
                    const amountDiff = Number(c.amount_after ?? 0) - Number(c.amount_before ?? 0);
                    const tags: { label: string; cls: string }[] = [];
                    if (c.is_new) tags.push({ label: "Nueva", cls: "badge-info" });
                    if (c.is_closed && !c.was_closed) tags.push(c.is_won ? { label: "Ganada", cls: "badge-success" } : { label: "Perdida", cls: "badge-danger" });
                    if (!c.is_new && amountDiff !== 0) tags.push({ label: amountDiff > 0 ? "Valor ↑" : "Valor ↓", cls: amountDiff > 0 ? "badge-success" : "badge-warning" });
                    if (!c.is_new && c.close_before !== c.close_after) {
                      tags.push(c.close_after > end || c.close_after < start ? { label: "Salió del periodo", cls: "badge-danger" } : { label: "Fecha movida", cls: "badge-warning" });
                    }
                    if (!c.is_new && c.stage_before !== c.stage_after && !(c.is_closed && !c.was_closed)) tags.push({ label: "Etapa", cls: "" });
                    return (
                      <tr key={c.opportunity_id}>
                        <td>
                          <Link href={`/oportunidades/${c.opportunity_id}`} className="link font-medium">{c.name}</Link>
                          <p className="text-xs text-muted">{userName(c.owner_id)}</p>
                        </td>
                        <td><span className="flex flex-wrap gap-1">{tags.map((g) => <span key={g.label} className={`badge ${g.cls}`}><Tr>{g.label}</Tr></span>)}</span></td>
                        <td className="num whitespace-nowrap text-right">
                          {c.is_new ? formatCompactCurrency(c.amount_after) : <>{formatCompactCurrency(c.amount_before)} → {formatCompactCurrency(c.amount_after)}</>}
                          {!c.is_new && amountDiff !== 0 && (
                            <span className={`block text-xs ${amountDiff > 0 ? "text-success" : "text-danger"}`}>
                              {amountDiff > 0 ? `+${formatCompactCurrency(amountDiff)}` : `(${formatCompactCurrency(-amountDiff)})`}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-sm">
                          {c.is_new || c.close_before === c.close_after ? <Fmt date={c.close_after} /> : <><Fmt date={c.close_before} /> → <Fmt date={c.close_after} /></>}
                        </td>
                        <td className="text-sm">{c.is_new || c.stage_before === c.stage_after ? <Val>{c.stage_after}</Val> : <><Val>{c.stage_before}</Val> → <Val>{c.stage_after}</Val></>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
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

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { elapsedFraction, periodLabel, type GoalPeriodType } from "@/lib/goals/periods";
import { getLocale } from "@/lib/i18n/server";
import { GoalMeter } from "./GoalMeter";
import { Tr } from "@/components/ui/Tr";

type Progress = { goal_id: string; user_id: string | null; user_name: string; metric: string; target: number; actual: number };

/** Cumplimiento de la meta de ventas ganadas: compañía y (opcional) por asesor o del usuario. */
export async function GoalSummary({ type, start, userId, perUser = false }: { type: GoalPeriodType; start: string; userId?: string; perUser?: boolean }) {
  const supabase = await createClient();
  const [{ data }, locale] = await Promise.all([
    supabase.rpc("goal_progress", { p_period_type: type, p_period_start: start }),
    getLocale(),
  ]);
  const rows = ((data ?? []) as Progress[]).filter((p) => p.metric === "won_amount").map((p) => ({ ...p, target: Number(p.target), actual: Number(p.actual) }));
  const mine = userId ? rows.find((r) => r.user_id === userId) : undefined;
  const company = rows.find((r) => r.user_id === null);
  const main = mine ?? company;
  if (!main) return null;
  const elapsed = elapsedFraction(type, start);
  const users = perUser ? rows.filter((r) => r.user_id) : [];

  return (
    <section className="glass p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">
          <Tr>{mine ? "Mi meta de ventas" : "Meta de ventas de la compañía"}</Tr> · <span className="first-letter:uppercase">{periodLabel(type, start, locale)}</span>
        </p>
        <Link href={`/metas?tipo=${type}&inicio=${start}`} className="btn btn-sm btn-ghost"><Tr>Ver metas</Tr> <ArrowRight size={14} /></Link>
      </div>
      <div className="mt-2 grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)] md:items-center">
        <p className="kpi-value">
          {main.target ? formatPercent((main.actual / main.target) * 100) : "—"}
          <span className="kpi-unit">{formatCompactCurrency(main.actual)} <Tr>de</Tr> {formatCompactCurrency(main.target)}</span>
        </p>
        <GoalMeter actual={main.actual} target={main.target} elapsed={elapsed} />
      </div>
      {users.length > 0 && (
        <ul className="mt-4 grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
          {users.map((u) => (
            <li key={u.goal_id}>
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="font-medium">{u.user_name}</span>
                <span className="num">{u.target ? formatPercent((u.actual / u.target) * 100) : "—"}</span>
              </div>
              <GoalMeter actual={u.actual} target={u.target} elapsed={elapsed} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

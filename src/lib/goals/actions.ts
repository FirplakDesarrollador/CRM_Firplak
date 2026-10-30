"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAmount, type FormState } from "@/lib/records/form";
import { GOAL_METRICS, type GoalPeriodType } from "./periods";

/** Guarda la grilla de metas: `g:<userId|company>:<metric>`; vacío elimina la meta. */
export async function saveGoals(periodType: GoalPeriodType, start: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("sales_goals").select("id, user_id, metric").eq("period_type", periodType).eq("period_start", start);
  const find = (userId: string | null, metric: string) =>
    (existing ?? []).find((g) => g.user_id === userId && g.metric === metric);

  let saved = 0;
  const errors: string[] = [];
  for (const [key, raw] of fd.entries()) {
    if (!key.startsWith("g:")) continue;
    const [, who, metric] = key.split(":");
    if (!GOAL_METRICS.some((m) => m.key === metric)) continue;
    const userId = who === "company" ? null : who;
    const value = String(raw).trim();
    const current = find(userId, metric);
    if (!value) {
      if (current) await supabase.from("sales_goals").delete().eq("id", current.id);
      continue;
    }
    const target = parseAmount(value);
    if (target === null || target < 0) { errors.push(`Valor no válido: ${value}`); continue; }
    const { error } = current
      ? await supabase.from("sales_goals").update({ target }).eq("id", current.id)
      : await supabase.from("sales_goals").insert({ user_id: userId, metric, period_type: periodType, period_start: start, target });
    if (error) errors.push(error.message.includes("row-level security") ? "Sin permiso para alguna de las metas" : error.message);
    else saved += 1;
  }
  revalidatePath("/", "layout");
  if (errors.length) return { message: [...new Set(errors)].join(" · ") };
  return { ok: true, message: `${saved} meta(s) guardada(s)` };
}

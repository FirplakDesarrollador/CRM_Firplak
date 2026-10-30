import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getObjectDef } from "@/lib/records/data";
import type { Filter, ObjectKey } from "@/lib/objects";
import { matchesAll } from "./evaluate";

export type ValidationError = { field: string | null; message: string };

/** Valida un registro candidato (estado final tras guardar) contra las reglas activas. */
export async function validateRecord(object: ObjectKey, candidate: Record<string, unknown>, userId: string): Promise<ValidationError | null> {
  const supabase = await createClient();
  const { data: rules } = await supabase.from("validation_rules").select("conditions, error_message, error_field").eq("object", object).eq("is_active", true);
  if (!rules?.length) return null;
  const def = await getObjectDef(object);
  for (const rule of rules) {
    const conditions = (Array.isArray(rule.conditions) ? rule.conditions : []) as Filter[];
    if (conditions.length && matchesAll(def, candidate, conditions, userId)) {
      return { field: rule.error_field, message: rule.error_message };
    }
  }
  return null;
}

/** Aplica a la oportunidad los valores que la base deriva de la etapa (para validar antes de guardar). */
export async function withStageEffects(candidate: Record<string, unknown>, stageChanged: boolean) {
  if (!candidate.stage_id || !stageChanged) return candidate;
  const supabase = await createClient();
  const { data: stage } = await supabase.from("pipeline_stages").select("probability, category, forecast_category").eq("id", String(candidate.stage_id)).maybeSingle();
  if (!stage) return candidate;
  return {
    ...candidate,
    probability: stage.probability,
    forecast_category: stage.forecast_category,
    is_closed: stage.category !== "open",
    is_won: stage.category === "won",
  };
}

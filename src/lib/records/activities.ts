import "server-only";
import { createClient } from "@/lib/supabase/server";
import { syncActivityToMicrosoft } from "@/lib/ms365/sync";
import type { CurrentUser } from "@/lib/session";
import { parseAmount, type FormState } from "./form";
import { friendlyError } from "./persist";

export type ActivityResult = { ok: true; id: string } | { ok: false; state: FormState };

/**
 * Registra una actividad con lo que trae el formulario rápido (tarea, llamada, reunión, correo o nota). Lo usan
 * el formulario del CRM y el envío de lo creado sin señal; este último trae el `id` que generó el dispositivo,
 * para que reenviar no la duplique.
 */
export async function insertActivity(formData: FormData, user: CurrentUser, id?: string): Promise<ActivityResult> {
  const type = String(formData.get("activity_type") ?? "task");
  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return { ok: false, state: { errors: { subject: "Escribe un asunto" } } };

  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };
  const start = get("start_at");
  const duration = parseAmount(String(get("duration_minutes") ?? "")) || null;
  // La hora del formulario es la de Colombia.
  const startIso = start ? `${start}:00-05:00` : null;
  const endIso = startIso && duration && type === "meeting"
    ? new Date(Date.parse(startIso) + duration * 60000).toISOString()
    : null;

  const supabase = await createClient();
  const { data: created, error } = await supabase.from("activities").insert({
    ...(id ? { id } : {}),
    activity_type: type,
    subject,
    description: get("description"),
    status: formData.get("completed") === "on" ? "completed" : "pending",
    priority: get("priority") ?? "normal",
    due_date: get("due_date"),
    start_at: startIso,
    end_at: endIso,
    location: get("location"),
    call_result: get("call_result"),
    duration_minutes: duration,
    account_id: get("account_id"),
    contact_id: get("contact_id"),
    opportunity_id: get("opportunity_id"),
    lead_id: get("lead_id"),
    case_id: get("case_id"),
    owner_id: get("owner_id") ?? user.id,
  }).select("id").single();
  if (error || !created) return { ok: false, state: { message: friendlyError(error?.message ?? "No se pudo registrar la actividad.") } };
  if (type === "meeting" || type === "task") await syncActivityToMicrosoft(created.id);
  return { ok: true, id: created.id };
}

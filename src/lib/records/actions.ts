"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getObject, isObjectKey, type ListDefinition, type ObjectKey } from "@/lib/objects";
import { getObjectDef, untypedClient } from "./data";
import { parseRecordForm, type FormState } from "./form";

function friendlyError(message: string) {
  if (message.includes("row-level security")) return "No tienes permiso para realizar esta acción.";
  if (message.includes("violates foreign key")) return "El registro está relacionado con otros datos y no se puede completar la acción.";
  if (message.includes("duplicate key")) return "Ya existe un registro con ese valor.";
  return message;
}

export async function saveRecord(objectKey: ObjectKey, id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const def = await getObjectDef(objectKey);
  if (!can(user.access, def.permission, id ? "edit" : "create")) {
    return { message: "No tienes permiso para realizar esta acción." };
  }

  const db = await untypedClient();
  let existingCustom: Record<string, unknown> = {};
  if (id) {
    const { data } = await db.from(def.table).select("custom_fields").eq("id", id).maybeSingle();
    if (!data) return { message: "El registro no existe o no tienes acceso." };
    existingCustom = (data.custom_fields ?? {}) as Record<string, unknown>;
  }

  const { values, errors, echo } = parseRecordForm(def, formData, existingCustom);
  if (Object.keys(errors).length) {
    return { errors, values: echo, message: "Revisa los campos marcados." };
  }

  if (objectKey === "opportunities" && values.stage_id) {
    const supabase = await createClient();
    const { data: stage } = await supabase
      .from("pipeline_stages").select("pipeline_id").eq("id", String(values.stage_id)).maybeSingle();
    if (!stage) return { errors: { stage_id: "Etapa no válida" }, values: echo };
    values.pipeline_id = stage.pipeline_id;
  }
  if (!values.owner_id) delete values.owner_id;

  const result = id
    ? await db.from(def.table).update(values).eq("id", id).select("id").maybeSingle()
    : await db.from(def.table).insert(values).select("id").single();

  if (result.error || !result.data) {
    return {
      values: echo,
      message: result.error ? friendlyError(result.error.message) : "No tienes permiso para editar este registro.",
    };
  }

  revalidatePath("/", "layout");
  const returnTo = String(formData.get("_return") ?? "");
  redirect(returnTo.startsWith("/") ? returnTo : `${def.path}/${result.data.id}`);
}

export async function deleteRecord(objectKey: ObjectKey, id: string): Promise<FormState> {
  const def = getObject(objectKey);
  const db = await untypedClient();
  const { data, error } = await db.from(def.table).delete().eq("id", id).select("id");
  if (error) return { message: friendlyError(error.message) };
  if (!data?.length) return { message: "No tienes permiso para eliminar este registro." };
  revalidatePath("/", "layout");
  redirect(def.path);
}

export async function moveOpportunityStage(id: string, stageId: string, lossReason?: string): Promise<FormState> {
  const supabase = await createClient();
  const patch: { stage_id: string; loss_reason?: string } = { stage_id: stageId };
  if (lossReason) patch.loss_reason = lossReason;
  const { data, error } = await supabase.from("opportunities").update(patch).eq("id", id).select("id");
  if (error) return { message: friendlyError(error.message) };
  if (!data?.length) return { message: "No tienes permiso para mover esta oportunidad." };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Actividades
// ---------------------------------------------------------------------------
export async function createActivity(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const type = String(formData.get("activity_type") ?? "task");
  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return { errors: { subject: "Escribe un asunto" } };

  const get = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };
  const start = get("start_at");
  const duration = Number(get("duration_minutes") ?? "") || null;
  const startIso = start ? `${start}:00-05:00` : null;
  const endIso = startIso && duration && type === "meeting"
    ? new Date(Date.parse(startIso) + duration * 60000).toISOString()
    : null;

  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
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
  });
  if (error) return { message: friendlyError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Actividad registrada" };
}

export async function setActivityStatus(id: string, status: "pending" | "completed" | "cancelled"): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").update({ status }).eq("id", id).select("id");
  if (error) return { message: friendlyError(error.message) };
  if (!data?.length) return { message: "No tienes permiso para modificar esta actividad." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteActivity(id: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").delete().eq("id", id).select("id");
  if (error) return { message: friendlyError(error.message) };
  if (!data?.length) return { message: "No tienes permiso para eliminar esta actividad." };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vistas de lista
// ---------------------------------------------------------------------------
export async function saveListView(object: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isObjectKey(object)) return { message: "Objeto no válido" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { errors: { name: "Ponle un nombre a la vista" } };

  let definition: ListDefinition;
  try {
    definition = JSON.parse(String(formData.get("definition") ?? "{}"));
  } catch {
    return { message: "Definición de vista no válida" };
  }
  const shared = formData.get("is_shared") === "on";
  const id = String(formData.get("id") ?? "") || null;

  const supabase = await createClient();
  const payload = { object, name, definition, is_shared: shared, owner_id: user.id };
  const { data, error } = id
    ? await supabase.from("list_views").update({ name, definition, is_shared: shared }).eq("id", id).select("id").single()
    : await supabase.from("list_views").insert(payload).select("id").single();
  if (error) return { message: friendlyError(error.message) };

  revalidatePath("/", "layout");
  const def = getObject(object);
  redirect(`${def.path}?view=${data.id}`);
}

export async function deleteListView(object: string, id: string): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("list_views").delete().eq("id", id).select("id");
  if (error) return { message: friendlyError(error.message) };
  if (!data?.length) return { message: "No puedes eliminar esta vista." };
  revalidatePath("/", "layout");
  redirect(isObjectKey(object) ? getObject(object).path : "/");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { getObject, isObjectKey, type ListDefinition, type ObjectKey } from "@/lib/objects";
import { getObjectDef, untypedClient } from "./data";
import type { FormState } from "./form";
import { friendlyError, persistRecord } from "./persist";
import { insertActivity } from "./activities";
import { validateRecord, withStageEffects } from "@/lib/rules/server";
import { runAutomations } from "@/lib/rules/automation";
import { syncActivityToMicrosoft } from "@/lib/ms365/sync";

export async function saveRecord(objectKey: ObjectKey, id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const def = await getObjectDef(objectKey);
  const result = await persistRecord(objectKey, id, formData, user, { ignoreDuplicates: formData.get("_ignore_duplicates") === "1" });
  if (!result.ok) return result.state;

  revalidatePath("/", "layout");
  const returnTo = String(formData.get("_return") ?? "");
  redirect(returnTo.startsWith("/") ? returnTo : `${def.path}/${result.id}`);
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
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: before } = await supabase.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (!before) return { message: "La oportunidad no existe o no tienes acceso." };
  const patch: { stage_id: string; loss_reason?: string } = { stage_id: stageId };
  if (lossReason) patch.loss_reason = lossReason;
  const candidate = await withStageEffects({ ...before, ...patch }, true);
  const invalid = await validateRecord("opportunities", candidate, user.id);
  if (invalid) return { message: invalid.message };
  const { data, error } = await supabase.from("opportunities").update(patch).eq("id", id).select("id");
  if (error) return { message: friendlyError(error.message) };
  if (!data?.length) return { message: "No tienes permiso para mover esta oportunidad." };
  await runAutomations("opportunities", "update", id, before, user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Actividades
// ---------------------------------------------------------------------------
export async function createActivity(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const result = await insertActivity(formData, user);
  if (!result.ok) return result.state;
  revalidatePath("/", "layout");
  return { ok: true, message: "Actividad registrada" };
}

export async function setActivityStatus(id: string, status: "pending" | "completed" | "cancelled"): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").update({ status }).eq("id", id).select("id");
  if (error) return { message: friendlyError(error.message) };
  if (!data?.length) return { message: "No tienes permiso para modificar esta actividad." };
  await syncActivityToMicrosoft(id);
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

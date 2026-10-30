"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import type { FormState } from "@/lib/records/form";
import { syncUser } from "./sync";
import { postToWebhook } from "./teams";
import { hasScope } from "./config";
import { getConnection } from "./graph";
import { createRecordFolder, FOLDER_BY_OBJECT, getRecordFolder, getSharePointSettings, MAX_UPLOAD_BYTES, uploadToFolder } from "./sharepoint";

export async function syncMs365Now(_prev?: FormState, _fd?: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  try {
    const summary = await syncUser(user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: `Sincronizado: ${summary}.` };
  } catch (e) {
    return { message: `No se pudo sincronizar: ${(e as Error).message}` };
  }
}

export async function saveMs365Settings(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  const conn = await getConnection(user.id);
  if (!conn) return { message: "No has conectado tu cuenta de Microsoft 365." };
  const flags = Object.fromEntries(["calendar_push", "calendar_pull", "mail_pull", "send_via_outlook"].map((k) => [k, fd.get(k) === "on"]));
  // Planner: «plan|nombre» y «depósito|nombre» elegidos en las listas.
  const [planId, planName] = String(fd.get("planner_plan") ?? "").split("|");
  const [bucketId, bucketName] = String(fd.get("planner_bucket") ?? "").split("|");
  const planner = planId
    ? { planner_plan_id: planId, planner_plan_name: planName, planner_bucket_id: planId === conn.settings.planner_plan_id ? bucketId || undefined : undefined, planner_bucket_name: planId === conn.settings.planner_plan_id ? bucketName || undefined : undefined }
    : { planner_plan_id: undefined, planner_plan_name: undefined, planner_bucket_id: undefined, planner_bucket_name: undefined };
  const settings = { ...flags, ...planner };
  const supabase = await createClient();
  const { error } = await supabase.from("ms365_connections").update({ settings }).eq("user_id", user.id);
  if (error) return { message: error.message };
  revalidatePath("/preferencias");
  return { ok: true, message: "Preferencias guardadas" };
}

export async function disconnectMs365(_prev?: FormState, _fd?: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  const supabase = await createClient();
  await supabase.from("ms365_connections").delete().eq("user_id", user.id);
  revalidatePath("/preferencias");
  return { ok: true, message: "Cuenta de Microsoft desconectada" };
}

// ---------------------------------------------------------------- Canales de Teams (administración)
async function admin() {
  const user = await getCurrentUser();
  return user && canSystem(user.access, "customize") ? await createClient() : null;
}

export async function saveTeamsChannel(_prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await admin();
  if (!supabase) return { message: "No tienes permiso para esta configuración." };
  const name = String(fd.get("name") ?? "").trim();
  const url = String(fd.get("webhook_url") ?? "").trim();
  if (!name || !/^https?:\/\//.test(url)) return { message: "Escribe el nombre del canal y la dirección del webhook (https://…)." };
  const { error } = await supabase.from("teams_channels").insert({ name, webhook_url: url });
  if (error) return { message: error.message };
  revalidatePath("/configuracion/microsoft-365");
  return { ok: true, message: "Canal agregado" };
}

export async function deleteTeamsChannel(id: string): Promise<FormState> {
  const supabase = await admin();
  if (!supabase) return { message: "No tienes permiso para esta configuración." };
  await supabase.from("teams_channels").delete().eq("id", id);
  revalidatePath("/configuracion/microsoft-365");
  return { ok: true, message: "Canal eliminado" };
}

export async function testTeamsChannel(id: string): Promise<FormState> {
  const supabase = await admin();
  if (!supabase) return { message: "No tienes permiso para esta configuración." };
  const { data } = await supabase.from("teams_channels").select("name, webhook_url").eq("id", id).maybeSingle();
  if (!data) return { message: "El canal no existe." };
  try {
    await postToWebhook(data.webhook_url, { title: "Prueba de Firplak CRM", text: `Este canal (${data.name}) recibirá los avisos de las automatizaciones.` });
    return { ok: true, message: "Mensaje de prueba enviado" };
  } catch (e) {
    return { message: `Teams no aceptó el mensaje: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------- SharePoint
type FolderObject = keyof typeof FOLDER_BY_OBJECT;
const recordPath = (object: FolderObject, id: string) => `/${object === "accounts" ? "cuentas" : "oportunidades"}/${id}`;

export async function saveSharePointSite(_prev: FormState, fd: FormData): Promise<FormState> {
  const supabase = await admin();
  if (!supabase) return { message: "No tienes permiso para esta configuración." };
  const value = Object.fromEntries(["site_id", "site_name", "site_url", "drive_id", "drive_name"].map((k) => [k, String(fd.get(k) ?? "")]));
  if (!value.site_id || !value.drive_id) return { message: "Elige el sitio y la biblioteca." };
  const { error } = await supabase.from("integration_settings").upsert({ key: "sharepoint", value, updated_at: new Date().toISOString() });
  if (error) return { message: error.message };
  revalidatePath("/configuracion/microsoft-365");
  return { ok: true, message: "Biblioteca de SharePoint guardada" };
}

async function sharePointContext() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada" };
  const [conn, sp] = await Promise.all([getConnection(user.id), getSharePointSettings()]);
  if (!sp) return { error: "Administración todavía no eligió la biblioteca de SharePoint." };
  if (!conn || !hasScope(conn.scopes, "Files.ReadWrite.All")) return { error: "Conecta (o vuelve a conectar) tu cuenta de Microsoft 365 en Mis preferencias." };
  return { conn, sp };
}

export async function createFolderForRecord(object: FolderObject, id: string, name: string): Promise<FormState> {
  const ctx = await sharePointContext();
  if ("error" in ctx) return { message: ctx.error };
  if (await getRecordFolder(object, id)) return { ok: true, message: "La carpeta ya existe" };
  try {
    await createRecordFolder(ctx.conn!, ctx.sp!, object, id, name);
  } catch (e) {
    return { message: `SharePoint no pudo crear la carpeta: ${(e as Error).message}` };
  }
  revalidatePath(recordPath(object, id));
  return { ok: true, message: "Carpeta creada en SharePoint" };
}

export async function uploadDocument(object: FolderObject, id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await sharePointContext();
  if ("error" in ctx) return { message: ctx.error };
  const folder = await getRecordFolder(object, id);
  if (!folder) return { message: "Primero crea la carpeta en SharePoint." };
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { message: "Elige un archivo" };
  if (file.size > MAX_UPLOAD_BYTES) return { message: "El archivo supera 4 MB: súbelo directamente en SharePoint." };
  try {
    await uploadToFolder(ctx.conn!, folder.drive_id, folder.item_id, file);
  } catch (e) {
    return { message: `SharePoint no aceptó el archivo: ${(e as Error).message}` };
  }
  revalidatePath(recordPath(object, id));
  return { ok: true, message: "Archivo subido" };
}

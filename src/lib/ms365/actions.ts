"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import { canSystem } from "@/lib/permissions";
import type { FormState } from "@/lib/records/form";
import { syncUser } from "./sync";
import { postToWebhook } from "./teams";

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
  const settings = Object.fromEntries(["calendar_push", "calendar_pull", "mail_pull", "send_via_outlook"].map((k) => [k, fd.get(k) === "on"]));
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

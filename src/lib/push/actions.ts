"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/session";
import type { FormState } from "@/lib/records/form";
import { allowedPushEndpoint, pushConfigured } from "./config";
import { sendPush } from "./send";

export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function savePushSubscription(subscription: BrowserSubscription, userAgent: string): Promise<FormState> {
  if (!pushConfigured()) return { message: "Las notificaciones push no están configuradas." };
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  if (!allowedPushEndpoint(subscription.endpoint) || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return { message: "Este navegador usa un servicio de notificaciones no permitido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("push_subscribe", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys.p256dh,
    p_auth: subscription.keys.auth,
    p_user_agent: userAgent,
  });
  if (error) return { message: "No se pudo activar en este dispositivo." };
  return { ok: true, message: "Notificaciones activadas en este dispositivo." };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function sendTestPush(): Promise<FormState> {
  if (!pushConfigured()) return { message: "Las notificaciones push no están configuradas." };
  const user = await getCurrentUser();
  if (!user) return { message: "Sesión expirada" };
  const supabase = await createClient();
  const { data: devices } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (!devices?.length) return { message: "No tienes dispositivos activados." };
  const results = await Promise.all(devices.map(async (device) => {
    const result = await sendPush(device, {
      id: randomUUID(),
      title: "Firplak CRM",
      body: "Las notificaciones funcionan en este dispositivo.",
      link: "/preferencias",
    });
    if (result === "gone") await supabase.from("push_subscriptions").delete().eq("id", device.id);
    return result;
  }));
  return results.includes("ok")
    ? { ok: true, message: "Prueba enviada. Debe llegar en unos segundos." }
    : { message: "No se pudo enviar la prueba. Desactiva y vuelve a activar." };
}

import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowedPushEndpoint, pushConfigured } from "./config";

export type PushDevice = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushMessage = { id: string; title: string; body?: string | null; link?: string | null };

const BATCH = 200;
const MAX_BATCHES = 5;

/** Envía un mensaje cifrado a un dispositivo. «gone»: el dispositivo ya no existe y hay que olvidarlo. */
export async function sendPush(device: PushDevice, message: PushMessage): Promise<"ok" | "gone" | "failed"> {
  if (!allowedPushEndpoint(device.endpoint)) return "gone";
  const link = message.link?.startsWith("/") && !message.link.startsWith("//") ? message.link : "/inicio";
  const payload = JSON.stringify({ id: message.id, title: message.title.slice(0, 120), body: message.body?.slice(0, 300) ?? "", link });
  try {
    const request = webpush.generateRequestDetails(
      { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      payload,
      {
        TTL: 24 * 60 * 60,
        urgency: "high",
        vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! },
      },
    );
    const response = await fetch(request.endpoint, {
      method: request.method,
      headers: request.headers as Record<string, string>,
      body: request.body as unknown as BodyInit,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return "ok";
    return response.status === 404 || response.status === 410 ? "gone" : "failed";
  } catch {
    return "failed";
  }
}

/** Envía lo pendiente a los dispositivos de cada persona. Lo llaman el webhook de la base y el cron. */
export async function dispatchPendingPush() {
  const totals = { notifications: 0, sent: 0, removed: 0, failed: 0 };
  const admin = createAdminClient();
  if (!admin || !pushConfigured()) return null;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: pending, error } = await admin.rpc("push_claim_pending", { p_limit: BATCH });
    if (error) throw new Error(error.message);
    if (!pending?.length) break;
    totals.notifications += pending.length;

    const { data: devices } = await admin.from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth").in("user_id", [...new Set(pending.map((n) => n.user_id))]);
    const removed: string[] = [];
    const delivered: string[] = [];
    await Promise.all(pending.flatMap((message) =>
      (devices ?? []).filter((d) => d.user_id === message.user_id).map(async (device) => {
        const result = await sendPush(device, message);
        if (result === "ok") { totals.sent++; delivered.push(device.id); }
        if (result === "gone") { totals.removed++; removed.push(device.id); }
        if (result === "failed") totals.failed++;
      }),
    ));
    if (removed.length) await admin.from("push_subscriptions").delete().in("id", removed);
    if (delivered.length) await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).in("id", [...new Set(delivered)]);
    if (pending.length < BATCH) break;
  }
  return totals;
}

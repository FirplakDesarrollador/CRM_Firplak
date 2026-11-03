// Suscripción de este navegador a las notificaciones push (solo en el navegador).
import { removePushSubscription, savePushSubscription, type BrowserSubscription } from "./actions";

const SYNC_KEY = "fp-push-synced";
const DAY = 24 * 60 * 60 * 1000;

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64url: string) {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function usesKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = keyBytes(publicKey);
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((b, i) => b === expected[i]);
}

export async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Pide el permiso si hace falta, suscribe el navegador y lo registra a nombre de quien tiene la sesión. */
export async function subscribeDevice(publicKey: string) {
  if ((await Notification.requestPermission()) !== "granted") return { denied: true as const };
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Sin service worker")), 10_000)),
  ]);
  let subscription = await registration.pushManager.getSubscription();
  // Una suscripción con otra clave (se cambió la del servidor) ya no sirve.
  if (subscription && !usesKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const result = await savePushSubscription(subscription.toJSON() as BrowserSubscription, navigator.userAgent);
  return { denied: false as const, ...result };
}

/** Deja de recibir en este navegador (al desactivar y al cerrar sesión). */
export async function forgetDevice() {
  try { localStorage.removeItem(SYNC_KEY); } catch { /* sin almacenamiento local */ }
  const subscription = await currentSubscription();
  if (!subscription) return;
  await removePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}

/**
 * Al abrir el CRM confirma una vez al día que el servidor conoce este navegador: el navegador puede
 * cambiar la suscripción por su cuenta, y otra persona pudo iniciar sesión aquí.
 */
export async function syncDevice(publicKey: string, userId: string) {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  if (!usesKey(subscription, publicKey)) {
    await subscribeDevice(publicKey);
    return;
  }
  const stamp = `${userId}|${subscription.endpoint}`;
  let last: { stamp: string; at: number } | null = null;
  try { last = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null"); } catch { /* se sincroniza de nuevo */ }
  if (last?.stamp === stamp && Date.now() - last.at < DAY) return;
  const result = await savePushSubscription(subscription.toJSON() as BrowserSubscription, navigator.userAgent);
  if (!result.ok) return;
  try { localStorage.setItem(SYNC_KEY, JSON.stringify({ stamp, at: Date.now() })); } catch { /* sin almacenamiento local */ }
}

import "server-only";

// Servicios de push de los navegadores. El servidor solo envía a estos: la dirección de un dispositivo
// la entrega el navegador de la persona, así que nunca se debe llamar a una dirección arbitraria.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

/** Clave pública para que el navegador se suscriba; null si push no está configurado. */
export function vapidPublicKey() {
  return pushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null;
}

export function allowedPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  // PUSH_EXTRA_ORIGINS: solo para el servicio simulado del modo demo.
  if ((process.env.PUSH_EXTRA_ORIGINS ?? "").split(",").includes(url.origin)) return true;
  return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
}

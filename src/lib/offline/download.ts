// «Preparar el día»: baja al dispositivo lo que el asesor consulta sin señal y deja lista la pantalla que lo
// muestra, para que abra aunque la app arranque sin internet.

import { saveSnapshot, SHELL_CACHE } from "./store";
import type { OfflineMeta, OfflineSnapshot } from "./types";

export { SHELL_CACHE };
export const OFFLINE_PATH = "/sin-conexion";

/** El servidor respondió que no hay sesión. */
export class SessionExpiredError extends Error {
  constructor() {
    super("La sesión venció");
    this.name = "SessionExpiredError";
  }
}

/** Sin sesión, el servidor responde 401 o lleva al ingreso. */
export function isSignedOut(response: Response) {
  if (response.status === 401) return true;
  if (!response.redirected) return false;
  try {
    const to = new URL(response.url);
    return to.origin === window.location.origin && to.pathname.startsWith("/login");
  } catch {
    return false;
  }
}

type Download = { snapshot: OfflineSnapshot; locale: "es" | "en"; labels: Record<string, string> };

/**
 * Descarga y guarda. Lanza `SessionExpiredError` si no hay sesión y `TypeError` si no hay red.
 * Devuelve `null` si la sesión se cerró mientras bajaba (no se guarda nada). `shell` dice si la pantalla que
 * muestra lo descargado quedó guardada para abrir sin red; los datos quedan aunque eso falle.
 */
export async function prepareDay(): Promise<{ meta: OfflineMeta; shell: boolean } | null> {
  const response = await fetch("/api/sin-conexion/descarga", { cache: "no-store", credentials: "same-origin" });
  if (isSignedOut(response)) throw new SessionExpiredError();
  if (!response.ok) throw new Error(`Descarga fallida (${response.status})`);
  const { snapshot, locale, labels } = (await response.json()) as Download;
  if (!snapshot?.user) throw new SessionExpiredError();

  const meta: OfflineMeta = {
    userId: snapshot.user.id,
    userName: snapshot.user.name,
    savedAt: Date.now(),
    locale,
    labels,
    counts: {
      accounts: snapshot.accounts.length,
      contacts: snapshot.contacts.length,
      opportunities: snapshot.opportunities.length,
      activities: snapshot.activities.length,
      products: snapshot.products.length,
    },
  };
  if (!(await saveSnapshot(meta, snapshot))) return null;
  const shell = await warmShell().catch(() => false);
  return { meta, shell };
}

/** Archivos de Next que nombra un texto (HTML o datos de la página): scripts, estilos y fuentes con huella. */
export function staticAssets(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s<>)]+/g)) {
    const path = match[0].replaceAll("&amp;", "&");
    found.add(path.startsWith("/_next/") ? path : `/_next/${path}`);
  }
  return [...found];
}

/**
 * Guarda la pantalla sin conexión con todo lo que necesita para abrir sin red. El HTML se escribe al final, y
 * solo si sus archivos quedaron: así nunca se sirve una pantalla a medias.
 */
export async function warmShell() {
  if (!("caches" in window)) return false;
  const page = await fetch(OFFLINE_PATH, { cache: "no-store", credentials: "same-origin" });
  if (!page.ok || page.redirected) return false;
  const html = await page.clone().text();

  const cache = await window.caches.open(SHELL_CACHE);
  const assets = new Set(staticAssets(html));
  const fetched = new Set<string>();
  // Los estilos nombran las fuentes; se sigue hasta no encontrar archivos nuevos.
  for (let round = 0; round < 3; round++) {
    const pending = [...assets].filter((url) => !fetched.has(url));
    if (pending.length === 0) break;
    await Promise.all(pending.map(async (url) => {
      fetched.add(url);
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`No se pudo guardar ${url}`);
      if (/\.css(\?|$)/.test(url)) {
        const css = await response.clone().text();
        for (const ref of css.matchAll(/url\(\s*["']?([^"')\s]+)/g)) {
          const target = new URL(ref[1], new URL(url, window.location.origin));
          if (target.origin === window.location.origin && target.pathname.startsWith("/_next/static/")) assets.add(target.pathname + target.search);
        }
      }
      await cache.put(url, response);
    }));
  }
  await cache.put(OFFLINE_PATH, page);

  // Lo de versiones anteriores de la app ya no hace falta.
  const keep = new Set([OFFLINE_PATH, ...assets].map((url) => new URL(url, window.location.origin).href));
  for (const request of await cache.keys()) {
    if (!keep.has(request.url)) await cache.delete(request);
  }
  return true;
}

import { expect, type BrowserContext, type Page } from "@playwright/test";

// Usuarios del modo demo (scripts/dev-demo.mjs).
export const USUARIOS = {
  admin: "luis.demo@firplak.com",
  gerente: "gerente.centro@firplak.com",
  asesora: "asesora.centro@firplak.com",
} as const;
export const CLAVE = "demo1234";
export const sesion = (quien: keyof typeof USUARIOS) => `test-results/sesiones/${quien}.json`;

export async function ingresar(page: Page, correo: string, clave = CLAVE) {
  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(correo);
  await page.getByLabel(/contraseña/i).fill(clave);
  await page.getByRole("button", { name: /ingresar/i }).click();
}

/** Nombre único por corrida, para encontrar exactamente lo que creó la prueba. */
export const unico = (base: string) => `${base} ${Date.now().toString(36)}`;

const SIMULADOR = "http://127.0.0.1:54370";

/**
 * Hace que este navegador use el servicio de push simulado del demo en lugar del real (FCM): así las
 * pruebas no dependen de internet y se puede leer lo que le llegó, ya descifrado. Devuelve su id.
 */
export async function usarPushSimulado(context: BrowserContext) {
  const sub = await (await fetch(`${SIMULADOR}/sim/suscribir`, { method: "POST" })).json();
  await context.grantPermissions(["notifications"]);
  await context.addInitScript((subscription) => {
    const clave = "e2e-push";
    const activa = () => localStorage.getItem(clave) !== null;
    const objeto = () => ({
      endpoint: subscription.endpoint,
      options: { applicationServerKey: Uint8Array.from(JSON.parse(localStorage.getItem(clave) ?? "[]")).buffer },
      toJSON: () => subscription,
      unsubscribe: async () => { localStorage.removeItem(clave); return true; },
    });
    PushManager.prototype.getSubscription = async () => (activa() ? objeto() : null) as unknown as PushSubscription;
    PushManager.prototype.subscribe = async (opciones) => {
      localStorage.setItem(clave, JSON.stringify([...(opciones!.applicationServerKey as Uint8Array)]));
      return objeto() as unknown as PushSubscription;
    };
  }, sub);
  return String(sub.endpoint).split("/").pop()!;
}

export async function activarPush(page: Page) {
  await page.goto("/preferencias");
  await page.getByRole("button", { name: "Activar notificaciones" }).click();
  await expect(page.getByText("Activas en este dispositivo.")).toBeVisible();
}

export async function pushRecibidos(id: string): Promise<{ title: string; body: string; link: string }[]> {
  const todos = await (await fetch(`${SIMULADOR}/sim/recibidos`)).json();
  return todos.filter((m: { to: string }) => m.to === id);
}

export async function vencerPush(id: string) {
  await fetch(`${SIMULADOR}/sim/vencer/${id}`, { method: "POST" });
}

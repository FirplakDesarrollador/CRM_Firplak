import { expect, test } from "@playwright/test";
import { activarPush, pushRecibidos, sesion, usarPushSimulado, vencerPush } from "./ayuda";

test.use({ storageState: sesion("asesora") });

test("un push muestra la notificación y al cerrar sesión este navegador deja de recibir", async ({ page, context }) => {
  await usarPushSimulado(context);
  await activarPush(page);

  const cdp = await context.newCDPSession(page);
  const registro = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => { if (e.registrations[0]) resolve(e.registrations[0].registrationId); });
  });
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: "http://localhost:3000",
    registrationId: await registro,
    data: JSON.stringify({ id: "prueba-1", title: "Aprobación pendiente", body: "Cotización 1001", link: "/aprobaciones" }),
  });
  await expect.poll(() => page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.getNotifications({ tag: "prueba-1" })).map((n) => [n.title, n.body, n.data.link]);
  })).toEqual([["Aprobación pendiente", "Cotización 1001", "/aprobaciones"]]);

  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem("e2e-push"))).toBeNull();
});

test("la prueba llega cifrada al dispositivo y un dispositivo vencido se olvida", async ({ page, context }) => {
  const id = await usarPushSimulado(context);
  await activarPush(page);

  await page.getByRole("button", { name: "Enviar prueba" }).click();
  await expect(page.getByText("Prueba enviada. Debe llegar en unos segundos.")).toBeVisible();
  await expect.poll(() => pushRecibidos(id)).toEqual([expect.objectContaining({ title: "Firplak CRM", link: "/preferencias" })]);

  await vencerPush(id);
  await page.getByRole("button", { name: "Enviar prueba" }).click();
  await expect(page.getByText("No se pudo enviar la prueba. Desactiva y vuelve a activar.")).toBeVisible();
  await page.getByRole("button", { name: "Enviar prueba" }).click();
  await expect(page.getByText("No tienes dispositivos activados.")).toBeVisible();
});

test("si el navegador las bloqueó, explica cómo permitirlas", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "denied" });
  });
  await page.goto("/preferencias");
  await expect(page.getByText(/Las notificaciones están bloqueadas/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Activar notificaciones" })).toHaveCount(0);
});

import { expect, test, type Page } from "@playwright/test";
import { sesion, unico } from "./ayuda";

// Modo Offline: completar y reprogramar una actividad que ya está en el CRM. El cambio queda en la bandeja de salida
// del dispositivo, se ve de una vez en la agenda y se envía solo cuando vuelve la conexión.
//
// Como en las demás pruebas sin conexión, la red se corta con la pantalla ya abierta (ver sin-conexion.spec.ts).

const BASE = "firplak-crm-sin-conexion";

type Envio = { id: string; userId: string; kind: string; title: string; status: string; values: Record<string, string> };

const bandeja = (page: Page) =>
  page.evaluate((base) => new Promise<Envio[]>((resolve, reject) => {
    const abrir = indexedDB.open(base);
    abrir.onerror = () => reject(abrir.error);
    abrir.onsuccess = () => {
      const db = abrir.result;
      const tx = db.transaction("salida", "readonly");
      const todos = tx.objectStore("salida").getAll();
      tx.oncomplete = () => {
        db.close();
        resolve((todos.result as (Envio & { createdAt: number })[]).sort((a, b) => a.createdAt - b.createdAt)
          .map(({ id, userId, kind, title, status, values }) => ({ id, userId, kind, title, status, values })));
      };
      tx.onerror = () => reject(tx.error);
    };
  }), BASE);

const tarjeta = (page: Page) => page.getByRole("region", { name: "Consulta sin señal" });
const panel = (page: Page) => page.locator("#panel-sin-conexion");
/** Día de hoy en Colombia más `dias`, como AAAA-MM-DD. */
const dia = (dias = 0) => new Date(Date.now() - 5 * 3600000 + dias * 86400000).toISOString().slice(0, 10);

async function descargar(page: Page) {
  await tarjeta(page).getByRole("button", { name: /^(Preparar el día|Actualizar)$/ }).click();
  await expect(tarjeta(page).getByText(/^Descargado hoy, /)).toBeVisible();
}

async function nuevaTarea(page: Page, asunto: string) {
  await page.getByRole("tab", { name: /Agenda/ }).click();
  await panel(page).getByRole("button", { name: "Registrar actividad" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Registrar actividad" })).toBeVisible();
  await page.getByLabel("Asunto").fill(asunto);
  await page.locator("#sa-due").fill(dia());
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(panel(page).getByText(asunto).first()).toBeVisible();
}

test.use({ storageState: sesion("asesora") });

test("sin señal se completa y se reprograma una tarea del CRM; al volver la conexión llega sola", async ({ page, context }) => {
  const completar = unico("Tarea para completar");
  const mover = unico("Tarea para reprogramar");
  await page.goto("/sin-conexion");
  await descargar(page);

  // Dos tareas que quedan en el CRM (con señal se envían de inmediato) y vuelven en la siguiente descarga.
  await nuevaTarea(page, completar);
  await nuevaTarea(page, mover);
  // La segunda puede quedar esperando si se guardó mientras salía la primera: «Enviar ahora» la despacha.
  await page.getByRole("tab", { name: /Envíos/ }).click();
  await expect(async () => {
    const enviarAhora = panel(page).getByRole("button", { name: "Enviar ahora" });
    if (await enviarAhora.isVisible() && await enviarAhora.isEnabled()) await enviarAhora.click();
    expect((await bandeja(page)).filter((e) => [completar, mover].includes(e.title)).map((e) => e.status)).toEqual(["sent", "sent"]);
  }).toPass();
  await descargar(page);
  await page.getByRole("tab", { name: /Agenda/ }).click();
  const boton = (accion: string, asunto: string) => panel(page).getByRole("button", { name: `${accion}: ${asunto}` });
  await expect(boton("Completar", completar)).toBeVisible();
  await expect(boton("Reprogramar", mover)).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("Sin señal", { exact: true })).toBeVisible();

  // Completar: queda tachada, marcada como sin enviar, y se puede deshacer.
  await boton("Completar", completar).click();
  const fila = (asunto: string) => panel(page).getByRole("listitem").filter({ has: page.getByRole("button", { name: new RegExp(`: ${asunto}$`) }) });
  await expect(fila(completar).getByText("Completada", { exact: true })).toBeVisible();
  await expect(fila(completar).getByText("Sin enviar", { exact: true })).toBeVisible();
  await expect(boton("Completar", completar)).toHaveCount(0);
  await boton("Deshacer", completar).click();
  await expect(boton("Completar", completar)).toBeVisible();
  expect((await bandeja(page)).filter((e) => e.kind === "change")).toEqual([]);
  await boton("Completar", completar).click();
  await expect(fila(completar).getByText("Completada", { exact: true })).toBeVisible();

  // Reprogramar: pide la fecha nueva y la tarea pasa a ese día.
  await boton("Reprogramar", mover).click();
  await expect(page.getByLabel("Nueva fecha")).toHaveValue(dia());
  await page.getByLabel("Nueva fecha").fill(dia(3));
  await panel(page).getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(fila(mover).getByText("Sin enviar", { exact: true })).toBeVisible();

  // Los dos cambios esperan en Envíos, diciendo qué se pidió.
  const cambios = (await bandeja(page)).filter((e) => e.kind === "change");
  expect(cambios.map(({ title, status, values }) => ({ title, status, complete: values.complete, due_date: values.due_date }))).toEqual([
    { title: completar, status: "pending", complete: "true", due_date: undefined },
    { title: mover, status: "pending", complete: undefined, due_date: dia(3) },
  ]);
  await page.getByRole("tab", { name: /Envíos/ }).click();
  await expect(panel(page).getByText(/^Completar/).first()).toBeVisible();
  await expect(panel(page).getByText(/Reprogramar para/)).toBeVisible();

  // Vuelve la señal: se envían solos.
  await context.setOffline(false);
  await expect.poll(async () => (await bandeja(page)).filter((e) => e.kind === "change").map((e) => e.status)).toEqual(["sent", "sent"]);

  // En el CRM quedó así: la descarga siguiente ya no trae la tarea completada y trae la otra con su fecha nueva.
  await descargar(page);
  await page.getByRole("tab", { name: /Agenda/ }).click();
  await expect(boton("Reprogramar", mover)).toBeVisible();
  await expect(boton("Completar", completar)).toHaveCount(0);
  await boton("Reprogramar", mover).click();
  await expect(page.getByLabel("Nueva fecha")).toHaveValue(dia(3));

  // Un cambio para una actividad que ya no existe queda rechazado con su motivo, y uno a nombre de otra persona no entra.
  const [{ userId }] = cambios;
  const enviar = (cuerpo: Record<string, unknown>) => page.request.post("/api/sin-conexion/enviar", { data: cuerpo });
  const fantasma = await enviar({ id: crypto.randomUUID(), userId, kind: "change", values: { activity_id: crypto.randomUUID(), complete: "true" } });
  expect(await fantasma.json()).toMatchObject({ status: "rejected", reason: "La actividad ya no existe en el CRM o ya no tienes acceso a ella." });
  const ajeno = await enviar({ id: crypto.randomUUID(), userId: crypto.randomUUID(), kind: "change", values: { activity_id: cambios[1].values.activity_id, complete: "true" } });
  expect(ajeno.status()).toBe(403);
  const vacio = await enviar({ id: crypto.randomUUID(), userId, kind: "change", values: { activity_id: cambios[1].values.activity_id } });
  expect(vacio.status()).toBe(400);
});

import { expect, test, type Page } from "@playwright/test";
import { ingresar, sesion, unico, USUARIOS } from "./ayuda";

// Modo sin conexión, parte B: lo que se crea sin señal (clientes y actividades) queda en la bandeja de salida del
// dispositivo y se envía solo al CRM cuando vuelve la conexión. Cada registro queda Pendiente, Enviado o
// Rechazado.
//
// Como en la parte A, la red se corta con la pantalla ya abierta (ver sin-conexion.spec.ts).

const BASE = "firplak-crm-sin-conexion";
const ENVIO = "**/api/sin-conexion/enviar";

type Envio = { id: string; userId: string; kind: string; title: string; status: string };

/** La bandeja de salida guardada en este navegador, de quien sea. */
const bandeja = (page: Page) =>
  page.evaluate((base) => new Promise<Envio[]>((resolve, reject) => {
    const abrir = indexedDB.open(base);
    abrir.onerror = () => reject(abrir.error);
    abrir.onsuccess = () => {
      const db = abrir.result;
      if (!db.objectStoreNames.contains("salida")) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction("salida", "readonly");
      const todos = tx.objectStore("salida").getAll();
      tx.oncomplete = () => {
        db.close();
        resolve((todos.result as (Envio & { createdAt: number })[])
          .sort((a, b) => a.createdAt - b.createdAt)
          .map(({ id, userId, kind, title, status }) => ({ id, userId, kind, title, status })));
      };
      tx.onerror = () => reject(tx.error);
    };
  }), BASE);

const estados = async (page: Page) => (await bandeja(page)).map((envio) => envio.status);

const tarjeta = (page: Page) => page.getByRole("region", { name: "Consulta sin señal" });
const panel = (page: Page) => page.locator("#panel-sin-conexion");
const sinEnviar = (page: Page) => page.getByRole("button", { name: /^\d+ sin enviar$/ });
const guardar = (page: Page) => page.getByRole("button", { name: "Guardar", exact: true });

/** Descarga el día y deja abierta la pantalla «Consulta sin señal». */
async function prepararYAbrir(page: Page) {
  await page.goto("/sin-conexion");
  await tarjeta(page).getByRole("button", { name: /^(Preparar el día|Actualizar)$/ }).click();
  await expect(tarjeta(page).getByText(/^Descargado hoy, /)).toBeVisible();
  await expect(page.getByRole("tab", { name: /Agenda/ })).toBeVisible();
}

async function nuevoCliente(page: Page, nombre: string, canal = "Canal Constructores") {
  await page.getByRole("tab", { name: /Clientes/ }).click();
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Nuevo cliente" })).toBeVisible();
  await page.getByLabel("Nombre del cliente").fill(nombre);
  await page.locator("#sc-industry").selectOption({ label: canal });
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByRole("heading", { level: 2, name: nombre })).toBeVisible();
}

test.describe("asesora", () => {
  test.use({ storageState: sesion("asesora") });

  test("crea un cliente y una llamada sin red, y se envían solos al volver la señal", async ({ page, context }) => {
    const cliente = unico("Ferretería Sin Señal");
    const asunto = unico("Llamada sin señal");
    await prepararYAbrir(page);
    await expect(sinEnviar(page)).toHaveCount(0);

    await context.setOffline(true);
    await expect(page.getByText("Sin señal", { exact: true })).toBeVisible();

    // Un cliente nuevo: el formulario revisa lo mínimo antes de guardarlo en el dispositivo.
    await page.getByRole("tab", { name: /Clientes/ }).click();
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByRole("button", { name: "Guardar cliente" }).click();
    await expect(page.getByText("Escribe el nombre del cliente")).toBeVisible();
    await expect(page.getByText("Elige el canal")).toBeVisible();
    expect(await bandeja(page)).toEqual([]);

    await page.getByLabel("Nombre del cliente").fill(cliente);
    await page.locator("#sc-industry").selectOption({ label: "Canal Distribución" });
    await page.locator("#sc-billing_city").fill("Medellín");
    await page.getByRole("button", { name: "Guardar cliente" }).click();

    // Queda en la ficha del cliente, marcado, y con los precios de la lista de su canal.
    await expect(page.getByText("Guardado en este dispositivo. Se enviará cuando haya señal.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: cliente })).toBeVisible();
    await expect(page).toHaveURL(/#v=clientes&c=[0-9a-f-]{36}$/);
    await expect(panel(page).getByText("Sin enviar", { exact: true })).toBeVisible();
    await expect(panel(page).getByText("Creado sin señal. Se enviará al CRM cuando haya conexión.")).toBeVisible();
    await expect(panel(page).getByText("Distribuidores 2026 · COP")).toBeVisible();

    // Una llamada a ese cliente, que todavía no existe en el CRM.
    await panel(page).getByRole("button", { name: "Registrar actividad" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Registrar actividad" })).toBeVisible();
    await page.getByRole("tab", { name: "Llamada" }).click();
    await expect(page.locator("#sa-account")).toHaveValue(/^[0-9a-f-]{36}$/);
    await expect(page.locator("#sa-account").locator("option:checked")).toHaveText(`${cliente} · sin enviar`);
    await guardar(page).click();
    await expect(page.getByText("Escribe un asunto")).toBeVisible();
    await page.getByLabel("Asunto").fill(asunto);
    await page.locator("#sa-result").selectOption({ label: "Interesado" });
    await page.locator("#sa-mins").fill("12");
    await expect(page.getByLabel("Ya realizada")).toBeChecked();
    await guardar(page).click();

    // De vuelta en la ficha, la llamada aparece como pendiente.
    await expect(page.getByRole("heading", { level: 2, name: cliente })).toBeVisible();
    await expect(panel(page).getByText(asunto)).toBeVisible();
    await expect(panel(page).getByText("Pendiente", { exact: true })).toBeVisible();

    // El encabezado dice cuánto falta por enviar y lleva a la bandeja.
    await expect(sinEnviar(page)).toHaveAccessibleName("2 sin enviar");
    await sinEnviar(page).click();
    await expect(page.getByRole("tab", { name: /Envíos/ })).toHaveAttribute("aria-selected", "true");
    await expect(panel(page).getByText("2 registros sin enviar")).toBeVisible();
    await expect(panel(page).getByText("Sin señal: se enviarán solos cuando vuelva la conexión.")).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Enviar ahora" })).toBeDisabled();
    await expect(panel(page).getByText("Pendiente", { exact: true })).toHaveCount(2);
    await expect(panel(page).getByText(`Se enviará después del cliente «${cliente}».`)).toBeVisible();
    expect((await bandeja(page)).map(({ kind, title, status }) => ({ kind, title, status }))).toEqual([
      { kind: "account", title: cliente, status: "pending" },
      { kind: "activity", title: asunto, status: "pending" },
    ]);

    // Recargar sin señal no es posible en desarrollo, pero volver a otra pestaña no pierde nada.
    await page.getByRole("tab", { name: /Agenda/ }).click();
    await expect(panel(page).getByText(asunto)).toBeVisible();
    await page.getByRole("tab", { name: /Envíos/ }).click();

    // Vuelve la señal: se envían solos, primero el cliente y después su llamada.
    await context.setOffline(false);
    await expect(panel(page).getByText("Todo está enviado.")).toBeVisible();
    await expect(panel(page).getByText("Enviado", { exact: true })).toHaveCount(2);
    await expect(sinEnviar(page)).toHaveCount(0);
    expect(await estados(page)).toEqual(["sent", "sent"]);

    // Y están en el CRM: el cliente con su ciudad y la llamada en su historial.
    await panel(page).getByRole("link", { name: "Ver en el CRM" }).click();
    await expect(page).toHaveURL(/\/cuentas\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: cliente })).toBeVisible();
    await expect(page.getByText("Medellín").first()).toBeVisible();
    await expect(page.getByText(asunto).first()).toBeVisible();
  });

  test("un cliente repetido queda rechazado: se corrige, se envía de todas formas o se descarta", async ({ page }) => {
    const nombre = unico("Depósito Repetido");
    await prepararYAbrir(page);

    // Con señal, lo que se guarda aquí se envía enseguida.
    await nuevoCliente(page, nombre);
    await expect(page.getByText("Guardado. Se está enviando al CRM.")).toBeVisible();
    await expect.poll(() => estados(page)).toEqual(["sent"]);

    // El mismo nombre otra vez: el CRM lo rechaza y dice con cuál se parece.
    await nuevoCliente(page, nombre);
    await expect.poll(() => estados(page)).toEqual(["sent", "rejected"]);
    await expect(panel(page).getByText("El CRM no aceptó este cliente. Corrígelo para volver a enviarlo.")).toBeVisible();
    await expect(sinEnviar(page)).toHaveAccessibleName("1 sin enviar");
    await sinEnviar(page).click();
    await expect(panel(page).getByText("Rechazado", { exact: true })).toBeVisible();
    await expect(panel(page).getByText("Encontramos registros que podrían ser el mismo. Revísalos o guarda de todas formas.")).toBeVisible();
    await expect(panel(page).getByText(`Ya existe en el CRM: ${nombre}`)).toBeVisible();

    // Corregirlo: con otro nombre ya no choca.
    await panel(page).getByRole("button", { name: "Corregir" }).click();
    await expect(page.getByLabel("Nombre del cliente")).toHaveValue(nombre);
    await page.getByLabel("Nombre del cliente").fill(`${nombre} Sucursal`);
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect.poll(() => estados(page)).toEqual(["sent", "sent"]);
    expect((await bandeja(page))[1].title).toBe(`${nombre} Sucursal`);

    // Otro repetido: esta vez sí es otro cliente, y se envía de todas formas.
    await nuevoCliente(page, nombre);
    await expect.poll(() => estados(page)).toEqual(["sent", "sent", "rejected"]);
    await sinEnviar(page).click();
    await panel(page).getByRole("button", { name: "Enviar de todas formas" }).click();
    await expect.poll(() => estados(page)).toEqual(["sent", "sent", "sent"]);
    await expect(panel(page).getByText("Todo está enviado.")).toBeVisible();
    await expect(sinEnviar(page)).toHaveCount(0);

    // Algo que no alcanzó a salir se puede descartar: no llega al CRM.
    await page.route(ENVIO, (route) => route.abort("internetdisconnected"));
    const asunto = unico("Nota descartada");
    await page.getByRole("tab", { name: /Agenda/ }).click();
    await panel(page).getByRole("button", { name: "Registrar actividad" }).click();
    await page.getByRole("tab", { name: "Nota" }).click();
    await page.getByLabel("Asunto").fill(asunto);
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expect(sinEnviar(page)).toHaveAccessibleName("1 sin enviar");
    await sinEnviar(page).click();
    await expect(panel(page).getByText(asunto)).toBeVisible();
    await panel(page).getByRole("button", { name: "Descartar" }).click();
    await expect(panel(page).getByText("¿Descartar este registro? No se enviará al CRM.")).toBeVisible();
    await panel(page).getByRole("button", { name: "Cancelar" }).click();
    await expect(panel(page).getByText(asunto)).toBeVisible();
    await panel(page).getByRole("button", { name: "Descartar" }).click();
    await panel(page).getByRole("button", { name: "Sí, descartar" }).click();
    await expect(panel(page).getByText(asunto)).toHaveCount(0);
    await expect(sinEnviar(page)).toHaveCount(0);
    expect((await bandeja(page)).map((envio) => envio.title)).not.toContain(asunto);
    await page.unroute(ENVIO);
  });
});

test("cerrar sesión con registros sin enviar avisa, los conserva y se envían cuando la misma persona vuelve", async ({ page }) => {
  const asunto = unico("Tarea sin enviar");
  await ingresar(page, USUARIOS.asesora);
  await expect(page).toHaveURL(/\/inicio/);
  await prepararYAbrir(page);

  // Hay internet, pero el envío no llega (como con una señal que va y viene).
  await page.route(ENVIO, (route) => route.abort("internetdisconnected"));
  await panel(page).getByRole("button", { name: "Registrar actividad" }).click();
  await page.getByLabel("Asunto").fill(asunto);
  await guardar(page).click();
  await expect(panel(page).getByText("Pendiente", { exact: true })).toBeVisible();
  const [pendiente] = await bandeja(page);
  expect(pendiente).toMatchObject({ kind: "activity", title: asunto, status: "pending" });

  // En el CRM, el encabezado avisa que hay algo sin enviar y lleva a la bandeja.
  await page.getByRole("link", { name: "Volver al CRM" }).click();
  await expect(page).toHaveURL(/\/inicio/);
  await expect(page.getByRole("link", { name: "1 sin enviar" })).toHaveAttribute("href", "/sin-conexion#v=salida&volver=%2Finicio");

  // Al cerrar sesión se avisa antes de salir; cancelar deja todo como estaba.
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  const aviso = page.getByRole("alert").filter({ hasText: "Tienes registros sin enviar" });
  await expect(aviso).toContainText("Tienes registros sin enviar: 1 registro.");
  await expect(aviso).toContainText("Quedan guardados en este dispositivo y se enviarán cuando vuelvas a iniciar sesión aquí.");
  await aviso.getByRole("button", { name: "Cancelar" }).click();
  await expect(aviso).toHaveCount(0);
  await expect(page).toHaveURL(/\/inicio/);
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await aviso.getByRole("button", { name: "Cerrar sesión de todas formas" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await bandeja(page)).toEqual([pendiente]);
  await page.unroute(ENVIO);

  // Sin sesión, la pantalla de consulta solo dice cuántos hay: ni de quién son ni qué dicen.
  await page.goto("/sin-conexion");
  await expect(page.getByText(/En este dispositivo hay registros sin enviar: 1\./)).toBeVisible();
  await expect(page.getByText(asunto)).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);

  // Otra persona entra en el mismo dispositivo: no ve lo ajeno, no lo envía a su nombre y sale sin aviso.
  await ingresar(page, USUARIOS.gerente);
  await expect(page).toHaveURL(/\/inicio/);
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await expect(page.getByRole("link", { name: /sin enviar$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await bandeja(page)).toEqual([pendiente]);

  // Vuelve quien lo creó: se envía solo al entrar.
  await ingresar(page, USUARIOS.asesora);
  await expect(page).toHaveURL(/\/inicio/);
  await expect.poll(() => estados(page)).toEqual(["sent"]);
  await expect(page.getByRole("link", { name: /sin enviar$/ })).toHaveCount(0);

  // Con la siguiente descarga ya viene del CRM, como una tarea más de la agenda.
  await prepararYAbrir(page);
  await expect(panel(page).getByText(asunto)).toHaveCount(1);
  await expect(panel(page).getByText("Enviado", { exact: true })).toHaveCount(0);
  expect(await bandeja(page)).toEqual([]);
});

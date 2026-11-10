import { expect, test, type Page } from "@playwright/test";
import { sesion, unico } from "./ayuda";

// Modo sin conexión, parte C: una cotización se arma sin señal con los precios descargados, queda en el
// dispositivo con un número provisional y se envía sola al CRM, que le pone el número oficial. Si el precio de
// lista cambió desde la descarga, el CRM respeta el cotizado y deja la línea marcada.
//
// Como en las partes A y B, la red se corta con la pantalla ya abierta (ver sin-conexion.spec.ts).

const BASE = "firplak-crm-sin-conexion";
const MUEBLE = "Mueble de baño flotante 60 cm";

type Envio = { kind: string; title: string; status: string; dependsOn: string | null };

/** La bandeja de salida guardada en este navegador. */
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
          .map(({ kind, title, status, dependsOn }) => ({ kind, title, status, dependsOn: dependsOn ?? null })));
      };
      tx.onerror = () => reject(tx.error);
    };
  }), BASE);

/**
 * Cambia, en lo descargado en este navegador, el precio de un producto en una lista: así el dispositivo queda
 * con un precio viejo, como cuando la lista cambia en el CRM después de «Preparar el día».
 */
const precioDescargado = (page: Page, referencia: string, lista: string, precio: number) =>
  page.evaluate(([base, ref, nombre, valor]) => new Promise<number>((resolve, reject) => {
    const abrir = indexedDB.open(base as string);
    abrir.onerror = () => reject(abrir.error);
    abrir.onsuccess = () => {
      const db = abrir.result;
      const tx = db.transaction("descarga", "readwrite");
      const store = tx.objectStore("descarga");
      const leer = store.get("data");
      let antes = -1;
      leer.onsuccess = () => {
        const data = leer.result;
        const producto = data.products.find((p: { product_code: string }) => p.product_code === ref);
        const libro = data.price_books.find((b: { name: string }) => b.name === nombre);
        const fila = data.prices.find((x: [string, string, number]) => x[0] === libro.id && x[1] === producto.id);
        antes = fila[2];
        fila[2] = valor;
        store.put(data, "data");
      };
      tx.oncomplete = () => { db.close(); resolve(antes); };
      tx.onerror = () => reject(tx.error);
    };
  }), [BASE, referencia, lista, precio] as const);

const tarjeta = (page: Page) => page.getByRole("region", { name: "Consulta sin señal" });
const panel = (page: Page) => page.locator("#panel-sin-conexion");
const sinEnviar = (page: Page) => page.getByRole("button", { name: /^\d+ sin enviar$/ });
const totales = (page: Page) => page.getByRole("region", { name: "Totales" });
/** La cotización hecha sin señal ocupa toda la pantalla, fuera de las pestañas. */
const cotizacion = (page: Page) => page.getByRole("main");

/** Descarga el día y deja abierta la pantalla «Consulta sin señal». */
async function prepararYAbrir(page: Page) {
  await page.goto("/sin-conexion");
  await tarjeta(page).getByRole("button", { name: /^(Preparar el día|Actualizar)$/ }).click();
  await expect(tarjeta(page).getByText(/^Descargado hoy, /)).toBeVisible();
  await expect(page.getByRole("tab", { name: /Agenda/ })).toBeVisible();
}

async function abrirCliente(page: Page, nombre: string) {
  await page.getByRole("tab", { name: /Clientes/ }).click();
  await page.getByRole("button", { name: new RegExp(nombre) }).click();
  await expect(page.getByRole("heading", { level: 2, name: nombre })).toBeVisible();
}

async function agregar(page: Page, busqueda: string, producto: string) {
  await page.locator("#sq-buscar").fill(busqueda);
  await page.getByRole("button", { name: `Agregar: ${producto}` }).click();
  await expect(page.getByRole("button", { name: `Quitar: ${producto}` })).toBeVisible();
}

test.describe("asesora", () => {
  test.use({ storageState: sesion("asesora") });

  test("cotiza sin red con los precios del cliente y la cotización llega sola al CRM", async ({ page, context }) => {
    const nombre = unico("Cotización sin señal");
    await prepararYAbrir(page);
    await abrirCliente(page, "Almacenes Casa Viva");

    await context.setOffline(true);
    await expect(page.getByText("Sin señal", { exact: true })).toBeVisible();

    // Desde la ficha del cliente: el formulario ya trae el cliente y dice con qué lista se cotiza.
    await panel(page).getByRole("button", { name: "Cotizar" }).click();
    await expect(page.getByRole("heading", { name: "Nueva cotización" })).toBeVisible();
    await expect(page.locator("#sq-account").locator("option:checked")).toHaveText("Almacenes Casa Viva");
    await expect(page.getByText("Lista de precios: Casa Viva 2026 · COP")).toBeVisible();

    // Revisa lo mínimo antes de guardar.
    await page.getByRole("button", { name: "Guardar cotización" }).click();
    await expect(page.getByText("Escribe un nombre para la cotización")).toBeVisible();
    await expect(page.getByText("Agrega al menos un producto")).toBeVisible();
    await expect(page.locator("#sq-name")).toBeFocused();
    expect(await bandeja(page)).toEqual([]);

    await page.locator("#sq-name").fill(nombre);
    await page.locator("#sq-contact").selectOption({ label: "Carolina Gómez Salcedo" });

    // El precio lo pone el teléfono con la regla del CRM: aquí, la lista propia del cliente.
    await agregar(page, "mb-060", MUEBLE);
    await expect(page.getByText("Agregado", { exact: true })).toBeVisible();
    await expect(page.getByText("Agrega al menos un producto")).toHaveCount(0);
    await expect(totales(page)).toContainText("$960,000");
    await page.locator('input[id^="sq-qty-"]').fill("2");
    await page.locator('input[id^="sq-disc-"]').fill("10");
    await expect(totales(page)).toContainText("$1,920,000");
    await expect(totales(page)).toContainText("($192,000)");
    await expect(totales(page)).toContainText("$1,728,000");
    await expect(totales(page)).toContainText("IVA (19%)");
    await expect(totales(page)).toContainText("$328,320");
    await expect(totales(page)).toContainText("$2,056,320");

    await page.locator('input[id^="sq-qty-"]').fill("0");
    await page.getByRole("button", { name: "Guardar cotización" }).click();
    await expect(page.getByText("La cantidad debe ser mayor que cero")).toBeVisible();
    await page.locator('input[id^="sq-qty-"]').fill("2");
    await page.getByRole("button", { name: "Guardar cotización" }).click();

    // Queda a la vista, sin enviar y con número provisional.
    await expect(page.getByText("Guardado en este dispositivo. Se enviará cuando haya señal.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: nombre })).toBeVisible();
    await expect(page).toHaveURL(/#v=clientes&c=[0-9a-f-]{36}&q=[0-9a-f-]{36}$/);
    await expect(cotizacion(page).getByText(/^PROV-[0-9A-Z]{6}$/)).toBeVisible();
    await expect(cotizacion(page).getByText("Número provisional", { exact: true })).toBeVisible();
    await expect(cotizacion(page).getByText("Sin enviar", { exact: true })).toBeVisible();
    await expect(cotizacion(page).getByText(/^Hecha sin señal\. Cuando haya conexión se envía al CRM/)).toBeVisible();
    await expect(cotizacion(page).getByText("Carolina Gómez Salcedo")).toBeVisible();
    await expect(cotizacion(page).getByText("Se crea una nueva con el nombre de la cotización")).toBeVisible();
    await expect(cotizacion(page).getByRole("link", { name: "Ver en el CRM" })).toHaveCount(0);
    await expect(totales(page)).toContainText("$2,056,320");
    expect(await bandeja(page)).toEqual([{ kind: "quote", title: nombre, status: "pending", dependsOn: null }]);

    // Mientras no se envía, se puede editar.
    await cotizacion(page).getByRole("button", { name: "Editar" }).click();
    await expect(page.getByRole("heading", { name: "Editar cotización" })).toBeVisible();
    await expect(page.locator("#sq-name")).toHaveValue(nombre);
    await page.locator('input[id^="sq-qty-"]').fill("3");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("heading", { level: 2, name: nombre })).toBeVisible();
    await expect(totales(page)).toContainText("$3,084,480");

    // «Volver» regresa a la ficha del cliente, que la lista entre las hechas sin señal.
    await cotizacion(page).getByRole("button", { name: "Volver" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Almacenes Casa Viva" })).toBeVisible();
    await expect(panel(page).getByRole("heading", { name: /Cotizaciones hechas sin señal/ })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: `Ver cotización: ${nombre}` })).toContainText("$3,084,480");

    // En la bandeja de salida aparece con su número provisional, el cliente y el total.
    await expect(sinEnviar(page)).toHaveAccessibleName("1 sin enviar");
    await sinEnviar(page).click();
    await expect(page.getByRole("tab", { name: /Envíos/ })).toHaveAttribute("aria-selected", "true");
    await expect(panel(page).getByText(/^Cotización PROV-[0-9A-Z]{6} · Almacenes Casa Viva · \$3,084,480$/)).toBeVisible();
    await expect(panel(page).getByText("Pendiente", { exact: true })).toBeVisible();

    // Vuelve la señal: se envía sola y el CRM le pone el número oficial.
    await context.setOffline(false);
    await expect(panel(page).getByText("Todo está enviado.")).toBeVisible();
    await expect(panel(page).getByText("Enviado", { exact: true })).toBeVisible();
    await expect(panel(page).getByText(/^Cotización COT-\d+ · Almacenes Casa Viva · \$3,084,480$/)).toBeVisible();
    await expect(panel(page).getByText("Cambió el precio de lista de algunos productos: se respetó lo cotizado.")).toHaveCount(0);
    expect(await bandeja(page)).toEqual([{ kind: "quote", title: nombre, status: "sent", dependsOn: null }]);

    // Ya enviada no se edita; la ficha lleva al CRM.
    await panel(page).getByRole("button", { name: `Ver cotización: ${nombre}` }).click();
    await expect(cotizacion(page).getByText(/^COT-\d+$/)).toBeVisible();
    await expect(cotizacion(page).getByText("Número provisional", { exact: true })).toHaveCount(0);
    await expect(cotizacion(page).getByText("Se creó una nueva con el nombre de la cotización")).toBeVisible();
    await expect(cotizacion(page).getByRole("button", { name: "Editar" })).toHaveCount(0);

    // En el CRM está como borrador, con su línea, sus totales y sin marca de precio cambiado.
    await cotizacion(page).getByRole("link", { name: "Ver en el CRM" }).click();
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^COT-\\d+ · ${nombre}$`) })).toBeVisible();
    await expect(page.getByText("Borrador").first()).toBeVisible();
    await expect(page.getByText(MUEBLE).first()).toBeVisible();
    await expect(page.getByText("$3,084,480").first()).toBeVisible();
    await expect(page.getByText("Cotizado sin señal")).toHaveCount(0);
  });

  test("si el precio de lista cambió desde la descarga, el CRM respeta el cotizado y marca la línea", async ({ page, context }) => {
    const nombre = unico("Cotización precio viejo");
    await prepararYAbrir(page);
    // El dispositivo se queda con un precio viejo: en el CRM la lista ya dice $960,000.
    expect(await precioDescargado(page, "DEMO-MB-060", "Casa Viva 2026", 900000)).toBe(960000);
    await page.reload();
    await expect(tarjeta(page).getByText(/^Descargado hoy, /)).toBeVisible();
    await abrirCliente(page, "Almacenes Casa Viva");

    await context.setOffline(true);
    await expect(page.getByText("Sin señal", { exact: true })).toBeVisible();
    await panel(page).getByRole("button", { name: "Cotizar" }).click();
    await page.locator("#sq-name").fill(nombre);
    await agregar(page, "mb-060", MUEBLE);
    await expect(totales(page)).toContainText("$900,000");
    await expect(totales(page)).toContainText("$1,071,000");
    await page.getByRole("button", { name: "Guardar cotización" }).click();
    await expect(page.getByRole("heading", { level: 2, name: nombre })).toBeVisible();
    await expect(cotizacion(page).getByText("Sin enviar", { exact: true })).toBeVisible();

    // Al llegar, el CRM conserva los $900,000 y le avisa a quien cotizó.
    await context.setOffline(false);
    await expect(cotizacion(page).getByText("Enviado", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Tu cotización llegó al CRM con los precios que cotizaste\./)).toBeVisible();
    await expect(cotizacion(page).getByText("Desde tu descarga cambió el precio de lista de 1 producto. El CRM respetó el precio que cotizaste y dejó marcadas esas líneas.")).toBeVisible();
    await expect(cotizacion(page).getByText("Precio de lista al enviar: $960,000. Se respetó el cotizado.")).toBeVisible();
    await expect(totales(page)).toContainText("$1,071,000");

    await cotizacion(page).getByRole("button", { name: "Volver" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Almacenes Casa Viva" })).toBeVisible();
    await page.getByRole("tab", { name: /Envíos/ }).click();
    await expect(panel(page).getByText("Cambió el precio de lista de algunos productos: se respetó lo cotizado.")).toBeVisible();

    // En el CRM la línea queda marcada, con el precio de lista que había al llegar.
    await panel(page).getByRole("link", { name: "Ver en el CRM" }).click();
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^COT-\\d+ · ${nombre}$`) })).toBeVisible();
    await expect(page.getByText("Cotizado sin señal").first()).toBeVisible();
    await expect(page.getByText("Precio de lista al llegar al CRM: $960,000").first()).toBeVisible();
    await expect(page.getByText("$1,071,000").first()).toBeVisible();
  });

  test("cotiza a un cliente creado sin red: se envía después del cliente, con la lista de su canal", async ({ page, context }) => {
    const cliente = unico("Depósito Sin Señal");
    const nombre = unico("Cotización cliente nuevo");
    await prepararYAbrir(page);
    await context.setOffline(true);
    await expect(page.getByText("Sin señal", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Clientes/ }).click();
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre del cliente").fill(cliente);
    await page.locator("#sc-industry").selectOption({ label: "Canal Distribución" });
    await page.getByRole("button", { name: "Guardar cliente" }).click();
    await expect(page.getByRole("heading", { level: 2, name: cliente })).toBeVisible();

    // El cliente aún no existe en el CRM: se cotiza con la lista de su canal.
    await panel(page).getByRole("button", { name: "Cotizar" }).click();
    await expect(page.locator("#sq-account").locator("option:checked")).toHaveText(`${cliente} · sin enviar`);
    await expect(page.getByText("Lista de precios: Distribuidores 2026 · COP")).toBeVisible();
    await page.locator("#sq-name").fill(nombre);
    await agregar(page, "mb-060", MUEBLE);
    await expect(totales(page)).toContainText("$1,025,000");
    await page.getByRole("button", { name: "Guardar cotización" }).click();

    await expect(page.getByRole("heading", { level: 2, name: nombre })).toBeVisible();
    await expect(cotizacion(page).getByText(`Se enviará después del cliente «${cliente}».`)).toBeVisible();
    const pendientes = await bandeja(page);
    expect(pendientes.map(({ kind, title, status }) => ({ kind, title, status }))).toEqual([
      { kind: "account", title: cliente, status: "pending" },
      { kind: "quote", title: nombre, status: "pending" },
    ]);
    expect(pendientes[1].dependsOn).toMatch(/^[0-9a-f-]{36}$/);
    await expect(sinEnviar(page)).toHaveAccessibleName("2 sin enviar");

    // Vuelve la señal: primero el cliente y después su cotización.
    await sinEnviar(page).click();
    await context.setOffline(false);
    await expect(panel(page).getByText("Todo está enviado.")).toBeVisible();
    await expect(panel(page).getByText("Enviado", { exact: true })).toHaveCount(2);
    expect((await bandeja(page)).map((envio) => envio.status)).toEqual(["sent", "sent"]);

    // En el CRM la cotización quedó a nombre del cliente nuevo, con una oportunidad creada para ella.
    await panel(page).getByRole("button", { name: `Ver cotización: ${nombre}` }).click();
    await cotizacion(page).getByRole("link", { name: "Ver en el CRM" }).click();
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^COT-\\d+ · ${nombre}$`) })).toBeVisible();
    await expect(page.getByRole("link", { name: cliente }).first()).toBeVisible();
    await expect(page.getByText("$1,219,750").first()).toBeVisible();
    await expect(page.getByText("Cotizado sin señal")).toHaveCount(0);
  });
});

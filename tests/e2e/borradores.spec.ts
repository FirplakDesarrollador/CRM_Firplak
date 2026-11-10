import { expect, test, type Page } from "@playwright/test";
import { ingresar, sesion, unico, USUARIOS } from "./ayuda";

// Fase 1 del modo sin conexión: lo que se escribe en un formulario queda como borrador en el dispositivo, se
// recupera al volver a abrirlo y no se pierde si al guardar no hay internet.

const PREFIJO = "crm:borrador:";
const AVISO_RECUPERADO = "Recuperamos lo que estabas escribiendo y no alcanzaste a guardar.";
const AVISO_SIN_CONEXION = /Sin conexión: no se guardó\. Lo que escribiste queda en este dispositivo/;

/** Borradores guardados en este navegador, sin el usuario: «/cuentas/nueva», «/cuentas/<id>#actividad»… */
const borradores = (page: Page) =>
  page.evaluate((prefijo) => Object.keys(localStorage).filter((k) => k.startsWith(prefijo)).map((k) => k.split(":").slice(3).join(":")), PREFIJO);

const guardar = (page: Page) => page.locator("main").getByRole("button", { name: /^Guardar/ }).click();

async function crearCuenta(page: Page, nombre: string) {
  await page.goto("/cuentas/nueva");
  await page.getByLabel(/Nombre de la cuenta/).fill(nombre);
  await page.locator("#f-industry").selectOption({ label: "Canal Constructores" });
  await guardar(page);
  await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
}

test.describe("administrador", () => {
  test.use({ storageState: sesion("admin") });

  test("lo escrito en una cuenta nueva sobrevive a recargar y se puede descartar", async ({ page }) => {
    const nombre = unico("Borrador Recarga");
    await page.goto("/cuentas/nueva");
    // Abrir el formulario no crea borrador: solo lo que la persona escribe.
    await expect(page.getByLabel(/Nombre de la cuenta/)).toBeVisible();
    expect(await borradores(page)).toEqual([]);

    await page.getByLabel(/Nombre de la cuenta/).fill(nombre);
    await page.locator("#f-account_type").selectOption({ label: "Cliente" });
    await page.locator("#f-rating").selectOption({ label: "Caliente" });
    await expect.poll(() => borradores(page)).toEqual(["/cuentas/nueva"]);

    // Un borrador que dejó otra persona en este mismo dispositivo se borra al entrar.
    await page.evaluate((prefijo) => {
      localStorage.setItem(`${prefijo}otra-persona:/cuentas/nueva`, JSON.stringify({ at: Date.now(), values: { name: "Ajeno" } }));
    }, PREFIJO);

    await page.reload();
    await expect(page.getByText(AVISO_RECUPERADO)).toBeVisible();
    await expect(page.getByLabel(/Nombre de la cuenta/)).toHaveValue(nombre);
    await expect(page.locator("#f-account_type")).toHaveValue("Cliente");
    await expect(page.locator("#f-rating")).toHaveValue("Caliente");
    await expect.poll(() => borradores(page)).toEqual(["/cuentas/nueva"]);

    await page.getByRole("button", { name: "Descartar borrador" }).click();
    await expect(page.getByText(AVISO_RECUPERADO)).toHaveCount(0);
    await expect(page.getByLabel(/Nombre de la cuenta/)).toHaveValue("");
    await expect(page.locator("#f-account_type")).toHaveValue("Prospecto");
    expect(await borradores(page)).toEqual([]);

    // «Cancelar» también lo descarta.
    await page.getByLabel(/Nombre de la cuenta/).fill(nombre);
    await expect.poll(() => borradores(page)).toEqual(["/cuentas/nueva"]);
    await page.locator("main").getByRole("link", { name: "Cancelar" }).click();
    await expect(page).toHaveURL(/\/cuentas$/);
    expect(await borradores(page)).toEqual([]);
  });

  test("guardar sin conexión avisa, conserva lo escrito y guarda cuando vuelve internet", async ({ page, context }) => {
    const nombre = unico("Borrador Sin Señal");
    await page.goto("/cuentas/nueva");
    await page.getByLabel(/Nombre de la cuenta/).fill(nombre);
    await page.locator("#f-industry").selectOption({ label: "Canal Constructores" });
    await page.locator("#f-rating").selectOption({ label: "Caliente" });

    await context.setOffline(true);
    await expect(page.getByText(/Sin conexión: no se puede guardar/)).toBeVisible();
    await guardar(page);
    // El aviso sale arriba del formulario y el botón está abajo: se lleva a la vista.
    await expect(page.getByText(AVISO_SIN_CONEXION)).toBeInViewport();
    await expect(page).toHaveURL(/\/cuentas\/nueva/);
    await expect(page.getByLabel(/Nombre de la cuenta/)).toHaveValue(nombre);
    await expect(page.locator("#f-industry")).toHaveValue("Canal Constructores");
    await expect(page.locator("#f-rating")).toHaveValue("Caliente");
    expect(await borradores(page)).toEqual(["/cuentas/nueva"]);

    await context.setOffline(false);
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    expect(await borradores(page)).toEqual([]);
    // Guardado: al volver al formulario no queda nada por recuperar.
    await page.goto("/cuentas/nueva");
    await expect(page.getByLabel(/Nombre de la cuenta/)).toHaveValue("");
    await expect(page.getByText(AVISO_RECUPERADO)).toHaveCount(0);
  });

  test("si el envío falla a mitad de camino, lo escrito se conserva", async ({ page }) => {
    const nombre = unico("Borrador Envío Caído");
    await page.goto("/cuentas/nueva");
    await page.getByLabel(/Nombre de la cuenta/).fill(nombre);
    await page.locator("#f-industry").selectOption({ label: "Canal Constructores" });

    // El navegador cree que hay internet, pero la petición de guardar no llega.
    await page.route("**/cuentas/nueva", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()));
    await guardar(page);
    await expect(page.getByText(AVISO_SIN_CONEXION)).toBeVisible();
    await expect(page.getByLabel(/Nombre de la cuenta/)).toHaveValue(nombre);
    await expect(page.locator("#f-industry")).toHaveValue("Canal Constructores");
    expect(await borradores(page)).toEqual(["/cuentas/nueva"]);

    await page.unroute("**/cuentas/nueva");
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    expect(await borradores(page)).toEqual([]);
  });

  test("un guardado con errores conserva lo elegido en las listas", async ({ page }) => {
    await page.goto("/cuentas/nueva");
    await page.getByLabel(/^NIT/).fill("900123456");
    await page.locator("#f-account_type").selectOption({ label: "Cliente" });
    await page.locator("#f-rating").selectOption({ label: "Caliente" });
    await guardar(page);
    await expect(page.getByText("Revisa los campos marcados.")).toBeVisible();
    await expect(page.locator("#f-account_type")).toHaveValue("Cliente");
    await expect(page.locator("#f-rating")).toHaveValue("Caliente");
    await expect(page.getByLabel(/^NIT/)).toHaveValue("900123456");
    await page.locator("main").getByRole("link", { name: "Cancelar" }).click();
    await expect(page).toHaveURL(/\/cuentas$/);
  });

  test("al editar, un borrador de una versión anterior del registro se ofrece en vez de aplicarse", async ({ page }) => {
    const nombre = unico("Borrador Edición");
    await crearCuenta(page, nombre);
    const ficha = new URL(page.url()).pathname;

    await page.goto(`${ficha}/editar`);
    await page.getByLabel(/^Teléfono/).fill("6041234567");
    await expect.poll(() => borradores(page)).toEqual([`${ficha}/editar`]);
    await page.reload();
    // Mismo registro, sin cambios de por medio: se aplica solo.
    await expect(page.getByText(AVISO_RECUPERADO)).toBeVisible();
    await expect(page.getByLabel(/^Teléfono/)).toHaveValue("6041234567");

    // El registro cambió después de escribir el borrador (aquí, la versión guardada con el borrador ya no coincide).
    await page.evaluate((prefijo) => {
      const clave = Object.keys(localStorage).find((k) => k.startsWith(prefijo))!;
      localStorage.setItem(clave, JSON.stringify({ ...JSON.parse(localStorage.getItem(clave)!), base: "2000-01-01T00:00:00+00:00" }));
    }, PREFIJO);
    await page.reload();
    await expect(page.getByText(/Hay un borrador de este registro guardado en este dispositivo/)).toBeVisible();
    await expect(page.getByLabel(/^Teléfono/)).toHaveValue("");
    await page.getByRole("button", { name: "Recuperar borrador" }).click();
    await expect(page.getByLabel(/^Teléfono/)).toHaveValue("6041234567");

    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${ficha}$`));
    expect(await borradores(page)).toEqual([]);
  });

  test("una actividad a medio escribir se recupera y se limpia al guardarla", async ({ page }) => {
    const asunto = unico("Llamada a medias");
    await crearCuenta(page, unico("Borrador Actividad"));
    const ficha = new URL(page.url()).pathname;
    const formulario = page.locator("form", { has: page.locator("#act-subject") });

    await page.getByRole("tab", { name: "Llamada" }).click();
    await page.locator("#act-subject").fill(asunto);
    await page.locator("#act-mins").click();
    await page.keyboard.type("25");
    await expect.poll(() => borradores(page)).toEqual([`${ficha}#actividad`]);

    await page.reload();
    await expect(page.getByRole("tab", { name: "Llamada" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#act-subject")).toHaveValue(asunto);
    await expect(page.locator("#act-mins")).toHaveValue("25");
    await expect(formulario.getByText(AVISO_RECUPERADO)).toBeVisible();

    await formulario.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Actividad registrada")).toBeVisible();
    await expect(page.getByText(asunto).first()).toBeVisible();
    // Queda listo para la siguiente llamada: mismo tipo, campos vacíos y sin borrador.
    await expect(page.getByRole("tab", { name: "Llamada" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#act-subject")).toHaveValue("");
    await expect(formulario.getByText(AVISO_RECUPERADO)).toHaveCount(0);
    expect(await borradores(page)).toEqual([]);
  });
});

test("cerrar sesión borra los borradores del dispositivo", async ({ page }) => {
  await ingresar(page, USUARIOS.asesora);
  await expect(page).toHaveURL(/\/inicio/);
  await page.goto("/cuentas/nueva");
  await page.getByLabel(/Nombre de la cuenta/).fill(unico("Borrador Que Se Borra"));
  await expect.poll(() => borradores(page)).toEqual(["/cuentas/nueva"]);

  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await borradores(page)).toEqual([]);
});

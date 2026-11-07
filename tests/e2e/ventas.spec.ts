import { expect, test, type Page } from "@playwright/test";
import { activarPush, pushRecibidos, sesion, unico, usarPushSimulado } from "./ayuda";

/** Elige una opción en un campo de relación con búsqueda. */
async function buscarYElegir(page: Page, campo: string | RegExp, texto: string) {
  const entrada = page.getByLabel(campo);
  await entrada.fill(texto);
  await page.getByRole("option", { name: new RegExp(texto, "i") }).first().click();
}

const guardar = (page: Page) => page.locator("main").getByRole("button", { name: /^Guardar/ }).click();

test.describe("administrador", () => {
  test.use({ storageState: sesion("admin") });

  test("crea una cuenta, aparece en la lista y el Código SAP no se repite", async ({ page }) => {
    const nombre = unico("Constructora Prueba");
    const codigo = `T${Date.now().toString(36).toUpperCase()}`;
    await page.goto("/cuentas/nueva");
    await page.getByLabel(/Nombre de la cuenta/).fill(nombre);
    await page.getByLabel(/Código SAP/).fill(codigo.toLowerCase());
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    await page.getByRole("tab", { name: "Detalles" }).click();
    await expect(page.getByText(codigo, { exact: true }).first()).toBeVisible();

    await page.goto(`/cuentas?q=${encodeURIComponent(nombre)}`);
    await expect(page.getByRole("link", { name: nombre })).toBeVisible();

    await page.goto("/cuentas/nueva");
    await page.getByLabel(/Nombre de la cuenta/).fill(unico("Otra con el mismo código"));
    await page.getByLabel(/Código SAP/).fill(codigo);
    await guardar(page);
    await expect(page).toHaveURL(/\/cuentas\/nueva/);
    await expect(page.getByText(/ya (existe|está|tiene)|repit|otra cuenta/i).first()).toBeVisible();
  });

  test("un cliente del exterior se guarda sin NIT; uno nacional lo exige", async ({ page }) => {
    for (const mercado of ["Internacional", "Nacional"]) {
      await page.goto("/cuentas/nueva");
      await page.getByLabel(/Nombre de la cuenta/).fill(unico(`Cliente ${mercado}`));
      await expect(async () => {
        await page.locator("#f-account_type").selectOption({ label: "Cliente" });
        await page.locator("#f-market").selectOption({ label: mercado });
        await expect(page.locator("#f-market")).toHaveValue(mercado, { timeout: 1000 });
      }).toPass();
      await guardar(page);
      if (mercado === "Internacional") {
        await expect(page).toHaveURL(/\/cuentas\/[0-9a-f-]{36}/);
      } else {
        await expect(page.getByText("Las cuentas de tipo Cliente requieren NIT.").first()).toBeVisible();
        await expect(page).toHaveURL(/\/cuentas\/nueva/);
      }
    }
  });

  test("crea una oportunidad en una cuenta y la ve en el pipeline", async ({ page }) => {
    const nombre = unico("Torre de prueba");
    await page.goto("/oportunidades/nueva");
    await page.getByLabel(/Nombre de la oportunidad/).fill(nombre);
    await buscarYElegir(page, /^Cuenta/, "Casa Viva");
    await page.getByLabel(/Etapa/).selectOption({ label: "Prospección (10%)" });
    await page.getByLabel(/Valor/).fill("150000000");
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    await expect(page.getByRole("link", { name: "Almacenes Casa Viva" }).first()).toBeVisible();

    await page.goto("/oportunidades/pipeline");
    await expect(page.getByText(nombre).first()).toBeVisible();
  });

  test("registra una tarea y la completa", async ({ page }) => {
    const asunto = unico("Llamar al arquitecto");
    await page.goto("/actividades/nueva");
    await page.getByLabel(/Asunto/).fill(asunto);
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: asunto })).toBeVisible();
    await page.goto("/actividades");
    const fila = page.getByRole("listitem").filter({ hasText: asunto });
    await fila.getByRole("checkbox", { name: "Marcar como completada" }).check();
    await expect(fila.getByRole("checkbox", { name: "Marcar como pendiente" })).toBeChecked();
    await page.waitForLoadState("networkidle");
    await page.reload();
  });

  test("consulta en SAP la cartera de una cuenta y el inventario de un producto", async ({ page }) => {
    await page.goto("/cuentas?q=Casa%20Viva");
    await page.getByRole("link", { name: "Almacenes Casa Viva" }).first().click();
    await page.getByRole("tab", { name: "SAP" }).click();
    await expect(page.getByText(/cupo/i).first()).toBeVisible();
  });

  test("al activar un pedido crea su oferta de venta en SAP", async ({ page }) => {
    await page.goto("/configuracion/sap");
    const oferta = page.getByRole("checkbox", { name: /crear su oferta de venta/ });
    await oferta.check();
    await page.getByRole("button", { name: "Guardar", exact: true }).first().click();
    await page.waitForLoadState("networkidle");

    const nombre = unico("Pedido de prueba");
    await page.goto("/pedidos/nuevo");
    await page.getByLabel(/Nombre del pedido/).fill(nombre);
    await buscarYElegir(page, /^Cuenta/, "Casa Viva");
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(nombre) })).toBeVisible();

    await buscarYElegir(page, /producto/i, "DEMO-MB-060");
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("DEMO-MB-060").first()).toBeVisible();

    await page.getByRole("list", { name: "Estado" }).getByRole("button", { name: "Activado" }).click();
    await page.getByRole("tab", { name: "SAP" }).click();
    await expect(page.getByText(/oferta/i).first()).toBeVisible();
    await expect(page.getByText(/^6\d{3}$|N\.º.*6\d{3}/).first()).toBeVisible();
  });
});

test.describe("aprobaciones", () => {
  test("un descuento alto va a aprobación, el jefe recibe el push y lo aprueba", async ({ browser }) => {
    const contextoGerente = await browser.newContext({ storageState: sesion("gerente") });
    const dispositivo = await usarPushSimulado(contextoGerente);
    const gerente = await contextoGerente.newPage();
    await activarPush(gerente);

    const asesora = await (await browser.newContext({ storageState: sesion("asesora") })).newPage();
    await asesora.goto("/cotizaciones");
    await asesora.getByRole("link", { name: "COT-1001" }).click();
    const linea = asesora.getByRole("list").filter({ has: asesora.getByRole("textbox", { name: "Descuento %" }) }).getByRole("listitem").first();
    await linea.getByRole("textbox", { name: "Descuento %" }).fill("25");
    await linea.getByRole("button", { name: "Guardar" }).click();
    await asesora.waitForLoadState("networkidle");
    await asesora.reload();
    await asesora.getByRole("button", { name: /enviar a aprobaci/i }).click();
    await expect(asesora.getByText(/pendiente|en revisión|espera/i).first()).toBeVisible();

    // La notificación de la campana también llega como push, cifrada y con el enlace al registro.
    await expect.poll(() => pushRecibidos(dispositivo), { timeout: 30_000 }).toEqual([expect.objectContaining({ link: expect.stringMatching(/^\/cotizaciones\//) })]);

    await gerente.goto("/aprobaciones");
    await expect(gerente.getByText(/COT-1001|Remodelación 180/).first()).toBeVisible();
    await gerente.getByRole("button", { name: "Aprobar" }).first().click();
    await gerente.waitForLoadState("networkidle");
    await gerente.reload();
    await expect(gerente.getByText("No tienes solicitudes por aprobar.")).toBeVisible();

    await asesora.context().close();
    await gerente.context().close();
  });
});

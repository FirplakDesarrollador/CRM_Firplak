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
    await page.locator("#f-industry").selectOption({ label: "Canal Constructores" });
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    await page.getByRole("tab", { name: "Detalles" }).click();
    await expect(page.getByText(codigo, { exact: true }).first()).toBeVisible();

    await page.goto(`/cuentas?q=${encodeURIComponent(nombre)}`);
    await expect(page.getByRole("link", { name: nombre })).toBeVisible();

    await page.goto("/cuentas/nueva");
    await page.getByLabel(/Nombre de la cuenta/).fill(unico("Otra con el mismo código"));
    await page.getByLabel(/Código SAP/).fill(codigo);
    await page.locator("#f-industry").selectOption({ label: "Canal Constructores" });
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
        await page.locator("#f-industry").selectOption({ label: "Canal Distribución" });
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
    // Casa Viva es del Canal Distribución: solo se ofrecen las etapas de su pipeline.
    await expect(page.getByText("Pipeline del Canal Distribución: Distribución y retail.")).toBeVisible();
    await expect(page.getByLabel(/Etapa/).locator("option", { hasText: "Prospección" })).toHaveCount(0);
    await page.getByLabel(/Etapa/).selectOption({ label: "Contacto inicial (10%)" });
    await page.getByLabel(/Valor/).fill("150000000");
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    await expect(page.getByRole("link", { name: "Almacenes Casa Viva" }).first()).toBeVisible();

    await page.goto("/oportunidades/pipeline");
    await page.getByLabel("Pipeline", { exact: true }).selectOption({ label: "Canal Distribución · Distribución y retail" });
    await expect(page.getByText(nombre).first()).toBeVisible();
  });

  test("una cotización sin oportunidad crea la suya en el pipeline del canal, factura a la cuenta y usa la lista propia del cliente", async ({ page }) => {
    const nombre = unico("Cotización canal");
    await page.goto("/cotizaciones/nueva");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Nombre de la cotización/).fill(nombre);
    await buscarYElegir(page, /^Facturar a/, "Casa Viva");
    // Direcciones y condiciones de pago vienen de la cuenta y no se editan…
    await expect(page.locator("#f-billing_address")).toHaveValue(/Av\. Boyacá/);
    await expect(page.locator("#f-billing_address")).toBeDisabled();
    await expect(page.locator("#f-payment_terms")).toHaveValue("60 días");
    await expect(page.locator("#f-shipping_address")).toBeDisabled();
    // …salvo la entrega con su casilla: se parte de la dirección de la cuenta y se cambia.
    await page.getByLabel("Entregar en otra dirección").check();
    await expect(page.locator("#f-shipping_address")).toBeEnabled();
    await expect(page.locator("#f-shipping_address")).toHaveValue(/Av\. Boyacá/);
    await page.locator("#f-shipping_address").fill("Bodega del cliente final, Funza");
    await guardar(page);
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);
    await expect(page.getByText("Sincronizada").first()).toBeVisible();

    // Un producto codificado del cliente toma su precio; uno no codificado, el de la lista del canal, marcado.
    for (const ref of ["DEMO-MB-060", "DEMO-CO-240"]) {
      await expect(async () => {
        await page.locator("#ql-product").fill(ref);
        await page.getByRole("option", { name: new RegExp(ref) }).first().click({ timeout: 2000 });
      }).toPass();
      await page.getByRole("button", { name: "Agregar" }).click();
      await expect(page.getByText(ref).first()).toBeVisible();
    }
    const fila = (ref: string) => page.getByRole("listitem").filter({ hasText: ref });
    await expect(fila("DEMO-MB-060").getByLabel("Precio unitario")).toHaveValue("960000");
    await expect(fila("DEMO-MB-060").getByText("No codificado")).toHaveCount(0);
    await expect(fila("DEMO-CO-240").getByLabel("Precio unitario")).toHaveValue("5248000");
    await expect(fila("DEMO-CO-240").getByText("No codificado")).toBeVisible();

    await page.getByRole("tab", { name: "Detalles" }).click();
    await expect(page.getByText("Casa Viva 2026").first()).toBeVisible();
    await expect(page.getByText("Bodega del cliente final, Funza").first()).toBeVisible();
    await expect(page.getByText("60 días").first()).toBeVisible();

    // La oportunidad nueva lleva el nombre de la cotización, está en el pipeline del canal y vale lo cotizado.
    // (los nombres de oportunidad se guardan con mayúscula inicial en cada palabra)
    await page.getByRole("link", { name: new RegExp(nombre.split(" ").slice(-1)[0], "i") }).first().click();
    await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}/);
    await expect(page.getByText("Distribución y retail").first()).toBeVisible();
    await expect(page.getByText("$6,208,000").first()).toBeVisible();
  });

  test("«Facturar a» debe ser la cuenta de la oportunidad", async ({ page }) => {
    await page.goto("/cotizaciones/nueva");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Nombre de la cotización/).fill(unico("Cuenta cruzada"));
    await buscarYElegir(page, /^Oportunidad/, "Exhibición nueva tienda");
    // Al elegir la oportunidad, «Facturar a» toma su cuenta.
    await expect(page.locator("main").getByText("Distribuidora Hogar y Acabados Ltda.").first()).toBeVisible();
    await page.getByRole("button", { name: "Quitar selección" }).nth(1).click();
    await buscarYElegir(page, /^Facturar a/, "Casa Viva");
    await guardar(page);
    await expect(page.getByText(/debe ser la misma de la oportunidad \(Distribuidora Hogar y Acabados Ltda\.\)/).first()).toBeVisible();
    await expect(page).toHaveURL(/\/cotizaciones\/nueva/);
  });

  test("Indicadores muestra un embudo por canal", async ({ page }) => {
    await page.goto("/indicadores");
    await expect(page.getByRole("heading", { name: "Embudos de ventas por canal" })).toBeVisible();
    const constructores = page.getByRole("region", { name: "Embudo Canal Constructores" });
    const distribucion = page.getByRole("region", { name: "Embudo Canal Distribución" });
    await expect(constructores.getByText("Especificación técnica", { exact: true })).toBeVisible();
    await expect(constructores.getByText("Muestras y catálogo", { exact: true })).toHaveCount(0);
    await expect(distribucion.getByText("Muestras y catálogo", { exact: true })).toBeVisible();
    await expect(distribucion.getByText("Especificación técnica", { exact: true })).toHaveCount(0);
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
  test("una cotización con descuento alto no se puede presentar sin pasar por aprobación", async ({ browser }) => {
    const asesora = await (await browser.newContext({ storageState: sesion("asesora") })).newPage();
    await asesora.goto("/oportunidades");
    await asesora.getByRole("link", { name: "Hogar y Acabados · Exhibición nueva tienda Chía" }).first().click();
    await asesora.getByRole("link", { name: "Nueva cotización" }).click();
    await expect(asesora).toHaveURL(/\/cotizaciones\/nueva/);
    await asesora.waitForLoadState("networkidle");
    await guardar(asesora);
    await expect(asesora).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);

    await expect(async () => {
      await asesora.locator("#ql-product").fill("mueble");
      await asesora.getByRole("option").first().click({ timeout: 2000 });
    }).toPass();
    await asesora.locator("#ql-disc").fill("20");
    await asesora.getByRole("button", { name: "Agregar" }).click();
    await expect(asesora.getByText("Requiere aprobación:")).toBeVisible();

    // Saltar a «Presentada» desde la barra de estados se rechaza y la cotización sigue en Borrador.
    await asesora.getByRole("list", { name: "Estado" }).getByRole("button", { name: "Presentada", exact: true }).click();
    await expect(asesora.getByText(/requiere aprobación .*antes de pasarla a «Presentada»/)).toBeVisible();
    await asesora.reload();
    await expect(asesora.getByRole("list", { name: "Estado" }).getByRole("button", { name: "Borrador", exact: true })).toBeDisabled();
    await expect(asesora.getByRole("button", { name: /enviar a aprobaci/i })).toBeVisible();
  });

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

import { expect, test, type Page } from "@playwright/test";
import { sesion, unico } from "./ayuda";

// Cotización corta y pedido completo: la cotización pide la cuenta primero, la ciudad de entrega, la validez y, en el
// Canal Constructores, el segmento de obra y el tipo; Carpintería de Obra admite tipologías escritas a mano; el pedido
// agrega contactos y despacho; los impresos traen bancos, correo de facturación electrónica y el rol de cada contacto.

async function buscarYElegir(page: Page, campo: string | RegExp, texto: string) {
  const entrada = page.getByLabel(campo);
  await entrada.fill(texto);
  await page.getByRole("option", { name: new RegExp(texto, "i") }).first().click();
}
const guardar = (page: Page) => page.locator("main").getByRole("button", { name: /^Guardar/ }).click();
const estado = (page: Page, nombre: string) => page.getByRole("list", { name: "Estado" }).getByRole("button", { name: nombre });

test.describe("cotización corta y pedido completo", () => {
  test.use({ storageState: sesion("admin") });

  test("Carpintería de Obra: de la cotización con tipologías al pedido impreso", async ({ page }) => {
    // Administración carga las formas de pago que salen en los impresos.
    const banco = unico("BANCO DE PRUEBA Cta Cte 000-000 | Convenio");
    await page.goto("/configuracion/documentos");
    await page.locator('textarea[name="payment_lines"]').fill(`${banco}\nOTRO BANCO Cta Cte 111-111`);
    await page.locator('input[name="payment_note"]').fill("Enviar soporte a cartera de prueba.");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Guardado. Las cotizaciones y los pedidos ya se imprimen con estos datos.")).toBeVisible();

    // Cuenta del Canal Constructores con ciudad y correo de facturación electrónica, y dos contactos con rol.
    const cuenta = unico("Constructora Tipologías");
    await page.goto("/cuentas/nueva");
    await page.getByLabel(/Nombre de la cuenta/).fill(cuenta);
    await page.locator("#f-industry").selectOption({ label: "Canal Constructores" });
    await page.locator("#f-tax_id").fill(`900${Date.now().toString().slice(-6)}-1`);
    await page.locator("#f-einvoice_email").fill("facturas@tipologias.example");
    await page.locator("#f-billing_street").fill("Calle 6 Norte # 2-36");
    await page.locator("#f-billing_state").selectOption("Valle del Cauca");
    await page.locator("#f-billing_city").selectOption("Cali");
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: cuenta })).toBeVisible();
    const contacto = async (apellido: string, rol: string) => {
      await page.goto("/contactos/nuevo");
      await page.waitForLoadState("networkidle");
      await page.getByLabel(/Apellidos/).fill(apellido);
      await buscarYElegir(page, /^Cuenta/, cuenta);
      await page.locator("#f-contact_role").selectOption(rol);
      await guardar(page);
      await expect(page.getByRole("heading", { level: 1, name: new RegExp(apellido, "i") })).toBeVisible();
    };
    // Los nombres de persona se guardan con mayúscula inicial: se buscan sin distinguir mayúsculas.
    const compras = unico("Compradora");
    const logistica = unico("Bodeguero");
    await contacto(compras, "Compras");
    await contacto(logistica, "Logística");

    // Cotización: la cuenta va arriba; segmento y tipo aparecen al elegir una cuenta de Constructores.
    const nombre = unico("Cocinas Torre Norte");
    await page.goto("/cotizaciones/nueva");
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel(/^Facturar a/)).toHaveCount(0);
    await expect(page.locator("#f-project_segment")).toHaveCount(0);
    await expect(page.locator("#f-validity_days")).toHaveValue("30");
    await page.getByLabel(/Nombre de la cotización/).fill(nombre);
    await buscarYElegir(page, /^Cuenta/, cuenta);
    await expect(page.locator("#f-delivery_city")).toHaveValue("Cali");
    await expect(page.locator("#f-project_segment")).toBeVisible();
    // El contacto se busca solo entre los de la cuenta elegida.
    await page.getByLabel(/^Contacto/).fill("a");
    await expect(page.getByRole("option", { name: new RegExp(compras, "i") })).toBeVisible();
    // «Castaño» es un contacto de otra cuenta de la demostración: también tiene «a», pero no aparece.
    await expect(page.getByRole("option", { name: /Castaño/ })).toHaveCount(0);
    await page.getByRole("option", { name: new RegExp(compras, "i") }).click();
    // Sin segmento de obra no guarda.
    await guardar(page);
    await expect(page.getByText("Revisa los campos marcados.").first()).toBeVisible();
    await expect(page).toHaveURL(/\/cotizaciones\/nueva/);
    await page.locator("#f-project_segment").selectOption("Obras Vis/Vip");
    await page.locator("#f-sale_type").selectOption("Carpintería de Obra");
    await page.locator("#f-validity_days").selectOption("15");
    await page.locator("#f-delivery_city").fill("Palmira");
    await page.locator("#f-end_customer_name").fill("Conjunto Torre Norte");
    await guardar(page);
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);
    const cotizacion = page.url().split("?")[0];

    // Tipologías escritas a mano: valor, descuento y neto. También se mezcla un producto del catálogo.
    const tipologia = async (texto: string, valor: string, cantidad = "1") => {
      await page.locator("#ql-typology").fill(texto);
      await page.locator("#ql-qty").fill(cantidad);
      await page.locator("#ql-price").fill(valor);
      await page.locator("#ql-disc").fill("25");
      await page.getByRole("button", { name: "Agregar" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: texto })).toBeVisible();
    };
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("Escribe la tipología").first()).toBeVisible();
    await tipologia("Tipología de Cocina L", "100000");
    await tipologia("Tipología de Cocina U - Apto B", "200000", "2");
    const fila = (texto: string) => page.getByRole("listitem").filter({ hasText: texto });
    await expect(fila("Tipología de Cocina L").getByText("$75,000")).toBeVisible();
    await expect(fila("Tipología de Cocina L").getByText("A medida")).toBeVisible();
    await expect(fila("Tipología de Cocina U - Apto B").getByText("$300,000")).toBeVisible();
    await page.getByRole("button", { name: "Producto del catálogo" }).click();
    await expect(async () => {
      await page.locator("#ql-product").fill("DEMO-MB-060");
      await page.getByRole("option", { name: /DEMO-MB-060/ }).first().click({ timeout: 2000 });
    }).toPass();
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(fila("DEMO-MB-060")).toBeVisible();

    // El impreso: validez, segmento y tipo, correo de facturación electrónica, contacto con su rol y bancos.
    const impreso = cotizacion.replace("/cotizaciones/", "/imprimir/cotizacion/");
    await page.goto(impreso);
    const hoja = page.locator("article");
    await expect(hoja).toContainText("Validez de la oferta: 15 días");
    await expect(hoja).toContainText("Obras Vis/Vip · Carpintería de Obra");
    await expect(hoja).toContainText("Facturación electrónica: facturas@tipologias.example");
    await expect(hoja).toContainText("Ciudad: Palmira");
    await expect(hoja).toContainText("Cliente final: Conjunto Torre Norte");
    await expect(hoja).toContainText(new RegExp(`Compras:\\s*${compras}`, "i"));
    await expect(hoja).toContainText(banco);
    await expect(hoja).toContainText("Enviar soporte a cartera de prueba.");
    await expect(hoja).toContainText("Tipología de Cocina U - Apto B");
    await expect(hoja).toContainText("Aceptado por el cliente");
    await expect(hoja).toContainText("Somos autorretenedores");
    const pdf = await page.request.get(`${impreso}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    // Presentada y aceptada: el segmento ya está en la oportunidad y pasa al pedido.
    await page.goto(cotizacion);
    await estado(page, "Presentada").click();
    // El estado actual queda marcado (su botón ya no se puede pulsar).
    await expect(estado(page, "Presentada")).toBeDisabled();
    await estado(page, "Aceptada").click();
    await page.getByRole("dialog").getByRole("button", { name: "Sí, aceptada" }).click();
    await page.getByRole("button", { name: "Crear pedido" }).click();
    await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}/);
    const pedido = page.url().split("?")[0];
    await expect(fila("Tipología de Cocina L").getByText("A medida")).toBeVisible();

    // El pedido completa lo que la cotización no pidió: contactos de logística, dirección y despacho.
    await page.goto(`${pedido}/editar`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#f-project_segment")).toHaveValue("Obras Vis/Vip");
    await expect(page.locator("#f-sale_type")).toHaveValue("Carpintería de Obra");
    await expect(page.locator("#f-delivery_city")).toHaveValue("Palmira");
    await expect(page.locator("#f-end_customer_name")).toHaveValue("Conjunto Torre Norte");
    await buscarYElegir(page, /^Contacto de logística/, logistica);
    await page.locator("#f-shipping_address").fill("Obra Torre Norte, portería 2");
    await page.locator("#f-delivery_type").selectOption("Entrega en obra");
    await page.locator("#f-delivery_floor").fill("4");
    await page.getByLabel("Servicio de subida").check();
    await guardar(page);
    await expect(page).toHaveURL(new RegExp(`${pedido.split("/").pop()}$`));
    await page.getByRole("link", { name: "Imprimir / PDF" }).waitFor();
    const pedidoImpreso = pedido.replace("/pedidos/", "/imprimir/pedido/");
    await page.goto(pedidoImpreso);
    await expect(hoja).toContainText("Pedido");
    await expect(hoja).toContainText("Facturación electrónica: facturas@tipologias.example");
    await expect(hoja).toContainText(new RegExp(`Compras:\\s*${compras}`, "i"));
    await expect(hoja).toContainText(new RegExp(`Logística:\\s*${logistica}`, "i"));
    await expect(hoja).toContainText("Obra Torre Norte, portería 2");
    await expect(hoja).toContainText("Tipo de entrega: Entrega en obra");
    await expect(hoja).toContainText("Servicio de subida: Sí");
    await expect(hoja).toContainText("Obras Vis/Vip · Carpintería de Obra");
    await expect(hoja).toContainText(banco);
    const pedidoPdf = await page.request.get(`${pedidoImpreso}/pdf`);
    expect(pedidoPdf.status()).toBe(200);
    expect(pedidoPdf.headers()["content-disposition"]).toMatch(/filename="PED-\d+\.pdf"/);

    // La oportunidad quedó con el segmento y el tipo de la cotización.
    await page.goto(cotizacion);
    await page.getByRole("tab", { name: "Detalles" }).click();
    await expect(page.locator("main")).toContainText("Obras Vis/Vip");
  });

  test("otros canales no piden segmento ni tipo, y una cotización Estándar no admite tipologías", async ({ page }) => {
    await page.goto("/cotizaciones/nueva");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Nombre de la cotización/).fill(unico("Surtido estándar"));
    await buscarYElegir(page, /^Cuenta/, "Casa Viva");
    await expect(page.locator("#f-delivery_city")).not.toHaveValue("");
    await expect(page.locator("#f-project_segment")).toHaveCount(0);
    await expect(page.locator("#f-sale_type")).toHaveCount(0);
    await guardar(page);
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);
    await expect(page.getByRole("button", { name: "Tipología a medida" })).toHaveCount(0);
    await expect(page.locator("#ql-product")).toBeVisible();
  });

  test("una cotización vencida se marca, no se acepta y se renueva en otra con fecha de hoy", async ({ page }) => {
    await page.goto("/cotizaciones");
    await page.getByRole("row", { name: /Altos del Valle · borrador anterior/ }).getByRole("link", { name: /^COT-/ }).click();
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);
    const vencida = page.url().split("?")[0];
    await expect(page.locator("main").getByText("Vencida", { exact: true })).toBeVisible();
    await expect(page.getByText(/Esta cotización venció el .* y ya no se puede aceptar/)).toBeVisible();
    await page.getByRole("button", { name: "Renovar" }).click();
    // La renovada es otra cotización, en Borrador y vigente; la anterior queda Reemplazada y enlaza a la nueva.
    await expect(page).not.toHaveURL(vencida);
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name: /Altos del Valle · borrador anterior/ })).toBeVisible();
    await expect(page.locator("main").getByText("Vencida", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Renovar" })).toHaveCount(0);
    await page.goto(vencida);
    await expect(page.getByRole("link", { name: /Renovada en COT-/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Renovar" })).toHaveCount(0);
  });
});

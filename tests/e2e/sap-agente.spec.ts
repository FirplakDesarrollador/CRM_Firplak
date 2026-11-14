import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { sesion } from "./ayuda";

// El agente de SAP (agente-sap/agente.mjs) corre de verdad contra el SAP simulado y la base de la demo;
// el CRM muestra la copia que dejó, con su hora, en vez de consultar SAP en vivo.
const correrAgente = (...comando: string[]) => {
  const cfg = JSON.parse(readFileSync("test-results/agente-sap-demo.json", "utf8"));
  return execFileSync(process.execPath, ["agente-sap/agente.mjs", ...(comando.length ? comando : ["correr", "--ahora"])], {
    encoding: "utf8",
    env: { ...process.env, AGENTE_SAP_CONFIG: "test-results/agente-sap-demo.json", AGENTE_SAP_PASSWORD: cfg.demoSapPassword, AGENTE_CRM_PASSWORD: cfg.demoCrmPassword },
  });
};

/** Elige la primera planta de un selector, si la lista de valores de plantas tiene alguna. */
async function elegirPlanta(selector: Locator) {
  if ((await selector.locator("option").count()) > 1) await selector.selectOption({ index: 1 });
}

async function elegirOrigen(page: Page, origen: RegExp) {
  await page.goto("/configuracion/sap");
  await page.getByRole("radio", { name: origen }).check();
  await page.getByRole("button", { name: "Guardar origen" }).click();
  await expect(page.getByText("Preferencias guardadas")).toBeVisible();
}

const abrirSapDeCasaViva = async (page: Page) => {
  await page.goto("/cuentas?q=Casa%20Viva");
  await page.getByRole("link", { name: "Almacenes Casa Viva" }).first().click();
  await page.getByRole("tab", { name: "SAP" }).click();
};

test.describe("SAP por agente", () => {
  test.use({ storageState: sesion("admin") });

  test("la ficha muestra la copia que trajo el agente, con su hora, y la corrida queda registrada", async ({ page }) => {
    try {
      await elegirOrigen(page, /Copia del agente/);

      // Antes de la primera corrida no hay copia: lo dice sin error.
      await abrirSapDeCasaViva(page);
      await expect(page.getByText(/Todavía no se ha traído de SAP/)).toBeVisible();

      const salida = correrAgente();
      expect(salida).toMatch(/0 errores/);

      await page.reload();
      await expect(page.getByText("Saldo de cartera")).toBeVisible();
      await expect(page.getByText(/Actualizado/)).toBeVisible();
      await expect(page.getByRole("cell", { name: "41210" })).toBeVisible();
      await expect(page.getByRole("cell", { name: "OC-CV-2231" })).toBeVisible();

      // Totales sin y con IVA, y las entregas que aún no se facturan.
      await expect(page.getByRole("columnheader", { name: "Total sin IVA" }).first()).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Total con IVA" }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: /Entregas sin facturar/ })).toBeVisible();
      await expect(page.getByRole("cell", { name: "52301" })).toBeVisible();

      // El número del pedido abre sus líneas: cada una con su fecha de despacho y lo que ya está en despacho.
      await page.getByRole("button", { name: "41210" }).click();
      const ventana = page.getByRole("dialog");
      await expect(ventana.getByRole("heading", { name: /Pedido 41210/ })).toBeVisible();
      await expect(ventana.getByRole("row")).toHaveCount(4);
      const pendiente = ventana.getByRole("row").nth(2);
      // 60 pedidas, 0 facturadas, 25 en despacho (producción terminada) y 35 por producir.
      await expect(pendiente.getByRole("cell").nth(0)).toContainText("MUEBLE DE BAÑO FLOTANTE 60 CM");
      await expect(pendiente.getByRole("cell").nth(0)).toContainText("DEMO-MB-060");
      await expect(pendiente.getByRole("cell").nth(1)).toHaveText("60");
      await expect(pendiente.getByRole("cell").nth(2)).toHaveText("0");
      await expect(pendiente.getByRole("cell").nth(3)).toHaveText("25");
      await expect(pendiente.getByRole("cell").nth(4)).toHaveText("35");
      await expect(pendiente.getByRole("cell").nth(5)).toContainText("Abierta");
      await expect(ventana.getByRole("row").nth(1)).toContainText("Entregada");
      // En un pedido corto no hay resumen: repetiría lo que ya se ve.
      await expect(ventana.getByRole("definition")).toHaveCount(0);
      // La ventana usa el ancho disponible (hasta 76rem).
      expect((await ventana.boundingBox())!.width).toBeGreaterThan(1100);
      await ventana.getByRole("button", { name: "Cerrar" }).click();
      await expect(ventana).toBeHidden();

      // Un pedido de muchas líneas sí lleva el resumen arriba.
      await page.goto("/cuentas?q=Altos%20del%20Valle");
      await page.getByRole("link", { name: /Constructora Altos del Valle/ }).first().click();
      await page.getByRole("tab", { name: "SAP" }).click();
      await page.getByRole("button", { name: "41188" }).click();
      const larga = page.getByRole("dialog");
      await expect(larga.getByRole("row")).toHaveCount(7);
      // 60 pedidas, 20 facturadas, 40 en despacho (sale de bodega) y 0 por producir.
      await expect(larga.getByRole("definition")).toHaveText(["60", "20", "40", "0"]);
      await larga.getByRole("button", { name: "Cerrar" }).click();

      // El inventario de un producto también sale de la copia.
      await page.goto("/productos?q=DEMO-MB-060");
      await page.getByRole("link", { name: /Mueble/i }).first().click();
      await page.getByRole("tab", { name: "SAP" }).click();
      await expect(page.getByText("En inventario").first()).toBeVisible();
      await expect(page.getByText(/Actualizado/)).toBeVisible();

      await page.goto("/configuracion/sap");
      await expect(page.getByText("Última correcta")).toBeVisible();
      await expect(page.getByRole("cell", { name: "Correcta" }).first()).toBeVisible();
    } finally {
      // Las demás pruebas usan la consulta en vivo contra el SAP simulado.
      await elegirOrigen(page, /Consulta en vivo/);
    }
  });

  test("importa de SAP por medio del agente solo los artículos que se eligen de la lista", async ({ page }) => {
    try {
      await elegirOrigen(page, /Copia del agente/);
      await page.getByLabel(/Solo códigos que empiezan por/).fill("FP-CO-");
      await page.getByRole("button", { name: /Guardar y ver artículos/ }).click();
      // La solicitud queda esperando al agente; nada más pasa hasta que él la atienda.
      await expect(page.getByText(/Enviado al agente de SAP/)).toBeVisible();
      expect(correrAgente("atender")).toMatch(/1 solicitudes atendidas/);
      // Llega la lista completa del filtro: 14 artículos FP-CO- (dos no son de venta) y un kit.
      await expect(page.getByText("13 artículos de SAP con ese filtro. Elige los que quieres importar.")).toBeVisible();
      await expect(page.getByRole("cell", { name: "FP-CO-102", exact: true })).toBeVisible();
      await expect(page.getByText("0 de 13 elegidos")).toBeVisible();

      // Sin marcar nada no se importa nada.
      await page.getByRole("button", { name: /Importar seleccionados/ }).click();
      await expect(page.getByText("Marca al menos un artículo de la lista para importarlo.")).toBeVisible();

      // Buscar en la lista y marcar dos.
      await page.getByPlaceholder("Buscar en la lista").fill("ref 102");
      await expect(page.getByRole("checkbox", { name: /^Elegir FP-CO-/ })).toHaveCount(1);
      await page.getByRole("checkbox", { name: "Elegir FP-CO-102" }).check();
      await page.getByPlaceholder("Buscar en la lista").fill("");
      await page.getByRole("checkbox", { name: "Elegir FP-CO-106" }).check();
      await expect(page.getByText("2 de 13 elegidos")).toBeVisible();
      // La lista trae de SAP el grupo de cada artículo.
      await expect(page.getByRole("row", { name: /FP-CO-102/ })).toContainText("COC03-Kit de cocinas");

      // Con plantas en la lista de valores, la planta es obligatoria: sin ella no se envía nada.
      if ((await page.locator("#sap-plant option").count()) > 1) {
        await page.getByRole("button", { name: "Importar seleccionados (2)" }).click();
        await expect(page.getByRole("alert").filter({ hasText: "Falta elegir" })).toContainText("la planta de los artículos elegidos");
        await elegirPlanta(page.locator("#sap-plant"));
      }
      // El grupo queda atado a la familia: sin elegirla no se importa.
      await page.getByRole("button", { name: "Importar seleccionados (2)" }).click();
      await expect(page.getByText("Para traer el Grupo de Artículo, elige la Familia: el grupo queda atado a ella.")).toBeVisible();
      await page.locator("#sap-family").selectOption("Cocinas");
      await elegirPlanta(page.locator("#sap-plant"));
      await page.getByRole("button", { name: "Importar seleccionados (2)" }).click();
      await expect(page.getByText(/Enviado al agente de SAP/)).toBeVisible();
      expect(correrAgente("atender")).toMatch(/1 solicitudes atendidas/);
      await expect(page.getByText("2 artículos leídos de SAP: 2 productos creados y 0 actualizados. Se agregó 1 grupo de artículo a la lista de valores.")).toBeVisible();

      // Entraron esos dos y ninguno más.
      await page.goto("/productos?q=FP-CO-");
      await expect(page.getByRole("link", { name: /COCINA INTEGRAL REF 102/ }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /COCINA INTEGRAL REF 106/ }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /COCINA INTEGRAL REF 110/ })).toHaveCount(0);
      // El producto entró con la familia elegida y el grupo de SAP, que ya está en la lista de valores.
      await page.getByRole("link", { name: /COCINA INTEGRAL REF 102/ }).first().click();
      await expect(page.getByText("COC03-Kit de cocinas").first()).toBeVisible();
      await expect(page.getByText("Cocinas", { exact: true }).first()).toBeVisible();

      // Un kit: al marcarlo aparecen sus componentes, con su cantidad y un selector de planta para cada uno.
      await page.goto("/configuracion/sap");
      await page.getByRole("button", { name: /Guardar y ver artículos/ }).click();
      await expect(page.getByText(/Enviado al agente de SAP/)).toBeVisible();
      correrAgente("atender");
      const kit = page.getByRole("row", { name: /FP-CO-KIT1/ });
      await expect(kit).toContainText("Kit · 2 componentes");
      await expect(page.getByRole("cell", { name: /FP-LV-101/ })).toHaveCount(0);
      await page.getByRole("checkbox", { name: "Elegir FP-CO-KIT1" }).check();
      await expect(page.getByRole("row", { name: /FP-LV-101/ })).toContainText("× 1");
      await expect(page.getByRole("row", { name: /FP-MB-104/ })).toContainText("× 2");
      await page.locator("#sap-family").selectOption("Cocinas");
      const plantaLavamanos = page.getByLabel("Planta de FP-LV-101");
      if (await plantaLavamanos.count()) {
        // Con plantas en la lista de valores, cada componente tiene que llevar la suya.
        await page.getByRole("button", { name: "Importar seleccionados (1)" }).click();
        await expect(page.getByRole("alert").filter({ hasText: "Falta elegir" })).toContainText("FP-LV-101");
        await elegirPlanta(plantaLavamanos);
        await elegirPlanta(page.getByLabel("Planta de FP-MB-104"));
      }
      await page.getByRole("button", { name: "Importar seleccionados (1)" }).click();
      await expect(page.getByText(/Enviado al agente de SAP/)).toBeVisible();
      expect(correrAgente("atender")).toMatch(/1 solicitudes atendidas/);
      // Entran el kit y sus dos componentes, aunque los componentes no se marcaron.
      await expect(page.getByText(/3 artículos leídos de SAP: 3 productos creados y 0 actualizados\. 1 kit quedó con sus componentes\./)).toBeVisible();
      await page.goto("/productos?q=FP-CO-KIT1");
      await page.getByRole("link", { name: /KIT COCINA CON LAVAMANOS/ }).first().click();
      await expect(page.getByText("KIT", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: /LAVAMANOS REF 101/ })).toBeVisible();
      await expect(page.getByRole("link", { name: /MUEBLE BAÑO REF 104/ })).toBeVisible();

      // Al volver a listar, la lista dice cuáles ya están en el CRM.
      await page.goto("/configuracion/sap");
      await page.getByRole("button", { name: /Guardar y ver artículos/ }).click();
      await expect(page.getByText(/Enviado al agente de SAP/)).toBeVisible();
      correrAgente("atender");
      await expect(page.getByRole("row", { name: /FP-CO-102/ })).toContainText("Ya está");
      await expect(page.getByRole("row", { name: /FP-CO-110/ })).not.toContainText("Ya está");
    } finally {
      await elegirOrigen(page, /Consulta en vivo/);
    }
  });
});

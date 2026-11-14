import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { sesion } from "./ayuda";

// El agente de SAP (agente-sap/agente.mjs) corre de verdad contra el SAP simulado y la base de la demo;
// el CRM muestra la copia que dejó, con su hora, en vez de consultar SAP en vivo.
const correrAgente = () => {
  const cfg = JSON.parse(readFileSync("test-results/agente-sap-demo.json", "utf8"));
  return execFileSync(process.execPath, ["agente-sap/agente.mjs", "correr", "--ahora"], {
    encoding: "utf8",
    env: { ...process.env, AGENTE_SAP_CONFIG: "test-results/agente-sap-demo.json", AGENTE_SAP_PASSWORD: cfg.demoSapPassword, AGENTE_CRM_PASSWORD: cfg.demoCrmPassword },
  });
};

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
});

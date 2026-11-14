import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { sesion } from "./ayuda";

// Ventas reales de SAP: el agente sube el CSV del mes y el CRM las muestra en Indicadores (con las
// sucursales de un mismo cliente sumadas), en la ficha del cliente y por vendedor en Configuración → SAP.
const hoy = new Date();
const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
const CSV = [
  "Fecha,Mes,Año,# Factura,TipoVentas,Zona,Territorio,Grupo de Cliente,Vendedor Senior,Código Cliente,Nombre cliente,Valor Total",
  `${mes}-01,x,${hoy.getFullYear()},9001,Nacional,CENTRO DEL PAIS,Meta,Canal Distribución,LUIS DEMO,CN900100200-67,MAXI S A S ACACIAS,5000000`,
  `${mes}-01,x,${hoy.getFullYear()},9002,Nacional,TOLIMA GRANDE,Tolima,Canal Distribución,CAMILA ASESORA,CN900100200-74,MAXI S A S IBAGUE,3000000`,
  `${mes}-01,x,${hoy.getFullYear()},9003,Excluido,CENTRO DEL PAIS,"Bogotá, D.C.",Canal Constructores,LUIS DEMO,C20001,ALMACENES CASA VIVA S.A.,2500000`,
  `${mes}-01,x,${hoy.getFullYear()},9004,Nacional,CENTRO DEL PAIS,"Bogotá, D.C.",Canal Constructores,LUIS DEMO,C20001,ALMACENES CASA VIVA S.A.,-500000`,
].join("\n");

const subirVentas = () => {
  const cfg = JSON.parse(readFileSync("test-results/agente-sap-demo.json", "utf8"));
  writeFileSync(`${cfg.ventasCsvDir}/Ventas SAP ${mes}.csv`, `﻿${CSV}\n`);
  return execFileSync(process.execPath, ["agente-sap/agente.mjs", "ventas"], {
    encoding: "utf8",
    env: { ...process.env, AGENTE_SAP_CONFIG: "test-results/agente-sap-demo.json", AGENTE_SAP_PASSWORD: cfg.demoSapPassword, AGENTE_CRM_PASSWORD: cfg.demoCrmPassword },
  });
};

test.describe("ventas reales de SAP", () => {
  test("la dirección ve el total con las sucursales agrupadas; el detalle, al abrir el grupo", async ({ browser }) => {
    expect(subirVentas()).toMatch(/1 meses actualizados, 4 líneas/);
    // Sin cambios en el archivo no se vuelve a subir.
    expect(subirVentas()).toMatch(/sin cambios/);

    const admin = await (await browser.newContext({ storageState: sesion("admin") })).newPage();
    await admin.goto("/indicadores");
    const ventas = admin.getByRole("region", { name: "Ventas reales (SAP)" });
    await expect(ventas.getByRole("heading", { name: "Ventas reales (SAP)" })).toBeVisible();
    // 5 + 3 + 2,5 − 0,5 = 10 millones: «Excluido» y la nota crédito cuentan.
    await expect(ventas.getByText(/4 facturas · 2 clientes/)).toBeVisible();
    const grupo = ventas.getByRole("button", { name: /MAXI S A S/ });
    await expect(grupo).toContainText("2 sucursales");
    await expect(ventas.getByText("MAXI S A S ACACIAS")).toHaveCount(0);
    await grupo.click();
    await expect(ventas.getByText("MAXI S A S ACACIAS")).toBeVisible();
    await expect(ventas.getByText(/CN900100200-74 · CAMILA ASESORA/)).toBeVisible();
    // Un cliente que ya es cuenta del CRM sale con el nombre del CRM y enlaza a su ficha.
    await ventas.getByRole("button", { name: /Almacenes Casa Viva/ }).click();
    await ventas.getByRole("link", { name: "ALMACENES CASA VIVA S.A." }).click();
    await expect(admin.getByRole("heading", { name: "Ventas facturadas, últimos 12 meses" })).toBeVisible();

    // Cada vendedor de SAP queda relacionado con el usuario del mismo nombre, y se puede cambiar.
    await admin.goto("/configuracion/sap");
    await expect(admin.getByLabel("Usuario del CRM para LUIS DEMO")).toHaveValue(/.+/);
    await expect(admin.getByLabel("Usuario del CRM para LUIS DEMO").locator("option:checked")).toHaveText("Luis Demo");
    await expect(admin.getByLabel("Usuario del CRM para CAMILA ASESORA").locator("option:checked")).toHaveText("Camila Asesora");

    // La asesora solo ve lo de su vendedor de SAP: una sucursal, sin el resto del grupo.
    const asesora = await (await browser.newContext({ storageState: sesion("asesora") })).newPage();
    await asesora.goto("/indicadores");
    const suyas = asesora.getByRole("region", { name: "Ventas reales (SAP)" });
    await expect(suyas.getByText(/1 facturas · 1 clientes/)).toBeVisible();
    await expect(suyas.getByRole("button", { name: /MAXI S A S IBAGUE/ })).toBeVisible();
    await expect(suyas.getByText("2 sucursales")).toHaveCount(0);
  });
});

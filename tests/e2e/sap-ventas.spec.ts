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
  // Mercado internacional: zona Exterior, cliente con código «CE»; el territorio es el país.
  `${mes}-01,x,${hoy.getFullYear()},9005,Exterior,EXTERIOR,Panamá,Canal Distribución,LUIS DEMO,CE777001,ISTMO HOME CENTER,4000000`,
].join("\n");

// El mismo mes del año pasado: la sucursal de Acacias vendió 4 millones; Casa Viva y la de Ibagué no compraron.
const mesAnterior = `${hoy.getFullYear() - 1}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
const CSV_ANTERIOR = [
  CSV.split("\n")[0],
  `${mesAnterior}-01,x,${hoy.getFullYear() - 1},8001,Nacional,CENTRO DEL PAIS,Meta,Canal Distribución,LUIS DEMO,CN900100200-67,MAXI S A S ACACIAS,4000000`,
].join("\n");

const subirVentas = () => {
  const cfg = JSON.parse(readFileSync("test-results/agente-sap-demo.json", "utf8"));
  writeFileSync(`${cfg.ventasCsvDir}/Ventas SAP ${mes}.csv`, `\uFEFF${CSV}\n`);
  writeFileSync(`${cfg.ventasCsvDir}/Ventas SAP ${mesAnterior}.csv`, `\uFEFF${CSV_ANTERIOR}\n`);
  return execFileSync(process.execPath, ["agente-sap/agente.mjs", "ventas"], {
    encoding: "utf8",
    env: { ...process.env, AGENTE_SAP_CONFIG: "test-results/agente-sap-demo.json", AGENTE_SAP_PASSWORD: cfg.demoSapPassword, AGENTE_CRM_PASSWORD: cfg.demoCrmPassword },
  });
};

test.describe("ventas reales de SAP", () => {
  test("la dirección ve el total con las sucursales agrupadas; el detalle, al abrir el grupo", async ({ browser }) => {
    expect(subirVentas()).toMatch(/2 meses actualizados, 6 líneas/);
    // Sin cambios en el archivo no se vuelve a subir.
    expect(subirVentas()).toMatch(/sin cambios/);

    const admin = await (await browser.newContext({ storageState: sesion("admin") })).newPage();
    await admin.goto("/indicadores");
    const ventas = admin.getByRole("region", { name: "Ventas reales (SAP)" });
    await expect(ventas.getByRole("heading", { name: "Ventas reales (SAP)" })).toBeVisible();
    // 5 + 3 + 2,5 − 0,5 + 4 = 14 millones: «Excluido», la nota crédito y la venta de Exterior cuentan.
    await expect(ventas.getByText(/5 facturas · 3 clientes/)).toBeVisible();
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

    // Crecimiento frente a las mismas fechas del año anterior: el grupo duplicó (4 → 8 millones) y Casa Viva es nuevo.
    await admin.goto("/indicadores");
    await expect(ventas.getByText(/Frente al mismo periodo del año anterior/)).toBeVisible();
    await expect(ventas.getByRole("button", { name: /MAXI S A S/ })).toContainText("+100 %");
    await expect(ventas.getByRole("button", { name: /Almacenes Casa Viva/ })).toContainText("Nuevo");
    // Al abrir el grupo, cada sucursal trae el suyo: Acacias creció 25 % y la de Ibagué es nueva.
    await ventas.getByRole("button", { name: /MAXI S A S/ }).click();
    await expect(ventas.getByRole("listitem").filter({ hasText: "CN900100200-67" }).last()).toContainText("+25 %");
    await ventas.getByRole("button", { name: /MAXI S A S/ }).click();

    // Los gráficos se filtran entre sí: al tocar un canal, las zonas y los clientes son los de ese canal.
    const canales = ventas.getByRole("list", { name: "Ventas facturadas por canal" });
    const zonas = ventas.getByRole("list", { name: "Ventas facturadas por zona" });
    await expect(zonas.getByRole("button")).toHaveCount(3);
    await canales.getByRole("button", { name: /Canal Constructores/ }).click();
    await expect(ventas.getByRole("button", { name: /MAXI S A S/ })).toHaveCount(0);
    await expect(ventas.getByRole("button", { name: /Almacenes Casa Viva/ })).toBeVisible();
    await expect(zonas.getByRole("button")).toHaveCount(1);
    await expect(ventas.getByText(/2 facturas · 1 clientes/)).toBeVisible();
    // El gráfico de canales sigue completo, con el elegido marcado.
    await expect(canales.getByRole("button")).toHaveCount(2);
    await expect(canales.getByRole("button", { name: /Canal Constructores/ })).toHaveAttribute("aria-pressed", "true");
    // Se pueden sumar selecciones: el otro canal y una zona dejan solo la sucursal de esa zona.
    await ventas.getByRole("button", { name: "Quitar filtro Canal Constructores" }).click();
    await canales.getByRole("button", { name: /Canal Distribución/ }).click();
    await zonas.getByRole("button", { name: /TOLIMA GRANDE/ }).click();
    await expect(ventas.getByRole("button", { name: /MAXI S A S IBAGUE/ })).toBeVisible();
    await expect(ventas.getByText(/1 facturas · 1 clientes/)).toBeVisible();
    await ventas.getByRole("button", { name: "Quitar filtros" }).click();
    await expect(ventas.getByText(/5 facturas · 3 clientes/)).toBeVisible();

    // Participación: el grupo MAXI vendió 8 de 14 millones (57 %); dentro del grupo, Acacias es 5 de 8 (63 %).
    await expect(ventas.getByRole("button", { name: /MAXI S A S/ }).getByTestId("participacion")).toHaveText("57 %");
    await ventas.getByRole("button", { name: /MAXI S A S/ }).click();
    await expect(ventas.getByRole("listitem").filter({ hasText: "CN900100200-67" }).last().getByTestId("participacion-sucursal")).toHaveText("63 %");
    await ventas.getByRole("button", { name: /MAXI S A S/ }).click();
    // Ventas por asesor: el vendedor de SAP, con su participación (Luis 11 de 14 = 79 %).
    const asesores = ventas.getByRole("list", { name: "Ventas facturadas por asesor" });
    await expect(asesores.getByRole("listitem").filter({ hasText: "LUIS DEMO" })).toContainText("79 %");
    await expect(asesores.getByRole("listitem").filter({ hasText: "CAMILA ASESORA" })).toContainText("21 %");
    // Ventas por país sobre el mapa de América, solo mercado internacional: un punto por país con su participación.
    const mapa = ventas.getByRole("group", { name: "Mapa de ventas por país" });
    await expect(mapa.getByRole("button", { name: "Panamá, 100 %" })).toBeVisible();
    const paises = ventas.getByRole("list", { name: "Ventas facturadas por país" });
    await expect(paises.getByRole("button")).toHaveCount(1);
    // Al elegir el país, el mapa se acerca y el panel muestra sus principales clientes; se puede volver.
    await paises.getByRole("button", { name: /Panamá/ }).click();
    await expect(ventas.getByRole("list", { name: "Principales clientes · Panamá" })).toContainText("ISTMO HOME CENTER");
    await expect(mapa.getByRole("button", { name: "Panamá, 100 %" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => Number((await mapa.getAttribute("viewBox"))!.split(" ")[2])).toBeLessThan(200);
    await ventas.getByRole("button", { name: "Volver a América" }).click();
    await expect(paises.getByRole("button")).toHaveCount(1);
    // El punto del mapa también abre el país.
    await mapa.getByRole("button", { name: "Panamá, 100 %" }).click();
    await expect(ventas.getByRole("list", { name: "Principales clientes · Panamá" })).toBeVisible();
    await ventas.getByRole("button", { name: "Volver a América" }).click();
    // Filtro de mercado: Internacional deja solo Exterior; Nacional lo quita (y conserva «Excluido»).
    await admin.getByLabel("Mercado", { exact: true }).selectOption("internacional");
    await expect(ventas.getByText(/1 facturas · 1 clientes/)).toBeVisible();
    await expect(ventas.getByRole("button", { name: /MAXI S A S/ })).toHaveCount(0);
    await admin.getByLabel("Mercado", { exact: true }).selectOption("nacional");
    await expect(ventas.getByText(/4 facturas · 2 clientes/)).toBeVisible();
    await expect(ventas.getByRole("list", { name: "Ventas facturadas por país" })).toHaveCount(0);
    await admin.getByLabel("Mercado", { exact: true }).selectOption("all");
    await expect(ventas.getByText(/5 facturas · 3 clientes/)).toBeVisible();

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

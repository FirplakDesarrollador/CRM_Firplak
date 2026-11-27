import { expect, test } from "@playwright/test";
import { sesion } from "./ayuda";

// Pronóstico con lo real de SAP: facturado + pedidos y entregas abiertos + oportunidades abiertas, cada capa con su
// color en una barra de composición y en la curva día a día. En la demostración, el cliente con Código SAP tiene dos
// pedidos abiertos y una entrega sin facturar (de ayer: se facturaría en 3 días, 20 millones sin IVA).

const millones = (texto: string) => Number(texto.replace(/[^\d.]/g, ""));

test("la dirección ve las tres capas del pronóstico real, su suma y la curva del periodo", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: sesion("admin") })).newPage();
  await page.goto("/pronostico?tipo=year");
  const seccion = page.getByRole("region", { name: "Pronóstico con lo real de SAP" });
  await expect(seccion).toBeVisible();
  await expect(seccion.getByText("Lo tuyo")).toHaveCount(0);
  // Pedidos y entregas abiertos: al menos la entrega sin facturar de la demostración.
  const abiertos = millones(await seccion.getByTestId("real-backlog").innerText());
  expect(abiertos).toBeGreaterThanOrEqual(20);
  await expect(seccion).toContainText("Entregas sin facturar");
  await expect(seccion).toContainText("Fecha de despacho o de entrega más 4 días.");
  // Oportunidades abiertas de la demostración.
  expect(millones(await seccion.getByTestId("real-opportunities").innerText())).toBeGreaterThan(0);
  // El total es la suma de las tres capas (en millones, con el redondeo de cada cifra).
  const total = millones(await seccion.getByTestId("pronostico-real").innerText());
  const suma = abiertos + millones(await seccion.getByTestId("real-invoiced").innerText()) + millones(await seccion.getByTestId("real-opportunities").innerText());
  expect(Math.abs(total - suma)).toBeLessThan(1.6);
  // La curva: marca «Hoy», responde al teclado y tiene su tabla de datos.
  const curva = seccion.getByRole("group", { name: /Avance del pronóstico día a día/ });
  await expect(curva).toBeVisible();
  await expect(curva.getByText("Hoy", { exact: true })).toBeVisible();
  await curva.focus();
  await expect(seccion.getByRole("status")).toContainText("Acumulado");
  await page.keyboard.press("Escape");
  await seccion.getByText("Ver datos en tabla").click();
  await expect(seccion.getByRole("columnheader", { name: "Pedidos y entregas abiertos" })).toBeVisible();
  // Las cifras por asesor de las oportunidades siguen debajo.
  await expect(page.getByRole("heading", { name: "Oportunidades del CRM por categoría y asesor" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Tendencia del pronóstico" })).toBeVisible();
  await page.context().close();
});

test("una asesora ve solo lo suyo", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: sesion("asesora") })).newPage();
  await page.goto("/pronostico?tipo=year");
  const seccion = page.getByRole("region", { name: "Pronóstico con lo real de SAP" });
  await expect(seccion).toBeVisible();
  await expect(seccion.getByText("Lo tuyo")).toBeVisible();
  await page.context().close();
});

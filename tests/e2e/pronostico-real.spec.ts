import { expect, test } from "@playwright/test";
import { sesion } from "./ayuda";

// Pronóstico con lo real de SAP: facturado + pedidos y entregas abiertos + oportunidades abiertas, cada capa con su
// color en una barra de composición y en las barras con la línea del total. En la demostración, el cliente con Código SAP tiene dos
// pedidos abiertos y una entrega sin facturar (de ayer: se facturaría en 3 días, 20 millones sin IVA).

const millones = (texto: string) => Number(texto.replace(/[^\d.]/g, ""));

test("la dirección ve las tres capas del pronóstico real, su suma y las barras con la línea del total", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: sesion("admin") })).newPage();
  await page.goto("/pronostico?tipo=year");
  const seccion = page.getByRole("region", { name: "Pronóstico con lo real de SAP" });
  await expect(seccion).toBeVisible();
  await expect(seccion.getByText("Lo tuyo")).toHaveCount(0);
  // Pedidos y entregas abiertos: al menos la entrega sin facturar de la demostración.
  const abiertos = millones(await seccion.getByTestId("real-backlog").innerText());
  expect(abiertos).toBeGreaterThanOrEqual(20);
  await expect(seccion).toContainText("Entregas sin facturar");
  await expect(seccion).toContainText("Fecha de despacho o de entrega más 4 días; en Exterior y en pedidos «Sin POD», la misma fecha.");
  // Lo vencido hace más de 30 días no suma: se lista aparte para revisarlo en SAP.
  const atrasado = seccion.getByTestId("real-atrasado");
  await expect(atrasado).toContainText("Atrasado por revisar");
  await expect(atrasado).toContainText("no suma al pronóstico");
  await atrasado.locator("summary").click();
  await expect(atrasado.getByRole("columnheader", { name: "Días de atraso" })).toBeVisible();
  await expect(atrasado.getByRole("cell", { name: /^Pedido \d+$/ }).first()).toBeVisible();
  await expect(atrasado.getByRole("cell", { name: "OBRAS DEL SUR S.A.S." }).first()).toBeVisible();
  // Oportunidades abiertas de la demostración.
  expect(millones(await seccion.getByTestId("real-opportunities").innerText())).toBeGreaterThan(0);
  // El total es la suma de las tres capas (en millones, con el redondeo de cada cifra).
  const total = millones(await seccion.getByTestId("pronostico-real").innerText());
  const suma = abiertos + millones(await seccion.getByTestId("real-invoiced").innerText()) + millones(await seccion.getByTestId("real-opportunities").innerText());
  expect(Math.abs(total - suma)).toBeLessThan(1.6);
  // Año: una barra por mes con la línea del total; marca «Hoy», responde al teclado y tiene su tabla de datos.
  const curva = seccion.getByRole("group", { name: /Pronóstico mes a mes/ });
  await expect(curva).toBeVisible();
  await expect(curva.getByText("Hoy", { exact: true })).toBeVisible();
  await curva.focus();
  await expect(seccion.getByRole("status")).toContainText("Total del mes");
  await page.keyboard.press("Escape");
  await seccion.getByText("Ver datos en tabla").click();
  await expect(seccion.getByRole("columnheader", { name: "Pedidos y entregas abiertos" })).toBeVisible();
  await expect(seccion.getByRole("columnheader", { name: "Mes", exact: true })).toBeVisible();
  // Mes: barras acumuladas por semana, y la última termina en el pronóstico del periodo.
  await page.goto("/pronostico?tipo=month");
  const semanas = page.getByRole("region", { name: "Pronóstico con lo real de SAP" });
  const barras = semanas.getByRole("group", { name: /Pronóstico acumulado por semana/ });
  await expect(barras).toBeVisible();
  await barras.focus();
  await expect(semanas.getByRole("status")).toContainText("Acumulado");
  await page.keyboard.press("Escape");
  await semanas.getByText("Ver datos en tabla").click();
  await expect(semanas.getByRole("columnheader", { name: "Semana", exact: true })).toBeVisible();
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

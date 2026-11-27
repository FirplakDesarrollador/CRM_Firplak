import { expect, test } from "@playwright/test";
import { sesion, unico } from "./ayuda";

// Pronóstico por mes de entrega y facturación: una cotización de 10 unidades con 5 para julio y 5 para agosto reparte
// el negocio entre esos dos meses, en lugar de cargarlo completo al mes de cierre de la oportunidad.

test.use({ storageState: sesion("admin") });

test("entregas parciales: la cotización se parte en 2, 3 o 4 y el pronóstico reparte el negocio entre los meses", async ({ page }) => {
  const nombre = unico("Entrega por partes");
  await page.goto("/cotizaciones/nueva");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/Nombre de la cotización/).fill(nombre);
  await page.getByLabel(/^Cuenta/).fill("Casa Viva");
  await page.getByRole("option", { name: /Casa Viva/i }).first().click();
  // La cotización trae una entrega estimada por defecto; aquí, julio de 2031.
  await expect(page.locator("#f-delivery_date")).not.toHaveValue("");
  await page.locator("#f-delivery_date").fill("2031-07-10");
  await page.locator("main").getByRole("button", { name: /^Guardar/ }).click();
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);

  await expect(async () => {
    await page.locator("#ql-product").fill("DEMO-MB-060");
    await page.getByRole("option", { name: /DEMO-MB-060/ }).first().click({ timeout: 2000 });
  }).toPass();
  await page.locator("#ql-qty").fill("10");
  await page.getByRole("button", { name: "Agregar" }).click();
  const lineas = page.getByRole("listitem").filter({ hasText: "DEMO-MB-060" });
  await expect(lineas).toHaveCount(1);
  const meses = page.getByRole("region", { name: "Pronóstico por mes de entrega" });
  await expect(meses).toContainText("julio 2031");
  await expect(meses).toContainText("$9,600,000");

  // Entregas parciales: «Partir en 2» deja 5 y 5, la primera en la fecha de la cotización y la segunda 30 días después.
  const entregas = page.getByRole("region", { name: "Entregas parciales" });
  await expect(lineas.first().getByLabel("Entrega")).toHaveCount(0);
  await entregas.getByRole("button", { name: "Partir en 2 entregas" }).click();
  await expect(lineas).toHaveCount(2);
  await expect(lineas.nth(0).getByLabel("Cantidad")).toHaveValue("5");
  await expect(lineas.nth(1).getByLabel("Cantidad")).toHaveValue("5");
  await expect(entregas.getByLabel("Fecha de la entrega 1")).toHaveValue("2031-07-10");
  await expect(entregas.getByLabel("Fecha de la entrega 2")).toHaveValue("2031-08-09");
  await expect(meses.getByRole("listitem").filter({ hasText: "julio 2031" })).toContainText("$4,800,000");
  await expect(meses.getByRole("listitem").filter({ hasText: "agosto 2031" })).toContainText("$4,800,000");
  // El asesor mueve la segunda entrega completa a otra fecha; la línea toma la fecha nueva.
  await entregas.getByLabel("Fecha de la entrega 2").fill("2031-08-20");
  await entregas.getByRole("listitem").nth(1).getByRole("button", { name: "Cambiar fecha" }).click();
  await expect(lineas.nth(1).getByLabel("Entrega")).toHaveValue("2031-08-20");
  // Partir en 3: 10 unidades quedan 3, 3 y 4 (el sobrante en la última), cada 30 días.
  await entregas.getByRole("button", { name: "Partir en 3 entregas" }).click();
  await expect(lineas).toHaveCount(3);
  await expect(lineas.nth(2).getByLabel("Cantidad")).toHaveValue("4");
  await expect(entregas.getByLabel("Fecha de la entrega 3")).toHaveValue("2031-09-08");
  // Otra cantidad: 5 entregas de 2 unidades cada una; un número fuera de rango se rechaza sin tocar nada.
  await entregas.getByLabel("Otra cantidad de entregas").fill("5");
  await entregas.getByRole("button", { name: "Partir", exact: true }).click();
  await expect(lineas).toHaveCount(5);
  await expect(lineas.nth(4).getByLabel("Cantidad")).toHaveValue("2");
  await expect(entregas.getByLabel("Fecha de la entrega 5")).toHaveValue("2031-11-07");
  await entregas.getByLabel("Otra cantidad de entregas").fill("13");
  await entregas.getByRole("button", { name: "Partir", exact: true }).click();
  await expect(lineas).toHaveCount(5);
  // «Una sola entrega» devuelve la línea original; después se deja en dos para revisar el pronóstico.
  await entregas.getByRole("button", { name: "Una sola entrega" }).click();
  await expect(lineas).toHaveCount(1);
  await expect(lineas.first().getByLabel("Cantidad")).toHaveValue("10");
  await entregas.getByRole("button", { name: "Partir en 2 entregas" }).click();
  await expect(lineas).toHaveCount(2);

  // Pronóstico de agosto: el negocio aparece con la mitad de su valor y marcado «Por partes».
  await page.goto("/pronostico?tipo=month&inicio=2031-08-01");
  await expect(page.getByText(/Cada negocio cae en el mes en que se entrega y factura/)).toBeVisible();
  const fila = page.getByRole("row").filter({ hasText: "Luis Demo" }).first();
  await fila.getByRole("link").filter({ hasText: /\$/ }).last().click();
  const detalle = page.getByRole("region", { name: "Detalle del pronóstico" });
  const negocio = detalle.getByRole("row").filter({ hasText: new RegExp(nombre.split(" ").slice(-1)[0], "i") });
  await expect(negocio).toContainText("$4,800,000");
  await expect(negocio).toContainText("$9,600,000");
  await expect(negocio).toContainText("50% del negocio");
  await expect(negocio).toContainText("Por partes");
  // En julio está la otra mitad; en junio (ni entrega ni cierre) no aparece.
  await page.goto("/pronostico?tipo=month&inicio=2031-07-01");
  await page.getByRole("row").filter({ hasText: "Luis Demo" }).first().getByRole("link").filter({ hasText: /\$/ }).last().click();
  await expect(detalle.getByRole("row").filter({ hasText: new RegExp(nombre.split(" ").slice(-1)[0], "i") })).toContainText("$4,800,000");
});

test("el cliente acepta una sola entrega: se separa en su cotización aceptada y la original sigue con el resto", async ({ page }) => {
  const nombre = unico("Aceptación por partes");
  await page.goto("/cotizaciones/nueva");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/Nombre de la cotización/).fill(nombre);
  await page.getByLabel(/^Cuenta/).fill("Casa Viva");
  await page.getByRole("option", { name: /Casa Viva/i }).first().click();
  await page.locator("#f-delivery_date").fill("2032-03-10");
  await page.locator("main").getByRole("button", { name: /^Guardar/ }).click();
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);
  const original = page.url().split("?")[0];
  await expect(async () => {
    await page.locator("#ql-product").fill("DEMO-MB-060");
    await page.getByRole("option", { name: /DEMO-MB-060/ }).first().click({ timeout: 2000 });
  }).toPass();
  await page.locator("#ql-qty").fill("10");
  await page.getByRole("button", { name: "Agregar" }).click();
  const lineas = page.getByRole("listitem").filter({ hasText: "DEMO-MB-060" });
  await expect(lineas).toHaveCount(1);
  const entregas = page.getByRole("region", { name: "Entregas parciales" });
  // Con una sola entrega no hay nada que separar.
  await expect(page.getByRole("button", { name: "El cliente aceptó esta entrega" })).toHaveCount(0);
  await entregas.getByRole("button", { name: "Partir en 2 entregas" }).click();
  await expect(lineas).toHaveCount(2);

  // «Volver» en la confirmación no cambia nada; al confirmar, abre la cotización nueva, ya Aceptada.
  const primera = entregas.getByRole("listitem").first();
  await primera.getByRole("button", { name: "El cliente aceptó esta entrega" }).click();
  await expect(page.getByRole("dialog")).toContainText("queda Aceptada, lista para crear el pedido");
  await page.getByRole("dialog").getByRole("button", { name: "Volver" }).click();
  await expect(lineas).toHaveCount(2);
  await primera.getByRole("button", { name: "El cliente aceptó esta entrega" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sí, la aceptó" }).click();
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}\?separada=aceptada/);
  expect(page.url().split("?")[0]).not.toBe(original);
  await expect(page.getByText("Esta es la entrega que aceptó el cliente")).toBeVisible();
  await expect(page.getByRole("link", { name: /Entrega separada de COT-/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Estado" }).getByRole("button", { name: "Aceptada" })).toBeDisabled();
  await expect(lineas).toHaveCount(1);
  await expect(lineas.first().getByLabel("Cantidad")).toHaveValue("5");
  await expect(page.getByRole("button", { name: "Crear pedido" })).toBeVisible();

  // La original sigue abierta, con la otra mitad y sin estar partida.
  await page.goto(original);
  await expect(page.getByRole("list", { name: "Estado" }).getByRole("button", { name: "Borrador" })).toBeDisabled();
  await expect(lineas).toHaveCount(1);
  await expect(lineas.first().getByLabel("Cantidad")).toHaveValue("5");
  await expect(page.getByRole("button", { name: "El cliente aceptó esta entrega" })).toHaveCount(0);
});

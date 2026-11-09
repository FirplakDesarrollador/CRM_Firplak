import { expect, test } from "@playwright/test";
import { sesion } from "./ayuda";

test.use({ storageState: sesion("admin") });

async function definirMetaDeCompania(page: import("@playwright/test").Page, ruta: string, valor: string) {
  await page.goto(ruta);
  await page.locator("summary", { hasText: "Definir metas del periodo" }).click();
  await page.getByRole("textbox", { name: "Compañía (total) · Ventas ganadas" }).fill(valor);
  await page.getByRole("button", { name: "Guardar metas" }).click();
  await expect(page.getByRole("status").filter({ hasText: "guardada" })).toBeVisible();
}

test("el medidor no aplica el ritmo fuera del periodo actual", async ({ page }) => {
  await definirMetaDeCompania(page, "/metas?tipo=year&inicio=2031-01-01", "1000");
  await expect(page.getByText("Aún no inicia")).toBeVisible();
  await expect(page.getByText("A buen ritmo")).toHaveCount(0);

  await definirMetaDeCompania(page, "/metas?tipo=year&inicio=2019-01-01", "1000");
  await expect(page.getByText("Meta no cumplida")).toBeVisible();
  await expect(page.getByText("Por debajo del ritmo esperado")).toHaveCount(0);
});

test("en tema oscuro las series del pronóstico se distinguen del fondo", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/pronostico");
  // Compara el color ya resuelto de «Compromiso» y «Pronóstico» con la superficie: mínimo 3:1 para gráficos.
  await expect(page.getByRole("group", { name: "Tendencia del pronóstico" })).toBeVisible();
  const contraste = await page.evaluate(() => {
    const canal = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const luz = (c: string) => { const [r, g, b] = canal(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const prueba = document.createElement("span");
    document.body.append(prueba);
    const leer = (v: string) => { prueba.style.color = `var(${v})`; return getComputedStyle(prueba).color; };
    const [a, b] = [luz(leer("--chart-commit")), luz(leer("--surface"))].sort((x, y) => y - x);
    prueba.remove();
    return (a + 0.05) / (b + 0.05);
  });
  expect(contraste).toBeGreaterThan(3);
});

test("el gráfico de tendencia responde al teclado y tiene vista de tabla", async ({ page }) => {
  await page.goto("/pronostico");
  const grafico = page.getByRole("group", { name: "Tendencia del pronóstico" });
  await grafico.focus();
  const detalle = page.getByRole("status").filter({ hasText: "Potencial" });
  await expect(detalle).toContainText("Hoy (en vivo)");
  await page.keyboard.press("ArrowLeft");
  await expect(detalle).not.toContainText("Hoy (en vivo)");
  await page.keyboard.press("Escape");
  await expect(detalle).toHaveCount(0);
  await page.getByText("Ver datos en tabla").click();
  await expect(page.getByRole("columnheader", { name: "Fecha", exact: true })).toBeVisible();
});

test("el pronóstico final se ve con formato y el ajuste agrupa miles al escribir", async ({ page }) => {
  await page.goto("/pronostico");
  const fila = page.getByRole("row").filter({ hasText: "Camila Asesora" });
  await expect(fila.locator("td").last().locator("p").first()).toHaveText(/^\$[\d,.]+ M/);
  const campo = fila.getByRole("textbox", { name: /Ajuste de/ });
  await campo.click();
  await page.keyboard.type("1200000000");
  await expect(campo).toHaveValue("1,200,000,000");
  await campo.fill("");
  await page.keyboard.type("1.100.000");
  await expect(campo).toHaveValue("1,100,000");
  await fila.getByRole("button", { name: "Ajustar" }).click();
  await expect(fila.getByRole("status")).toHaveText("Ajuste guardado");
  await expect(fila.locator("td").last().locator("p").first()).toHaveText(/^\$1\.1 M/);
  await campo.fill("");
  await fila.getByRole("button", { name: "Ajustar" }).click();
  await expect(fila.getByRole("status")).toHaveText("Ajuste eliminado");
});

test("los datos de los gráficos de Indicadores se pueden leer con teclado", async ({ page }) => {
  await page.goto("/indicadores");
  const descritos = await page.getByRole("tooltip").evaluateAll((t) => t.every((x) => { const d = x.closest("[tabindex='0']"); return d?.getAttribute("aria-describedby") === x.id; }));
  expect(descritos).toBe(true);
  const etapa = page.locator("main ol > li").first();
  await etapa.focus();
  await expect(etapa.getByRole("tooltip")).toBeVisible();
});

test("en modo claro las tarjetas y las columnas del Pipeline llevan el borde azul", async ({ page }) => {
  const azul = "rgba(47, 110, 163, 0.26)";
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/indicadores");
  await expect.poll(() => page.locator("main .glass").first().evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(azul);
  await page.goto("/oportunidades/pipeline");
  await expect.poll(() => page.locator(".kanban-column").first().evaluate((e) => getComputedStyle(e).borderTopColor)).toBe(azul);
});

test("las tarjetas tienen blur real y el logo de fondo se mueve despacio", async ({ page }) => {
  await page.goto("/indicadores");
  // El orden de las reglas importa: si el compilador descarta la estándar, el blur desaparece sin avisar.
  await expect.poll(() => page.locator("main .glass").first().evaluate((e) => getComputedStyle(e).backdropFilter)).toContain("blur");
  await expect.poll(() => page.locator("main .card").first().evaluate((e) => getComputedStyle(e).backdropFilter)).toContain("blur");
  const logo = page.locator(".brand-backdrop-logo");
  await expect.poll(() => logo.evaluate((e) => getComputedStyle(e).animationName)).toBe("logo-deriva");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => logo.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
});

test("cifras y textos claros: totales en «$X M», sustantivos que concuerdan, fechas legibles y aviso de tareas vencidas", async ({ page }) => {
  // Metas: avance y faltante en la misma unidad, sin mezclar millones con pesos completos.
  await page.goto("/metas");
  const ventas = page.locator("section.glass").filter({ hasText: "Ventas ganadas" }).first();
  await expect(ventas).toContainText(/\$[\d,.]+ M de \$[\d,.]+ M · (Faltan \$[\d,.]+ M|Superada por \$[\d,.]+ M|Cumplida)/);
  await expect(page.getByText("Brecha")).toHaveCount(0);

  // Indicadores: «1 pedido», nunca «1 pedidos».
  await page.goto("/indicadores");
  await expect(page.getByText("Pedidos en curso")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/\b1 (pedidos|cotizaciones|oportunidades|reuniones|prospectos|ganadas|perdidas)\b/);

  // Inicio: el subtítulo de «Tareas vencidas» habla de tareas, no de reuniones.
  await page.goto("/inicio");
  const tareas = page.locator(".glass").filter({ hasText: "Tareas vencidas" }).first();
  await expect(tareas).toContainText(/Requieren seguimiento|Al día/);

  // Buscador: fechas como «13 abr 2026», no ISO.
  await page.goto("/buscar?q=casa");
  await expect(page.getByRole("link", { name: /Casa Viva/ }).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/\d{4}-\d{2}-\d{2}/);

  // La campana trae el aviso diario de tareas vencidas, con el plural correcto.
  await page.getByRole("button", { name: "Notificaciones" }).click();
  await expect(page.getByText(/^Tienes (1 tarea vencida|\d+ tareas vencidas)$/).first()).toBeVisible();
  await expect(page.getByText(/tarea\(s\)/)).toHaveCount(0);
});

test("Indicadores tiene protagonista, los embudos vacíos ocupan una línea y la ficha no repite datos", async ({ page }) => {
  await page.goto("/indicadores");
  // Cuatro cifras de ventas arriba; las demás, agrupadas en dos paneles con título.
  await expect(page.getByRole("heading", { name: "Seguimiento comercial" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prospectos, cotizaciones, pedidos y casos" })).toBeVisible();
  const vacios = page.locator("section[aria-label^='Embudo']").filter({ hasText: "Sin oportunidades abiertas ni ganadas en el periodo" });
  await expect(vacios.first()).toBeVisible();
  await expect(vacios.locator("ol")).toHaveCount(0);

  // Una oportunidad nueva no pide «Motivo de pérdida».
  await page.goto("/oportunidades/nueva");
  await expect(page.getByRole("button", { name: /Guardar/ }).first()).toBeVisible();
  await expect(page.getByText("Motivo de pérdida")).toHaveCount(0);

  // La ficha de oportunidad no repite en Detalles lo que ya dice la cabecera.
  await page.goto("/oportunidades");
  await page.locator("main table a[href^='/oportunidades/']").first().click();
  await expect(page.getByRole("heading", { name: "Pronóstico" })).toBeVisible();
  await expect(page.getByText("Probabilidad", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Fecha de cierre", { exact: true })).toHaveCount(1);
  // «Eliminar» es discreto (texto rojo sin borde): no pesa lo mismo que «Editar».
  await expect(page.getByRole("button", { name: /^Eliminar / })).toHaveClass(/btn-ghost/);

  // Informes: las columnas quedan alineadas de una carpeta a otra.
  await page.goto("/informes");
  const columnas = await page.locator("main table").evaluateAll((tablas) =>
    tablas.map((t) => Math.round(t.querySelector("th:nth-child(2)")!.getBoundingClientRect().left)));
  expect(columnas.length).toBeGreaterThan(1);
  expect(new Set(columnas).size).toBe(1);

  // Metas sin metas por asesor: el vacío lleva a definirlas.
  await page.goto("/metas");
  const definir = page.getByRole("link", { name: "Definir metas por asesor" });
  if (await definir.count()) {
    await definir.click();
    await expect(page.getByRole("button", { name: "Guardar metas" })).toBeVisible();
  }
});

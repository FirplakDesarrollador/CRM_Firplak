import { expect, test } from "@playwright/test";
import { sesion } from "./ayuda";

const PAGINAS = ["/inicio", "/cuentas", "/contactos", "/prospectos", "/oportunidades", "/oportunidades/pipeline", "/cotizaciones", "/pedidos",
  "/productos", "/casos", "/campanas", "/actividades", "/aprobaciones", "/indicadores", "/metas", "/pronostico", "/informes",
  "/preferencias", "/configuracion", "/configuracion/sap", "/configuracion/microsoft-365", "/configuracion/asistentes"];

test.use({ storageState: sesion("admin") });

test("ninguna página se desborda a lo ancho en el celular", async ({ page }) => {
  for (const ruta of PAGINAS) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    const ancho = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(ancho[0], `${ruta} mide ${ancho[0]} px en una pantalla de ${ancho[1]} px`).toBeLessThanOrEqual(ancho[1]);
  }
});

test("la barra inferior reemplaza al menú y «Más» abre los demás módulos", async ({ page }) => {
  await page.goto("/inicio");
  const barra = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(barra).toBeInViewport();
  await barra.getByRole("link", { name: "Cuentas" }).click();
  await expect(page).toHaveURL(/\/cuentas/);
  await expect(barra.getByRole("link", { name: "Cuentas" })).toHaveAttribute("aria-current", "page");

  await barra.getByRole("button", { name: "Más" }).click();
  const hoja = page.getByRole("navigation", { name: "Más módulos" });
  await expect(hoja).toBeVisible();
  await hoja.getByRole("link", { name: "Productos" }).click();
  await expect(page).toHaveURL(/\/productos/);
  await expect(hoja).toHaveCount(0);
});

test("el buscador muestra un texto que cabe en el celular", async ({ page }) => {
  await page.goto("/inicio");
  const buscador = page.getByRole("textbox", { name: "Búsqueda global" });
  await expect(buscador).toHaveAttribute("placeholder", "Buscar");
  const cabe = await buscador.evaluate((input: HTMLInputElement) => {
    const estilo = getComputedStyle(input);
    const lienzo = document.createElement("canvas").getContext("2d")!;
    lienzo.font = estilo.font;
    return lienzo.measureText(input.placeholder).width <= input.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
  });
  expect(cabe).toBe(true);
});

test("el gráfico de tendencia se lee en el celular: texto real de 11 px, fechas sin encimarse y detalle al tocar", async ({ page }) => {
  await page.goto("/pronostico");
  const grafico = page.getByRole("group", { name: "Tendencia del pronóstico" });
  await expect(grafico).toBeVisible();
  await expect.poll(() => grafico.evaluate((svg: SVGSVGElement) => svg.viewBox.baseVal.width === Math.round(svg.getBoundingClientRect().width))).toBe(true);
  const medidas = await grafico.evaluate((svg: SVGSVGElement) => {
    const alto = svg.getBoundingClientRect().height;
    const fechas = [...svg.querySelectorAll("text")].filter((t) => Number(t.getAttribute("y")) > alto - 20).map((t) => t.getBoundingClientRect());
    return { alto, cruces: fechas.slice(1).filter((f, i) => f.left < fechas[i].right).length, fuente: svg.querySelector("text")!.getAttribute("font-size") };
  });
  expect(medidas.fuente).toBe("11");
  expect(medidas.alto).toBe(200);
  expect(medidas.cruces).toBe(0);
  await grafico.scrollIntoViewIfNeeded();
  const caja = (await grafico.boundingBox())!;
  await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await expect(page.getByRole("status").filter({ hasText: "Potencial" })).toBeVisible();
  await page.getByText("Ver datos en tabla").click();
  await expect(page.getByRole("columnheader", { name: "Fecha", exact: true })).toBeVisible();
});

test("Pronóstico por asesor muestra las cifras en tarjetas, sin desplazarse a los lados", async ({ page }) => {
  await page.goto("/pronostico");
  const seccion = page.locator("section", { has: page.getByRole("heading", { name: "Pronóstico por asesor" }) });
  await expect(seccion.locator("table")).toBeHidden();
  const tarjeta = seccion.getByRole("listitem").filter({ hasText: "abiertas" }).first();
  for (const cifra of ["Cerrado", "Compromiso", "Mejor caso", "Pipeline", "Meta", "Pronóstico final"]) {
    const dentro = await tarjeta.getByText(cifra, { exact: true }).evaluate((e) => e.getBoundingClientRect().right <= document.documentElement.clientWidth);
    expect(dentro, cifra).toBe(true);
  }
});

test("el embudo usa todo el ancho y sus detalles aparecen al enfocar", async ({ page }) => {
  await page.goto("/indicadores");
  await expect(page.locator("main ol > li").first()).toBeVisible();
  const barras = await page.locator("main ol > li").evaluateAll((filas) => filas.map((f) => f.children[1].firstElementChild!.getBoundingClientRect().width));
  expect(Math.max(...barras)).toBeGreaterThan(200);
  const etapa = page.locator("main ol > li").first();
  await etapa.focus();
  const detalle = etapa.getByRole("tooltip");
  await expect(detalle).toBeVisible();
  const caja = (await detalle.boundingBox())!;
  expect(caja.x + caja.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("la app es instalable: manifiesto, íconos y página sin conexión", async ({ page, request }) => {
  const manifiesto = await (await request.get("/manifest.webmanifest")).json();
  expect(manifiesto.display).toBe("standalone");
  expect(manifiesto.start_url).toBe("/inicio");
  for (const icono of manifiesto.icons) expect((await request.get(icono.src)).ok()).toBe(true);
  await page.goto("/inicio");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "Sin conexión" })).toBeVisible();
});

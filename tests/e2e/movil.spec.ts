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

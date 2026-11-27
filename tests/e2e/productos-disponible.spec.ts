import { expect, test } from "@playwright/test";
import { sesion, unico } from "./ayuda";

// Productos: diseño, disponible real de PT-01 (En inventario − Comprometido, de la copia de SAP), su filtro, el
// vistazo al dejar presionada una fila, los kits y «Volver a la lista» con los filtros como se dejaron.
// En la demostración: DEMO-MB-060 tiene 260 − 100 = 160; DEMO-LV-RD, 45 − 60 = −15 (el CRM lo escribe «(15)»); los demás, 50.

test.use({ storageState: sesion("admin") });

const fila = (page: import("@playwright/test").Page, referencia: string) => page.getByRole("row").filter({ hasText: referencia });

test("la lista muestra el disponible, se filtra con un clic y «Volver a la lista» conserva los filtros", async ({ page }) => {
  await page.goto("/productos");
  await expect(page.getByRole("columnheader", { name: "Disponible PT-01" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Diseño del producto" })).toBeVisible();
  await expect(fila(page, "DEMO-MB-060").getByText("160", { exact: true })).toBeVisible();
  await expect(fila(page, "DEMO-LV-RD").getByText("(15)", { exact: true })).toBeVisible();

  // «Con disponible»: solo los que tienen disponible real mayor que cero.
  await page.getByRole("link", { name: "Con disponible" }).click();
  await expect(page).toHaveURL(/available_qty/);
  await expect(fila(page, "DEMO-MB-060")).toBeVisible();
  await expect(fila(page, "DEMO-LV-RD")).toHaveCount(0);
  const filtrada = page.url();

  // Entrar a un producto y volver: la lista queda como estaba.
  await fila(page, "DEMO-MB-060").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/productos\/[0-9a-f-]{36}/);
  await page.getByRole("link", { name: "Volver a la lista" }).click();
  await expect(page).toHaveURL(filtrada);
  await expect(fila(page, "DEMO-LV-RD")).toHaveCount(0);

  // Entrar por el menú del módulo empieza de cero, y desde ahí «Volver» ya no trae el filtro.
  await page.getByRole("navigation").getByRole("link", { name: "Productos", exact: true }).first().click();
  await expect(page).toHaveURL(/\/productos$/);
  await expect(fila(page, "DEMO-LV-RD")).toBeVisible();
  await fila(page, "DEMO-LV-RD").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/productos\/[0-9a-f-]{36}/);
  await expect(page.getByRole("link", { name: "Volver a la lista" })).toHaveAttribute("href", "/productos");
  // El botón se quita con otro clic.
  await page.goto(filtrada);
  await page.getByRole("link", { name: "Con disponible" }).click();
  await expect(page).not.toHaveURL(/available_qty/);
});

test("dejar presionado un producto muestra su disponible y sus precios sin entrar a la ficha", async ({ page }) => {
  await page.goto("/productos?q=DEMO-MB-060");
  const enlace = fila(page, "DEMO-MB-060").getByRole("link").first();
  const caja = (await enlace.boundingBox())!;
  await page.mouse.move(caja.x + 12, caja.y + caja.height / 2);
  await page.mouse.down();
  const vistazo = page.getByRole("dialog", { name: /Disponible y precios de/ });
  await expect(vistazo).toBeVisible();
  await page.mouse.up();
  // Soltar no navega: sigue en la lista, con la tarjeta abierta.
  await expect(page).toHaveURL(/\/productos\?q=DEMO-MB-060/);
  await expect(vistazo).toContainText("Disponible PT-01");
  await expect(vistazo).toContainText("160");
  await expect(vistazo.getByRole("listitem").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(vistazo).toBeHidden();
  // Un clic corto sí entra a la ficha.
  await enlace.click();
  await expect(page).toHaveURL(/\/productos\/[0-9a-f-]{36}/);
  // Con teclado o ratón, el botón de información abre la misma tarjeta.
  await page.goto("/productos?q=DEMO-LV-RD");
  await fila(page, "DEMO-LV-RD").getByRole("button", { name: /Ver disponible y precios de/ }).click();
  await expect(vistazo).toContainText("(15)");
});

test("Diseño del producto: lista propia, columna y búsqueda; el kit dice cuántos kits completos salen", async ({ page }) => {
  const guardar = () => page.locator("main").getByRole("button", { name: /^Guardar/ }).click();
  const diseno = unico("Honolulu");
  await page.goto("/configuracion/listas?objeto=products");
  const tarjeta = page.locator("#lista-design");
  await expect(tarjeta.getByRole("heading", { name: /Diseño del producto/ })).toBeVisible();
  await tarjeta.getByLabel("Nuevo valor").fill(diseno);
  await tarjeta.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(tarjeta.getByText(diseno)).toBeVisible();

  const nombre = unico("Hidromasaje básica");
  await page.goto("/productos/nuevo");
  await page.getByLabel(/Nombre del producto/).fill(nombre);
  await page.locator("#f-design").selectOption({ label: diseno });
  await guardar();
  await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
  await page.goto(`/productos?q=${encodeURIComponent(diseno)}`);
  await expect(fila(page, nombre).getByText(diseno, { exact: true })).toBeVisible();

  // Kit con 1 mueble de 60 (160 disponibles) y 2 muebles de 80 (50): salen 25 kits y el de 80 es el que limita.
  const kit = unico("Kit de prueba disponible");
  await page.goto("/productos/nuevo");
  await page.getByLabel(/Nombre del producto/).fill(kit);
  await page.getByLabel("Referencia").fill(`KITD-${Date.now().toString(36).toUpperCase()}`);
  await page.getByLabel("Kit", { exact: true }).check();
  await guardar();
  await expect(page.getByRole("heading", { level: 1, name: kit })).toBeVisible();
  const ficha = page.url().split("?")[0];
  const componentes = page.locator("section").filter({ has: page.getByRole("heading", { name: /Componentes del kit/ }) });
  const agregar = async (referencia: string, cantidad?: string) => {
    await expect(async () => {
      await componentes.locator("#kit-comp").fill(referencia);
      await page.getByRole("option", { name: new RegExp(referencia) }).first().click({ timeout: 2000 });
    }).toPass();
    if (cantidad) await componentes.locator("#kit-qty").fill(cantidad);
    await componentes.getByRole("button", { name: "Agregar" }).click();
    await expect(componentes.getByText(referencia).first()).toBeVisible();
  };
  await agregar("DEMO-MB-060");
  await agregar("DEMO-MB-080", "2");
  await page.goto(`${ficha}?tab=sap`);
  const disponible = page.locator("section").filter({ has: page.getByRole("heading", { name: "Disponible del kit" }) });
  await expect(disponible.getByTestId("kit-disponible")).toHaveText("25");
  await expect(disponible.getByRole("row").filter({ hasText: "DEMO-MB-080" })).toContainText("Limita");
  await expect(disponible.getByRole("row").filter({ hasText: "DEMO-MB-060" })).toContainText("160");
  // Con un componente sin disponible (−15), no sale ningún kit.
  await page.goto(ficha);
  await agregar("DEMO-LV-RD");
  await page.goto(`${ficha}?tab=sap`);
  await expect(disponible.getByTestId("kit-disponible")).toHaveText("0");
  await page.goto(`/productos?q=${encodeURIComponent(kit)}`);
  await expect(fila(page, kit).getByText("0", { exact: true })).toBeVisible();
});

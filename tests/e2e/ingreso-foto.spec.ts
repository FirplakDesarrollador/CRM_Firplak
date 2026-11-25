import { expect, test } from "@playwright/test";

// Sin sesión: es la pantalla de ingreso.
test.use({ storageState: { cookies: [], origins: [] } });

test("el ingreso muestra el formulario en una tarjeta de vidrio sobre la foto de producto", async ({ page, request }) => {
  await page.goto("/login");
  const tarjeta = page.locator(".foto-ingreso-tarjeta");
  await expect(tarjeta.getByRole("heading", { name: "Ingresa a tu cuenta" })).toBeVisible();
  await expect(tarjeta.getByRole("button", { name: "Ingresar" })).toBeVisible();

  // La foto se sirve sin sesión (si pasara por el control de acceso, redirigiría al ingreso y no cargaría).
  const fondo = await page.locator(".foto-ingreso").evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(fondo).toContain("/brand/ingreso.webp");
  const foto = await request.get("/brand/ingreso.webp");
  expect(foto.status()).toBe(200);
  expect(foto.headers()["content-type"]).toContain("image/webp");

  // La tarjeta es de vidrio: translúcida y con desenfoque de lo que tiene detrás.
  const filtro = await tarjeta.evaluate((el) => {
    const s = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
    return s.backdropFilter || s.webkitBackdropFilter || "";
  });
  expect(filtro).toContain("blur");
});

test("en celular el ingreso lleva arriba el azul con el logo FIRPLAK CRM y la tarjeta queda en la mitad de arriba", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const marca = page.locator(".foto-ingreso-marca");
  await expect(marca.getByAltText("Firplak · inspirando hogares")).toBeVisible();
  await expect(marca.getByText("CRM", { exact: true })).toBeVisible();
  await expect(marca.getByText("Cada proyecto, cada distribuidor y cada visita, en un solo lugar.")).toBeVisible();
  await expect(page.getByText("Uso interno · Firplak").last()).toBeVisible();

  // La tarjeta va debajo de la marca y empieza en el tercio de arriba, no centrada sobre la foto.
  const cajaMarca = (await marca.boundingBox())!;
  const cajaTarjeta = (await page.locator(".foto-ingreso-tarjeta").boundingBox())!;
  expect(cajaTarjeta.y).toBeGreaterThan(cajaMarca.y + cajaMarca.height);
  expect(cajaTarjeta.y).toBeLessThan(844 / 3);
  // Nada se desborda a lo ancho.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // En computador esa cabecera no aparece: el panel azul de la izquierda ya lleva el logo y la frase.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(marca).toBeHidden();
});

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

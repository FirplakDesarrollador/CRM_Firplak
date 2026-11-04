import { expect, test, type Page } from "@playwright/test";
import { ingresar, USUARIOS } from "./ayuda";

const raiz = (page: Page, atributo: string) => page.evaluate((a) => document.documentElement.getAttribute(a), atributo);

async function guardarApariencia(page: Page, tema: "Claro" | "Oscuro" | "Según el sistema", vidrio: "Transparente" | "Medio" | "Sólido") {
  await page.goto("/preferencias");
  await page.getByRole("radio", { name: tema }).check();
  await expect(async () => {
    await page.getByRole("button", { name: vidrio }).click();
    await expect(page.getByRole("slider", { name: "Efecto de vidrio" })).toHaveAttribute("aria-valuetext", vidrio);
  }).toPass();
  await page.getByRole("button", { name: "Guardar preferencias" }).click();
  await expect(page.getByText("Preferencias guardadas")).toBeVisible();
}

test("el tema y el vidrio del perfil se aplican solos al ingresar en otro dispositivo", async ({ page, browser }) => {
  await ingresar(page, USUARIOS.asesora);
  await page.waitForURL(/inicio/);
  await guardarApariencia(page, "Oscuro", "Sólido");

  // Otro dispositivo: un navegador sin ninguna cookie.
  const otro = await browser.newContext();
  const nuevo = await otro.newPage();
  await ingresar(nuevo, USUARIOS.asesora);
  await nuevo.waitForURL(/inicio/);
  await expect.poll(() => raiz(nuevo, "data-theme")).toBe("dark");
  await expect.poll(() => raiz(nuevo, "data-glass")).toBe("solid");
  await nuevo.goto("/preferencias");
  await expect(nuevo.getByRole("slider", { name: "Efecto de vidrio" })).toHaveAttribute("aria-valuetext", "Sólido");
  await expect(nuevo.getByRole("radio", { name: "Oscuro" })).toBeChecked();
  await otro.close();

  // Queda como estaba para las demás pruebas.
  await guardarApariencia(page, "Según el sistema", "Medio");
  await page.reload();
  expect(await raiz(page, "data-theme")).toBeNull();
  expect(await raiz(page, "data-glass")).toBeNull();
});

test("en un navegador compartido no queda la apariencia de la persona anterior", async ({ page, context }) => {
  await context.addCookies([
    { name: "fp-theme", value: "dark", url: "http://localhost:3000" },
    { name: "fp-glass", value: "solid", url: "http://localhost:3000" },
  ]);
  await page.goto("/login");
  expect(await raiz(page, "data-glass")).toBe("solid");
  await ingresar(page, USUARIOS.asesora);
  await page.waitForURL(/inicio/);
  await expect.poll(() => raiz(page, "data-theme")).toBeNull();
  await expect.poll(() => raiz(page, "data-glass")).toBeNull();
});

test("la pestaña del navegador tiene el ícono de Firplak", async ({ page, request }) => {
  const ico = await request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  expect(ico.headers()["content-type"]).toContain("icon");
  await page.goto("/login");
  await expect(page.locator('link[rel="icon"][href*="favicon.ico"]')).toHaveCount(1);
});

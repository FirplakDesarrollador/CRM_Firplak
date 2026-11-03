import { expect, test } from "@playwright/test";
import { CLAVE, ingresar, sesion, USUARIOS } from "./ayuda";

test.describe("sin sesión", () => {
  test("una contraseña equivocada no entra y lo explica", async ({ page }) => {
    await ingresar(page, USUARIOS.asesora, "equivocada");
    await expect(page.getByRole("alert").or(page.locator(".error-text")).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("una página privada pide ingresar y luego vuelve a ella", async ({ page }) => {
    await page.goto("/cuentas");
    await expect(page).toHaveURL(/\/login\?next=%2Fcuentas/);
    await page.getByLabel(/correo/i).fill(USUARIOS.asesora);
    await page.getByLabel(/contraseña/i).fill(CLAVE);
    await page.getByRole("button", { name: /ingresar/i }).click();
    await expect(page).toHaveURL(/\/cuentas$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("cerrar sesión vuelve al inicio de sesión y corta el acceso", async ({ page }) => {
    await ingresar(page, USUARIOS.asesora);
    await expect(page).toHaveURL(/\/inicio/);
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("asesora", () => {
  test.use({ storageState: sesion("asesora") });

  test("no ve ni abre la configuración", async ({ page }) => {
    await page.goto("/inicio");
    await page.getByRole("button", { name: "Menú de usuario" }).click();
    await expect(page.getByRole("link", { name: "Mi perfil" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Configuración" })).toHaveCount(0);
    await page.goto("/configuracion");
    await expect(page).toHaveURL(/\/inicio/);
  });
});

test.describe("administrador", () => {
  test.use({ storageState: sesion("admin") });

  test("abre la configuración", async ({ page }) => {
    await page.goto("/configuracion");
    await expect(page.getByRole("navigation", { name: "Configuración" })).toBeVisible();
  });

  test("cambia el idioma de la interfaz y vuelve al español", async ({ page }) => {
    const idioma = async (valor: string) => {
      await page.goto("/preferencias");
      await page.locator("#language").selectOption(valor);
      await page.getByRole("button", { name: /Guardar preferencias|Save preferences/ }).click();
      await expect(page.getByRole("button", { name: /Guardar preferencias|Save preferences/ })).toBeEnabled();
      await page.waitForLoadState("networkidle");
    };
    await idioma("en");
    await page.goto("/inicio");
    await expect(page.getByRole("link", { name: "Accounts" }).first()).toBeVisible();
    await idioma("es");
    await page.goto("/inicio");
    await expect(page.getByRole("link", { name: "Cuentas" }).first()).toBeVisible();
  });
});

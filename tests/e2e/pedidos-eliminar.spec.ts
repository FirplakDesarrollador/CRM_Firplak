import { expect, test, type Page } from "@playwright/test";
import { sesion, unico } from "./ayuda";

// Borrar un pedido lo decide el permiso «Eliminar» del perfil, no el estado del pedido.
async function buscarYElegir(page: Page, campo: string | RegExp, texto: string) {
  await page.getByLabel(campo).fill(texto);
  await page.getByRole("option", { name: new RegExp(texto, "i") }).first().click();
}

test.describe("eliminar pedidos", () => {
  test.use({ storageState: sesion("admin") });

  test("un pedido ya activado se puede eliminar, con una advertencia antes", async ({ page }) => {
    const nombre = unico("Pedido para borrar");
    await page.goto("/pedidos/nuevo");
    await page.getByLabel(/Nombre del pedido/).fill(nombre);
    await buscarYElegir(page, /^Cuenta/, "Casa Viva");
    await page.locator("main").getByRole("button", { name: /^Guardar/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(nombre) })).toBeVisible();
    await buscarYElegir(page, /producto/i, "DEMO-MB-060");
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("DEMO-MB-060").first()).toBeVisible();

    await page.getByRole("list", { name: "Estado" }).getByRole("button", { name: "Activado" }).click();
    // Si está encendida la creación de ofertas en SAP, activar pide confirmación.
    const confirmar = page.getByRole("dialog").getByRole("button", { name: "Activar pedido" });
    if (await confirmar.isVisible().catch(() => false)) await confirmar.click();
    await expect(page.getByRole("list", { name: "Estado" }).locator('li[aria-current="step"]')).toContainText("Activado");

    // El botón está aunque el pedido ya no sea borrador, y avisa lo que implica.
    await page.reload();
    await page.getByRole("button", { name: /^Eliminar el pedido PED-/ }).click();
    const aviso = page.getByRole("dialog");
    await expect(aviso).toContainText("Este pedido está en estado «Activado»");
    await expect(aviso).toContainText("Esta acción no se puede deshacer.");
    // «Volver» no borra nada.
    await aviso.getByRole("button", { name: "Volver" }).click();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(nombre) })).toBeVisible();

    await page.getByRole("button", { name: /^Eliminar el pedido PED-/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page).toHaveURL(/\/pedidos(\?|$)/);
    await page.goto(`/pedidos?q=${encodeURIComponent(nombre)}`);
    await expect(page.getByRole("link", { name: new RegExp(nombre) })).toHaveCount(0);
  });
});

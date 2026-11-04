import { expect, test, type Page } from "@playwright/test";
import { sesion } from "./ayuda";

test.use({ storageState: sesion("admin") });

const nivel = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-glass"));

async function guardar(page: Page) {
  await page.getByRole("button", { name: "Guardar preferencias" }).click();
  await expect(page.getByText("Preferencias guardadas")).toBeVisible();
}

test("la barra de efecto de vidrio cambia el nivel, y solo queda al guardar", async ({ page }) => {
  await page.goto("/preferencias");
  const barra = page.getByRole("slider", { name: "Efecto de vidrio" });
  await expect(barra).toBeVisible();
  // Por defecto, el vidrio de siempre.
  await expect(barra).toHaveAttribute("aria-valuetext", "Medio");
  expect(await nivel(page)).toBeNull();

  // Se ve al moverla, pero al irse sin guardar vuelve lo que había. Reintenta: el primer clic puede llegar antes de que cargue React.
  await expect(async () => {
    await page.getByRole("button", { name: "Sólido" }).click();
    expect(await nivel(page)).toBe("solid");
  }).toPass();
  await page.getByRole("link", { name: "Indicadores" }).first().click();
  await page.waitForURL(/indicadores/);
  await expect.poll(() => nivel(page)).toBeNull();

  // Sólido guardado: sin blur en toda la app y con el logo quieto.
  await page.goto("/preferencias");
  await page.getByRole("button", { name: "Sólido" }).click();
  await guardar(page);
  await page.goto("/indicadores");
  expect(await nivel(page)).toBe("solid");
  await expect.poll(() => page.locator("main .glass").first().evaluate((e) => getComputedStyle(e).backdropFilter)).toBe("none");
  await expect.poll(() => page.locator(".brand-backdrop-logo").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");

  // Con el teclado hasta Transparente: el logo se mueve de nuevo y el blur es menor.
  await page.goto("/preferencias");
  await page.getByRole("slider", { name: "Efecto de vidrio" }).focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("slider", { name: "Efecto de vidrio" })).toHaveAttribute("aria-valuetext", "Transparente");
  await guardar(page);
  await page.goto("/indicadores");
  expect(await nivel(page)).toBe("clear");
  await expect.poll(() => page.locator("main .glass").first().evaluate((e) => getComputedStyle(e).backdropFilter)).toContain("blur(16px)");
  await expect.poll(() => page.locator(".brand-backdrop-logo").evaluate((e) => getComputedStyle(e).animationName)).toBe("logo-deriva");

  // Queda como estaba para las demás pruebas.
  await page.goto("/preferencias");
  await page.getByRole("button", { name: "Medio" }).click();
  await guardar(page);
  await page.reload();
  expect(await nivel(page)).toBeNull();
});

import { expect, test as setup } from "@playwright/test";
import { ingresar, sesion, USUARIOS } from "./ayuda";

for (const quien of Object.keys(USUARIOS) as (keyof typeof USUARIOS)[]) {
  setup(`sesión de ${quien}`, async ({ page }) => {
    await ingresar(page, USUARIOS[quien]);
    await expect(page).toHaveURL(/\/inicio/);
    await page.context().storageState({ path: sesion(quien) });
  });
}

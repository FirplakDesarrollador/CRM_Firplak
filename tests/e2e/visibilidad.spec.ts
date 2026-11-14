import { expect, test, type Page } from "@playwright/test";
import { sesion, unico } from "./ayuda";

// Visibilidad entre asesores: con las cuentas en privado, un asesor no abre el cliente de otro, pero el CRM le avisa
// que existe y quién lo atiende (al crearlo y al buscarlo). Y una rama de roles puede compartir clientes entre sí.

/** Deja «Compartir por defecto» de las cuentas en el nivel indicado (con la sesión de administración). */
async function compartirCuentas(page: Page, nivel: "private" | "read") {
  await page.goto("/configuracion/compartir");
  await page.locator(`input[type="radio"][name="accounts"][value="${nivel}"]`).check();
  await page.locator("main").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Reglas de compartir actualizadas")).toBeVisible();
}

test("con las cuentas en privado, crear o buscar el cliente de otro avisa que existe y de quién es, sin abrirlo", async ({ browser }) => {
  const admin = await (await browser.newContext({ storageState: sesion("admin") })).newPage();
  const asesora = await (await browser.newContext({ storageState: sesion("asesora") })).newPage();
  const cliente = unico("Ferretería Reservada");
  const nit = `9${Date.now().toString().slice(-8)}-1`;

  // La administración crea un cliente y deja las cuentas en privado.
  await admin.goto("/cuentas/nueva");
  await admin.getByLabel(/Nombre de la cuenta/).fill(cliente);
  await admin.getByLabel("NIT").fill(nit);
  await admin.locator("#f-industry").selectOption({ label: "Canal Distribución" });
  await admin.locator("main").getByRole("button", { name: /^Guardar/ }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toContainText("Ferretería Reservada");
  const ficha = admin.url().split("?")[0];
  try {
    await compartirCuentas(admin, "private");

    // La asesora no lo ve en su lista ni puede abrir la ficha.
    await asesora.goto(`/cuentas?q=${encodeURIComponent(cliente)}`);
    await expect(asesora.getByRole("link", { name: new RegExp(cliente, "i") })).toHaveCount(0);
    await asesora.goto(ficha);
    await expect(asesora.getByRole("heading", { level: 1, name: new RegExp(cliente, "i") })).toHaveCount(0);

    // Al intentar crearlo, el aviso dice que ya existe y quién lo atiende, sin enlace a la ficha.
    await asesora.goto("/cuentas/nueva");
    await asesora.getByLabel(/Nombre de la cuenta/).fill(cliente.toUpperCase());
    await asesora.locator("#f-industry").selectOption({ label: "Canal Distribución" });
    await asesora.locator("main").getByRole("button", { name: /^Guardar/ }).click();
    const aviso = asesora.getByRole("listitem").filter({ hasText: "ya existe y está a cargo de" });
    await expect(aviso).toContainText(new RegExp(cliente, "i"));
    await expect(aviso).toContainText("Luis Demo");
    await expect(aviso.getByRole("link")).toHaveCount(0);
    await expect(asesora).toHaveURL(/\/cuentas\/nueva/);

    // Al buscarlo por nombre o por NIT aparece aparte, también sin enlace.
    for (const consulta of [cliente, nit]) {
      await asesora.goto(`/buscar?q=${encodeURIComponent(consulta)}`);
      const otros = asesora.getByRole("region", { name: /Clientes a cargo de otras personas/ });
      await expect(otros).toContainText(new RegExp(cliente, "i"));
      await expect(otros).toContainText("A cargo de Luis Demo");
      await expect(otros.getByRole("link")).toHaveCount(0);
    }
    // Quien sí puede abrirlo lo encuentra como siempre y no lo ve en esa sección.
    await admin.goto(`/buscar?q=${encodeURIComponent(cliente)}`);
    await expect(admin.getByRole("link", { name: new RegExp(cliente, "i") })).toBeVisible();
    await expect(admin.getByRole("region", { name: /Clientes a cargo de otras personas/ })).toHaveCount(0);
  } finally {
    // Queda como estaba para las demás pruebas.
    await compartirCuentas(admin, "read");
  }
});

test("un rol se puede marcar para que su rama comparta clientes", async ({ browser }) => {
  const admin = await (await browser.newContext({ storageState: sesion("admin") })).newPage();
  const rol = unico("Coordinación B2C");
  await admin.goto("/configuracion/roles");
  await admin.locator("#role-name").fill(rol);
  await admin.getByRole("button", { name: "Crear rol" }).click();
  const fila = admin.getByRole("listitem").filter({ has: admin.locator(`input[value="${rol}"]`) });
  await expect(fila).toBeVisible();
  const casilla = fila.getByLabel("Comparten clientes");
  await expect(casilla).not.toBeChecked();
  await casilla.check();
  await fila.getByRole("button", { name: "Guardar" }).click();
  await expect(admin.getByText("Rol actualizado")).toBeVisible();
  await admin.reload();
  await expect(admin.getByRole("listitem").filter({ has: admin.locator(`input[value="${rol}"]`) }).getByLabel("Comparten clientes")).toBeChecked();
});

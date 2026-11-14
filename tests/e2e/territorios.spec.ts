import { expect, test, type Page } from "@playwright/test";
import { sesion, unico } from "./ayuda";

// Territorios: qué canal, mercado y zona atiende cada asesor. La zona del cliente sale de su dirección; un asesor con
// territorios no crea clientes fuera de lo suyo, y la ficha sugiere a quién le corresponde un cliente.

/** Llena y guarda el formulario de cuenta nueva. Con `abrir` en falso sigue en el formulario ya abierto (tras un rechazo). */
async function nuevaCuenta(page: Page, nombre: string, departamento: string, ciudad: string, abrir = true) {
  if (abrir) await page.goto("/cuentas/nueva");
  await page.getByLabel(/Nombre de la cuenta/).fill(nombre);
  await page.locator("#f-industry").selectOption({ label: "Canal Distribución" });
  const ciudades = page.locator("#f-billing_city");
  await expect(async () => {
    await page.locator("#f-billing_state").selectOption({ label: departamento });
    await expect(ciudades).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await ciudades.selectOption({ label: ciudad });
  await page.locator("main").getByRole("button", { name: /^Guardar/ }).click();
}

test("la zona sale de la dirección, el asesor no crea fuera de su territorio y la ficha sugiere el responsable", async ({ browser }) => {
  const admin = await (await browser.newContext({ storageState: sesion("admin") })).newPage();
  const asesora = await (await browser.newContext({ storageState: sesion("asesora") })).newPage();

  // La administración le asigna a la asesora Distribución en Antioquia.
  await admin.goto("/configuracion/territorios");
  await admin.locator("#t-user").selectOption({ label: "Camila Asesora" });
  await admin.getByRole("checkbox", { name: "Canal Distribución" }).check();
  await admin.locator("#t-zone").selectOption({ label: "Antioquia" });
  await admin.getByRole("button", { name: "Agregar territorio" }).click();
  const porAsesor = admin.getByRole("region", { name: /Territorios por asesor/ });
  await expect(porAsesor.getByRole("listitem").filter({ hasText: "Camila Asesora" }).first()).toContainText("Canal Distribución · Antioquia");
  try {
    // Un nombre de departamento mal escrito no se acepta.
    await admin.locator("#t-user").selectOption({ label: "Camila Asesora" });
    await admin.getByRole("checkbox", { name: "Canal Constructores" }).check();
    await admin.locator("#t-zone").selectOption({ label: "Centro del País" });
    await admin.locator("#t-deps").fill("Meta, Boyaca sin tilde");
    await admin.getByRole("button", { name: "Agregar territorio" }).click();
    await expect(admin.getByText(/No reconozco estos departamentos: Boyaca sin tilde/)).toBeVisible();

    // Fuera de su zona no puede crear el cliente, y el aviso dice por qué.
    await nuevaCuenta(asesora, unico("Ferretería del Tolima"), "Tolima", "Ibagué");
    await expect(asesora.getByText(/fuera del territorio de su responsable \(Canal Distribución · Nacional · Tolima Grande\)/)).toBeVisible();
    await expect(asesora).toHaveURL(/\/cuentas\/nueva/);

    // En su zona sí, y la zona queda puesta sola.
    const propia = unico("Ferretería de Antioquia");
    // Corrige la dirección en el mismo formulario: volver a abrirlo recuperaría el borrador rechazado.
    await nuevaCuenta(asesora, propia, "Antioquia", "Medellín", false);
    await expect(asesora.getByRole("heading", { level: 1 })).toContainText("Ferretería de Antioquia");
    await expect(asesora.locator("main").getByText("Antioquia", { exact: true }).first()).toBeVisible();
    await expect(asesora.getByText("Según los territorios, le corresponde a")).toHaveCount(0);

    // Un cliente de esa zona creado por otra persona muestra a quién le corresponde.
    await nuevaCuenta(admin, unico("Depósito de Envigado"), "Antioquia", "Envigado");
    await expect(admin.getByRole("heading", { level: 1 })).toContainText("Depósito de Envigado");
    await expect(admin.getByText("Según los territorios, le corresponde a Camila Asesora.")).toBeVisible();
  } finally {
    // Sin territorios para las demás pruebas.
    await admin.goto("/configuracion/territorios");
    const region = admin.getByRole("region", { name: /Territorios por asesor/ });
    await expect(region).toBeVisible();
    const filas = region.getByRole("button", { name: /^Quitar Canal/ });
    for (let quedan = await filas.count(); quedan > 0; quedan--) {
      await filas.first().click();
      await admin.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
      await expect(filas).toHaveCount(quedan - 1);
    }
  }
  await expect(admin.getByText("Todavía no hay territorios.", { exact: false })).toBeVisible();
});

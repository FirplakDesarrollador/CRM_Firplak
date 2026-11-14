import { expect, test, type Page } from "@playwright/test";
import { sesion, unico } from "./ayuda";

test.use({ storageState: sesion("admin") });

const guardar = (page: Page) => page.locator("main").getByRole("button", { name: /^Guardar/ }).click();

async function cuentaInternacional(page: Page) {
  const nombre = unico("Distribuidora Miami");
  await page.goto("/cuentas/nueva");
  await page.getByLabel(/Nombre de la cuenta/).fill(nombre);
  await expect(async () => {
    await page.locator("#f-market").selectOption({ label: "Internacional" });
    await page.locator("#f-industry").selectOption({ label: "Canal Distribución" });
    await expect(page.locator("#f-market")).toHaveValue("Internacional", { timeout: 1000 });
  }).toPass();
  await guardar(page);
  await expect(page).toHaveURL(/\/cuentas\/[0-9a-f-]{36}/);
  return { id: page.url().split("/cuentas/")[1].split(/[?#]/)[0], nombre };
}

test("una oportunidad de una cuenta del exterior se registra en USD y se convierte a pesos con la TRM", async ({ page }) => {
  const cuenta = await cuentaInternacional(page);

  // Desde la cuenta: el formulario pide el valor en USD y no en pesos.
  await page.goto(`/oportunidades/nueva?account=${cuenta.id}`);
  await expect(page.getByLabel("Valor en USD")).toBeVisible();
  await expect(page.getByLabel("Valor", { exact: true })).toHaveCount(0);
  await page.getByLabel("Valor en USD").fill("1,000");
  await guardar(page);
  await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}/);
  await page.getByRole("tab", { name: "Detalles" }).click();
  await expect(page.getByText("$1,000 USD").first()).toBeVisible();
  await expect(page.getByText("$4,000,000").first()).toBeVisible();

  // Al elegir la cuenta en el formulario, el valor cambia de pesos a USD.
  await page.goto("/oportunidades/nueva");
  await expect(page.getByLabel("Valor", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Valor en USD")).toHaveCount(0);
  await expect(async () => {
    await page.getByLabel("Cuenta", { exact: true }).fill(cuenta.nombre.split(" ").slice(0, 2).join(" "));
    await page.getByRole("option", { name: new RegExp(cuenta.nombre.split(" ")[1], "i") }).first().click({ timeout: 2000 });
  }).toPass();
  await expect(page.getByLabel("Valor en USD")).toBeVisible();
  await expect(page.getByLabel("Valor", { exact: true })).toHaveCount(0);
});

test("la dirección elige país, departamento y ciudad de las listas; fuera de Colombia es texto libre", async ({ page }) => {
  await page.goto("/cuentas/nueva");
  const pais = page.locator("#f-billing_country");
  const dpto = page.locator("#f-billing_state");
  const ciudad = page.locator("#f-billing_city");
  await page.getByLabel(/Nombre de la cuenta/).fill(unico("Ferretería Lugares"));
  await page.locator("#f-industry").selectOption({ label: "Canal Distribución" });
  await expect(pais).toHaveValue("Colombia");
  await expect(ciudad).toBeDisabled();
  await expect(async () => {
    await dpto.selectOption({ label: "Antioquia" });
    await expect(ciudad).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await expect(ciudad.locator("option", { hasText: "Medellín" })).toHaveCount(1);
  await expect(ciudad.locator("option", { hasText: "Cali" })).toHaveCount(0);
  // Están los 33 departamentos, también los últimos de la lista: la API corta en 1000 filas y son 1.122 municipios.
  await expect(dpto.locator("option")).toHaveCount(34);
  for (const [departamento, capital] of [["Tolima", "Ibagué"], ["Valle del Cauca", "Cali"], ["Sucre", "Sincelejo"], ["Vichada", "Puerto Carreño"]]) {
    await dpto.selectOption({ label: departamento });
    await expect(ciudad.locator("option", { hasText: new RegExp(`^${capital}$`) })).toHaveCount(1);
  }
  await dpto.selectOption({ label: "Antioquia" });
  await ciudad.selectOption({ label: "Medellín" });

  // En otro país, departamento y ciudad se escriben.
  await page.locator("#f-shipping_country").selectOption({ label: "Panamá" });
  await expect(page.locator("#f-shipping_state")).toHaveJSProperty("tagName", "INPUT");
  await page.locator("#f-shipping_city").fill("Ciudad de Panamá");

  await guardar(page);
  await expect(page).toHaveURL(/\/cuentas\/[0-9a-f-]{36}/);
  await page.getByRole("tab", { name: "Detalles" }).click();
  await expect(page.getByText("Medellín").first()).toBeVisible();
  await expect(page.getByText("Antioquia").first()).toBeVisible();
  await expect(page.getByText("Ciudad de Panamá").first()).toBeVisible();
});

test("Configuración → Monedas muestra la TRM vigente y permite registrarla a mano", async ({ page }) => {
  await page.goto("/configuracion/monedas");
  await expect(page.getByTestId("trm-vigente")).toHaveText(/\$\d/);
  await page.getByLabel("TRM (pesos por dólar)").fill("4,000");
  await page.getByRole("button", { name: "Guardar TRM" }).click();
  await expect(page.getByText("TRM guardada").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Manual" }).first()).toBeVisible();
});

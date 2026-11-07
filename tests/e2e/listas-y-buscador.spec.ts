import { expect, test, type Page } from "@playwright/test";
import { sesion } from "./ayuda";

test.use({ storageState: sesion("admin") });

test("Listas de valores: de Personalizar se puede volver al resumen y entrar de nuevo", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/configuracion/listas");
  const tarjeta = page.locator("section.card").filter({ has: page.getByRole("button", { name: "Personalizar" }) }).first();
  const id = await tarjeta.getAttribute("id");
  expect(id).toBeTruthy();
  const lista = page.locator(`section[id="${id}"]`);
  const opciones = await lista.locator(".badge").allInnerTexts();

  await expect(async () => {
    await lista.getByRole("button", { name: "Personalizar" }).click();
    await expect(page).toHaveURL(/editar=/, { timeout: 3000 });
  }).toPass();
  await expect(lista.getByLabel("Nuevo valor")).toBeVisible();

  // Vuelve al resumen, sin perder la personalización.
  await lista.getByRole("link", { name: "Volver al resumen" }).click();
  await expect(page).not.toHaveURL(/editar=/);
  await expect(lista.getByLabel("Nuevo valor")).toHaveCount(0);
  await expect(lista.getByText("Personalizada")).toBeVisible();
  expect(opciones.length).toBeGreaterThan(1);
  await expect(lista.locator(".badge").nth(1)).toBeVisible();

  // Las demás listas siguen en resumen, y esta se puede abrir otra vez.
  await lista.getByRole("link", { name: "Editar" }).click();
  await expect(page).toHaveURL(/editar=/);
  await expect(lista.getByLabel("Nuevo valor")).toBeVisible();
  await expect(page.getByLabel("Nuevo valor")).toHaveCount(1);

  // Queda como estaba para las demás pruebas.
  await lista.getByRole("button", { name: "Restablecer" }).click();
  await expect(lista.getByRole("button", { name: "Personalizar" })).toBeVisible();
});

test("Listas dependientes: Segmento solo ofrece lo que corresponde a Mercado y Canal", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/configuracion/listas?objeto=accounts");
  const lista = page.locator("section#lista-segment");
  await expect(lista.getByRole("button", { name: "Personalizar" }).or(lista.getByRole("link", { name: "Editar" }))).toBeVisible();
  if (await lista.getByRole("button", { name: "Personalizar" }).count()) {
    await expect(async () => {
      await lista.getByRole("button", { name: "Personalizar" }).click();
      await expect(page).toHaveURL(/editar=segment/, { timeout: 3000 });
    }).toPass();
  } else {
    await lista.getByRole("link", { name: "Editar" }).click();
  }

  // Segmento pasa a depender de Mercado y de Canal.
  for (const controladora of ["Mercado", "Canal"]) {
    await lista.getByLabel("Lista que la controla").selectOption({ label: controladora });
    await lista.getByRole("button", { name: "Agregar lista" }).click();
    await expect(lista.getByText(`«${controladora}»`)).toBeVisible();
  }
  await expect(lista.getByText("Depende de las listas Mercado + Canal")).toBeVisible();
  const matriz = (nombre: string) => lista.locator("form").filter({ hasText: `«${nombre}»` });
  const [seg1, seg2] = (await matriz("Mercado").locator("tbody th").allInnerTexts()).map((x) => x.trim());
  const canal = (await matriz("Canal").locator("thead th").allInnerTexts())[1];

  await matriz("Mercado").getByRole("checkbox", { name: `${seg1} · Nacional` }).check();
  await matriz("Mercado").getByRole("checkbox", { name: `${seg2} · Internacional` }).check();
  await matriz("Mercado").getByRole("button", { name: "Guardar relaciones con Mercado" }).click();
  await expect(matriz("Mercado").getByText("Relaciones guardadas")).toBeVisible();
  await matriz("Canal").getByRole("checkbox", { name: `${seg1} · ${canal}` }).check();
  await matriz("Canal").getByRole("checkbox", { name: `${seg2} · ${canal}` }).check();
  await matriz("Canal").getByRole("button", { name: "Guardar relaciones con Canal" }).click();
  await expect(matriz("Canal").getByText("Relaciones guardadas")).toBeVisible();

  // En el formulario, Segmento depende de lo elegido en las dos listas.
  await page.goto("/cuentas/nueva");
  const mercado = page.getByLabel("Mercado", { exact: true });
  // La semilla trae además un campo personalizado «Canal»: el de la lista es industry.
  const canalSel = page.locator("#f-industry");
  const seg = page.getByLabel("Segmento", { exact: true });
  await expect(page.getByText("Elige primero «Mercado» y «Canal».")).toBeVisible();
  await expect(seg.locator("option")).toHaveText(["— Ninguno —"]);
  await expect(async () => {
    await mercado.selectOption({ label: "Nacional" });
    await canalSel.selectOption({ label: canal });
    await expect(seg.locator("option")).toHaveText(["— Ninguno —", seg1], { timeout: 1500 });
  }).toPass();
  await seg.selectOption({ label: seg1 });
  await mercado.selectOption({ label: "Internacional" });
  await expect(seg).toHaveValue("");
  await expect(seg.locator("option")).toHaveText(["— Ninguno —", seg2]);

  // El prospecto usa las mismas listas y dependencias de Cuentas, y la configuración lo indica.
  await page.goto("/prospectos/nuevo");
  const segProspecto = page.locator("#f-segment");
  await expect(async () => {
    await page.locator("#f-market").selectOption({ label: "Internacional" });
    await page.locator("#f-industry").selectOption({ label: canal });
    await expect(segProspecto.locator("option")).toHaveText(["— Ninguno —", seg2], { timeout: 1500 });
  }).toPass();
  await page.goto("/configuracion/listas?objeto=leads");
  await expect(page.getByText("Mercado, Canal y Segmento usan las mismas listas de Cuentas")).toBeVisible();
  await expect(page.locator("section#lista-industry")).toHaveCount(0);

  // Queda como estaba para las demás pruebas.
  await page.goto("/configuracion/listas?objeto=accounts&editar=segment");
  await page.locator("section#lista-segment").getByRole("button", { name: "Restablecer" }).click();
  await expect(page.locator("section#lista-segment").getByRole("button", { name: "Personalizar" })).toBeVisible();
});

async function compruebaLista(page: Page) {
  const buscador = page.getByLabel("Cuenta principal");
  await buscador.scrollIntoViewIfNeeded();
  await expect(async () => {
    await buscador.click();
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole("listbox").getByRole("option").nth(1)).toBeVisible({ timeout: 2000 });
  }).toPass();
  const lista = page.getByRole("listbox");
  await lista.scrollIntoViewIfNeeded();

  // Toda la lista está encima: en cada opción, lo que recibe el clic es esa opción y no la tarjeta siguiente.
  const tapadas = await lista.evaluate((ul) =>
    [...ul.querySelectorAll('[role="option"]')].filter((o) => {
      const c = o.getBoundingClientRect();
      const y = c.top + c.height / 2;
      if (y > ul.getBoundingClientRect().bottom || y > innerHeight) return false;
      return !o.contains(document.elementFromPoint(c.left + c.width / 2, y));
    }).length,
  );
  expect(tapadas).toBe(0);

  // Un clic real sobre la segunda opción la selecciona.
  const opcion = lista.getByRole("option").nth(1);
  const nombre = await opcion.locator("p").first().innerText();
  await opcion.click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByText(nombre, { exact: true }).first()).toBeVisible();
}

test("Cuenta principal: la lista del buscador queda encima de la tarjeta Direcciones", async ({ page }) => {
  await page.goto("/cuentas/nueva");
  await compruebaLista(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cuentas/nueva");
  await compruebaLista(page);
});

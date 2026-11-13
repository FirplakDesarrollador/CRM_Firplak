import { expect, test } from "@playwright/test";
import { sesion, unico } from "./ayuda";

test.use({ storageState: sesion("admin") });

test("Planta y Grupo de Artículo: el administrador crea sus valores y se eligen en el producto", async ({ page }) => {
  const planta = unico("Planta Prueba");
  const grupo = unico("Grupo Prueba");

  // Configuración → Listas de valores → Productos: las dos listas existen y se llenan ahí mismo.
  await page.goto("/configuracion/listas?objeto=products");
  for (const [campo, titulo, valor] of [["plant", "Planta", planta], ["item_group", "Grupo de Artículo", grupo]] as const) {
    const tarjeta = page.locator(`#lista-${campo}`);
    await expect(tarjeta.getByRole("heading", { name: new RegExp(titulo) })).toBeVisible();
    await tarjeta.getByLabel("Nuevo valor").fill(valor);
    await tarjeta.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(tarjeta.getByText(valor)).toBeVisible();
    await expect(tarjeta.getByText("Personalizada")).toBeVisible();
  }

  // La lista ya creada se puede seguir modificando: se abre con «Editar» y admite otro valor.
  const tarjetaPlanta = page.locator("#lista-plant");
  await tarjetaPlanta.getByRole("link", { name: "Editar" }).click();
  await expect(page).toHaveURL(/editar=plant/);
  await tarjetaPlanta.getByLabel("Nuevo valor").fill(`${planta} B`);
  await tarjetaPlanta.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(tarjetaPlanta.getByText(`${planta} B`)).toBeVisible();

  // Producto nuevo: los dos campos ofrecen esos valores y quedan guardados.
  const nombre = unico("Producto con planta");
  await page.goto("/productos/nuevo");
  await page.getByLabel(/Nombre del producto/).fill(nombre);
  await page.locator("#f-plant").selectOption({ label: planta });
  await page.locator("#f-item_group").selectOption({ label: grupo });
  await page.locator("main").getByRole("button", { name: /^Guardar/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
  await expect(page.getByText(planta, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(grupo, { exact: true }).first()).toBeVisible();

  // En la lista de productos aparecen como columnas y se puede buscar por ellos.
  await page.goto(`/productos?q=${encodeURIComponent(planta)}`);
  await expect(page.getByRole("columnheader", { name: "Planta" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Grupo de Artículo" })).toBeVisible();
  await expect(page.getByRole("link", { name: nombre })).toBeVisible();
});

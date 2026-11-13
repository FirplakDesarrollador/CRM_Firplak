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
    // Planta trae de fábrica el valor «KIT» (el de los kits): se abre con «Personalizar». Grupo de Artículo empieza vacía.
    if (campo === "plant") {
      await expect(tarjeta.getByText("KIT", { exact: true })).toBeVisible();
      await tarjeta.getByRole("button", { name: "Personalizar" }).click();
      await expect(page).toHaveURL(/editar=plant/);
    }
    await tarjeta.getByLabel("Nuevo valor").fill(valor);
    await tarjeta.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(tarjeta.getByText(valor)).toBeVisible();
    await expect(tarjeta.getByText("Personalizada")).toBeVisible();
  }

  // La lista ya creada se puede seguir modificando: se abre con «Editar» y admite otro valor.
  await page.goto("/configuracion/listas?objeto=products");
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

test("Kit: se marca en el producto, toma la planta KIT y se le agregan componentes en su ficha", async ({ page }) => {
  const guardar = () => page.locator("main").getByRole("button", { name: /^Guardar/ }).click();
  const crear = async (nombre: string, referencia: string, kit = false) => {
    await page.goto("/productos/nuevo");
    await page.getByLabel(/Nombre del producto/).fill(nombre);
    await page.getByLabel("Referencia").fill(referencia);
    if (kit) await page.getByLabel("Kit", { exact: true }).check();
    await guardar();
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    return page.url().split("?")[0];
  };
  const sufijo = Date.now().toString(36).toUpperCase();
  const lavamanos = unico("Lavamanos Oslo 63cm");
  // «Gabinete» y no «Mueble» (aquí y en el kit): la prueba de aprobaciones busca «mueble» y toma el primer resultado.
  const mueble = unico("Gabinete elevado dos puertas 63cm");
  const fichaLavamanos = await crear(lavamanos, `LVM-${sufijo}`);
  await crear(mueble, `MUE-${sufijo}`);
  // Un producto suelto no muestra la tarjeta de componentes.
  await expect(page.getByRole("heading", { name: /Componentes del kit/ })).toHaveCount(0);

  const kit = unico("Kit Lvm Oslo con gabinete elev 63cm");
  const fichaKit = await crear(kit, `KIT-${sufijo}`, true);
  // La planta quedó en KIT sin elegirla y la ficha abre con la tarjeta de componentes vacía.
  await expect(page.locator("main").getByText("KIT", { exact: true }).first()).toBeVisible();
  const tarjeta = page.locator("section").filter({ has: page.getByRole("heading", { name: /Componentes del kit/ }) });
  await expect(tarjeta.getByText("Este kit todavía no tiene componentes. Agrega el primero.")).toBeVisible();

  const agregar = async (referencia: string, cantidad?: string) => {
    await expect(async () => {
      await tarjeta.locator("#kit-comp").fill(referencia);
      await page.getByRole("option", { name: new RegExp(referencia) }).first().click({ timeout: 2000 });
    }).toPass();
    if (cantidad) await tarjeta.locator("#kit-qty").fill(cantidad);
    await tarjeta.getByRole("button", { name: "Agregar" }).click();
  };
  await agregar(`LVM-${sufijo}`);
  await expect(tarjeta.getByRole("link", { name: lavamanos })).toBeVisible();
  await agregar(`MUE-${sufijo}`, "2");
  const filaMueble = tarjeta.getByRole("listitem").filter({ hasText: mueble });
  await expect(filaMueble).toContainText("2");
  await expect(tarjeta.getByRole("heading", { name: /Componentes del kit/ })).toContainText("2");
  // El kit no puede ser componente de sí mismo.
  await agregar(`KIT-${sufijo}`);
  await expect(tarjeta.getByText("Un kit no puede ser componente de sí mismo.")).toBeVisible();

  // El componente sabe en qué kits está, y un producto en uso no se puede marcar como kit.
  await page.goto(fichaLavamanos);
  const enKits = page.locator("section").filter({ has: page.getByRole("heading", { name: /Kits que lo incluyen/ }) });
  await expect(enKits.getByRole("link", { name: kit })).toBeVisible();
  await page.goto(`${fichaLavamanos}/editar`);
  await page.getByLabel("Kit", { exact: true }).check();
  await guardar();
  await expect(page.getByText(/es componente de un kit/)).toBeVisible();

  // Quitar un componente pide confirmación.
  await page.goto(fichaKit);
  await filaMueble.getByRole("button", { name: new RegExp(`Quitar ${mueble}`) }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Quitar" }).click();
  await expect(tarjeta.getByRole("link", { name: mueble })).toHaveCount(0);
  await expect(tarjeta.getByRole("link", { name: lavamanos })).toBeVisible();
});

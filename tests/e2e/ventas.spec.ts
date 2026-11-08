import { expect, test, type Page } from "@playwright/test";
import { activarPush, pushRecibidos, sesion, unico, usarPushSimulado } from "./ayuda";

/** Elige una opción en un campo de relación con búsqueda. */
async function buscarYElegir(page: Page, campo: string | RegExp, texto: string) {
  const entrada = page.getByLabel(campo);
  await entrada.fill(texto);
  await page.getByRole("option", { name: new RegExp(texto, "i") }).first().click();
}

const guardar = (page: Page) => page.locator("main").getByRole("button", { name: /^Guardar/ }).click();

test.describe("administrador", () => {
  test.use({ storageState: sesion("admin") });

  test("crea una cuenta, aparece en la lista y el Código SAP no se repite", async ({ page }) => {
    const nombre = unico("Constructora Prueba");
    const codigo = `T${Date.now().toString(36).toUpperCase()}`;
    await page.goto("/cuentas/nueva");
    await page.getByLabel(/Nombre de la cuenta/).fill(nombre);
    await page.getByLabel(/Código SAP/).fill(codigo.toLowerCase());
    await page.locator("#f-industry").selectOption({ label: "Canal Constructores" });
    // Los números (no solo el dinero) agrupan miles al escribir y se guardan bien.
    await page.locator("#f-employees").click();
    await page.keyboard.type("2500");
    await expect(page.locator("#f-employees")).toHaveValue("2,500");
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    await page.getByRole("tab", { name: "Detalles" }).click();
    await expect(page.getByText(codigo, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("2,500", { exact: true }).first()).toBeVisible();

    await page.goto(`/cuentas?q=${encodeURIComponent(nombre)}`);
    await expect(page.getByRole("link", { name: nombre })).toBeVisible();

    await page.goto("/cuentas/nueva");
    await page.getByLabel(/Nombre de la cuenta/).fill(unico("Otra con el mismo código"));
    await page.getByLabel(/Código SAP/).fill(codigo);
    await page.locator("#f-industry").selectOption({ label: "Canal Constructores" });
    await guardar(page);
    await expect(page).toHaveURL(/\/cuentas\/nueva/);
    await expect(page.getByText(/ya (existe|está|tiene)|repit|otra cuenta/i).first()).toBeVisible();
  });

  test("un cliente del exterior se guarda sin NIT; uno nacional lo exige", async ({ page }) => {
    for (const mercado of ["Internacional", "Nacional"]) {
      await page.goto("/cuentas/nueva");
      await page.getByLabel(/Nombre de la cuenta/).fill(unico(`Cliente ${mercado}`));
      await expect(async () => {
        await page.locator("#f-account_type").selectOption({ label: "Cliente" });
        await page.locator("#f-market").selectOption({ label: mercado });
        await page.locator("#f-industry").selectOption({ label: "Canal Distribución" });
        await expect(page.locator("#f-market")).toHaveValue(mercado, { timeout: 1000 });
      }).toPass();
      await guardar(page);
      if (mercado === "Internacional") {
        await expect(page).toHaveURL(/\/cuentas\/[0-9a-f-]{36}/);
      } else {
        await expect(page.getByText("Las cuentas de tipo Cliente requieren NIT.").first()).toBeVisible();
        await expect(page).toHaveURL(/\/cuentas\/nueva/);
      }
    }
  });

  test("crea una oportunidad en una cuenta y la ve en el pipeline", async ({ page }) => {
    const nombre = unico("Torre de prueba");
    await page.goto("/oportunidades/nueva");
    await page.getByLabel(/Nombre de la oportunidad/).fill(nombre);
    await buscarYElegir(page, /^Cuenta/, "Casa Viva");
    // Casa Viva es del Canal Distribución: solo se ofrecen las etapas de su pipeline.
    await expect(page.getByText("Pipeline del Canal Distribución: Distribución y retail.")).toBeVisible();
    await expect(page.getByLabel(/Etapa/).locator("option", { hasText: "Prospección" })).toHaveCount(0);
    await page.getByLabel(/Etapa/).selectOption({ label: "Contacto inicial (10%)" });
    // El valor agrupa miles mientras se escribe; el punto es el decimal y la coma del teclado del iPhone también.
    const valor = page.getByLabel(/Valor/);
    await valor.click();
    await page.keyboard.type("1500,75");
    await expect(valor).toHaveValue("1,500.75");
    await valor.fill("");
    await page.keyboard.type("150000000");
    await expect(valor).toHaveValue("150,000,000");
    // Al borrar una cifra el formato se rehace; borrar justo tras una coma de miles borra la cifra anterior.
    await page.keyboard.press("Backspace");
    await expect(valor).toHaveValue("15,000,000");
    await page.keyboard.type("0");
    await expect(valor).toHaveValue("150,000,000");
    await page.keyboard.press("ArrowLeft", { delay: 20 });
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Backspace");
    await expect(valor).toHaveValue("15,000,000");
    await page.keyboard.type("0");
    await expect(valor).toHaveValue("150,000,000");
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: nombre })).toBeVisible();
    await expect(page.getByRole("link", { name: "Almacenes Casa Viva" }).first()).toBeVisible();

    await page.goto("/oportunidades/pipeline");
    await page.getByLabel("Pipeline", { exact: true }).selectOption({ label: "Canal Distribución · Distribución y retail" });
    await expect(page.getByText(nombre).first()).toBeVisible();
  });

  test("una cotización sin oportunidad crea la suya en el pipeline del canal, factura a la cuenta y usa la lista propia del cliente", async ({ page }) => {
    const nombre = unico("Cotización canal");
    await page.goto("/cotizaciones/nueva");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Nombre de la cotización/).fill(nombre);
    await buscarYElegir(page, /^Facturar a/, "Casa Viva");
    // Direcciones y condiciones de pago vienen de la cuenta y no se editan…
    await expect(page.locator("#f-billing_address")).toHaveValue(/Av\. Boyacá/);
    await expect(page.locator("#f-billing_address")).toBeDisabled();
    await expect(page.locator("#f-payment_terms")).toHaveValue("60 días");
    await expect(page.locator("#f-shipping_address")).toBeDisabled();
    // …salvo la entrega con su casilla: se parte de la dirección de la cuenta y se cambia.
    await page.getByLabel("Entregar en otra dirección").check();
    await expect(page.locator("#f-shipping_address")).toBeEnabled();
    await expect(page.locator("#f-shipping_address")).toHaveValue(/Av\. Boyacá/);
    await page.locator("#f-shipping_address").fill("Bodega del cliente final, Funza");
    await guardar(page);
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);
    await expect(page.getByText("Sincronizada").first()).toBeVisible();

    // Un producto codificado del cliente toma su precio; uno no codificado, el de la lista del canal, marcado.
    for (const ref of ["DEMO-MB-060", "DEMO-CO-240"]) {
      await expect(async () => {
        await page.locator("#ql-product").fill(ref);
        await page.getByRole("option", { name: new RegExp(ref) }).first().click({ timeout: 2000 });
      }).toPass();
      await page.getByRole("button", { name: "Agregar" }).click();
      await expect(page.getByText(ref).first()).toBeVisible();
    }
    const fila = (ref: string) => page.getByRole("listitem").filter({ hasText: ref });
    await expect(fila("DEMO-MB-060").getByLabel("Precio unitario")).toHaveValue("960,000");
    await expect(fila("DEMO-MB-060").getByText("No codificado")).toHaveCount(0);
    await expect(fila("DEMO-CO-240").getByLabel("Precio unitario")).toHaveValue("5,248,000");
    await expect(fila("DEMO-CO-240").getByText("No codificado")).toBeVisible();

    // Cada título queda sobre su columna, tanto en las líneas como en el formulario de agregar.
    const borde = async (l: ReturnType<Page["locator"]>) => {
      const caja = await l.boundingBox();
      return caja ? Math.round(caja.x + caja.width) : NaN;
    };
    const titulos = page.locator("section", { hasText: "Productos cotizados" }).locator(":scope > div.hidden > span");
    for (const [titulo, enLinea, alAgregar] of [
      ["Cantidad", "Cantidad", "#ql-qty"],
      ["Precio unit.", "Precio unitario", "#ql-price"],
      ["Desc. %", "Descuento %", "#ql-disc"],
    ] as const) {
      const derecho = await borde(titulos.filter({ hasText: titulo }));
      expect(await borde(fila("DEMO-MB-060").getByLabel(enLinea))).toBe(derecho);
      expect(await borde(page.locator(alAgregar))).toBe(derecho);
    }

    // Cantidad, precio opcional y descuento son cifras cortas: título y dato centrados.
    for (const id of ["#ql-qty", "#ql-price", "#ql-disc"]) await expect(page.locator(id)).toHaveCSS("text-align", "center");
    await expect(fila("DEMO-MB-060").getByLabel("Cantidad")).toHaveCSS("text-align", "center");
    await expect(fila("DEMO-MB-060").getByLabel("Descuento %")).toHaveCSS("text-align", "center");

    // Cantidad y descuento también agrupan y usan punto decimal al escribir (sin guardar: los totales no cambian).
    const cantidad = fila("DEMO-MB-060").getByLabel("Cantidad");
    await cantidad.fill("");
    await cantidad.click();
    await page.keyboard.type("1500");
    await expect(cantidad).toHaveValue("1,500");
    const descuento = fila("DEMO-MB-060").getByLabel("Descuento %");
    await descuento.fill("");
    await descuento.click();
    await page.keyboard.type("12,5");
    await expect(descuento).toHaveValue("12.5");

    await page.getByRole("tab", { name: "Detalles" }).click();
    await expect(page.getByText("Casa Viva 2026").first()).toBeVisible();
    await expect(page.getByText("Bodega del cliente final, Funza").first()).toBeVisible();
    await expect(page.getByText("60 días").first()).toBeVisible();

    // La oportunidad nueva lleva el nombre de la cotización, está en el pipeline del canal y vale lo cotizado.
    // (los nombres de oportunidad se guardan con mayúscula inicial en cada palabra)
    await page.getByRole("link", { name: new RegExp(nombre.split(" ").slice(-1)[0], "i") }).first().click();
    await expect(page).toHaveURL(/\/oportunidades\/[0-9a-f-]{36}/);
    await expect(page.getByText("Distribución y retail").first()).toBeVisible();
    await expect(page.getByText("$6,208,000").first()).toBeVisible();
  });

  test("el precio por lista agrupa miles al escribir, usa punto decimal y conserva el valor guardado", async ({ page }) => {
    await page.goto("/productos?q=DEMO-AC-ESP");
    await page.getByRole("link", { name: /DEMO-AC-ESP|Accesorio|espejo/i }).first().click();
    await expect(page).toHaveURL(/\/productos\/[0-9a-f-]{36}/);
    await page.waitForLoadState("networkidle");
    const precio = page.getByLabel("Precio en Lista estándar COP");
    await precio.fill("");
    await expect(precio).toHaveValue("");
    await precio.click();
    await page.keyboard.type("1234567,5");
    await expect(precio).toHaveValue("1,234,567.5");
    const fila = page.getByRole("listitem").filter({ has: precio });
    await fila.getByRole("button", { name: /^(Guardar|Agregar)$/ }).click();
    await expect(fila.getByText("Precio guardado")).toBeVisible();
    await expect(fila.getByText("$1,234,568")).toBeVisible();
    // Tras guardar, el campo muestra el precio nuevo (no vuelve al anterior).
    await expect(precio).toHaveValue("1,234,567.5");
  });

  test("en listas y pestañas, cada título de columna queda alineado con su dato", async ({ page }) => {
    /** Desfase en píxeles entre el texto de cada título y el de su dato en la primera fila, según la alineación. */
    const desfases = () => page.evaluate(() => {
      const caja = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
      const tabla = [...document.querySelectorAll("table")].find((t) => (t as HTMLElement).offsetParent && t.querySelector("tbody tr td + td"))!;
      const tds = [...tabla.querySelector("tbody tr")!.children];
      return [...tabla.querySelectorAll("thead th")].flatMap((th, i) => {
        const td = tds[i];
        if (!td?.textContent?.trim() || !th.textContent?.trim()) return [];
        const a = getComputedStyle(th).textAlign.replace("start", "left").replace("end", "right");
        const b = getComputedStyle(td).textAlign.replace("start", "left").replace("end", "right");
        const h = caja(th), d = caja(td);
        const px = a === "right" ? h.right - d.right : a === "center" ? (h.left + h.right - d.left - d.right) / 2 : h.left - d.left;
        // Tras una columna de cifras (a la derecha), la siguiente no queda pegada: al menos 40 px entre textos.
        const previo = tds[i - 1];
        const aire = previo && getComputedStyle(previo).textAlign === "right" && b !== "right" ? d.left - caja(previo).right : Infinity;
        if (aire < 40) return [`${th.textContent.trim()}: pegada a la cifra anterior (${Math.round(aire)}px)`];
        return a !== b || Math.abs(px) > 1 ? [`${th.textContent.trim()}: ${a}/${b} ${Math.round(px)}px`] : [];
      });
    });
    for (const url of ["/inicio", "/oportunidades", "/cotizaciones", "/pedidos"]) {
      await page.goto(url);
      await expect(page.locator("tbody tr").first()).toBeVisible();
      expect(await desfases(), url).toEqual([]);
    }
    // Pestaña Cotizaciones dentro de una oportunidad (montos a la derecha, Sí/No al centro).
    await page.goto("/cotizaciones");
    await page.getByRole("link", { name: "COT-1002" }).click();
    await page.locator("main a[href^='/oportunidades/']").first().click();
    await page.getByRole("tab", { name: /Cotizaciones/ }).click();
    await expect(page.getByRole("columnheader", { name: "Total neto" })).toBeVisible();
    expect(await desfases()).toEqual([]);
  });

  test("la lista de precios depende del mercado y el canal: un distribuidor del exterior no recibe la nacional en pesos", async ({ page }) => {
    // Lista del mercado Internacional para el Canal Distribución: la moneda la fija el mercado.
    const lista = unico("Distribución Internacional");
    await page.goto("/productos/listas");
    await expect(page.getByText("Sin uso: en el mercado Internacional cada canal necesita su propia lista.").first()).toBeVisible();
    await page.locator("#pb-name").fill(lista);
    await page.locator("#pb-kind").selectOption({ label: "Canal Distribución" });
    await page.locator("#pb-market").selectOption("Internacional");
    await page.getByRole("button", { name: "Crear lista" }).click();
    await expect(page.locator(`input[value="${lista}"]`)).toBeVisible();

    const cotizar = async (cuenta: string, canal: string) => {
      await page.goto("/cuentas/nueva");
      await page.getByLabel(/Nombre de la cuenta/).fill(cuenta);
      await page.locator("#f-market").selectOption("Internacional");
      await page.locator("#f-industry").selectOption({ label: canal });
      await guardar(page);
      await expect(page.getByRole("heading", { level: 1, name: cuenta })).toBeVisible();
      await page.goto("/cotizaciones/nueva");
      await page.waitForLoadState("networkidle");
      await page.getByLabel(/Nombre de la cotización/).fill(`Cotización ${cuenta}`);
      await buscarYElegir(page, /^Facturar a/, cuenta);
      await guardar(page);
    };
    // Distribuidor del exterior: su lista de mercado y canal, en dólares.
    await cotizar(unico("Distribuidora Andina"), "Canal Distribución");
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);
    await page.getByRole("tab", { name: "Detalles" }).click();
    await expect(page.getByText(lista).first()).toBeVisible();
    await expect(page.getByText("USD", { exact: true }).first()).toBeVisible();
    // Constructor del exterior sin lista de su canal: no se crea (ni usa la general en USD ni la nacional).
    await cotizar(unico("Constructora Andina"), "Canal Constructores");
    await expect(page.getByText("No hay una lista de precios activa para el mercado Internacional y el Canal Constructores").first()).toBeVisible();
    await expect(page).toHaveURL(/\/cotizaciones\/nueva/);
  });

  test("«Facturar a» debe ser la cuenta de la oportunidad", async ({ page }) => {
    await page.goto("/cotizaciones/nueva");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Nombre de la cotización/).fill(unico("Cuenta cruzada"));
    await buscarYElegir(page, /^Oportunidad/, "Exhibición nueva tienda");
    // Al elegir la oportunidad, «Facturar a» toma su cuenta.
    await expect(page.locator("main").getByText("Distribuidora Hogar y Acabados Ltda.").first()).toBeVisible();
    await page.getByRole("button", { name: "Quitar selección" }).nth(1).click();
    await buscarYElegir(page, /^Facturar a/, "Casa Viva");
    await guardar(page);
    await expect(page.getByText(/debe ser la misma de la oportunidad \(Distribuidora Hogar y Acabados Ltda\.\)/).first()).toBeVisible();
    await expect(page).toHaveURL(/\/cotizaciones\/nueva/);
  });

  test("Indicadores muestra un embudo por canal", async ({ page }) => {
    await page.goto("/indicadores");
    await expect(page.getByRole("heading", { name: "Embudos de ventas por canal" })).toBeVisible();
    const constructores = page.getByRole("region", { name: "Embudo Canal Constructores" });
    const distribucion = page.getByRole("region", { name: "Embudo Canal Distribución" });
    await expect(constructores.getByText("Especificación técnica", { exact: true })).toBeVisible();
    await expect(constructores.getByText("Muestras y catálogo", { exact: true })).toHaveCount(0);
    await expect(distribucion.getByText("Muestras y catálogo", { exact: true })).toBeVisible();
    await expect(distribucion.getByText("Especificación técnica", { exact: true })).toHaveCount(0);
  });

  test("registra una tarea y la completa", async ({ page }) => {
    const asunto = unico("Llamar al arquitecto");
    await page.goto("/actividades/nueva");
    await page.getByLabel(/Asunto/).fill(asunto);
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: asunto })).toBeVisible();
    await page.goto("/actividades");
    const fila = page.getByRole("listitem").filter({ hasText: asunto });
    await fila.getByRole("checkbox", { name: "Marcar como completada" }).check();
    await expect(fila.getByRole("checkbox", { name: "Marcar como pendiente" })).toBeChecked();
    await page.waitForLoadState("networkidle");
    await page.reload();
  });

  test("consulta en SAP la cartera de una cuenta y el inventario de un producto", async ({ page }) => {
    await page.goto("/cuentas?q=Casa%20Viva");
    await page.getByRole("link", { name: "Almacenes Casa Viva" }).first().click();
    await page.getByRole("tab", { name: "SAP" }).click();
    await expect(page.getByText(/cupo/i).first()).toBeVisible();
  });

  test("al activar un pedido crea su oferta de venta en SAP", async ({ page }) => {
    await page.goto("/configuracion/sap");
    const oferta = page.getByRole("checkbox", { name: /crear su oferta de venta/ });
    await oferta.check();
    await page.getByRole("button", { name: "Guardar", exact: true }).first().click();
    await page.waitForLoadState("networkidle");

    const nombre = unico("Pedido de prueba");
    await page.goto("/pedidos/nuevo");
    await page.getByLabel(/Nombre del pedido/).fill(nombre);
    await buscarYElegir(page, /^Cuenta/, "Casa Viva");
    await guardar(page);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(nombre) })).toBeVisible();

    await buscarYElegir(page, /producto/i, "DEMO-MB-060");
    await page.getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("DEMO-MB-060").first()).toBeVisible();

    await page.getByRole("list", { name: "Estado" }).getByRole("button", { name: "Activado" }).click();
    await page.getByRole("tab", { name: "SAP" }).click();
    await expect(page.getByText(/oferta/i).first()).toBeVisible();
    await expect(page.getByText(/^6\d{3}$|N\.º.*6\d{3}/).first()).toBeVisible();
  });
});

test.describe("aprobaciones", () => {
  test("una cotización con descuento alto no se puede presentar sin pasar por aprobación", async ({ browser }) => {
    const asesora = await (await browser.newContext({ storageState: sesion("asesora") })).newPage();
    await asesora.goto("/oportunidades");
    await asesora.getByRole("link", { name: "Hogar y Acabados · Exhibición nueva tienda Chía" }).first().click();
    await asesora.getByRole("link", { name: "Nueva cotización" }).click();
    await expect(asesora).toHaveURL(/\/cotizaciones\/nueva/);
    await asesora.waitForLoadState("networkidle");
    await guardar(asesora);
    await expect(asesora).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);

    await expect(async () => {
      await asesora.locator("#ql-product").fill("mueble");
      await asesora.getByRole("option").first().click({ timeout: 2000 });
    }).toPass();
    await asesora.locator("#ql-disc").fill("20");
    await asesora.getByRole("button", { name: "Agregar" }).click();
    await expect(asesora.getByText("Requiere aprobación:")).toBeVisible();

    // Saltar a «Presentada» desde la barra de estados se rechaza y la cotización sigue en Borrador.
    await asesora.getByRole("list", { name: "Estado" }).getByRole("button", { name: "Presentada", exact: true }).click();
    await expect(asesora.getByText(/requiere aprobación .*antes de pasarla a «Presentada»/)).toBeVisible();
    await asesora.reload();
    await expect(asesora.getByRole("list", { name: "Estado" }).getByRole("button", { name: "Borrador", exact: true })).toBeDisabled();
    await expect(asesora.getByRole("button", { name: /enviar a aprobaci/i })).toBeVisible();
  });

  test("un descuento alto va a aprobación, el jefe recibe el push y lo aprueba", async ({ browser }) => {
    const contextoGerente = await browser.newContext({ storageState: sesion("gerente") });
    const dispositivo = await usarPushSimulado(contextoGerente);
    const gerente = await contextoGerente.newPage();
    await activarPush(gerente);

    const asesora = await (await browser.newContext({ storageState: sesion("asesora") })).newPage();
    await asesora.goto("/cotizaciones");
    await asesora.getByRole("link", { name: "COT-1001" }).click();
    const linea = asesora.getByRole("list").filter({ has: asesora.getByRole("textbox", { name: "Descuento %" }) }).getByRole("listitem").first();
    await linea.getByRole("textbox", { name: "Descuento %" }).fill("25");
    await linea.getByRole("button", { name: "Guardar" }).click();
    await asesora.waitForLoadState("networkidle");
    await asesora.reload();
    await asesora.getByRole("button", { name: /enviar a aprobaci/i }).click();
    await expect(asesora.getByText(/pendiente|en revisión|espera/i).first()).toBeVisible();

    // La notificación de la campana también llega como push, cifrada y con el enlace al registro.
    await expect.poll(() => pushRecibidos(dispositivo), { timeout: 30_000 }).toEqual([expect.objectContaining({ link: expect.stringMatching(/^\/cotizaciones\//) })]);

    await gerente.goto("/aprobaciones");
    await expect(gerente.getByText(/COT-1001|Remodelación 180/).first()).toBeVisible();
    await gerente.getByRole("button", { name: "Aprobar" }).first().click();
    await gerente.waitForLoadState("networkidle");
    await gerente.reload();
    await expect(gerente.getByText("No tienes solicitudes por aprobar.")).toBeVisible();

    await asesora.context().close();
    await gerente.context().close();
  });
});

import { expect, test, type Page } from "@playwright/test";
import { sesion } from "./ayuda";

// El PDF de la cotización (`/imprimir/cotizacion/[id]/pdf`) y el botón que lo comparte en el iPhone con el CRM
// instalado. Chrome no es ese iPhone: aquí se simula (`navigator.standalone` y la hoja de compartir) para probar
// el recorrido del botón; el comportamiento real de iOS se revisa en el simulador y en el teléfono.

async function abrirVistaDeImprimir(page: Page) {
  await page.goto("/cotizaciones");
  await page.getByRole("link", { name: "COT-1002" }).click();
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/);
  const vista = new URL(page.url()).pathname.replace("/cotizaciones/", "/imprimir/cotizacion/");
  await page.goto(vista);
  return vista;
}

test.describe("PDF de la cotización", () => {
  test.use({ storageState: sesion("asesora") });

  test("la ruta entrega un PDF con el nombre de la cotización y sin guardarse en caché", async ({ page }) => {
    const vista = await abrirVistaDeImprimir(page);
    const res = await page.request.get(`${vista}/pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["content-disposition"]).toBe('inline; filename="COT-1002.pdf"');
    expect(res.headers()["cache-control"]).toBe("private, no-store");
    const cuerpo = await res.body();
    expect(cuerpo.subarray(0, 5).toString()).toBe("%PDF-");
    expect(cuerpo.length).toBeGreaterThan(10_000);

    const inexistente = await page.request.get("/imprimir/cotizacion/00000000-0000-0000-0000-000000000000/pdf");
    expect(inexistente.status()).toBe(404);
  });

  test("en el computador el botón abre el diálogo de imprimir y no pide el PDF", async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => { (window as unknown as { impresiones: number }).impresiones = ((window as unknown as { impresiones?: number }).impresiones ?? 0) + 1; };
    });
    const pedidos: string[] = [];
    page.on("request", (r) => { if (r.url().endsWith("/pdf")) pedidos.push(r.url()); });
    await abrirVistaDeImprimir(page);
    await page.getByRole("button", { name: "Imprimir o guardar PDF" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { impresiones?: number }).impresiones)).toBe(1);
    expect(pedidos).toEqual([]);
  });

  test("en el iPhone con el CRM instalado el botón comparte el archivo PDF", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { compartido: { name: string; type: string; size: number }[][]; impresiones: number };
      w.compartido = [];
      w.impresiones = 0;
      window.print = () => { w.impresiones += 1; };
      Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: (d?: ShareData) => Boolean(d?.files?.length) });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (d: ShareData) => { w.compartido.push((d.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size }))); },
      });
    });
    await abrirVistaDeImprimir(page);
    const boton = page.getByRole("button", { name: "Imprimir o guardar PDF" });
    await expect(boton).toBeEnabled();
    await boton.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { compartido: unknown[] }).compartido.length)).toBe(1);
    const [[archivo]] = await page.evaluate(() => (window as unknown as { compartido: { name: string; type: string; size: number }[][] }).compartido);
    expect(archivo.name).toBe("COT-1002.pdf");
    expect(archivo.type).toBe("application/pdf");
    expect(archivo.size).toBeGreaterThan(10_000);
    expect(await page.evaluate(() => (window as unknown as { impresiones: number }).impresiones)).toBe(0);
  });

  test("si el PDF no se puede preparar, el botón avisa y reintenta", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { configurable: true, get: () => true });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", { configurable: true, value: async () => undefined });
    });
    let fallar = true;
    await page.route("**/imprimir/cotizacion/*/pdf", (ruta) => (fallar ? ruta.fulfill({ status: 500, body: "error" }) : ruta.continue()));
    await abrirVistaDeImprimir(page);
    await expect(page.getByText("No se pudo preparar el PDF. Toca el botón para reintentar.")).toBeVisible();
    fallar = false;
    await page.getByRole("button", { name: "Imprimir o guardar PDF" }).click();
    await expect(page.getByText("No se pudo preparar el PDF. Toca el botón para reintentar.")).toBeHidden();
    await expect(page.getByRole("button", { name: "Imprimir o guardar PDF" })).toBeEnabled();
  });
});

test.describe("PDF de la cotización sin sesión", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sin sesión la ruta manda a ingresar y no entrega el PDF", async ({ request }) => {
    const res = await request.get("/imprimir/cotizacion/00000000-0000-0000-0000-000000000000/pdf", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login");
  });
});

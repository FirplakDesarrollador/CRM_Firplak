import { expect, test, type Page } from "@playwright/test";
import { ingresar, sesion, USUARIOS } from "./ayuda";
import { staticAssets } from "../../src/lib/offline/download";

// Modo sin conexión, parte A: «Preparar el día» baja al dispositivo los clientes, la agenda y los precios del
// asesor, y la pantalla «Consulta sin señal» los muestra sin pedirle nada al servidor.
//
// Estas pruebas corren sobre el servidor de desarrollo, donde una página no termina de cargar si el servidor no
// responde. Por eso aquí se corta la red con la pantalla ya abierta. Abrirla desde cero sin red (con el servidor
// apagado) se comprueba a mano con `npm run dev:demo -- --produccion` y, con los archivos donde los deja el
// hosting, con `npm run dev:demo -- --vercel`.

const BASE = "firplak-crm-sin-conexion";
const ALMACEN = "descarga";

/** Lo que hay descargado en este navegador: de quién es y cuántos clientes trae. `null` si no hay nada. */
const descargado = (page: Page) =>
  page.evaluate(([base, almacen]) => new Promise<{ userId: string; clientes: number } | null>((resolve, reject) => {
    // Sin versión: abre la base como esté. Si no existe, queda vacía y la app la completa al usarla.
    const abrir = indexedDB.open(base);
    abrir.onupgradeneeded = () => {
      if (!abrir.result.objectStoreNames.contains(almacen)) abrir.result.createObjectStore(almacen);
    };
    abrir.onerror = () => reject(abrir.error);
    abrir.onsuccess = () => {
      const db = abrir.result;
      const tx = db.transaction(almacen, "readonly");
      const meta = tx.objectStore(almacen).get("meta");
      const data = tx.objectStore(almacen).get("data");
      tx.oncomplete = () => {
        db.close();
        resolve(meta.result && data.result ? { userId: meta.result.userId, clientes: data.result.accounts.length } : null);
      };
      tx.onerror = () => reject(tx.error);
    };
  }), [BASE, ALMACEN]);

/** Archivos de la pantalla guardados para abrirla sin red. */
const pantallaGuardada = (page: Page) =>
  page.evaluate(async (base) => ((await caches.has(base)) ? (await (await caches.open(base)).keys()).length : 0), BASE);

const tarjeta = (page: Page) => page.getByRole("region", { name: "Consulta sin señal" });

async function prepararElDia(page: Page) {
  await expect(tarjeta(page).getByText("Descarga tus clientes, agenda y precios para consultarlos sin señal.")).toBeVisible();
  await tarjeta(page).getByRole("button", { name: "Preparar el día" }).click();
  await expect(tarjeta(page).getByText(/^Descargado hoy, /)).toBeVisible();
  await expect(tarjeta(page).getByText(/^\d+ clientes? · \d+ actividad(es)? · \d+ productos?$/)).toBeVisible();
  // Con la descarga de hoy, el botón pasa a ser solo «Actualizar».
  await expect(tarjeta(page).getByRole("button", { name: "Actualizar" })).toBeEnabled();
}

const producto = (page: Page, referencia: string) => page.locator("#panel-sin-conexion li", { hasText: referencia });

// En Vercel los archivos con huella van en /_next/static/immutable/…, no en /_next/static/… como en una
// compilación local. La app no los reconocía: guardaba la pantalla sin sus scripts y sin señal no abría
// (reporte de Luis del 10 nov 2026, desde el iPhone).
test("reconoce los archivos de la pantalla donde los deja el hosting y donde los deja una compilación local", () => {
  const vercel = `<link rel="stylesheet" href="/_next/static/immutable/chunks/0vzt-zfzif1zz.css" data-precedence="next"/>
    <link rel="preload" as="font" href="/_next/static/immutable/media/c0680f1bdb3a2e90-s.p.1ay-qk1u8nydy.woff2" crossorigin=""/>
    <script src="/_next/static/immutable/chunks/turbopack-1cvbnb3nlabgn.js" async=""></script>
    <script src="/_next/static/otra-carpeta/x1.js?dpl=dpl_1&amp;v=2" async=""></script>
    <script>self.__next_f.push([1,"3:I[1,[\"static/immutable/chunks/3na5n3mkfnrc5.js\",\"static/immutable/chunks/44xcerwlley0q.js\"],\"OfflineApp\"]"])</script>`;
  expect(staticAssets(vercel).sort()).toEqual([
    "/_next/static/immutable/chunks/0vzt-zfzif1zz.css",
    "/_next/static/immutable/chunks/3na5n3mkfnrc5.js",
    "/_next/static/immutable/chunks/44xcerwlley0q.js",
    "/_next/static/immutable/chunks/turbopack-1cvbnb3nlabgn.js",
    "/_next/static/immutable/media/c0680f1bdb3a2e90-s.p.1ay-qk1u8nydy.woff2",
    "/_next/static/otra-carpeta/x1.js?dpl=dpl_1&v=2",
  ]);
  const local = `<script src="/_next/static/chunks/a1.js" async=""></script><script>self.__next_f.push([1,"[\"static/chunks/b2.js\"]"])</script>`;
  expect(staticAssets(local).sort()).toEqual(["/_next/static/chunks/a1.js", "/_next/static/chunks/b2.js"]);
});

test.describe("asesora", () => {
  test.use({ storageState: sesion("asesora") });

  test("prepara el día y consulta clientes y precios sin red", async ({ page, context }) => {
    await page.goto("/inicio");
    await prepararElDia(page);
    expect((await descargado(page))?.clientes).toBeGreaterThanOrEqual(3);
    await expect.poll(() => pantallaGuardada(page)).toBeGreaterThan(1);

    await tarjeta(page).getByRole("link", { name: "Modo Offline" }).click();
    await expect(page).toHaveURL(/\/sin-conexion/);
    await expect(page.getByRole("heading", { level: 1, name: "Consulta sin señal" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver al CRM" })).toHaveAttribute("href", "/inicio");
    await expect(page.getByRole("tab", { name: /Agenda/ })).toHaveAttribute("aria-selected", "true");

    // Se va la señal: lo descargado se sigue consultando.
    await context.setOffline(true);
    await expect(page.getByText("Sin señal", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver al CRM" })).toHaveCount(0);
    await expect(tarjeta(page).getByText("Necesitas conexión para descargar.")).toBeVisible();
    await expect(tarjeta(page).getByRole("button", { name: "Actualizar" })).toBeDisabled();

    await page.getByRole("tab", { name: /Clientes/ }).click();
    await page.getByLabel("Buscar cliente por nombre, NIT o ciudad").fill("casa viva");
    await expect(page.locator("#panel-sin-conexion li")).toHaveCount(1);
    await page.getByRole("button", { name: /Almacenes Casa Viva/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Almacenes Casa Viva" })).toBeVisible();
    await expect(page.getByText("Casa Viva 2026 · COP")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /Contactos/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /Oportunidades abiertas/ })).toBeVisible();

    // El precio lo calcula el teléfono con la regla del CRM: primero la lista del cliente y, si el producto no
    // está en ella, la de su canal.
    await page.getByRole("button", { name: "Ver precios de este cliente" }).click();
    await expect(page.getByRole("tab", { name: /Productos/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#precios-para")).toHaveValue(/^a:/);
    await expect(page.locator("#panel-sin-conexion").getByRole("status")).toHaveText("Lista de precios: Casa Viva 2026 · COP · propia del cliente");
    await expect(producto(page, "DEMO-MB-060")).toContainText("$960,000");
    await expect(producto(page, "DEMO-MB-060").getByText("Precio de canal")).toHaveCount(0);
    await expect(page.getByText("Precio de canal").first()).toBeVisible();

    await page.locator("#precios-para").selectOption({ label: "Lista estándar COP · COP" });
    await expect(page.locator("#panel-sin-conexion").getByRole("status")).toHaveText("Lista de precios: Lista estándar COP · COP");
    await expect(producto(page, "DEMO-MB-060")).toContainText("$1,250,000");
    await expect(page.getByText("Precio de canal")).toHaveCount(0);

    await page.locator("#buscar-producto").fill("mb-060");
    await expect(page.locator("#panel-sin-conexion li")).toHaveCount(1);

    // «Atrás» vuelve a la ficha del cliente sin pedirle nada al servidor.
    await page.goBack();
    await expect(page.getByRole("heading", { level: 2, name: "Almacenes Casa Viva" })).toBeVisible();

    // Sin red, abrir cualquier pantalla del CRM lleva a lo descargado y recuerda a dónde se quería ir.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.goto("/cuentas", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/sin-conexion#volver=%2Fcuentas$/);
    await expect(page.getByRole("heading", { level: 1, name: "Consulta sin señal" })).toBeVisible();
    await context.setOffline(false);
  });
});

test("una pantalla guardada a medias se completa sola al volver a entrar con red", async ({ page }) => {
  await ingresar(page, USUARIOS.asesora);
  await expect(page).toHaveURL(/\/inicio/);
  await prepararElDia(page);
  // El HTML es lo último que se guarda: cuando está, ya están todos sus archivos.
  await expect.poll(() => page.evaluate(async (base) => Boolean((await caches.has(base)) && (await (await caches.open(base)).match("/sin-conexion"))), BASE)).toBe(true);
  const completa = await pantallaGuardada(page);
  expect(completa).toBeGreaterThan(1);

  // Como quedó en los dispositivos que la guardaron antes del arreglo: solo el HTML, sin sus archivos.
  await page.evaluate(async (base) => {
    const cache = await caches.open(base);
    for (const request of await cache.keys()) {
      if (new URL(request.url).pathname !== "/sin-conexion") await cache.delete(request);
    }
  }, BASE);
  expect(await pantallaGuardada(page)).toBe(1);

  await page.reload();
  await expect(tarjeta(page).getByText(/^Descargado hoy, /)).toBeVisible();
  await expect.poll(() => pantallaGuardada(page)).toBe(completa);
});

test.describe("administrador", () => {
  test.use({ storageState: sesion("admin") });

  test("la agenda y las oportunidades quedan descargadas; lo de otra persona se borra al entrar", async ({ page }) => {
    await page.goto("/sin-conexion");
    await expect(page.getByText("Aún no has preparado el día en este dispositivo.")).toBeVisible();
    await prepararElDia(page);

    const panel = page.locator("#panel-sin-conexion");
    await expect(page.getByRole("tab", { name: /Agenda/ })).toHaveAttribute("aria-selected", "true");
    await expect(panel.getByText("No tienes actividades pendientes ni reuniones en los próximos 7 días.")).toHaveCount(0);
    expect(await panel.locator("li").count()).toBeGreaterThan(0);

    await page.getByRole("tab", { name: /Oportunidades/ }).click();
    expect(await panel.locator("li").count()).toBeGreaterThan(0);

    // Recargar no pierde nada: los datos están en el dispositivo.
    await page.reload();
    await expect(page.getByRole("tab", { name: /Oportunidades/ })).toHaveAttribute("aria-selected", "true");
    await expect(tarjeta(page).getByText(/^Descargado hoy, /)).toBeVisible();

    // La descarga que dejó otra persona en este dispositivo se borra al entrar al CRM.
    await page.evaluate(([base, almacen]) => new Promise<void>((resolve, reject) => {
      const abrir = indexedDB.open(base);
      abrir.onerror = () => reject(abrir.error);
      abrir.onsuccess = () => {
        const db = abrir.result;
        const tx = db.transaction(almacen, "readwrite");
        const store = tx.objectStore(almacen);
        const meta = store.get("meta");
        meta.onsuccess = () => store.put({ ...meta.result, userId: "otra-persona" }, "meta");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }), [BASE, ALMACEN]);
    expect((await descargado(page))?.userId).toBe("otra-persona");
    await page.goto("/inicio");
    await expect(tarjeta(page).getByRole("button", { name: "Preparar el día" })).toBeVisible();
    await expect(tarjeta(page).getByRole("link", { name: "Modo Offline" })).toHaveCount(0);
    await expect.poll(() => descargado(page)).toBeNull();
  });
});

test("cerrar sesión borra lo descargado y la pantalla guardada", async ({ page }) => {
  await ingresar(page, USUARIOS.asesora);
  await expect(page).toHaveURL(/\/inicio/);
  await prepararElDia(page);
  expect(await descargado(page)).not.toBeNull();
  await expect.poll(() => pantallaGuardada(page)).toBeGreaterThan(1);

  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await descargado(page)).toBeNull();
  expect(await pantallaGuardada(page)).toBe(0);

  // Sin sesión, la pantalla de consulta no muestra nada y manda a iniciar sesión.
  await page.goto("/sin-conexion");
  await expect(page.getByText(/Tu sesión se cerró y lo descargado en este dispositivo se borró/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("tab")).toHaveCount(0);
});

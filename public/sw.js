// Service worker de Firplak CRM (app instalable).
// · Páginas: siempre de la red (los datos son privados y cambian). Sin conexión:
//     – si el asesor preparó el día, abre «Consulta sin señal» (/sin-conexion), cuyo HTML y archivos guardó la
//       app en una caché aparte; esa pantalla no trae datos: los lee del dispositivo;
//     – si no, la página «offline».
// · Archivos estáticos de Next con huella (/_next/static/…; en Vercel, /_next/static/immutable/…): caché primero.
//   En desarrollo (?static=0) van primero a la red, porque cambian sin cambiar de nombre, y la copia guardada
//   solo se usa sin red.
// · Notificaciones push: se muestran al llegar y al tocarlas abren el registro.
// Nunca se guardan páginas con datos ni respuestas de la API.
const VERSION = 'firplak-crm-v4';
const OFFLINE_URL = '/offline';
// La pantalla de consulta sin señal. La llena la app al «Preparar el día» y la borra al cerrar sesión.
const SHELL_CACHE = 'firplak-crm-sin-conexion';
const SHELL_URL = '/sin-conexion';
// Con mala señal una página puede tardar minutos en fallar: la pantalla sin señal no espera tanto.
const SHELL_TIMEOUT = 3000;
const CACHE_STATIC = new URL(self.location).searchParams.get('static') !== '0';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png', '/icons/badge-96.png', '/brand/firplak-mark-white.png'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHELL_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

const savedShell = () => caches.open(SHELL_CACHE).then((cache) => cache.match(SHELL_URL));
// Un archivo con huella es el mismo aunque la dirección traiga otro parámetro (?dpl=…).
const savedStatic = (request) => caches.match(request).then((hit) => hit ?? caches.match(request, { ignoreSearch: true }));

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function page(request, url) {
  if (url.pathname === SHELL_URL) {
    const shell = await savedShell();
    if (!shell) return fetch(request).catch(() => caches.match(OFFLINE_URL));
    return withTimeout(fetch(request), SHELL_TIMEOUT).catch(() => shell);
  }
  try {
    return await fetch(request);
  } catch {
    // Sin red: si hay algo descargado se lleva allí, recordando qué pantalla se quería abrir.
    if (await savedShell()) return Response.redirect(`${SHELL_URL}#volver=${encodeURIComponent(url.pathname + url.search)}`, 302);
    return caches.match(OFFLINE_URL);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(page(request, url));
    return;
  }
  if (!url.pathname.startsWith('/_next/static/')) return;
  const fromNetwork = () => fetch(request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((cache) => cache.put(request, copy));
    }
    return res;
  });
  if (!CACHE_STATIC) {
    event.respondWith(fromNetwork().catch(() => savedStatic(request).then((hit) => hit ?? Response.error())));
    return;
  }
  event.respondWith(savedStatic(request).then((hit) => hit ?? fromNetwork()));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Un mensaje ilegible igual avisa: los navegadores exigen mostrar algo por cada push.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Firplak CRM', {
      body: data.body || undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.id,
      data: { link: data.link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data && event.notification.data.link;
  const url = new URL(typeof link === 'string' ? link : '/inicio', self.location.origin);
  const target = url.origin === self.location.origin ? url.href : new URL('/inicio', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        try {
          const focused = await open.focus();
          await focused.navigate(target);
          return;
        } catch {
          // Una ventana que este service worker aún no controla no se puede dirigir: se abre otra.
        }
      }
      await self.clients.openWindow(target);
    }),
  );
});

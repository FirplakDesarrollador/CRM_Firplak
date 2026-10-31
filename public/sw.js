// Service worker de Firplak CRM (app instalable).
// · Páginas: siempre de la red (los datos son privados y cambian); sin conexión, página «offline».
// · Archivos estáticos de Next con huella (/_next/static/…): caché primero. En desarrollo
//   (?static=0) no se guardan, porque cambian sin cambiar de nombre.
// Nunca se guardan páginas con datos ni respuestas de la API.
const VERSION = 'firplak-crm-v1';
const OFFLINE_URL = '/offline';
const CACHE_STATIC = new URL(self.location).searchParams.get('static') !== '0';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png', '/brand/firplak-mark-white.png'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (CACHE_STATIC && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return res;
      })),
    );
  }
});

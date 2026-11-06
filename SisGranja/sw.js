const CACHE_NAME = 'sisgranja-v3.0.0-20261103';
const OFFLINE_URL = './index.html';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([OFFLINE_URL, './js/persistencia.js'])));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('sisgranja-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Red primero para que HTML/JS nuevos lleguen siempre; la caché solo sirve sin conexión.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copia = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r || (event.request.mode === 'navigate' ? caches.match(OFFLINE_URL) : Response.error())))
  );
});

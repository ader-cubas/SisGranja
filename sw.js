const CACHE_NAME = 'sisgranja-v2.6.5-20261029f';
const OFFLINE_URL = './SisGranja_v2.5.html';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Red primero para que HTML/JS nuevos lleguen siempre; la caché solo sirve sin conexión.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if ((response.ok && new URL(event.request.url).origin === self.location.origin) || (response.type === 'opaque' && event.request.destination === 'image')) {
          const copia = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match(OFFLINE_URL)))
  );
});

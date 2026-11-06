const CACHE_NAME = 'sisgranja-v3.0.0-20261103';
const OFFLINE_URL = './SisGranja_v2.5.html';
const IMAGENES_ATLAS = ['acaros.png.jpg', 'timpanismo.png.jpg', 'salmonella.png.jpg', 'neumonia-hermorragica.png.jpeg', 'coccidiosis.png.jpg', 'dermatitis.png.jpg', 'linfadenitis.png.jpg', 'colibacilosis.jpg.jpg'].map(n => './SisGranja/img/' + n);

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([OFFLINE_URL, './SisGranja/js/persistencia.js']).then(() => Promise.all(IMAGENES_ATLAS.map(u => cache.add(u).catch(() => null))))));
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
        if ((response.ok && ['https://cdn.jsdelivr.net', self.location.origin].includes(new URL(event.request.url).origin)) || (response.type === 'opaque' && event.request.destination === 'image')) {
          const copia = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r || (event.request.mode === 'navigate' ? caches.match(OFFLINE_URL) : Response.error())))
  );
});

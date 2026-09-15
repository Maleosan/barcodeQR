const VERSION = 'stokqr-shell-v1';
const APP_SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './assets/icons/app-icon.svg', './src/app.js', './src/core/constants.js',
  './src/core/stock.js', './src/data/indexed-db-repository.js',
  './src/services/inventory-service.js', './src/services/scanner-service.js',
  './src/services/qr-service.js', './src/services/csv-service.js',
  './src/ui/templates.js'
];
self.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === location.origin) caches.open(VERSION).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});

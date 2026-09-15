const CACHE = 'stokqr-v3';
const BASE = new URL('./', self.location).pathname;
const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'styles.css',
  BASE + 'manifest.webmanifest',
  BASE + 'assets/icons/icon.svg',
  BASE + 'src/app.js',
  BASE + 'src/domain.js',
  BASE + 'src/repository.js',
  BASE + 'src/scanner.js',
  BASE + 'src/excel.js',
  'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(async cache => {
    for (const asset of ASSETS) {
      try { await cache.add(asset); } catch {}
    }
  }).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));

const cacheResponse = async (request, response) => {
  if (response?.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const appAsset = url.origin === self.location.origin &&
    (event.request.mode === 'navigate' || ['script', 'style', 'document'].includes(event.request.destination));

  if (appAsset) {
    event.respondWith(
      fetch(event.request)
        .then(response => cacheResponse(event.request, response))
        .catch(async () => (await caches.match(event.request)) ||
          (event.request.mode === 'navigate' ? caches.match(BASE + 'index.html') : undefined))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(hit => hit || fetch(event.request).then(response => cacheResponse(event.request, response)))
  );
});

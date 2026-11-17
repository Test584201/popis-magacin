/* Service worker: sve se kešira pri prvom otvaranju, pa aplikacija radi i bez interneta. */
const CACHE = 'popis-magacin-v4';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'libs/xlsx.full.min.js', 'libs/zxing.min.js',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).catch(() => caches.match('index.html'));
    })
  );
});

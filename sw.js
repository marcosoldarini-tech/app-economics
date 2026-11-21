// Service worker: l'app funziona anche offline.
// Dopo ogni modifica ai file, aumenta VERSION per forzare l'aggiornamento della cache.
const VERSION = 'economics-v3';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // File dell'app: prima la rete (così gli aggiornamenti arrivano), poi la cache.
    // cache: 'no-cache' chiede sempre al server se il file è cambiato, invece di usare la cache HTTP del browser.
    e.respondWith(
      fetch(e.request.url, { cache: 'no-cache' }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
    );
  } else {
    // Librerie da CDN (versioni fisse): prima la cache.
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});

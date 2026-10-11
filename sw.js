const CACHE_NAME = 'vesper-atelier-v8';
const APP_SHELL = [
  '/',
  '/index.html',
  '/getting-started.html',
  '/guide.js',
  '/chess.js',
  '/styles.css',
  '/app.js',
  '/avatar.js',
  '/favicon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('vesper-atelier-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/Vesper-Setup.exe') return;
  if (url.pathname.startsWith('/models/')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') event.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (error) {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await cache.match('/index.html');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});

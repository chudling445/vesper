const CACHE_NAME = 'vesper-atelier-v29';
const APP_SHELL = [
  '/',
  '/index.html',
  '/welcome.html',
  '/onboarding.html',
  '/getting-started.html',
  '/games.html',
  '/voices.html',
  '/about.html',
  '/model-only.html',
  '/workspace.html',
  '/planner',
  '/planner.html',
  '/lab',
  '/code-lab',
  '/code-lab.html',
  '/quick-capture.html',
  '/share.html',
  '/manus-routes.json',
  '/guide.js',
  '/first-run.js',
  '/welcome-gate.js',
  '/welcome.js',
  '/onboarding.js',
  '/offline-sync.js',
  '/page.js',
  '/games.js',
  '/arcade-framework.js',
  '/arcade-extra-games.js',
  '/arcade-toys.js',
  '/arcade-utility-pack.js',
  '/arcade-launcher.js',
  '/voices.js',
  '/voice-utils.js',
  '/persistence.js',
  '/persistence-queue.mjs',
  '/health-tools.mjs',
  '/feedback.js',
  '/theme-provider.js',
  '/themeManager.js',
  '/theme-selector.js',
  '/export-utils.js',
  '/a11y.js',
  '/chess.js',
  '/styles.css',
  '/app.js',
  '/avatar.js',
  '/expressionManager.js',
  '/animationController.js',
  '/hitboxManager.js',
  '/waifuVoice.js',
  '/audio-viseme-manager.js',
  '/relationship-memory.js',
  '/character-cards.js',
  '/markdown-renderer.js',
  '/model-only.js',
  '/workspace.js',
  '/planner.js',
  '/money-tracker.js',
  '/local-tools.js',
  '/pc-catalog.js',
  '/pc-price-catalog.mjs',
  '/tracker-calculations.mjs',
  '/code-lab.js',
  '/code-worker.js',
  '/quick-capture.js',
  '/share.js',
  '/favicon.svg',
  '/assets/vesper-banner.png',
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
    } catch {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await cache.match('/index.html');
        if (shell) return shell;
        return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vesper is offline</title><body><main><h1>Vesper is offline</h1><p>The local Vesper server is not responding, and no saved app page is available. Start Vesper, then try again.</p><button onclick="location.reload()">Try again</button></main></body></html>', {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      return new Response('Vesper could not reach the local server, and this resource is not available offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  })());
});

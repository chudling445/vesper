// A minimal service worker: it exists so the browser offers "Add to Home Screen".
// Nothing is cached on purpose: her page and voice always come from the PC that runs her.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* let the network answer */ });

// Cache ownership follows the complete registration scope, not a shared product prefix.
const PREFIX = 'lexl-scope:' + encodeURIComponent(self.registration.scope) + ':';
const CACHE = PREFIX + '01115-stage1b-v1';
const ASSETS = ['./', './index.html', './data-layer.js', './storage-transition.js',
  './storage-session.js', './backup-package.js', './program-1.webp', './program-2.webp',
  './program-3.webp', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './logo-dark.png', './logo-light.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(cache.put(event.request, copy).catch(() => {}));
        }
        return response;
      } catch {
        return await cache.match(event.request) || await cache.match(new URL('index.html', self.registration.scope).href) || Response.error();
      }
    }
    return await cache.match(event.request) || fetch(event.request);
  })());
});

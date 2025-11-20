const CACHE_NAME = 'pos-static-v1';
const RUNTIME_CACHE = 'pos-runtime-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/icon-192.svg',
  '/icon-512.svg',
  '/offline.html'
];

// Install - cache core assets (cache-first)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch handler: navigation requests -> network-first with offline fallback.
// Static assets -> cache-first. API/dynamic requests -> network-first with runtime cache fallback.
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Always allow chrome-extension and other unsupported schemes to fall through
  if (url.protocol.startsWith('chrome-extension')) return;

  // Navigation requests (HTML)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        // put a copy in runtime cache
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // For other requests: serve from cache first for static assets
  if (PRECACHE_URLS.includes(url.pathname) || req.destination === 'image' || req.destination === 'style' || req.destination === 'script'){
    event.respondWith(caches.match(req).then(resp => resp || fetch(req).then(r=>{ caches.open(RUNTIME_CACHE).then(c=>c.put(req, r.clone())); return r;})).catch(()=>caches.match('/offline.html')));
    return;
  }

  // Default: try network, fallback to runtime cache, then offline
  event.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(RUNTIME_CACHE).then(cache => cache.put(req, copy));
      return res;
    }).catch(()=>caches.match(req).then(r => r || caches.match('/offline.html')))
  );
});

// Allow skipWaiting via message from client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

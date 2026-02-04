// Basic service worker for offline caching
const CACHE_NAME = 'globaldeets-cache-v2';
const CORE_ASSETS = [
  '/',
  'index.html',
  'analytics.html',
  'categories.html',
  'timeline.html',
  'bb-content.html',
  'offline.html',
  'styles.css',
  'projects-data.js',
  'projects-render.js',
  'ui-effects.js',
  'interactions.js',
  'app.js',
  'auth.js',
  'data.js',
  'pwa-install.js',
  'sw-register.js',
  'manifest.json',
  'assets/icon-72.svg',
  'assets/icon-96.svg',
  'assets/icon-128.svg',
  'assets/icon-144.svg',
  'assets/icon-152.svg',
  'assets/icon-192.svg',
  'assets/icon-384.svg',
  'assets/icon-512.svg',
  'assets/screenshot-wide.svg',
  'assets/screenshot-mobile.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});

// Network falling back to cache, with offline fallback for navigation requests
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const isNav = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  event.respondWith(
    fetch(request).then(resp => {
      // Stale-while-revalidate style caching for GET
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return resp;
    }).catch(() => {
      return caches.match(request).then(cached => {
        if (cached) return cached;
        if (isNav) return caches.match('offline.html');
        return caches.match('index.html');
      });
    })
  );
});

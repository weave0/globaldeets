// Basic service worker for offline caching
const CACHE_NAME = 'globaldeets-cache-v5';
// Precache only files that exist in the deploy artifact: cache.addAll rejects (and the worker
// fails to install) if any entry 404s.
const CORE_ASSETS = [
  '/',
  'index.html',
  'news.html',
  'categories.html',
  'timeline.html',
  'offline.html',
  'styles.css',
  'world-desk.css',
  'world-desk.js',
  'news.js',
  'interactions.js',
  'app.js',
  'sw-register.js',
  'manifest.json',
  'assets/favicon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/logo-mark.png',
];
const OFFLINE_COPY_HEADER = 'X-GlobalDeets-Offline-Copy';
const CACHED_AT_HEADER = 'X-GlobalDeets-Cached-At';

// A stylesheet or script is cached only when the server labels it as one. Some servers (the Vite
// dev server among them) answer a generic request for /styles.css with a JavaScript module; caching
// that would later replay an unstyled page.
const EXPECTED_TYPES = { '.css': 'text/css', '.js': 'javascript' };

function hasExpectedType(url, response) {
  const match = /\.(css|js)$/.exec(new URL(url, self.location.href).pathname);
  if (!match) return true;
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes(EXPECTED_TYPES[`.${match[1]}`]);
}

function precache(cache, path) {
  const accept = path.endsWith('.css') ? 'text/css' : '*/*';
  return fetch(new Request(path, { headers: { Accept: accept } })).then(response => {
    if (!response.ok || !hasExpectedType(path, response)) {
      throw new Error(`precache rejected ${path}: HTTP ${response.status} ${response.headers.get('content-type')}`);
    }
    return cache.put(path, response);
  });
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(CORE_ASSETS.map(path => precache(cache, path))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))),
      self.clients.claim(),
    ])
  );
});

// Network first, falling back to cache. Successful GET responses refresh the current cache.
// API responses served from cache are explicitly marked as offline copies so the page can say
// that it is showing saved stories instead of presenting them as current.
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/');
  const isNav =
    request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  event.respondWith(
    fetch(request)
      .then(resp => {
        if (resp.ok && hasExpectedType(request.url, resp)) {
          const copy = isApi ? stampCachedAt(resp.clone()) : Promise.resolve(resp.clone());
          copy.then(stamped => caches.open(CACHE_NAME).then(cache => cache.put(request, stamped)));
        }
        return resp;
      })
      .catch(() => {
        return caches.match(request).then(cached => {
          if (cached && isApi) return markOfflineCopy(cached);
          if (cached) return cached;
          if (isApi) {
            return new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (isNav) return caches.match('offline.html');
          return Response.error();
        });
      })
  );
});

async function stampCachedAt(response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, new Date().toISOString());
  return new Response(await response.blob(), { status: response.status, headers });
}

async function markOfflineCopy(cached) {
  const headers = new Headers(cached.headers);
  headers.set(OFFLINE_COPY_HEADER, cached.headers.get(CACHED_AT_HEADER) || 'unknown');
  // Readable by the page even when the API is reached cross-origin (local development).
  headers.set('Access-Control-Expose-Headers', OFFLINE_COPY_HEADER);
  return new Response(await cached.blob(), { status: cached.status, headers });
}

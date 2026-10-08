// Basic service worker for offline caching
const CACHE_NAME = 'globaldeets-cache-v8';
// The offline shell: every precached page plus every same-origin asset those pages load (including
// news-reader-bridge.css, which news.js injects). tests/offline-shell-agreement.test.mjs keeps this
// list complete and limited to shipped files; a missing file would fail the worker install.
const CORE_ASSETS = [
  '/',
  'index.html',
  'news.html',
  'categories.html',
  'timeline.html',
  'offline.html',
  'styles.css',
  'world-desk.css',
  'news-reader-bridge.css',
  'world-desk.js',
  'news.js',
  'globe-hero.js',
  'site-nav.js',
  'interactions.js',
  'app.js',
  'sw-register.js',
  'manifest.json',
  'assets/favicon.png',
  'assets/apple-touch-icon.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/logo-mark.png',
  'assets/icons/site/nav-home.svg',
  'assets/icons/site/nav-news.svg',
  'assets/icons/site/nav-list.svg',
  'story/santa-ynez-pipeline/',
  'story/santa-ynez-pipeline/index.html',
  'story/story.css',
  'story/santa-ynez-pipeline/story.js',
  'story/santa-ynez-pipeline/story.json',
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
  event.respondWith(respond(event, request));
});

async function respond(event, request) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/');
  const isNav =
    request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

  let response;
  try {
    response = await fetch(request);
  } catch {
    return fromCache(request, isApi, isNav);
  }

  if (response.ok && hasExpectedType(request.url, response)) {
    // The write is registered with the event's lifetime (waitUntil is called while respondWith is
    // still pending), so the worker is kept alive until it settles. A failed write is contained:
    // the valid network response below is returned either way.
    event.waitUntil(
      writeToCache(request, response.clone(), isApi).catch(error =>
        console.warn('GlobalDeets cache write failed:', request.url, error)
      )
    );
  }
  return response;
}

async function writeToCache(request, response, isApi) {
  const stored = isApi ? await stampCachedAt(response) : response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, stored);
}

async function fromCache(request, isApi, isNav) {
  const cached = await caches.match(request);
  if (cached && isApi) return markOfflineCopy(cached);
  if (cached) return cached;
  if (isApi) {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (isNav) return (await caches.match('offline.html')) || Response.error();
  return Response.error();
}

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

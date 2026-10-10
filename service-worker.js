// Basic service worker for offline caching
const CACHE_NAME = 'globaldeets-cache-v10';
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
  'editorial-reader.css',
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
  // Public maintained story shell. No private responses or claims are precached.
  'story/santa-ynez-pipeline/',
  'story/santa-ynez-pipeline/index.html',
  'story/story.css',
  'story/santa-ynez-pipeline/story.js',
  'story/santa-ynez-pipeline/story.json',
];
const OFFLINE_COPY_HEADER = 'X-GlobalDeets-Offline-Copy';
const CACHED_AT_HEADER = 'X-GlobalDeets-Cached-At';
const OFFLINE_MISS_HEADER = 'X-GlobalDeets-Offline-Miss';
const OFFLINE_PAGES = new Set(['index', 'news', 'categories', 'timeline', 'offline']);
// Only the actual story feed is rendered with an explicit "saved copy" warning.
// Source authority, admissions, coverage and health must remain live-only or visibly unavailable.
const PUBLIC_NEWS_API_PATHS = new Set(['/api/news']);
// The one publicly reviewed, shipped story record is an offline data dependency.
// Never extend this allowance to private, operator or intelligence API responses.
const PUBLIC_STORY_RECORDS = new Set(['/story/santa-ynez-pipeline/story.json']);
const PUBLIC_PAGES = new Set([
  '/', '/index.html', '/news', '/news.html', '/categories', '/categories.html',
  '/timeline', '/timeline.html', '/offline', '/offline.html', '/globe', '/globe.html',
  '/worldmap', '/worldmap.html', '/about', '/about.html', '/contact', '/contact.html',
  '/knowledge', '/knowledge.html', '/donate', '/donate.html',
  '/story/santa-ynez-pipeline', '/story/santa-ynez-pipeline/',
]);
const PUBLIC_ASSET_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest']);

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

async function normalizeHtmlResponse(response) {
  if (!response.redirected) return response;
  const headers = new Headers(response.headers);
  // Fetch exposes decoded bytes; do not retain the upstream wire-encoding/length metadata.
  headers.delete('content-encoding');
  headers.delete('content-length');
  // Cloning the actual bytes into a new Response removes the redirect chain and URL.
  return new Response(await response.blob(), { status: response.status, headers });
}

function precache(cache, path) {
  const accept = path.endsWith('.css') ? 'text/css' : '*/*';
  return fetch(new Request(path, { headers: { Accept: accept } })).then(async response => {
    if (!response.ok || !hasExpectedType(path, response)) {
      throw new Error(`precache rejected ${path}: HTTP ${response.status} ${response.headers.get('content-type')}`);
    }
    // Pages redirects .html requests to clean URLs. A redirected Response cannot
    // satisfy a different offline navigation URL; cache a URL-neutral HTML response.
    return cache.put(path, (path.endsWith('.html') || (response.headers.get('content-type') || '').includes('text/html'))
      ? await normalizeHtmlResponse(response) : response);
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
  // Do not intercept external origins or non-news functions (including payment sessions).
  if (url.origin !== self.location.origin) return;
  const isApi = PUBLIC_NEWS_API_PATHS.has(url.pathname);
  const isStoryRecord = PUBLIC_STORY_RECORDS.has(url.pathname);
  if (url.pathname.startsWith('/api/') && !isApi) return;
  if (url.pathname === '/get-session' || url.pathname === '/create-checkout') return;
  const isNav =
    request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  // Fetch/XHR outside the public news API has no offline cache semantics. Bypass the worker.
  if (!isApi && !isStoryRecord && !isNav && !PUBLIC_ASSET_DESTINATIONS.has(request.destination)) return;
  const cacheable = isApi || isStoryRecord || (isNav
    ? PUBLIC_PAGES.has(url.pathname)
    : PUBLIC_ASSET_DESTINATIONS.has(request.destination));
  event.respondWith(respond(event, request, { isApi, isNav, cacheable }));
});

async function respond(event, request, { isApi, isNav, cacheable }) {

  let response;
  try {
    response = await fetch(request);
  } catch {
    return fromCache(request, isApi, isNav);
  }

  const cacheControl = response.headers.get('cache-control') || '';
  const sensitive =
    /\b(?:private|no-store|no-cache)\b/i.test(cacheControl) ||
    response.headers.has('set-cookie') ||
    request.headers.has('authorization');
  if (cacheable && !sensitive && response.ok && hasExpectedType(request.url, response)) {
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
  await cache.put(request, !isApi && (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html'))
    ? await normalizeHtmlResponse(stored) : stored);
}

async function fromCache(request, isApi, isNav) {
  const cached = await caches.match(request);
  if (cached && isApi) return markOfflineCopy(cached);
  if (cached) return isNav ? normalizeHtmlResponse(cached) : cached;
  if (isApi) {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', [OFFLINE_MISS_HEADER]: '1' },
    });
  }
  if (isNav && urlIsSameOrigin(request.url)) {
    const page = offlinePageFor(request.url);
    if (page) {
      const shell = await caches.match(page);
      if (shell) return shell;
    }
  }
  if (isNav) return (await caches.match('offline.html')) || Response.error();
  return Response.error();
}

function urlIsSameOrigin(href) {
  return new URL(href).origin === self.location.origin;
}

function offlinePageFor(href) {
  const url = new URL(href);
  if (url.origin !== self.location.origin) return null;
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  if (pathname === '/') return 'index.html';
  if (pathname === '/story/santa-ynez-pipeline') return 'story/santa-ynez-pipeline/index.html';
  // Only known reader shells are served by offline navigation; unknown routes keep the fallback.
  const name = pathname.slice(1).replace(/\.html$/, '');
  return OFFLINE_PAGES.has(name) ? `${name}.html` : null;
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

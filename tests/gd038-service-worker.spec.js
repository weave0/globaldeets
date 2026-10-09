/* global ExtendableEvent, Cache */
const { expect, test } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// The rest of the suite blocks service workers so page.route mocks stay deterministic. This file is
// the separate path that exercises the real worker: install (which fails if any precached file is
// missing), cache upgrade, and explicitly labeled offline news.
test.use({ serviceWorkers: 'allow' });

const feed = {
  cached: false,
  total: 1,
  items: [
    {
      id: 'sw-1',
      source: 'Fixture Wire',
      sourceId: 'fixture-wire',
      headline: 'Story saved for offline reading',
      sourceUrl: 'https://example.com/sw-1',
      region: 'global',
      published: new Date().toISOString(),
      displayMode: 'headline-link',
    },
  ],
};

async function routeApi(context) {
  // In local Vite development, news.js normally targets the live API hostname. Route only
  // this test context to same-origin /api to verify actual service-worker cache behavior.
  await context.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (resource, init) => {
      const url = typeof resource === 'string' ? resource : resource instanceof Request ? resource.url : null;
      if (url?.startsWith('https://globaldeets.com/api/')) {
        const parsed = new URL(url);
        return nativeFetch(parsed.pathname + parsed.search, init);
      }
      return nativeFetch(resource, init);
    };
  });
  await context.route('**/api/news**', async route => {
    const { pathname } = new URL(route.request().url());
    const body =
      pathname === '/api/news'
        ? feed
        : pathname === '/api/news/health'
          ? { healthySources: 21, totalSources: 21, generatedAt: new Date().toISOString() }
          : {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-GlobalDeets-Offline-Copy, X-GlobalDeets-Cached-At',
      },
      body: JSON.stringify(body),
    });
  });
}

async function waitForControllingWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
  }
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test('the service worker installs, precaches only shipped files, and retires the old cache', async ({
  page,
}) => {
  // Seed the cache the previous worker version used; activation must delete it.
  await page.goto('/offline.html');
  await page.evaluate(() => caches.open('globaldeets-cache-v8').then(cache => cache.put('/stale', new Response('old'))));

  await page.goto('/index.html');
  await waitForControllingWorker(page);

  const state = await page.evaluate(async () => ({
    keys: await caches.keys(),
    precached: await caches
      .open('globaldeets-cache-v9')
      .then(cache => Promise.all(['/world-desk.js', '/news.js', '/offline.html'].map(path => cache.match(path))))
      .then(matches => matches.every(Boolean)),
  }));
  expect(state.keys).toContain('globaldeets-cache-v9');
  expect(state.keys).not.toContain('globaldeets-cache-v8');
  expect(state.precached).toBe(true);
});

test('a direct maintained story link keeps the reviewed record through offline reload', async ({ page }) => {
  await page.goto('/story/santa-ynez-pipeline/');
  await waitForControllingWorker(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Ynez Pipeline — Evidence Dossier' })).toBeVisible();
  await page.context().route('**/*', route => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Ynez Pipeline — Evidence Dossier' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Read at Los Angeles Times/ }).first()).toBeVisible();
  await expect(page.getByText(/Content version 2026-09-03[.]1/)).toBeVisible();
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
});

test('a dev server answering a stylesheet with JavaScript can never leave an unstyled cached page', async ({
  page,
}) => {
  // Vite answers a generic GET /styles.css with a JS module unless the request asks for CSS. The
  // worker must precache the real stylesheet and refuse to cache mislabeled CSS/JS.
  await page.goto('/index.html');
  await waitForControllingWorker(page);
  const cached = await page.evaluate(async () => {
    const cache = await caches.open('globaldeets-cache-v9');
    const out = {};
    for (const path of ['/styles.css', '/world-desk.css', '/news.js']) {
      const response = await cache.match(path);
      out[path] = response ? response.headers.get('content-type') : null;
    }
    return out;
  });
  expect(cached['/styles.css']).toContain('text/css');
  expect(cached['/world-desk.css']).toContain('text/css');
  expect(cached['/news.js']).toContain('javascript');

  // With the network gone, the replayed homepage is still styled.
  await page.context().route('**/*', route => route.abort('internetdisconnected'));
  await page.reload();
  const styledRules = await page.evaluate(() =>
    [...document.styleSheets]
      .filter(sheet => sheet.href && /\/(styles|world-desk)\.css$/.test(sheet.href))
      .map(sheet => sheet.cssRules.length)
  );
  expect(styledRules.length).toBe(2);
  for (const count of styledRules) expect(count).toBeGreaterThan(10);
});

test('offline readers get saved stories that are explicitly labeled as out of date', async ({
  page,
  context,
}) => {
  await routeApi(context);
  await page.goto('/news.html');
  await waitForControllingWorker(page);
  // One controlled, online visit stores the feed response in the worker cache.
  await page.reload();
  await expect(page.locator('#news-grid .news-card')).toHaveCount(1);
  await expect(page.locator('.news-alert[data-alert="offline"]')).toHaveCount(0);

  // Chromium's context.setOffline() does not apply to service-worker fetches, so simulate losing
  // the network by failing every API request the worker makes; it must fall back to its cache.
  await context.unroute('**/api/news**');
  await context.route('**/api/news**', route => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('#news-grid')).toContainText('Story saved for offline reading');
  await expect(page.locator('.news-alert[data-alert="offline"]')).toContainText('may be out of date');
  await expect(page.locator('#news-freshness')).toHaveText('saved copy');
});

// Fetch-event lifetime: the cache write must be registered through event.waitUntil (so the browser
// keeps the worker alive until it settles), must not delay the network response, and a failing
// write must never turn a valid network response into an error.
async function instrumentWorker(context, page, mode) {
  await routeApi(context);
  await page.goto('/news.html');
  await waitForControllingWorker(page);
  const [worker] = context.serviceWorkers();
  await worker.evaluate(writeMode => {
    self.__lifetimes = [];
    self.__unhandled = 0;
    self.addEventListener('unhandledrejection', () => {
      self.__unhandled += 1;
    });
    const waitUntil = ExtendableEvent.prototype.waitUntil;
    ExtendableEvent.prototype.waitUntil = function (promise) {
      self.__lifetimes.push(promise);
      return waitUntil.call(this, promise);
    };
    const put = Cache.prototype.put;
    Cache.prototype.put = function (...args) {
      if (writeMode === 'reject') return Promise.reject(new Error('quota exceeded (simulated)'));
      return new Promise(resolve => setTimeout(resolve, 1500)).then(() => put.apply(this, args));
    };
  }, mode);
  return worker;
}

const PROBE_URL = '/api/news?region=asia&limit=1&offset=0';

async function fetchThroughWorker(page) {
  return page.evaluate(async url => {
    const started = performance.now();
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const body = await response.json();
    return { status: response.status, elapsed: performance.now() - started, items: body.items?.length };
  }, PROBE_URL);
}

test('a delayed cache write is held open by waitUntil and does not delay the response', async ({
  page,
  context,
}) => {
  const worker = await instrumentWorker(context, page, 'delay');
  const result = await fetchThroughWorker(page);
  expect(result.status).toBe(200);
  expect(result.items).toBe(1);
  expect(result.elapsed, 'response is not blocked by the 1.5s write').toBeLessThan(1200);

  const outcome = await worker.evaluate(async url => {
    const registered = self.__lifetimes.length;
    const settled = await Promise.allSettled(self.__lifetimes);
    const cached = await caches.match(url);
    return {
      registered,
      allFulfilled: settled.every(entry => entry.status === 'fulfilled'),
      cached: Boolean(cached),
      cachedAt: cached?.headers.get('X-GlobalDeets-Cached-At') || null,
    };
  }, PROBE_URL);
  expect(outcome.registered, 'cache write registered via waitUntil').toBeGreaterThan(0);
  expect(outcome.allFulfilled).toBe(true);
  expect(outcome.cached, 'the delayed write landed').toBe(true);
  expect(outcome.cachedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('a rejected cache write still returns the valid network response', async ({ page, context }) => {
  const worker = await instrumentWorker(context, page, 'reject');
  const result = await fetchThroughWorker(page);
  expect(result.status).toBe(200);
  expect(result.items).toBe(1);

  const outcome = await worker.evaluate(async url => {
    const settled = await Promise.allSettled(self.__lifetimes);
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
      registered: settled.length,
      allFulfilled: settled.every(entry => entry.status === 'fulfilled'),
      unhandled: self.__unhandled,
      cached: Boolean(await caches.match(url)),
    };
  }, PROBE_URL);
  expect(outcome.registered).toBeGreaterThan(0);
  expect(outcome.allFulfilled, 'the write failure is contained, not propagated').toBe(true);
  expect(outcome.unhandled).toBe(0);
  expect(outcome.cached).toBe(false);
});

test('first install, then immediately offline: News keeps its styling and the More menu works', async ({
  page,
  context,
}) => {
  // One online visit installs the worker. No second controlled visit warms the runtime cache.
  await page.goto('/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.route('**/*', route => route.abort('internetdisconnected'));
  await page.goto('/news.html');

  const sheets = await page.evaluate(() =>
    Object.fromEntries(
      [...document.styleSheets]
        .filter(sheet => sheet.href && sheet.href.startsWith(location.origin))
        .map(sheet => {
          let rules = -1; // a stylesheet that failed to load cannot expose its rules
          try {
            rules = sheet.cssRules.length;
          } catch {}
          return [new URL(sheet.href).pathname, rules];
        })
    )
  );
  expect(sheets['/styles.css']).toBeGreaterThan(10);
  expect(sheets['/world-desk.css']).toBeGreaterThan(10);
  expect(sheets['/news-reader-bridge.css'], 'news.js-injected bridge stylesheet').toBeGreaterThan(5);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByText('More')).toBeVisible();

  // site-nav.js behavior: Escape closes More and returns focus to its toggle.
  const more = page.locator('details.nav-more');
  const toggle = more.locator('summary');
  await toggle.click();
  await expect(more).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(more).not.toHaveAttribute('open', '');
  await expect(toggle).toBeFocused();
});

test('first-install offline navigation preserves known clean routes and region queries', async ({ page, context }) => {
  await page.goto('/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.route('**/*', route => route.abort('internetdisconnected'));
  const cases = [
    ['/', 'GlobalDeets — World Desk'],
    ['/news', 'World News Feed'],
    ['/news?region=europe', 'World News Feed'],
    ['/news.html?region=asia', 'World News Feed'],
    ['/categories', 'Browse by Region'],
    ['/timeline', 'Reporting Timeline'],
  ];
  for (const [path, title] of cases) {
    await page.goto(path);
    await expect(page).toHaveTitle(new RegExp(title));
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
  }
  await page.goto('/this-page-does-not-exist');
  await expect(page).toHaveTitle(/Offline/);
});

test('a service-worker API cache miss is distinct from a genuine upstream 503', async ({ page, context }) => {
  await page.goto('/index.html');
  await waitForControllingWorker(page);
  const missing = '/api/news?region=africa&limit=3&offset=999999';
  await context.route('**/api/news?region=africa&limit=3&offset=999999', route =>
    route.abort('internetdisconnected')
  );
  const miss = await page.evaluate(async path => {
    const response = await fetch(path);
    return { status: response.status, marker: response.headers.get('X-GlobalDeets-Offline-Miss') };
  }, missing);
  expect(miss).toEqual({ status: 503, marker: '1' });
  await context.unroute('**/api/news?region=africa&limit=3&offset=999999');
  await context.route('**/api/news?region=africa&limit=3&offset=999999', route =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"upstream"}' })
  );
  const upstream = await page.evaluate(async path => {
    const response = await fetch(path);
    return { status: response.status, marker: response.headers.get('X-GlobalDeets-Offline-Miss') };
  }, missing);
  expect(upstream).toEqual({ status: 503, marker: null });
});


test('News shows offline/no-saved-copy distinctly from a genuine upstream 503', async ({ page, context }) => {
  // Dev's news.js uses the production API hostname for localhost, whereas the deployed reader
  // fetches same-origin /api/news. Rewrite only that dev-only API prefix so this browser check
  // exercises the actual production same-origin service-worker path and reader classification.
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (typeof input === 'string' && input.startsWith('https://globaldeets.com/api/')) {
        const url = new URL(input);
        return nativeFetch(url.pathname + url.search, init);
      }
      return nativeFetch(input, init);
    };
  });
  await page.goto('/index.html');
  await waitForControllingWorker(page);

  let failNetwork = true;
  await context.route('**/api/news**', route => {
    if (failNetwork) return route.abort('internetdisconnected');
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"upstream"}' });
  });

  await page.goto('/news.html?region=africa');
  await expect(page.locator('.news-error')).toHaveAttribute('data-failure', 'offline');
  await expect(page.locator('.news-error')).toContainText('offline');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(0);
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);

  failNetwork = false;
  await page.reload();
  await expect(page.locator('.news-error')).toHaveAttribute('data-failure', 'upstream');
  await expect(page.locator('.news-error')).toContainText('service returned an error');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(0);
});

test('private sessions, trust snapshots and unrelated APIs never enter the offline cache', async ({ page, context }) => {
  await page.goto('/index.html');
  await waitForControllingWorker(page);
  const cases = [
    ['/get-session?session_id=fixture-private', { 'Cache-Control': 'no-store' }],
    ['/api/deploy?test=fixture-private', { 'Cache-Control': 'public, max-age=60' }],
    ['/api/news/health?test=fixture-private', { 'Cache-Control': 'public, max-age=60' }],
    ['/api/news/sources?test=fixture-private', { 'Cache-Control': 'public, max-age=60' }],
  ];
  for (const [path, headers] of cases) {
    await context.route('**' + path, route => route.fulfill({
      status: 200, contentType: 'application/json', headers, body: '{"ok":true}',
    }));
    const status = await page.evaluate(async url => (await fetch(url)).status, path);
    expect(status).toBe(200);
    const stored = await page.evaluate(async url => Boolean(await caches.match(url)), path);
    expect(stored, `${path} must never be replayed by the public-news worker`).toBe(false);
    await context.unroute('**' + path);
  }
});

test('no-store public news is never cached even when its response is successful', async ({ page, context }) => {
  await page.goto('/index.html');
  await waitForControllingWorker(page);
  const path = '/api/news?region=pacific&limit=1&offset=987654';
  await context.route('**' + path, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: '{"items":[],"total":0}',
  }));
  const status = await page.evaluate(async url => (await fetch(url)).status, path);
  expect(status).toBe(200);
  expect(await page.evaluate(async url => Boolean(await caches.match(url)), path)).toBe(false);
});

test('actual Pages CSP allows service worker first-install and offline News navigation', async ({ page, context }) => {
  // Apply the checked-in Pages header to the *document*, where worker-src is enforced.
  // This test is intentionally independent of Vite's default (CSP-free) response.
  const rawHeaders = readFileSync(join(__dirname, '..', '_headers'), 'utf8');
  const headerLine = rawHeaders.split(/\r?\n/).find(line =>
    line.trimStart().startsWith('Content-Security-Policy:')
  );
  expect(headerLine, 'missing Pages Content-Security-Policy').toBeTruthy();
  const policy = headerLine.trim().replace(/^Content-Security-Policy:\s*/, '');
  expect(policy).toContain("worker-src 'self' blob:");

  await page.route('**/index.html', async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': policy },
    });
  });

  const response = await page.goto('/index.html');
  expect(response.headers()['content-security-policy']).toBe(policy);
  const registeredWorker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.scriptURL || null;
  });
  expect(registeredWorker).toMatch(/\/service-worker\.js$/);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.route('**/*', route => route.abort('internetdisconnected'));
  await page.goto('/news?region=europe');
  await expect(page).toHaveTitle(/World News Feed — GlobalDeets/);
  expect(new URL(page.url()).searchParams.get('region')).toBe('europe');
});

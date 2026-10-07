/* global ExtendableEvent, Cache */
const { expect, test } = require('@playwright/test');

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
  await page.evaluate(() => caches.open('globaldeets-cache-v5').then(cache => cache.put('/stale', new Response('old'))));

  await page.goto('/index.html');
  await waitForControllingWorker(page);

  const state = await page.evaluate(async () => ({
    keys: await caches.keys(),
    precached: await caches
      .open('globaldeets-cache-v6')
      .then(cache => Promise.all(['/world-desk.js', '/news.js', '/offline.html'].map(path => cache.match(path))))
      .then(matches => matches.every(Boolean)),
  }));
  expect(state.keys).toContain('globaldeets-cache-v6');
  expect(state.keys).not.toContain('globaldeets-cache-v5');
  expect(state.precached).toBe(true);
});

test('a dev server answering a stylesheet with JavaScript can never leave an unstyled cached page', async ({
  page,
}) => {
  // Vite answers a generic GET /styles.css with a JS module unless the request asks for CSS. The
  // worker must precache the real stylesheet and refuse to cache mislabeled CSS/JS.
  await page.goto('/index.html');
  await waitForControllingWorker(page);
  const cached = await page.evaluate(async () => {
    const cache = await caches.open('globaldeets-cache-v6');
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

const PROBE_URL = 'https://globaldeets.com/api/news?region=asia&limit=1&offset=0';

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

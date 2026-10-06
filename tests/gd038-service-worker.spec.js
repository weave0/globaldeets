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
  await page.evaluate(() => caches.open('globaldeets-cache-v3').then(cache => cache.put('/stale', new Response('old'))));

  await page.goto('/index.html');
  await waitForControllingWorker(page);

  const state = await page.evaluate(async () => ({
    keys: await caches.keys(),
    precached: await caches
      .open('globaldeets-cache-v4')
      .then(cache => Promise.all(['/world-desk.js', '/news.js', '/offline.html'].map(path => cache.match(path))))
      .then(matches => matches.every(Boolean)),
  }));
  expect(state.keys).toContain('globaldeets-cache-v4');
  expect(state.keys).not.toContain('globaldeets-cache-v3');
  expect(state.precached).toBe(true);
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

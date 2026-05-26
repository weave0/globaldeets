const { expect, test } = require('@playwright/test');

const newsFixture = {
  generatedAt: new Date('2026-05-25T12:00:00Z').toISOString(),
  cached: false,
  cacheAgeSeconds: 0,
  total: 3,
  items: [
    {
      source: 'Reuters',
      headline: 'Global leaders meet for climate finance talks',
      summary: 'Negotiators opened a new round of source-linked global climate finance talks.',
      sourceUrl: 'https://example.com/reuters-climate-finance',
      region: 'global',
      published: '2026-05-25T11:30:00Z',
    },
    {
      source: 'BBC World',
      headline: 'European cities prepare new heat response plans',
      summary: 'Municipal agencies are testing heat response systems ahead of summer.',
      sourceUrl: 'https://example.com/bbc-heat-response',
      region: 'europe',
      published: '2026-05-25T10:45:00Z',
    },
    {
      source: 'NHK',
      headline: 'Pacific transport routes reopen after storm',
      summary: 'Ports and regional transport links are reopening after severe weather.',
      sourceUrl: 'https://example.com/nhk-pacific-transport',
      region: 'pacific',
      published: '2026-05-25T09:15:00Z',
    },
  ],
  sourceHealth: [
    {
      id: 'reuters',
      name: 'Reuters',
      url: 'https://www.reuters.com/world/',
      region: 'global',
      fetched: 1,
      lastError: null,
      stale: false,
    },
    {
      id: 'bbc-world',
      name: 'BBC World',
      url: 'https://www.bbc.com/news/world',
      region: 'europe',
      fetched: 1,
      lastError: null,
      stale: false,
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/news**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(newsFixture),
    });
  });

  await page.route('https://globaldeets.com/api/news**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(newsFixture),
    });
  });
});

test('homepage loads the primary GlobalDeets surface', async ({ page }) => {
  await page.goto('/index.html');

  await expect(page).toHaveTitle(/GlobalDeets/i);
  await expect(page.getByRole('heading', { name: 'GlobalDeets', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('#globe-hero-container')).toBeVisible();
  await expect(page.getByRole('heading', { name: /The Earth,\s*Right Now\./i })).toBeVisible();
});

test('news page renders feed and avoids the hard failure state', async ({ page }) => {
  await page.goto('/news.html');

  await expect(page.getByRole('heading', { name: /World News Feed/i })).toBeVisible();
  await expect(page.locator('#region-tabs')).toBeVisible();
  await expect(page.locator('#news-status')).toContainText(/3 of 3 stories/);
  await expect(page.locator('#news-grid .news-card')).toHaveCount(3);
  await expect(page.locator('.source-health-panel')).toBeVisible();
  await expect(page.locator('.news-error')).toHaveCount(0);
  await expect(page.getByText(/Unable to load news feed/i)).toHaveCount(0);
});

test('globe page loads with the canvas hero surface present', async ({ page }) => {
  await page.goto('/globe.html');

  const hero = page.locator('#globe-hero-container');
  await expect(hero).toBeVisible();
  await expect(page.locator('.globe-filter-bar')).toBeVisible();
  await expect(page.locator('#ticker-track')).toContainText(/Global leaders meet/i);
  await expect(page.locator('#globe-news-badge')).toBeVisible();

  const heroBox = await hero.boundingBox();
  expect(heroBox?.width).toBeGreaterThan(500);
  expect(heroBox?.height).toBeGreaterThan(300);
});

test('worldmap page loads map and webcam UI', async ({ page }) => {
  await page.goto('/worldmap.html');

  await expect(page.getByRole('heading', { name: /World Map - Live Webcams/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Explore Webcams/i })).toBeVisible();
  await expect(page.locator('#globe-container')).toBeVisible();
  await expect(page.locator('#location-search')).toBeVisible();
  await expect(page.locator('#featured-list .featured-item').first()).toBeVisible();
  await expect(page.locator('#total-cams')).not.toHaveText('0');
});

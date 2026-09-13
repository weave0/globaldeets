const { expect, test } = require('@playwright/test');

const governedNews = {
  cached: false,
  total: 3,
  sourceFingerprint: 'fixture-source',
  admissionFingerprint: 'fixture-admission',
  displayPolicyVersion: 'gd021-admission-v1',
  items: [
    {
      id: 'minnesota-1',
      source: 'Minnesota Reformer',
      sourceId: 'minnesota-reformer',
      headline: 'Minnesota verified-use story',
      summary: 'This reviewed source is permitted to expose its bounded excerpt.',
      sourceUrl: 'https://example.com/minnesota',
      region: 'americas',
      lang: 'en',
      originalLang: 'en',
      translated: false,
      published: '2026-09-12T12:00:00Z',
      allowedUseStatus: 'verified-public-use',
      displayMode: 'current-use',
    },
    {
      id: 'guardian-1',
      source: 'Guardian',
      sourceId: 'guardian',
      headline: 'Guardian headline-link story',
      summary: null,
      sourceUrl: 'https://example.com/guardian',
      region: 'global',
      lang: 'en',
      originalLang: 'en',
      translated: false,
      published: '2026-09-12T11:00:00Z',
      allowedUseStatus: 'permission-required',
      displayMode: 'headline-link',
    },
    {
      id: 'nhk-1',
      source: 'NHK',
      sourceId: 'nhk',
      headline: 'NHK source headline',
      summary: null,
      sourceUrl: 'https://example.com/nhk',
      region: 'asia',
      lang: 'ja',
      originalLang: 'ja',
      translated: false,
      published: '2026-09-12T10:00:00Z',
      allowedUseStatus: 'unknown',
      displayMode: 'headline-link',
    },
  ],
};

const sources = {
  totalSources: 21,
  sources: [
    { sourceId: 'minnesota-reformer', name: 'Minnesota Reformer' },
    { sourceId: 'guardian', name: 'Guardian' },
    { sourceId: 'nhk', name: 'NHK' },
  ],
};

const health = {
  generatedAt: new Date().toISOString(),
  healthySources: 21,
  totalSources: 21,
  sourceHealth: [],
};

test('news cards honor admission display mode without blank or false translation UI', async ({ page }) => {
  await page.route('**/api/news**', async route => {
    const url = new URL(route.request().url());
    const body = url.pathname === '/api/news/sources'
      ? sources
      : url.pathname === '/api/news/health'
        ? health
        : governedNews;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/news.html');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(3);

  const verified = page.locator('.news-card').filter({ hasText: 'Minnesota verified-use story' });
  await expect(verified.locator('.news-summary')).toHaveCount(1);
  await expect(verified.locator('.news-summary')).toContainText('permitted to expose');
  await expect(verified.getByText('Headline/link only')).toHaveCount(0);

  const guardian = page.locator('.news-card').filter({ hasText: 'Guardian headline-link story' });
  await expect(guardian.getByText('Headline/link only')).toBeVisible();
  await expect(guardian.locator('.news-summary')).toHaveCount(0);

  const nhk = page.locator('.news-card').filter({ hasText: 'NHK source headline' });
  await expect(nhk.getByText('Headline/link only')).toBeVisible();
  await expect(nhk.locator('.news-summary')).toHaveCount(0);
  await expect(nhk.locator('.news-mt-badge--failed')).toHaveCount(0);

  await expect
    .poll(() => page.evaluate(() => window.__globalDeetsNewsAdmissionFingerprint))
    .toBe('fixture-admission');
  await expect
    .poll(() => page.evaluate(() => window.__globalDeetsNewsDisplayPolicyVersion))
    .toBe('gd021-admission-v1');
});

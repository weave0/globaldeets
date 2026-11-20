const { expect, test } = require('@playwright/test');

const traced = {
  cached: false,
  total: 3,
  sourceFingerprint: 'gd052-browser-fixture',
  items: [
    {
      id: 'source-a', source: 'Minnesota Reformer', sourceId: 'minnesota-reformer',
      headline: 'First attribution example', summary: 'Example excerpt',
      sourceUrl: 'https://example.org/article', region: 'americas',
      originalLang: 'en', translated: false, published: '2026-11-19T12:00:00Z',
      displayMode: 'current-use', allowedUseStatus: 'verified-public-use',
      feedOriginHint: { version: 'gd052-feed-origin-v1',
        status: 'external-host-reference', markerKind: 'feed-source',
        referenceUrl: 'https://another.example/source', originalReportingVerified: false,
        syndicationVerified: false },
      exactLinkOverlap: { matchType: 'exact-article-url', distinctPublisherCount: 2,
        otherPublishers: [{ sourceId: 'calmatters', name: 'CalMatters' }] },
    },
    {
      id: 'source-b', source: 'CalMatters', sourceId: 'calmatters',
      headline: 'Different headline, same exact article URL', summary: null,
      sourceUrl: 'https://example.org/article', region: 'americas',
      originalLang: 'en', translated: false, published: '2026-11-19T11:00:00Z',
      displayMode: 'headline-link', allowedUseStatus: 'permission-required',
      feedOriginHint: { version: 'gd052-feed-origin-v1',
        status: 'same-article-host-reference', markerKind: 'original-link',
        referenceUrl: 'https://example.org/original', originalReportingVerified: false,
        syndicationVerified: false },
      exactLinkOverlap: { matchType: 'exact-article-url', distinctPublisherCount: 2,
        otherPublishers: [{ sourceId: 'minnesota-reformer', name: 'Minnesota Reformer' }] },
    },
    {
      id: 'source-c', source: 'Guardian', sourceId: 'guardian',
      headline: 'Unresolved attributed article', summary: null,
      sourceUrl: 'https://example.org/another', region: 'global',
      originalLang: 'en', translated: false, published: '2026-11-19T10:00:00Z',
      displayMode: 'headline-link', allowedUseStatus: 'permission-required',
      feedOriginHint: { version: 'gd052-feed-origin-v1',
        status: 'unresolved-marker', markerKind: null,
        referenceUrl: 'javascript:alert(1)', originalReportingVerified: false,
        syndicationVerified: false },
      exactLinkOverlap: null,
    },
  ],
};

async function routeFeed(page, items = traced.items) {
  await page.route('**/api/news**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/news') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...traced, total: items.length, items }) });
  });
}

test('each article exposes bounded source evidence and identical URL matches', async ({ page }) => {
  await routeFeed(page);
  await page.goto('/news.html');
  const cards = page.locator('#news-grid .news-card');
  await expect(cards).toHaveCount(3);
  const first = cards.filter({ hasText: 'First attribution example' });
  await expect(first.locator('.news-origin-context')).toHaveCount(1);
  await first.locator('.news-origin-context summary').click();
  await expect(first.locator('.news-origin-state')).toContainText('different host');
  await expect(first.locator('.news-origin-overlap')).toContainText('2 distinct monitored publisher feeds');
  await expect(first.locator('.news-origin-overlap')).toContainText('not independent corroboration');
  await expect(first.locator('.news-origin-overlap a[href="source-network.html?source=calmatters"]')).toHaveCount(1);
  await expect(first.locator('.news-origin-reference a[href="https://another.example/source"]')).toHaveCount(1);
  await expect(first.locator('.news-origin-caveat')).toContainText('cannot establish original reporting');
});

test('missing optional trust APIs do not suppress item traces or publisher link', async ({ page }) => {
  await routeFeed(page);
  await page.goto('/news.html');
  const first = page.locator('.news-card').filter({ hasText: 'First attribution example' });
  await expect(first.locator('.news-read-link')).toHaveAttribute('href', 'https://example.org/article');
  await expect(first.locator('.news-source-context')).toHaveCount(0);
  await first.locator('.news-origin-context summary').click();
  await expect(first.locator('.news-origin-state')).toContainText('source link');
});

test('unsafe source references are never clickable, unknowns never certify syndication', async ({ page }) => {
  await routeFeed(page);
  await page.goto('/news.html');
  const unknown = page.locator('.news-card').filter({ hasText: 'Unresolved attributed article' });
  await unknown.locator('.news-origin-context summary').click();
  await expect(unknown.locator('.news-origin-state')).toContainText('could not be safely resolved');
  await expect(unknown.locator('.news-origin-context a[href^="javascript:"]')).toHaveCount(0);
  await expect(unknown.locator('.news-origin-overlap')).toContainText('does not prove exclusivity');
});

test('origin disclosures are keyboard operable without mobile overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await routeFeed(page);
  await page.goto('/news.html');
  const summary = page.locator('.news-card').first().locator('.news-origin-context summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.news-card').first().locator('.news-origin-reference')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});


test('GD-053 evidence lens filters only loaded items and makes deep links shareable', async ({ page }) => {
  await routeFeed(page);
  await page.goto('/news.html?signal=shared-url');
  const select = page.locator('#news-evidence-filter');
  await expect(select).toHaveValue('shared-url');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(2);
  await expect(page.locator('.news-origin-context[open]')).toHaveCount(2);
  await expect(page.locator('#news-status')).toContainText('2 matching loaded-story filters');

  await select.selectOption('external-link');
  await expect(page).toHaveURL(/signal=external-link/);
  await expect(page.locator('#news-grid .news-card')).toHaveCount(1);
  await expect(page.locator('.news-card .news-headline')).toContainText('First attribution example');

  await select.selectOption('source-link');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(2);
  await select.selectOption('no-resolved-link');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(1);
  await expect(page.locator('.news-card .news-headline')).toContainText('Unresolved attributed article');

  await select.selectOption('all');
  await expect(page).not.toHaveURL(/signal=/);
  await expect(page.locator('#news-grid .news-card')).toHaveCount(3);
  await expect(page.locator('.news-origin-context[open]')).toHaveCount(0);
});

test('GD-053 evidence lens composes with search, fails closed and fits narrow phones', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await routeFeed(page);
  await page.goto('/news.html?signal=invalid-option');
  await expect(page.locator('#news-evidence-filter')).toHaveValue('all');
  await page.locator('#news-evidence-filter').selectOption('shared-url');
  await page.locator('#news-search').fill('unmatched');
  await expect(page.locator('[data-state="no-evidence-matches"]')).toContainText('No loaded stories');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('#news-evidence-filter')).toHaveValue('all');
  await expect(page.locator('#news-search')).toHaveValue('');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  const size = await page.locator('#news-evidence-filter').boundingBox();
  expect(size.height).toBeGreaterThanOrEqual(44);
});

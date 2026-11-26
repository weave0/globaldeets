const { expect, test } = require('@playwright/test');

const record = {
  "id": "ap-guardian-sam-moore-2025-01",
  "status": "active",
  "relation": "wire-attributed-version",
  "title": "Sam Moore obituary",
  "publishedOn": "2025-01-11",
  "reviewedAt": "2026-11-25",
  "origin": {
    "sourceId": "ap",
    "url": "https://apnews.com/article/obituary-sam-moore-bcdf09de45e2475a8c016d30b4297709"
  },
  "republication": {
    "sourceId": "guardian",
    "url": "https://www.theguardian.com/music/2025/jan/11/soul-man-singer-sam-moore-dies-aged-89-from-surgery-complications"
  },
  "evidenceSummary": "The Guardian explicitly credits Associated Press in Florida; its report corresponds to the AP-published obituary, with editorial differences. This establishes the attributed article relationship, not a licensing contract or an identical version."
};
const fp = 'gd054-fixture';
const authority = (records = [record], fingerprint = fp) => ({
  schemaVersion: 1, scope: 'reviewed-article-pairs-only', sourceFingerprint: fingerprint,
  validation: { valid: true }, records,
});
const response = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const item = (id, side, title) => ({
  id, sourceId: side.sourceId, source: side.sourceId, sourceUrl: side.url, headline: title,
  region: 'global', displayMode: 'headline-link', published: '2025-01-11T12:00:00Z',
});
const items = [
  item('a', record.origin, 'AP matched'),
  item('b', record.republication, 'Guardian matched'),
  item('c', { ...record.origin, url: record.origin.url + '?tracking=1' }, 'Different exact URL'),
  item('d', { ...record.origin, sourceId: 'guardian' }, 'Wrong source identity'),
];
async function mockNews(page, distribution) {
  await page.route('**/api/news**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/news/syndication') return route.fulfill(response(distribution));
    if (path === '/api/news') return route.fulfill(response({ total: items.length, items, sourceFingerprint: fp }));
    return route.fulfill({ status: 503, body: '{}' });
  });
}
test('article evidence requires exact URL and source identity on both sides', async ({ page }) => {
  await mockNews(page, authority());
  await page.goto('/news.html');
  const cards = page.locator('.news-card');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.news-distribution-context')).toHaveCount(2);
  const first = cards.filter({ hasText: 'AP matched' });
  await first.locator('.news-distribution-context summary').click();
  await expect(first.locator('.gd-distribution-record')).toContainText('Wire-attributed version');
  await expect(first.locator('.gd-distribution-record a')).toHaveCount(2);
  await expect(cards.filter({ hasText: 'Different exact URL' }).locator('.news-distribution-context')).toHaveCount(0);
  await expect(cards.filter({ hasText: 'Wrong source identity' }).locator('.news-distribution-context')).toHaveCount(0);
});
test('withdrawn, wrong-fingerprint, and unsafe authority data cannot add article claims', async ({ page }) => {
  for (const data of [
    authority([{ ...record, status: 'withdrawn', withdrawnAt: '2026-11-25', withdrawalReason: 'Corrected' }]),
    authority([record], 'wrong-fingerprint'),
    authority([{ ...record, origin: { ...record.origin, url: 'javascript:alert(1)' } }]),
  ]) {
    await mockNews(page, data);
    await page.goto('/news.html');
    await expect(page.locator('.news-card')).toHaveCount(4);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.news-distribution-context')).toHaveCount(0);
    await page.unroute('**/api/news**');
  }
});
test('publisher directory exposes historical pairs and explicit withdrawal history on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const sources = [
    { sourceId: 'ap', name: 'AP', primaryCountry: 'US', evidenceUrls: [], region: 'global' },
    { sourceId: 'guardian', name: 'Guardian', primaryCountry: 'GB', evidenceUrls: [], region: 'global' },
  ];
  await page.route('**/api/news/sources', route => route.fulfill(response({
    sourceFingerprint: fp, validation: { valid: true }, totalSources: sources.length, sources,
  })));
  await page.route('**/api/news/relationships', route => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/news/syndication', route => route.fulfill(response(authority([
    record, { ...record, id: 'withdrawn-example', status: 'withdrawn', withdrawnAt: '2026-11-25', withdrawalReason: 'Correction recorded' },
  ]))));
  await page.goto('/source-network.html?source=ap');
  const section = page.locator('.sn-distribution');
  await expect(section.locator('.gd-distribution-record')).toHaveCount(2);
  await expect(section).toContainText('Withdrawn record');
  await expect(section).toContainText('Correction recorded');
  await expect(section.locator('.gd-distribution-record').last().locator('a')).toHaveCount(0);
  await expect(section.locator('.gd-distribution-record').first().locator('a')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

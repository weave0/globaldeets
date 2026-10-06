const { expect, test } = require('@playwright/test');

// GD-038 acceptance: once reporting loads, a phone reader sees a real headline, its publisher, and
// a usable source action without scrolling. Story containers existing somewhere is not enough.

const LONG_HEADLINE =
  'Regional ministers agree emergency water-sharing framework after months of drought talks, but key upstream states have not yet signed';

function feed(count = 6) {
  return {
    cached: true,
    total: count,
    items: Array.from({ length: count }, (_, i) => ({
      id: `story-${i}`,
      source: i === 0 ? 'The East African' : 'Fixture Wire',
      sourceId: i === 0 ? 'the-east-african' : 'fixture-wire',
      headline: i === 0 ? LONG_HEADLINE : `Supporting story ${i}`,
      summary: i === 0 ? null : 'A bounded publisher excerpt.',
      sourceUrl: `https://example.com/story-${i}`,
      region: 'africa',
      published: new Date(Date.now() - (i + 1) * 600_000).toISOString(),
      displayMode: i === 0 ? 'headline-link' : 'current-use',
      allowedUseStatus: i === 0 ? 'unknown' : 'verified-public-use',
    })),
  };
}

const trust = {
  '/api/news/sources': { totalSources: 21, sources: [{ sourceId: 'fixture-wire', name: 'Fixture Wire' }] },
  '/api/news/admission': { summary: { reviewedSources: 21 }, liveAdmissions: [] },
  '/api/news/coverage': {
    totalSources: 21,
    totalRegions: 7,
    subnationalReporting: { sourceCount: 2 },
    regions: [],
    gaps: [{ id: 'gap', severity: 'high', detail: 'Language concentration' }],
  },
  // Partial availability renders a visible warning: the worst case for first-view space.
  '/api/news/health': { healthySources: 19, totalSources: 21, generatedAt: new Date().toISOString() },
};

async function mockApi(page, { offlineCopyAt } = {}) {
  await page.route('**/api/news**', async route => {
    const { pathname } = new URL(route.request().url());
    const body = trust[pathname] || feed();
    // Dev pages call the production API cross-origin; expose the header like a same-origin response.
    const headers =
      pathname === '/api/news' && offlineCopyAt
        ? { 'X-GlobalDeets-Offline-Copy': offlineCopyAt, 'Access-Control-Expose-Headers': 'X-GlobalDeets-Offline-Copy' }
        : {};
    await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
  });
}

async function expectInFirstViewport(page, locator, label) {
  await expect(locator, `${label} is visible`).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${label} has a box`).not.toBeNull();
  expect(box.y, `${label} top is on screen`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${label} bottom fits the first ${viewport.height}px`).toBeLessThanOrEqual(
    viewport.height
  );
}

async function expectNoHorizontalOverflow(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

const PHONES = [
  { name: 'tall phone 390x844', viewport: { width: 390, height: 844 } },
  { name: 'narrow phone 360x800', viewport: { width: 360, height: 800 } },
  { name: 'short phone 360x640', viewport: { width: 360, height: 640 } },
];

for (const phone of PHONES) {
  test.describe(phone.name, () => {
    test.use({ viewport: phone.viewport, isMobile: true, hasTouch: true });

    test('homepage shows the first headline, publisher, and source action without scrolling', async ({ page }) => {
      await mockApi(page);
      await page.goto('/index.html');
      const first = page.locator('#desk-latest .desk-story').first();
      await expect(first).toContainText(LONG_HEADLINE);

      await expectInFirstViewport(page, first.getByRole('link', { name: LONG_HEADLINE }), 'headline');
      await expectInFirstViewport(page, first.locator('.desk-story-source'), 'publisher');
      await expectInFirstViewport(page, first.getByRole('link', { name: /Read at The East African/ }), 'source action');
      await expectNoHorizontalOverflow(page);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });

    test('news page shows the first headline, publisher, and source action without scrolling', async ({ page }) => {
      await mockApi(page);
      await page.goto('/news.html');
      const first = page.locator('#news-grid .news-card').first();
      await expect(first).toContainText(LONG_HEADLINE);
      await expect(page.locator('.news-alert[data-alert="partial"]')).toBeVisible();

      await expectInFirstViewport(page, first.locator('.news-headline a'), 'headline');
      await expectInFirstViewport(page, first.locator('.news-source-name'), 'publisher');
      await expectInFirstViewport(page, first.locator('.news-read-link'), 'source action');
      await expect(page.locator('#news-sources-coverage')).not.toHaveAttribute('open', '');
      await expectNoHorizontalOverflow(page);
    });
  });
}

test.describe('news disclosures and warnings', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('Sources & coverage opens and closes by keyboard and keeps focus on its toggle', async ({ page }) => {
    await mockApi(page);
    await page.goto('/news.html');
    await expect(page.locator('#news-grid .news-card')).toHaveCount(6);

    const disclosure = page.locator('#news-sources-coverage');
    const toggle = disclosure.locator('summary');
    await expect(page.locator('#news-coverage-context')).toBeHidden();

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(page.locator('#news-coverage-context')).toBeVisible();
    await expect(page.locator('#news-source-count')).toHaveText('21 source endpoints in the live contract');
    await expect(page.getByRole('link', { name: 'Coverage & Evidence Observatory →' })).toBeVisible();
    await expect(toggle).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(toggle).toBeFocused();
    await expect(page.locator('#news-grid .news-card').first().locator('.news-read-link')).toBeVisible();
  });

  test('offline and partial-availability warnings stay visible while details are collapsed', async ({ page }) => {
    await mockApi(page, { offlineCopyAt: '2026-10-06T08:30:00.000Z' });
    await page.goto('/news.html');
    await expect(page.locator('#news-grid .news-card')).toHaveCount(6);

    await expect(page.locator('#news-sources-coverage')).not.toHaveAttribute('open', '');
    await expect(page.locator('.news-alert[data-alert="offline"]')).toBeVisible();
    await expect(page.locator('.news-alert[data-alert="offline"]')).toContainText('may be out of date');
    await expect(page.locator('.news-alert[data-alert="partial"]')).toContainText('2 of 21 sources failed');
    await expect(page.locator('#news-freshness')).toHaveText('saved copy');
  });

  test('live results state retrieval time and server-copy age, never story currency', async ({ page }) => {
    await mockApi(page);
    await page.goto('/news.html');
    await expect(page.locator('#news-status')).toHaveText('6 of 6 stories');
    await expect(page.locator('#news-freshness')).toHaveText(/^retrieved .+ · server copy up to 15 min old$/);
    await expect(page.locator('.news-alert[data-alert="offline"]')).toHaveCount(0);
  });
});

test.describe('labeled primary navigation', () => {
  test.use({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });

  test('destinations have visible labels and More works by keyboard', async ({ page }) => {
    await mockApi(page);
    await page.goto('/news.html');
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    for (const label of ['Today', 'News', 'Browse', 'More']) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'News' })).toHaveAttribute('aria-current', 'page');

    const more = nav.locator('details.nav-more');
    const toggle = more.locator('summary');
    await toggle.focus();
    await page.keyboard.press('Enter');
    const timeline = nav.getByRole('link', { name: 'Timeline' });
    await expect(timeline).toBeVisible();
    const box = await timeline.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(360);

    await page.keyboard.press('Escape');
    await expect(more).not.toHaveAttribute('open', '');
    await expect(toggle).toBeFocused();
    await expectNoHorizontalOverflow(page);
  });
});

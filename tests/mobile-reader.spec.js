const { test, expect } = require('@playwright/test');

const coverageFixture = {
  totalSources: 21,
  totalRegions: 7,
  subnationalReporting: { sourceCount: 2 },
  admission: { reviewedSources: 21, unresolvedRights: 3 },
  gaps: [
    { severity: 'high', title: 'Language diversity', action: 'Expand governed source coverage' },
    { severity: 'medium', title: 'Local reporting depth', action: 'Add reviewed local sources' },
    { severity: 'medium', title: 'Primary evidence density', action: 'Expand institutional evidence' },
  ],
};

const sourcesFixture = {
  sources: [
    {
      sourceId: 'reuters',
      name: 'Reuters',
      sourceClass: 'news-agency',
      evidenceRole: 'reporting',
      reviewedScope: 'global',
      operator: 'Thomson Reuters',
    },
  ],
};

const admissionFixture = {
  sources: [
    {
      sourceId: 'reuters',
      rightsState: 'unknown',
      reviewedAt: '2026-09-01',
      currentUse: 'headline-link',
    },
  ],
  summary: { reviewedSources: 21, unresolvedRights: 3 },
};

const healthFixture = {
  sourceHealth: Array.from({ length: 21 }, (_, index) => ({
    sourceId: index === 0 ? 'reuters' : `source-${index}`,
    healthy: index !== 20,
  })),
  checkedAt: new Date().toISOString(),
};

const newsFixture = {
  total: 3,
  items: [
    {
      id: 'mobile-1',
      title: 'Global leaders meet for climate talks',
      link: 'https://example.com/story-1',
      source: 'Reuters',
      sourceId: 'reuters',
      region: 'global',
      publishedAt: new Date().toISOString(),
      policy: { treatment: 'headline-link' },
    },
    {
      id: 'mobile-2',
      title: 'Regional infrastructure update',
      link: 'https://example.com/story-2',
      source: 'Reuters',
      sourceId: 'reuters',
      region: 'americas',
      publishedAt: new Date().toISOString(),
      policy: { treatment: 'headline-link' },
    },
    {
      id: 'mobile-3',
      title: 'Markets react to policy decision',
      link: 'https://example.com/story-3',
      source: 'Reuters',
      sourceId: 'reuters',
      region: 'europe',
      publishedAt: new Date().toISOString(),
      policy: { treatment: 'headline-link' },
    },
  ],
};

async function fulfillNewsApi(route) {
  const url = new URL(route.request().url());
  let fixture = newsFixture;
  if (url.pathname === '/api/news/coverage') fixture = coverageFixture;
  if (url.pathname === '/api/news/sources') fixture = sourcesFixture;
  if (url.pathname === '/api/news/admission') fixture = admissionFixture;
  if (url.pathname === '/api/news/health') fixture = healthFixture;

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture),
  });
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function expectPracticalTouchTarget(locator, minimum = 44) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(minimum);
  expect(box.height).toBeGreaterThanOrEqual(minimum);
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/news**', fulfillNewsApi);
});

test('mobile homepage fits, hydrates governed metrics, and keeps navigation reachable', async ({ page }) => {
  await page.goto('/index.html');

  await expect(page.getByRole('heading', { name: /The Earth,\s*Right Now\./i })).toBeVisible();
  await expect(page.locator('.dm-stat').filter({ hasText: 'Live Sources' })).toContainText('21');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('#globe-hero-container')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const ecosystemToggle = page.locator('.ecosystem-toggle');
  await expect(ecosystemToggle).toBeVisible();
  await expectPracticalTouchTarget(ecosystemToggle);
  await ecosystemToggle.click();
  await expect(page.locator('#ecosystem-dropdown')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const productNav = page.locator('header .primary-nav');
  const firstNavButton = productNav.locator('.nav-icon-btn').first();
  await expect(firstNavButton).toBeVisible();
  await expectPracticalTouchTarget(firstNavButton);
});

test('mobile news reader fits and keeps evidence controls usable', async ({ page }) => {
  await page.goto('/news.html');

  await expect(page.getByRole('heading', { name: /World News Feed/i })).toBeVisible();
  await expect(page.locator('#news-grid .news-card')).toHaveCount(3);
  await expect(page.locator('#news-coverage-context')).toBeVisible();
  await expect(page.locator('.news-source-context').first()).toBeAttached();
  await expectNoHorizontalOverflow(page);

  const tabs = page.locator('.region-tab');
  expect(await tabs.count()).toBeGreaterThan(1);
  await expect(tabs.first()).toBeVisible();
  await expectPracticalTouchTarget(tabs.first());

  const sourceContext = page.locator('.news-source-context').first();
  const sourceSummary = sourceContext.locator('summary');
  await expectPracticalTouchTarget(sourceSummary);
  await sourceSummary.click();
  await expect(sourceContext.locator('.news-source-context-body')).toBeVisible();

  const publisherLink = page.locator('.news-read-link').first();
  await expect(publisherLink).toBeVisible();
  await expectPracticalTouchTarget(publisherLink);

  await expectNoHorizontalOverflow(page);
});

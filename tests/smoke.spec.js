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

const dossierFixture = {
  dossierId: 'santa-ynez-pipeline',
  dossierVersion: '2026-09-03.1',
  reviewedAt: '2026-09-03',
  validation: { valid: true },
  integrity: { valid: true },
  sources: [
    {
      id: 'source:court',
      name: 'Federal court order',
      sourceClass: 'court-record',
      evidenceRole: 'primary-evidence',
      url: 'https://example.com/court',
    },
    {
      id: 'source:federal',
      name: 'Federal agency',
      sourceClass: 'institutional-statement',
      evidenceRole: 'official-position',
      url: 'https://example.com/federal',
    },
    {
      id: 'source:state',
      name: 'State agency',
      sourceClass: 'institutional-statement',
      evidenceRole: 'official-position',
      url: 'https://example.com/state',
    },
  ],
  entities: [
    { id: 'entity:court', displayName: 'Federal court' },
    { id: 'entity:federal', displayName: 'Federal agency' },
    { id: 'entity:state', displayName: 'State agency' },
  ],
  events: [
    { id: 'event:ruling', eventType: 'court-ruling', status: 'confirmed' },
    { id: 'event:correction', eventType: 'correction', status: 'confirmed' },
  ],
  claims: [
    {
      id: 'claim:ruling',
      proposition: 'The court imposed a penalty while declining pipeline shutdown.',
      type: 'fact-assertion',
      state: 'corroborated',
      originSourceId: 'source:court',
    },
    {
      id: 'claim:federal',
      proposition: 'The federal agency described its action as an energy-security measure.',
      type: 'official-position',
      state: 'disputed',
      originSourceId: 'source:federal',
    },
    {
      id: 'claim:state',
      proposition: 'The state challenged the federal authority asserted for the action.',
      type: 'official-position',
      state: 'disputed',
      originSourceId: 'source:state',
    },
    {
      id: 'claim:appeal',
      proposition: 'A subsequent filing reported notices of appeal.',
      type: 'fact-assertion',
      state: 'single-source',
      originSourceId: 'source:court',
    },
  ],
  evidence: [
    {
      id: 'evidence:ruling',
      issuerEntityId: 'entity:court',
      evidenceKey: 'court-order',
      documentType: 'judgment',
      publishedAt: '2026-08-19',
      canonicalRef: 'https://example.com/court',
    },
    {
      id: 'evidence:correction',
      issuerEntityId: 'entity:federal',
      evidenceKey: 'correction',
      documentType: 'government-release',
      publishedAt: '2026-09-03',
      canonicalRef: 'https://example.com/correction',
    },
  ],
  claimRelations: [
    { claimId: 'claim:federal', relatedClaimId: 'claim:state', relation: 'contradicts' },
  ],
  timeline: [
    {
      date: '2026-08-19',
      eventId: 'event:ruling',
      label: 'Federal court issues mixed order',
      claimIds: ['claim:ruling'],
      evidenceIds: ['evidence:ruling'],
    },
    {
      date: '2026-09-03',
      eventId: 'event:correction',
      label: 'Agency corrects mistaken release',
      claimIds: [],
      evidenceIds: ['evidence:correction'],
    },
  ],
  corrections: [
    {
      id: 'correction:doj:2026-09-03',
      observedAt: '2026-09-03',
      issuerEntityId: 'entity:federal',
      evidenceIds: ['evidence:correction'],
      description: 'The agency states that an earlier release mistakenly reprinted a prior item.',
      originalArtifactRetained: false,
    },
  ],
  unknowns: ['The final appellate outcome remains unresolved.'],
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

  await page.route('**/api/intelligence/dossiers/santa-ynez-pipeline', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dossierFixture),
    });
  });
});

test('homepage loads the primary GlobalDeets surface', async ({ page }) => {
  await page.goto('/index.html');

  await expect(page).toHaveTitle(/GlobalDeets/i);
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

test('Santa Ynez dossier renders an integrity-valid evidence interface on desktop', async ({ page }) => {
  await page.goto('/dossiers/santa-ynez-pipeline/');

  await expect(page.getByRole('heading', { name: /Santa Ynez Pipeline/i })).toBeVisible();
  await expect(page.locator('body[data-dossier-ready="true"]')).toBeVisible();
  await expect(page.getByText('Graph integrity validated')).toBeVisible();
  await expect(page.locator('#established-claims .claim-card')).toHaveCount(1);
  await expect(page.locator('#conflict-list .conflict-card')).toHaveCount(1);
  await expect(page.getByText(/mistakenly reprinted a prior item/i)).toBeVisible();
  await expect(page.locator('#timeline-list .timeline-item')).toHaveCount(2);
  await expect(page.locator('#dossier-error')).toBeHidden();
});

test.describe('Santa Ynez dossier mobile surface', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('remains readable without horizontal overflow', async ({ page }) => {
    await page.goto('/dossiers/santa-ynez-pipeline/');

    await expect(page.locator('body[data-dossier-ready="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: /What remains unresolved/i })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });
});

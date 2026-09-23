const { expect, test } = require('@playwright/test');

const fixture = {
  generatedAt: '2026-09-23T00:00:00.000Z',
  observatoryId: 'mission-control',
  observatoryVersion: '2026-09-23.1',
  rules: {
    compositeHealthScore: false,
    uptimeSlaGuarantee: false,
    automaticRemediation: false,
    automaticSeverityInference: false,
    liveProbeIsFullDiagnosis: false,
    curatedGapImpliesActiveWork: false,
  },
  sites: [
    {
      id: 'globaldeets',
      name: 'GlobalDeets',
      domain: 'globaldeets.com',
      url: 'https://globaldeets.com/',
      role: 'flagship',
      probe: { reachable: true, httpStatus: 200, latencyMs: 80, checkedAt: '2026-09-23T00:00:00.000Z', error: null },
    },
    {
      id: 'culturesherpa',
      name: 'Culture Sherpa',
      domain: 'culturesherpa.org',
      url: 'https://culturesherpa.org/',
      role: 'sibling',
      probe: { reachable: true, httpStatus: 200, latencyMs: 140, checkedAt: '2026-09-23T00:00:00.000Z', error: null },
    },
    {
      id: 'aiaimate',
      name: 'aiaimate',
      domain: 'aiaimate.com',
      url: 'https://aiaimate.com/',
      role: 'sibling',
      probe: {
        reachable: false,
        httpStatus: null,
        latencyMs: 6000,
        checkedAt: '2026-09-23T00:00:00.000Z',
        error: 'Timed out after 6000ms',
      },
    },
    {
      id: 'goodflippinvibes',
      name: 'Good Flippin Vibes',
      domain: 'goodflippinvibes.com',
      url: 'https://goodflippinvibes.com/',
      role: 'sibling',
      probe: { reachable: true, httpStatus: 200, latencyMs: 95, checkedAt: '2026-09-23T00:00:00.000Z', error: null },
    },
    {
      id: 'citizenapproved',
      name: 'Citizen Approved',
      domain: 'citizenapproved.org',
      url: 'https://citizenapproved.org/',
      role: 'sibling',
      probe: { reachable: true, httpStatus: 200, latencyMs: 110, checkedAt: '2026-09-23T00:00:00.000Z', error: null },
    },
  ],
  siteHealthSummary: { totalSites: 5, sitesProbed: 5, sitesReachable: 4, sitesUnreachable: 1 },
  gapSummary: {
    totalGaps: 6,
    openGaps: 5,
    resolvedGaps: 1,
    bySeverity: { critical: 0, high: 2, medium: 3, low: 0 },
    byCategory: { trust: 1, business: 3, operability: 1, engineering: 0, security: 0 },
    bySite: { 'globaldeets.com': 2, portfolio: 2, 'aiaimate.com': 1 },
  },
  gaps: [
    {
      id: 'root-docs-contradict-production',
      site: 'globaldeets.com',
      category: 'trust',
      severity: 'high',
      title: 'Root documentation describes a product that no longer exists',
      observedState: 'README.md and STATUS.md describe a retired product era.',
      targetState: 'Root docs describe the current product truthfully.',
      nextAction: 'Rewrite README.md and STATUS.md against current production.',
      detectedAt: '2026-09-23',
      status: 'open',
      origin: 'curated',
    },
    {
      id: 'live-probe:aiaimate:unreachable',
      site: 'aiaimate.com',
      category: 'operability',
      severity: 'high',
      title: 'aiaimate did not respond to a live health probe',
      observedState: 'Timed out after 6000ms',
      targetState: 'aiaimate responds with a successful status within the probe timeout.',
      nextAction: 'Check hosting/DNS/TLS for this domain directly.',
      detectedAt: '2026-09-23T00:00:00.000Z',
      status: 'open',
      origin: 'live-probe',
    },
    {
      id: 'ecosystem-site-visibility-gap',
      site: 'portfolio',
      category: 'operability',
      severity: 'medium',
      title: 'Sibling ecosystem sites had no shared operational visibility before Mission Control',
      observedState: 'No shared monitoring existed.',
      targetState: 'Live reachability is visible in one place.',
      nextAction: 'Resolved by this surface.',
      detectedAt: '2026-09-23',
      status: 'resolved',
      origin: 'curated',
    },
  ],
  integrity: { valid: true, structureErrors: [], semanticErrors: [], invalidGaps: [], duplicateIds: [] },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/ops/mission-control', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
  });
});

test('mission control renders live site health and a sortable, filterable gap table', async ({ page }) => {
  await page.goto('/mission-control/');

  await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible();
  await expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();
  await expect(page.getByText('Integrity validated')).toBeVisible();
  await expect(page.locator('#sites-reachable')).toHaveText('4 / 5');
  await expect(page.locator('.site-card')).toHaveCount(5);
  await expect(page.locator('.status-dot[data-status="down"]')).toHaveCount(1);

  const initialRows = page.locator('#gap-table-body tr');
  await expect(initialRows).toHaveCount(2); // default filter is status=open, one gap above is resolved
  await expect(page.getByText('2 of 3 gaps shown')).toBeVisible();

  await page.selectOption('#filter-status', 'all');
  await expect(page.locator('#gap-table-body tr')).toHaveCount(3);

  await page.selectOption('#filter-severity', 'high');
  await expect(page.locator('#gap-table-body tr')).toHaveCount(2);

  await page.fill('#filter-search', 'aiaimate');
  await expect(page.locator('#gap-table-body tr')).toHaveCount(1);
  await expect(page.locator('#gap-table-body')).toContainText('did not respond to a live health probe');

  await page.fill('#filter-search', '');
  await page.selectOption('#filter-severity', 'all');
  await page.selectOption('#filter-status', 'all');
  await page.click('.gap-table thead th[data-sort-key="site"]');
  await expect(page.locator('.gap-table thead th[data-sort-key="site"]')).toHaveAttribute('aria-sort', 'ascending');

  await expect(page.locator('#mc-error')).toBeHidden();
});

test.describe('mission control mobile surface', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('remains readable without horizontal overflow', async ({ page }) => {
    await page.goto('/mission-control/');
    await expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sortable, filterable gap list' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });
});

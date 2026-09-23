const { expect, test } = require('@playwright/test');

const coverageFixture = {
  observatoryId: 'coverage-evidence',
  integrity: { valid: true, localReporting: { valid: true } },
  newsCoverage: { totalSources: 21 },
  evidenceCoverage: { dossierCount: 1 },
  gaps: [{ id: 'coverage:fixture', severity: 'high' }],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/intelligence/observatory/coverage', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(coverageFixture),
    });
  });
});

test('Mission Control renders investor-safe evidence and a prioritized gap queue', async ({ page }) => {
  await page.goto('/observatory/mission-control/');

  await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible();
  await expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();
  await expect(page.getByText('25', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('21/25', { exact: true })).toBeVisible();
  await expect(page.getByText('Certify human audience metrics')).toBeVisible();
  await expect(page.getByText(/Do not pitch 36,391 raw edge visits as audience/)).toBeVisible();
  await expect(page.getByText('Investor-safe audience metric')).toBeVisible();
  await expect(page.getByText('Not yet certified')).toBeVisible();
  await expect(page.getByText('Live news sources')).toBeVisible();
  await expect(page.getByText('Published governed evidence')).toBeVisible();
  await expect(page.locator('#mission-control-error')).toBeHidden();
});

test('Mission Control filters gaps by severity without losing priority semantics', async ({ page }) => {
  await page.goto('/observatory/mission-control/');
  await expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();

  await page.locator('#severity-filter').selectOption('critical');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(1);
  await expect(page.getByText('Certify human audience metrics')).toBeVisible();
  await expect(page.getByText('Priority 1 · Open')).toBeVisible();

  await page.locator('#severity-filter').selectOption('high');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(3);
  await expect(page.getByText('Close estate browser-observability gaps')).toBeVisible();
  await expect(page.getByText('Replace stale portfolio-era narrative')).toBeVisible();
  await expect(page.getByText('Instrument business conversion events')).toBeVisible();
});

test.describe('Mission Control mobile surface', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('remains readable without horizontal overflow', async ({ page }) => {
    await page.goto('/observatory/mission-control/');
    await expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gaps, risks, and opportunities' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });
});

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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(coverageFixture) });
  });
});

test('Mission Control renders investor-safe evidence, visuals, and business interpretation', async ({ page }) => {
  await page.goto('/observatory/mission-control/');
  await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible();
  await expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();
  await expect(page.locator('#investor-grid').getByText('21/25', { exact: true })).toBeVisible();
  await expect(page.getByText('A governed world-information layer is already live')).toBeVisible();
  await expect(page.getByText('Certify human audience metrics')).toBeVisible();
  await expect(page.getByText(/Raw edge visits cannot be presented as audience/)).toBeVisible();
  await expect(page.getByText('Investor-safe audience', { exact: true })).toBeVisible();
  await expect(page.getByText('Not yet certified')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open work by severity' })).toBeVisible();
  await expect(page.locator('#mission-control-error')).toBeHidden();
});

test('Mission Control filters and searches the operating queue', async ({ page }) => {
  await page.goto('/observatory/mission-control/');
  await expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();

  await page.locator('#severity-filter').selectOption('critical');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(1);
  await expect(page.getByText('Certify human audience metrics')).toBeVisible();

  await page.locator('#severity-filter').selectOption('all');
  await page.locator('#gap-search').fill('Culture Sherpa');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(1);
  await expect(page.getByText('Quantify Culture Sherpa convergence opportunity')).toBeVisible();

  await page.locator('#gap-search').fill('');
  await page.locator('#status-filter').selectOption('in-progress');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(3);
});

test.describe('Mission Control mobile surface', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('remains readable without horizontal overflow', async ({ page }) => {
    await page.goto('/observatory/mission-control/');
    await expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gaps, risks, and opportunities' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });
});

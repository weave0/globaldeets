const { test, expect } = require('@playwright/test');

async function expectNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(overflow.scrollWidth, `${label} document overflow`).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.bodyScrollWidth, `${label} body overflow`).toBeLessThanOrEqual(overflow.viewport + 1);
}

async function expectTouchTarget(locator, label, minimum = 44) {
  await expect(locator, `${label} exists`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} has a box`).not.toBeNull();
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(minimum);
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(minimum);
}

async function openAndCheck(page, path, visibleSelector, label) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(visibleSelector).first(), `${label} core content`).toBeVisible();
  await page.waitForTimeout(250);
  await expectNoHorizontalOverflow(page, label);
}

test('globe remains usable at phone widths', async ({ page }) => {
  await openAndCheck(page, '/globe.html', '#globe-hero-container', 'globe');
  await expectTouchTarget(page.locator('.ecosystem-toggle'), 'globe ecosystem menu');
  await expectTouchTarget(page.locator('header .nav-icon-btn').first(), 'globe primary nav');
  await expectTouchTarget(page.locator('.globe-filter-btn').first(), 'globe region filter');
  await expect(page.locator('.globe-filter-bar')).toBeVisible();
});

test('knowledge directory keeps filters and source content readable', async ({ page }) => {
  await openAndCheck(page, '/knowledge.html', '.knowledge-hero', 'knowledge');
  await expectTouchTarget(page.locator('.ecosystem-toggle'), 'knowledge ecosystem menu');
  await expectTouchTarget(page.locator('header .nav-icon-btn').first(), 'knowledge primary nav');
  await expectTouchTarget(page.locator('.knowledge-filter-pill').first(), 'knowledge category filter');
  await expect(page.locator('.knowledge-grid')).toBeVisible();
});

test('world map keeps exploration controls reachable', async ({ page }) => {
  await openAndCheck(page, '/worldmap.html', '#main-content', 'world map');
  await expectTouchTarget(page.locator('.ecosystem-toggle'), 'world map ecosystem menu');
  await expectTouchTarget(page.locator('#view-toggle'), 'world map view toggle');
  await expectTouchTarget(page.locator('#panel-toggle'), 'world map panel toggle');
  await expectTouchTarget(page.locator('#location-search'), 'world map location search');
});

test('timeline collapses cleanly to a single mobile reading lane', async ({ page }) => {
  await openAndCheck(page, '/timeline.html', '.timeline-container', 'timeline');
  await expectTouchTarget(page.locator('header .nav-icon-btn').first(), 'timeline primary nav');
  await expect(page.locator('.timeline-item').first()).toBeVisible();
});

test('coverage observatory remains readable without clipping', async ({ page }) => {
  await openAndCheck(page, '/observatory/coverage/', '.observatory-shell', 'coverage observatory');
  await expect(page.getByRole('heading', { name: 'Coverage & Evidence Observatory' })).toBeVisible();
  await expect(page.locator('.contract-strip')).toBeVisible();
  await expect(page.locator('.metric-grid')).toBeAttached();
});

test('evidence dossier remains readable and navigable on phones', async ({ page }) => {
  await openAndCheck(page, '/dossiers/santa-ynez-pipeline/', '#dossier-app', 'evidence dossier');
  await expect(page.getByRole('heading', { name: /Santa Ynez Pipeline/i })).toBeVisible();
  await expectTouchTarget(page.locator('.dossier-nav a').first(), 'dossier navigation');
  await expectTouchTarget(page.locator('.source-details summary'), 'dossier source disclosure');
  await expect(page.locator('.stat-grid')).toBeVisible();
});

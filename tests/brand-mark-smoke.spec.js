const { expect, test } = require('@playwright/test');

test('canonical GD moon mark replaces legacy header assets without clipping', async ({ page }) => {
  await page.goto('/');

  const primaryMark = page.locator('.site-logo-mark').first();
  await expect(primaryMark).toHaveAttribute('data-brand-mark', 'gd-moon');
  await expect(primaryMark).toHaveAttribute('src', '/assets/logo-mark.svg');

  const primaryBox = await primaryMark.boundingBox();
  expect(primaryBox).not.toBeNull();
  expect(Math.abs(primaryBox.width - primaryBox.height)).toBeLessThanOrEqual(1);

  const ecosystemMark = page.locator('.ecosystem-logo').first();
  await expect(ecosystemMark).toHaveAttribute('data-brand-mark', 'gd-moon');
  const ecosystemBox = await ecosystemMark.boundingBox();
  expect(ecosystemBox).not.toBeNull();
  expect(Math.abs(ecosystemBox.width - ecosystemBox.height)).toBeLessThanOrEqual(1);
});

test('desktop navigation chrome is compact, stacked, and non-overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const ecosystem = await page.locator('.gfd-ecosystem-nav').boundingBox();
  const productHeader = await page.locator('header').first().boundingBox();
  const productButton = await page.locator('header .nav-icon-btn').first().boundingBox();

  expect(ecosystem).not.toBeNull();
  expect(productHeader).not.toBeNull();
  expect(productButton).not.toBeNull();
  expect(ecosystem.height).toBeLessThanOrEqual(48);
  expect(productHeader.y).toBeGreaterThanOrEqual(ecosystem.y + ecosystem.height - 1);
  expect(productHeader.height).toBeLessThanOrEqual(62);
  expect(productButton.width).toBeLessThanOrEqual(44);
  expect(productButton.height).toBeLessThanOrEqual(44);
  expect(productHeader.y + productHeader.height).toBeLessThanOrEqual(112);
});

test('ecosystem menu opens as a compact anchored popover instead of a full-width tray', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('.ecosystem-toggle').click();

  const dropdown = page.locator('.ecosystem-dropdown');
  await expect(dropdown).toHaveClass(/active/);
  const box = await dropdown.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeLessThanOrEqual(740);
  expect(box.x).toBeGreaterThan(600);
  expect(box.x + box.width).toBeLessThanOrEqual(1440);
});

test.describe('canonical GD moon mark on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('remains fully contained at compact navigation size', async ({ page }) => {
    await page.goto('/');
    const mark = page.locator('.ecosystem-logo').first();
    await expect(mark).toHaveAttribute('src', '/assets/logo-mark.svg');
    const box = await mark.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeLessThanOrEqual(23);
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
  });

  test('keeps both navigation layers compact without hiding product controls', async ({ page }) => {
    await page.goto('/');
    const ecosystem = await page.locator('.gfd-ecosystem-nav').boundingBox();
    const productHeader = await page.locator('header').first().boundingBox();
    const productButton = await page.locator('header .nav-icon-btn').first().boundingBox();

    expect(ecosystem).not.toBeNull();
    expect(productHeader).not.toBeNull();
    expect(productButton).not.toBeNull();
    expect(ecosystem.height).toBeLessThanOrEqual(46);
    expect(productHeader.y).toBeGreaterThanOrEqual(ecosystem.y + ecosystem.height - 1);
    expect(productHeader.height).toBeLessThanOrEqual(50);
    expect(productButton.width).toBeLessThanOrEqual(38);
    expect(productButton.height).toBeLessThanOrEqual(38);
  });
});

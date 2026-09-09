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

test.describe('canonical GD moon mark on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('remains fully contained at compact navigation size', async ({ page }) => {
    await page.goto('/');
    const mark = page.locator('.ecosystem-logo').first();
    await expect(mark).toHaveAttribute('src', '/assets/logo-mark.svg');
    const box = await mark.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeLessThanOrEqual(25);
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
  });
});

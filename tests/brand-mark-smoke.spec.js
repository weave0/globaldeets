const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('GlobalDeets product logo mark renders with transparent artwork', async ({ page }) => {
  await page.goto('/');
  const mark = page.locator('.site-logo-mark').first();
  await expect(mark).toBeVisible();
  const box = await mark.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
});

test('retired GFD ecosystem navigation no longer renders on the public page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.gfd-ecosystem-nav')).toHaveCount(0);
  await expect(page.locator('.ecosystem-toggle')).toHaveCount(0);
  await expect(page.locator('.ecosystem-logo')).toHaveCount(0);
  await expect(page.locator('#ecosystem-dropdown')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});

test('web app manifest prefers the scalable transparent mark while retaining maskable fallbacks', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')
  );
  expect(manifest.icons[0].src).toContain('logo-mark.svg');
  expect(manifest.icons.some(icon => icon.purpose?.includes('maskable'))).toBeTruthy();
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('retired ecosystem navigation stays absent and primary nav remains touch-usable', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.gfd-ecosystem-nav')).toHaveCount(0);
    await expect(page.locator('.ecosystem-toggle')).toHaveCount(0);

    const productHeader = await page.locator('header').first().boundingBox();
    const productButton = await page.locator('header .nav-icon-btn').first().boundingBox();
    expect(productHeader).not.toBeNull();
    expect(productButton).not.toBeNull();
    expect(productButton.width).toBeGreaterThanOrEqual(44);
    expect(productButton.height).toBeGreaterThanOrEqual(44);
  });
});

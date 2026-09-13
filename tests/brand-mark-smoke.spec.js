const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('canonical GlobalDeets mark is transparent square artwork', async ({ page }) => {
  await page.goto('/');
  const mark = page.locator('.site-logo-mark').first();
  await expect(mark).toBeVisible();
  const box = await mark.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
});

test('shared navigation uses the canonical compact square mark', async ({ page }) => {
  await page.goto('/');
  const ecosystemLogo = page.locator('.ecosystem-logo').first();
  await expect(ecosystemLogo).toHaveAttribute('src', '/assets/logo-mark.svg');
  const box = await ecosystemLogo.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
});

test('shared navigation stays compact and stacks product navigation below the ecosystem strip', async ({ page }) => {
  await page.goto('/');
  const ecosystem = await page.locator('.gfd-ecosystem-nav').boundingBox();
  const productHeader = await page.locator('header').first().boundingBox();
  expect(ecosystem).not.toBeNull();
  expect(productHeader).not.toBeNull();
  expect(productHeader.y).toBeGreaterThanOrEqual(ecosystem.y + ecosystem.height - 1);
});

test('web app manifest prefers the scalable transparent mark while retaining maskable fallbacks', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')
  );
  expect(manifest.icons[0].src).toContain('logo-mark.svg');
  expect(manifest.icons.some(icon => icon.purpose?.includes('maskable'))).toBeTruthy();
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

  test('keeps both navigation layers compact while preserving mobile touch targets', async ({ page }) => {
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
    expect(productButton.width).toBeGreaterThanOrEqual(44);
    expect(productButton.height).toBeGreaterThanOrEqual(44);
    expect(productButton.width).toBeLessThanOrEqual(46);
    expect(productButton.height).toBeLessThanOrEqual(46);
  });
});
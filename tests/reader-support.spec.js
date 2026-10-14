const { test, expect } = require('@playwright/test');

const FUNDRAISER = 'https://gofund.me/3f0dfec7a';

test('the home desk leads with news and offers a distinct, non-blocking fundraiser', async ({ page }) => {
  await page.goto('/index.html');
  const desk = page.locator('#world-desk');
  const appeal = page.locator('.reader-support-appeal');
  await expect(desk.getByRole('heading', { name: 'World Desk' })).toBeVisible();
  await expect(appeal.getByRole('heading', { name: 'Help keep GlobalDeets online.' })).toBeVisible();
  await expect(appeal.getByRole('link', { name: /Contribute on GoFundMe/ })).toHaveAttribute('href', FUNDRAISER);
  await expect(appeal.getByRole('link', { name: /Contribute on GoFundMe/ })).toHaveAttribute('target', '_blank');
  await expect(appeal.getByRole('link', { name: /Contribute on GoFundMe/ })).toHaveAttribute('rel', /noopener noreferrer/);
  await expect(appeal.getByRole('link', { name: "Why we're asking" })).toHaveAttribute('href', 'donate.html');
  expect(await desk.evaluate((node, other) => Boolean(node.compareDocumentPosition(document.querySelector(other)) & Node.DOCUMENT_POSITION_FOLLOWING), '.reader-support-appeal')).toBe(true);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Support GlobalDeets' })).toHaveAttribute('href', 'donate.html');
});

test('support page replaces obsolete no-donation warning and links to the supplied GoFundMe', async ({ page }) => {
  await page.goto('/donate.html');
  await expect(page.getByRole('heading', { name: 'Help keep GlobalDeets online.', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Contribute on GoFundMe/ })).toHaveAttribute('href', FUNDRAISER);
  await expect(page.getByText('Contributions are processed through GoFundMe, not GlobalDeets.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Donations are not being accepted');
  await expect(page.getByText('Supporting GlobalDeets does not buy placement', { exact: false })).toBeVisible();
});

test('reader support surfaces do not cause mobile horizontal overflow', async ({ page }) => {
  for (const width of [285, 320, 360, 390]) {
    await page.setViewportSize({ width, height: 640 });
    for (const route of ['/index.html', '/news.html', '/donate.html']) {
      await page.goto(route);
      const { scroll, viewport } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(scroll, `${width}px ${route} overflow`).toBeLessThanOrEqual(viewport + 1);
      await expect(page.locator('body')).toHaveClass(/gd-editorial/);
    }
  }
});

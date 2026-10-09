const { expect, test } = require('@playwright/test');

// GD-039 is a reader presentation pass, not an alternate source-admission or evidence model.
// These checks deliberately avoid invented story fixtures or newsroom-ranking claims.

test('the home reader leads with reporting, with the immersive globe below it', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveClass(/gd-editorial/);
  await expect(page.getByRole('heading', { name: 'World Desk', level: 1 })).toBeVisible();
  const order = await page.evaluate(() => {
    const desk = document.querySelector('#world-desk');
    const globe = document.querySelector('.globe-hero-section');
    const container = document.querySelector('main#main-content');
    return {
      globeInMain: container.contains(globe),
      globeAfterDesk: Boolean(desk.compareDocumentPosition(globe) & Node.DOCUMENT_POSITION_FOLLOWING),
      background: window.getComputedStyle(document.body).backgroundColor,
      loadedStyles: [...document.styleSheets].some(sheet => sheet.href?.endsWith('/editorial-reader.css')),
    };
  });
  expect(order.globeInMain).toBe(true);
  expect(order.globeAfterDesk).toBe(true);
  expect(order.background).toBe('rgb(247, 245, 239)');
  expect(order.loadedStyles).toBe(true);
});

test('the editorial masthead makes Evidence discoverable without hiding provenance in the menu', async ({ page }) => {
  await page.goto('/news.html');
  await expect(page.getByRole('heading', { name: 'Latest reporting', level: 1 })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  for (const label of ['Today', 'News', 'Browse', 'More']) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Evidence', exact: true }))
    .toHaveAttribute('href', '/observatory/coverage/');
  await expect(page.locator('#news-sources-coverage summary')).toContainText('Sources & coverage');
  await expect(page.locator('#region-tabs')).toBeVisible();
  await expect(page.locator('#news-search')).toHaveAttribute('placeholder', 'Filter loaded stories');
});

test('the editorial masthead has no horizontal overflow at reader phone widths', async ({ page }) => {
  for (const width of [390, 360, 320, 285]) {
    await page.setViewportSize({ width, height: 640 });
    for (const path of ['/index.html', '/news.html', '/categories.html', '/timeline.html']) {
      await page.goto(path);
      await expect(page.locator('body')).toHaveClass(/gd-editorial/);
      const snapshot = await page.evaluate(() => {
        const more = document.querySelector('details.nav-more summary').getBoundingClientRect();
        const nav = document.querySelector('header .primary-nav').getBoundingClientRect();
        return {
          scroll: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
          moreRight: more.right,
          moreWidth: more.width,
          moreHeight: more.height,
          navTop: nav.top,
        };
      });
      expect(snapshot.scroll, `${width}px ${path} overflow`).toBeLessThanOrEqual(width + 1);
      expect(snapshot.moreRight, `${width}px ${path} More boundary`).toBeLessThanOrEqual(width);
      expect(snapshot.moreWidth).toBeGreaterThanOrEqual(44);
      expect(snapshot.moreHeight).toBeGreaterThanOrEqual(44);
    }
  }
});

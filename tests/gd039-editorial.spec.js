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
  expect(order.background).toBe('rgb(11, 17, 26)');
  expect(order.loadedStyles).toBe(true);
});

test('midnight reader contrast and masthead density hold on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/index.html', '/news.html']) {
    await page.goto(path);
    const appearance = await page.evaluate(() => {
      const rgb = str => (str.match(/[0-9.]+/g) || []).slice(0, 3).map(Number);
      const luminance = parts => {
        const channels = parts.map(n => {
          const s = n / 255;
          return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        });
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      const contrast = (a, b) => {
        const left = luminance(rgb(a));
        const right = luminance(rgb(b));
        return (Math.max(left, right) + .05) / (Math.min(left, right) + .05);
      };
      const body = window.getComputedStyle(document.body);
      const title = window.getComputedStyle(document.querySelector(location.pathname.includes('news') ? '.news-page-title' : '.desk-title'));
      const nav = window.getComputedStyle(document.querySelector('.primary-nav .nav-item'));
      const input = location.pathname.includes('news') ? document.querySelector('.news-search-input') : null;
      return {
        background: body.backgroundColor,
        textContrast: contrast(body.color, body.backgroundColor),
        titleContrast: contrast(title.color, body.backgroundColor),
        navContrast: contrast(nav.color, body.backgroundColor),
        inputContrast: input ? contrast(window.getComputedStyle(input).color, window.getComputedStyle(input).backgroundColor) : null,
        headerHeight: document.querySelector('body > header').getBoundingClientRect().height,
      };
    });
    expect(appearance.background).toBe('rgb(11, 17, 26)');
    expect(appearance.textContrast).toBeGreaterThanOrEqual(4.5);
    expect(appearance.titleContrast).toBeGreaterThanOrEqual(4.5);
    expect(appearance.navContrast).toBeGreaterThanOrEqual(4.5);
    if (appearance.inputContrast !== null) expect(appearance.inputContrast).toBeGreaterThanOrEqual(4.5);
    expect(appearance.headerHeight).toBeLessThan(120);
  }
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
          culprits: [...document.querySelectorAll('body *')]
            .map(el => {
              const rect = el.getBoundingClientRect();
              return { tag: el.tagName, cls: (el.className?.baseVal || el.className || '').toString().slice(0, 75),
                right: Math.round(rect.right), width: Math.round(rect.width) };
            })
            .filter(item => item.right > document.documentElement.clientWidth + 1 && item.width > 0)
            .sort((a, b) => b.right - a.right)
            .slice(0, 7),
        };
      });
      expect(snapshot.scroll, `${width}px ${path} overflow: ${JSON.stringify(snapshot.culprits)}`).toBeLessThanOrEqual(width + 1);
      expect(snapshot.moreRight, `${width}px ${path} More boundary: ${JSON.stringify(snapshot.culprits)}`).toBeLessThanOrEqual(width);
      expect(snapshot.moreWidth).toBeGreaterThanOrEqual(44);
      expect(snapshot.moreHeight).toBeGreaterThanOrEqual(44);
    }
  }
});

test('the homepage chronological escape link has an accessible editorial color', async ({ page }) => {
  await page.goto('/index.html');
  const link = page.getByRole('link', { name: 'See newest first' });
  await expect(link).toHaveAttribute('href', 'news.html');
  const color = await link.evaluate(element => window.getComputedStyle(element).color);
  expect(color).toBe('rgb(124, 214, 211)');
});

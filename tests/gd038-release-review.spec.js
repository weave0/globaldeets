/* global getComputedStyle */
const { expect, test } = require('@playwright/test');

// Regressions for the PR #80 release review: local-calendar dates across DST, a dateline whose
// machine-readable and visible dates agree, honest globe pin labels, and a readable recovery note.

const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

function story(id, published, extra = {}) {
  return {
    id,
    source: 'Fixture Wire',
    sourceId: 'fixture-wire',
    headline: `Story ${id}`,
    sourceUrl: `https://example.com/${id}`,
    region: 'americas',
    published,
    displayMode: 'headline-link',
    ...extra,
  };
}

async function routeFeed(page, items) {
  await page.route('**/api/news**', route => {
    const { pathname } = new URL(route.request().url());
    return route.fulfill(json(pathname === '/api/news' ? { total: items.length, items } : {}));
  });
}

test.describe('local calendar dates (America/Chicago)', () => {
  test.use({ timezoneId: 'America/Chicago' });

  const cases = [
    {
      name: 'spring forward: just after midnight on the day after the 23-hour day',
      now: '2026-03-09T05:30:00Z', // 2026-03-09 00:30 CDT
      yesterdayStory: '2026-03-08T17:00:00Z', // 2026-03-08 12:00 CDT
      olderStory: '2026-03-07T18:00:00Z', // 2026-03-07 12:00 CST
      olderLabel: 'Saturday, March 7',
    },
    {
      name: 'fall back: late on the 25-hour day',
      now: '2026-11-02T05:30:00Z', // 2026-11-01 23:30 CST
      yesterdayStory: '2026-10-31T17:00:00Z', // 2026-10-31 12:00 CDT
      olderStory: '2026-10-30T17:00:00Z', // 2026-10-30 12:00 CDT
      olderLabel: 'Friday, October 30',
    },
  ];

  for (const c of cases) {
    test(`timeline "Yesterday" uses the local calendar — ${c.name}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(c.now));
      await routeFeed(page, [
        story('today', new Date(new Date(c.now).getTime() - 10 * 60_000).toISOString()),
        story('yesterday', c.yesterdayStory),
        story('older', c.olderStory),
      ]);
      await page.goto('/timeline.html');
      const days = page.locator('.timeline-item .timeline-day');
      await expect(days).toHaveText(['Today', 'Yesterday', c.olderLabel]);
      await expect(page.locator('.timeline-item').nth(1)).toContainText('Story yesterday');
    });
  }

  test('homepage dateline: machine-readable and visible date agree in the evening', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-07T00:30:00Z')); // 2026-10-06 19:30 CDT
    await routeFeed(page, [story('a', '2026-10-06T23:00:00Z')]);
    await page.goto('/index.html');
    const dateline = page.locator('#desk-date');
    await expect(dateline).toHaveText('Tuesday, October 6, 2026');
    await expect(dateline).toHaveAttribute('datetime', '2026-10-06');
  });

  test('homepage dateline: just after local midnight rolls to the new local day', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-07T05:05:00Z')); // 2026-10-07 00:05 CDT
    await routeFeed(page, [story('a', '2026-10-07T05:00:00Z')]);
    await page.goto('/index.html');
    const dateline = page.locator('#desk-date');
    await expect(dateline).toHaveText('Wednesday, October 7, 2026');
    await expect(dateline).toHaveAttribute('datetime', '2026-10-07');
  });
});

test('globe pins carry an explicit, honest location kind', async ({ page }) => {
  await routeFeed(page, []);
  await page.goto('/globe.html');
  await page.waitForFunction(() => window.GlobalDeetsGlobe);
  const results = await page.evaluate(() => {
    const { assignCoords, pinLocationLabel } = window.GlobalDeetsGlobe;
    const fixed = () => 0.5; // no jitter: inspect the base placement
    return [
      { source: 'BBC World', region: 'europe' },
      { source: 'Minnesota Reformer', region: 'americas' },
      { source: 'CalMatters', region: 'americas' },
      { source: 'Unknown Gazette', region: undefined },
    ].map(item => {
      const pin = { ...item, ...assignCoords(item, fixed) };
      return { source: item.source, kind: pin.locationKind, lat: pin.lat, lng: pin.lng, label: pinLocationLabel(pin) };
    });
  });

  const [bbc, reformer, calmatters, unknown] = results;
  expect(bbc.kind).toBe('publisher-approximate');
  expect([bbc.lat, bbc.lng]).toEqual([51.5, -0.12]);
  expect(bbc.label).toContain('approximate');

  for (const pin of [reformer, calmatters]) {
    expect(pin.kind, `${pin.source} has no invented coordinates`).toBe('region-fallback');
    expect([pin.lat, pin.lng]).toEqual([10, -80]);
    expect(pin.label).toContain('publisher location not mapped');
    expect(pin.label).toContain('Americas');
  }
  expect(unknown.kind).toBe('region-fallback');
  expect(unknown.label).toContain('general global feed position');

  for (const pin of results) {
    expect(pin.label).toContain('not where the story happened');
    expect(pin.label).not.toMatch(/home city/i);
  }
  await expect(page.getByText(/home city/i)).toHaveCount(0);
});

function luminance([r, g, b]) {
  const channel = value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

test('the load-more recovery message meets WCAG AA contrast for normal text', async ({ page }) => {
  await page.route('**/api/news**', route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/news') return route.fulfill(json({}));
    if (url.searchParams.get('offset') === '0') {
      return route.fulfill(
        json({ total: 40, items: Array.from({ length: 24 }, (_, i) => story(`s${i}`, new Date().toISOString())) })
      );
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/news.html');
  await page.locator('#load-more-btn').click();
  const note = page.locator('#load-more-note');
  await expect(note).toBeVisible();

  const colors = await note.evaluate(node => {
    const parse = value => (value.match(/[\d.]+/g) || []).map(Number);
    let background = [0, 0, 0, 0];
    for (let el = node; el; el = el.parentElement) {
      const bg = parse(getComputedStyle(el).backgroundColor);
      if (bg.length >= 3 && (bg[3] === undefined || bg[3] > 0)) {
        background = bg;
        break;
      }
    }
    return {
      text: parse(getComputedStyle(node).color),
      background,
      fontSize: parseFloat(getComputedStyle(node).fontSize),
    };
  });
  const L1 = luminance(colors.text.slice(0, 3));
  const L2 = luminance(colors.background.slice(0, 3));
  const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  expect(colors.fontSize, 'message is not shrunk').toBeGreaterThanOrEqual(13);
  expect(ratio, `contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
});

test('only the site header is sticky; semantic headers inside content stay in flow', async ({ page }) => {
  await routeFeed(page, Array.from({ length: 8 }, (_, i) => story(`s${i}`, new Date().toISOString())));
  await page.goto('/index.html');
  await expect(page.locator('#desk-latest .desk-story')).toHaveCount(8);

  const positions = await page.evaluate(() =>
    [...document.querySelectorAll('header')].map(el => ({
      cls: el.className || '(site)',
      siteHeader: el.parentElement === document.body,
      position: getComputedStyle(el).position,
    }))
  );
  expect(positions.filter(p => p.siteHeader)).toEqual([{ cls: '(site)', siteHeader: true, position: 'sticky' }]);
  for (const nested of positions.filter(p => !p.siteHeader)) {
    expect(nested.position, `${nested.cls} must not be sticky`).toBe('static');
  }

  // Scrolled into the story list, the dateline scrolls away instead of covering stories.
  await page.evaluate(() => {
    const desk = document.querySelector('.desk-header');
    const top = desk.getBoundingClientRect().top + window.scrollY + desk.offsetHeight + 300;
    window.scrollTo({ top, behavior: 'instant' });
  });
  const deskHeaderTop = await page.locator('.desk-header').evaluate(el => el.getBoundingClientRect().top);
  expect(deskHeaderTop).toBeLessThan(0);

  await page.goto('/worldmap.html');
  const modalHeaderPosition = await page
    .locator('header.modal-header')
    .evaluate(el => getComputedStyle(el).position);
  expect(modalHeaderPosition).toBe('static');
});

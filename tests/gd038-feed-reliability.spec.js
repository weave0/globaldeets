const { expect, test } = require('@playwright/test');

// GD-038 (roadmap F4/F5): the feed must stay truthful about which region it shows, keep each
// optional trust panel independent, and tell readers which failure actually happened.

function story(region, n) {
  return {
    id: `${region}-${n}`,
    source: 'Fixture Wire',
    sourceId: 'fixture-wire',
    headline: `${region} headline ${n}`,
    summary: null,
    sourceUrl: `https://example.com/${region}/${n}`,
    region,
    published: '2026-10-06T12:00:00Z',
    allowedUseStatus: 'unknown',
    displayMode: 'headline-link',
  };
}

function feed(region, count, total = count) {
  return { cached: false, total, items: Array.from({ length: count }, (_, i) => story(region, i + 1)) };
}

const trustOk = {
  '/api/news/sources': { totalSources: 21, sources: [{ sourceId: 'fixture-wire', name: 'Fixture Wire' }] },
  '/api/news/admission': { summary: { reviewedSources: 21 }, liveAdmissions: [] },
  '/api/news/coverage': { totalSources: 21, regions: [], gaps: [] },
  '/api/news/health': { healthySources: 21, totalSources: 21, generatedAt: new Date().toISOString() },
};

const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function routeNews(page, handler) {
  await page.route('**/api/news**', async route => {
    const url = new URL(route.request().url());
    if (trustOk[url.pathname] && url.pathname !== '/api/news') {
      const custom = await handler(url, route);
      if (custom !== undefined) return;
      await route.fulfill(json(trustOk[url.pathname]));
      return;
    }
    await handler(url, route);
  });
}

test('a slow earlier region can never overwrite a later region selection', async ({ page }) => {
  let releaseGlobal;
  const globalGate = new Promise(resolve => (releaseGlobal = resolve));
  await routeNews(page, async (url, route) => {
    if (url.pathname !== '/api/news') return undefined;
    const region = url.searchParams.get('region');
    if (region === 'global') {
      await globalGate;
      await route.fulfill(json(feed('global', 3))).catch(() => {});
      return true;
    }
    await route.fulfill(json(feed(region, 2)));
    return true;
  });

  await page.goto('/news.html');
  await page.getByRole('button', { name: 'Europe' }).click();
  await expect(page.locator('#news-grid .news-card')).toHaveCount(2);
  await expect(page.locator('#news-grid')).toContainText('europe headline 1');

  releaseGlobal();
  // Give the superseded response every chance to land, then prove it was rejected.
  await page.waitForTimeout(500);
  await expect(page.locator('#news-grid .news-card')).toHaveCount(2);
  await expect(page.locator('#news-grid')).not.toContainText('global headline');
  await expect(page.locator('#news-status')).toHaveText('2 of 2 stories');
  await expect(page.getByRole('button', { name: 'Europe' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/region=europe/);
});

test('a region deep link selects and requests that region', async ({ page }) => {
  const requested = [];
  await routeNews(page, async (url, route) => {
    if (url.pathname !== '/api/news') return undefined;
    requested.push(url.searchParams.get('region'));
    await route.fulfill(json(feed(url.searchParams.get('region'), 1)));
    return true;
  });

  await page.goto('/news.html?region=africa');
  await expect(page.locator('#news-grid')).toContainText('africa headline 1');
  await expect(page.getByRole('button', { name: 'Africa' })).toHaveAttribute('aria-pressed', 'true');
  expect(requested).toEqual(['africa']);
});

test('a hung trust endpoint degrades only its own panel', async ({ page }) => {
  await routeNews(page, async (url, route) => {
    if (url.pathname === '/api/news/health') return true; // never answers
    if (url.pathname !== '/api/news') return undefined;
    await route.fulfill(json(feed('global', 3)));
    return true;
  });

  await page.goto('/news.html');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(3);
  await expect(page.locator('#news-source-count')).toHaveText('21 source endpoints in the live contract');
  await expect(page.locator('#news-context-summary')).toContainText('21 rights records reviewed');
  await expect(page.locator('#news-health-status')).toHaveText('Health snapshot temporarily unavailable', {
    timeout: 15_000,
  });
});

test('feed failure is labeled and recoverable without a page reload', async ({ page }) => {
  let fail = true;
  await routeNews(page, async (url, route) => {
    if (url.pathname !== '/api/news') return undefined;
    if (fail) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    else await route.fulfill(json(feed('global', 3)));
    return true;
  });

  await page.goto('/news.html');
  const error = page.locator('.news-error');
  await expect(error).toHaveAttribute('data-failure', 'upstream');
  await expect(error).toContainText('not a sign that nothing is happening');
  await expect(page.getByText(/warming up/i)).toHaveCount(0);

  fail = false;
  await error.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#news-grid .news-card')).toHaveCount(3);
  await expect(page.locator('.news-error')).toHaveCount(0);
});

test('a true empty region and a no-match filter are different states', async ({ page }) => {
  await routeNews(page, async (url, route) => {
    if (url.pathname !== '/api/news') return undefined;
    const region = url.searchParams.get('region');
    await route.fulfill(json(region === 'pacific' ? feed('pacific', 0) : feed(region, 3)));
    return true;
  });

  await page.goto('/news.html');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(3);

  await page.locator('#news-search').fill('zzz-no-such-story');
  const noMatch = page.locator('.news-empty[data-state="no-matches"]');
  await expect(noMatch).toContainText('None of the 3 loaded stories match');
  await noMatch.getByRole('button', { name: 'Clear filter' }).click();
  await expect(page.locator('#news-grid .news-card')).toHaveCount(3);
  await expect(page.locator('#news-search')).toHaveValue('');

  await page.getByRole('button', { name: 'Pacific' }).click();
  await expect(page.locator('.news-empty[data-state="empty"]')).toContainText(
    'not a lack of events'
  );
});

test('a failed "load more" keeps the stories already shown', async ({ page }) => {
  await routeNews(page, async (url, route) => {
    if (url.pathname !== '/api/news') return undefined;
    if (url.searchParams.get('offset') === '0') {
      await route.fulfill(json(feed('global', 24, 40)));
    } else {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    }
    return true;
  });

  await page.goto('/news.html');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(24);
  await page.locator('#load-more-btn').click();
  await expect(page.locator('#load-more-note')).toContainText('already shown are unchanged');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(24);
  await expect(page.locator('#load-more-btn')).toBeEnabled();
});

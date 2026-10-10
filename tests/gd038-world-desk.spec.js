const fs = require('node:fs');
const path = require('node:path');
const { expect, test } = require('@playwright/test');

// GD-038 acceptance: GlobalDeets' public pages are a news desk, not a directory of the GFD estate.

const ROOT = path.join(__dirname, '..');
const now = Date.now();

const feed = {
  cached: false,
  total: 3,
  items: [
    {
      id: 'a',
      source: 'Fixture Wire',
      sourceId: 'fixture-wire',
      headline: 'Port authority reopens northern terminal',
      summary: null,
      sourceUrl: 'https://example.com/port',
      region: 'europe',
      published: new Date(now - 20 * 60_000).toISOString(),
      displayMode: 'headline-link',
    },
    {
      id: 'b',
      source: 'NHK',
      sourceId: 'nhk',
      headline: 'Translated regional transport update',
      sourceUrl: 'https://example.com/nhk',
      region: 'asia',
      published: new Date(now - 3 * 3_600_000).toISOString(),
      translated: true,
      originalLang: 'ja',
      displayMode: 'current-use',
    },
    {
      id: 'c',
      source: 'Fixture Wire',
      sourceId: 'fixture-wire',
      headline: 'Yesterday story',
      sourceUrl: 'javascript:alert(1)',
      region: 'africa',
      published: new Date(now - 30 * 3_600_000).toISOString(),
      displayMode: 'headline-link',
    },
  ],
};

const coverage = {
  totalSources: 21,
  totalRegions: 7,
  subnationalReporting: { sourceCount: 2 },
  regions: [{ region: 'europe', sourceCount: 4 }],
  gaps: [{ id: 'g1', severity: 'high' }],
};

const sources = {
  totalSources: 2,
  sources: [
    {
      sourceId: 'nhk',
      name: 'NHK',
      organizationName: 'Japan Broadcasting Corporation',
      sourceClass: 'public-service-broadcaster',
      primaryCountry: 'JP',
      sourceLanguages: ['ja'],
      evidenceUrls: ['https://www.nhk.or.jp/corporateinfo/'],
    },
    {
      sourceId: 'calmatters',
      name: 'CalMatters',
      organizationName: 'CalMatters',
      sourceClass: 'nonprofit-newsroom',
      primaryCountry: 'US',
      sourceLanguages: ['en'],
      evidenceUrls: ['https://example.org/publisher/privacy'],
    },
  ],
};

const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function mockApi(page, { feedStatus = 200 } = {}) {
  await page.route('**/api/news**', async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/news/coverage') return route.fulfill(json(coverage));
    if (pathname === '/api/news/sources') return route.fulfill(json(sources));
    if (pathname === '/api/news') {
      if (feedStatus !== 200) {
        return route.fulfill({ status: feedStatus, contentType: 'application/json', body: '{}' });
      }
      return route.fulfill(json(feed));
    }
    return route.fulfill(json({}));
  });
}

test('homepage shows an explained publisher mix with original-source actions', async ({ page }) => {
  const newsRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/news') newsRequests.push(url);
  });
  await mockApi(page);
  await page.goto('/index.html');

  const desk = page.locator('#world-desk');
  await expect(desk.getByRole('heading', { name: 'World Desk' })).toBeVisible();
  await expect(desk.getByRole('heading', { name: 'Across publishers' })).toBeVisible();
  await expect(page.locator('#desk-date')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('#desk-updated')).toContainText('3 stories from our current sources');
  await expect(desk.getByText('Not ranked by importance.')).toBeVisible();

  const stories = page.locator('#desk-latest .desk-story');
  await expect(stories).toHaveCount(3);
  expect(newsRequests.some(url => url.searchParams.get('mode') === 'diverse')).toBe(true);
  await expect(desk.getByRole('link', { name: 'See newest first' })).toHaveAttribute('href', 'news.html');
  await expect(stories.first().getByRole('link', { name: 'Port authority reopens northern terminal' })).toHaveAttribute(
    'href',
    'https://example.com/port'
  );
  await expect(stories.first().getByRole('link', { name: /Read at Fixture Wire/ })).toHaveAttribute(
    'target',
    '_blank'
  );
  await expect(stories.first()).toContainText('Feed: Europe');
  await expect(stories.first()).toContainText('Headline only');
  await expect(stories.nth(1)).toContainText('Machine-translated from JA');

  // Unsafe publisher URLs never become links.
  await expect(stories.nth(2).locator('a')).toHaveCount(0);

  // Region entry points deep-link into the feed.
  await expect(page.getByRole('link', { name: 'Middle East' })).toHaveAttribute('href', 'news.html?region=middle-east');
  await expect(page.getByText('They are not the location of a story.')).toBeVisible();
});

test('homepage latest-reporting failure is explicit and recoverable', async ({ page }) => {
  let fail = true;
  await page.route('**/api/news**', async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/news' && fail) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    }
    if (pathname === '/api/news') return route.fulfill(json(feed));
    return route.fulfill(json(coverage));
  });
  await page.goto('/index.html');

  const alert = page.locator('#desk-latest [role="alert"]');
  await expect(alert).toContainText('could not be loaded right now');
  await expect(page.locator('#desk-updated')).toHaveText('Latest reporting unavailable');
  fail = false;
  await alert.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#desk-latest .desk-story')).toHaveCount(3);
});

test('homepage no longer carries portfolio, pitch, or roadmap modules', async ({ page }) => {
  await mockApi(page);
  await page.goto('/index.html');
  await expect(page.locator('#desk-latest .desk-story')).toHaveCount(3);

  await expect(page.locator('#projectModal')).toHaveCount(0);
  await expect(page.locator('script[src*="projects-"], script[src*="platform-modal"]')).toHaveCount(0);
  await expect(page.getByText(/Roadmap|Product Direction|2030 Product Spine|Paywalls/)).toHaveCount(0);
  await expect(page.getByText(/geo-pinned/i)).toHaveCount(0);
  await expect(page.locator('.globe-pin-hint')).toHaveText(/approximate publisher location, or feed region if unmapped\. Never the story.s location/);
});

test('browse page offers regions and publishers, not sibling projects', async ({ page }) => {
  await mockApi(page);
  await page.goto('/categories.html');

  await expect(page.getByRole('heading', { level: 1, name: 'Browse the desk' })).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  const europe = page.locator('.browse-region[data-region="europe"]');
  await expect(europe).toHaveAttribute('href', 'news.html?region=europe');
  await expect(europe).toContainText('4 source endpoints route here');

  const nhk = page.locator('.browse-source').filter({ hasText: 'NHK' });
  await expect(nhk).toContainText('Publisher based in JP');
  await expect(nhk).toContainText('Language: JA');
  await expect(nhk.getByRole('link', { name: /Publisher documentation for NHK/ })).toHaveAttribute(
    'href',
    'https://www.nhk.or.jp/corporateinfo/'
  );
  // Some evidence URLs are privacy/policy pages, not verified About pages.
  const privacyFirst = page.locator('.browse-source').filter({ hasText: 'CalMatters' });
  await expect(privacyFirst.getByRole('link', { name: /Publisher documentation for CalMatters/ })).toHaveAttribute(
    'href',
    'https://example.org/publisher/privacy'
  );
  await expect(privacyFirst.getByRole('link', { name: /About CalMatters/ })).toHaveCount(0);
  await expect(page.locator('.category-projects-list')).toHaveCount(0);
});

test('timeline groups reporting by publication day and says what it is not', async ({ page }) => {
  await mockApi(page);
  await page.goto('/timeline.html');

  await expect(page.getByRole('heading', { level: 1, name: 'Reporting timeline' })).toBeVisible();
  await expect(page.getByText('not a timeline of the events themselves')).toBeVisible();
  const days = page.locator('.timeline-item');
  await expect(days.first().locator('.timeline-day')).toHaveText(/Today|Yesterday/);
  await expect(page.locator('.timeline-item .desk-story')).toHaveCount(3);
  await expect(page.locator('#timeline-status')).toContainText('3 stories');
});

test('public pages and the deploy root contain no GFD portfolio artifacts', async ({ request }) => {
  const retiredFiles = [
    'projects-data.js',
    'projects-render.js',
    'platform-modal.js',
    'PROJECT_TEMPLATE.js',
    'QUICK_REFERENCE.js',
    'bb-content.html',
    'bi-ecosystem.css',
  ];
  for (const file of retiredFiles) {
    expect(fs.existsSync(path.join(ROOT, file)), `${file} must stay retired`).toBe(false);
  }

  const forbidden = [
    /projects-data\.js/,
    /projects-render\.js/,
    /Fantasy Penpal/i,
    /Culture Sherpa/i,
    /aiaimate/i,
    /Insurance Intelligence/i,
    /Healthcare (?:System )?Intelligence/i,
    /Mission Control/i,
    /fantasy-penpal\.globaldeets/i,
    /steveb\.globaldeets/i,
    /medical\.globaldeets/i,
  ];
  for (const pagePath of ['/index.html', '/categories.html', '/timeline.html', '/news.html', '/app.js']) {
    const body = await (await request.get(pagePath)).text();
    for (const pattern of forbidden) {
      expect(body, `${pagePath} must not contain ${pattern}`).not.toMatch(pattern);
    }
  }
});

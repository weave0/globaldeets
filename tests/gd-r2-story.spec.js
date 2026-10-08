const { expect, test } = require('@playwright/test');

const STORY = '/story/santa-ynez-pipeline/';
const LATIMES =
  'https://www.latimes.com/environment/story/2026-08-20/judge-allows-controversial-oil-company-continue-pumping';

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectInFirstViewport(page, locator, label) {
  await expect(locator, `${label} is visible`).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${label} has a box`).not.toBeNull();
  expect(box.y, `${label} top is on screen`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${label} bottom fits the first ${viewport.height}px`).toBeLessThanOrEqual(
    viewport.height
  );
}

test('the world desk links to the maintained story', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.getByRole('link', { name: 'Open the Santa Ynez story' })).toHaveAttribute(
    'href',
    '/story/santa-ynez-pipeline/'
  );
  await expect(page.getByRole('link', { name: 'Open Evidence Dossier' })).toHaveAttribute(
    'href',
    '/dossiers/santa-ynez-pipeline/'
  );
});

test('an exact reporting URL opens the story and any other headline does not', async ({ page }) => {
  await page.route('**/api/news**', async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname !== '/api/news') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 2,
        items: [
          {
            id: 'lat',
            source: 'Los Angeles Times',
            sourceId: 'latimes',
            headline: 'Judge allows company to continue pumping',
            summary: null,
            sourceUrl: LATIMES,
            region: 'americas',
            published: '2026-08-20T12:00:00.000Z',
            displayMode: 'headline-link',
            allowedUseStatus: 'unknown',
          },
          {
            id: 'other',
            source: 'Fixture Wire',
            sourceId: 'fixture',
            headline: 'A different report that only resembles the dispute',
            summary: null,
            sourceUrl: 'https://example.com/other-pipeline',
            region: 'americas',
            published: '2026-08-20T13:00:00.000Z',
            displayMode: 'headline-link',
            allowedUseStatus: 'unknown',
          },
        ],
      }),
    });
  });

  await page.goto('/news.html');
  const context = page.getByRole('link', { name: 'Context & sources' });
  await expect(context).toHaveCount(1);
  await expect(context).toHaveAttribute('href', '/story/santa-ynez-pipeline/');
  await expect(page.getByRole('link', { name: /Read at Los Angeles Times/ })).toHaveAttribute('href', LATIMES);
  await expect(page.getByRole('link', { name: /Read at Fixture Wire/ })).toBeVisible();
  await context.click();
  await expect(page).toHaveURL(/\/story\/santa-ynez-pipeline\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Ynez Pipeline — Evidence Dossier' })).toBeVisible();
});

test('chronology does not treat publication order as event order', async ({ page }) => {
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  await expect(page.locator('.story-chrono > li')).toHaveCount(9);
  const differs = page.locator('.story-time-differs');
  await expect(differs).toHaveCount(3);
  await expect(page.getByText('Timeline date 2026-08-20 is not the event start 2026-08-19.')).toBeVisible();
  await expect(page.getByText(/Ordered by the dossier timeline date/)).toBeVisible();
});

test('the record keeps conflict, evidence, correction, and unknowns', async ({ page }) => {
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  await expect(page.getByText('These claims contradict each other in the maintained record.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence', exact: true })).toBeVisible();
  await expect(page.getByText('Primary document in the evidence record').first()).toBeVisible();
  await expect(page.getByText('Publisher reported').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What remains unresolved' })).toBeVisible();
  await expect(page.getByText(/We do not know yet/)).toBeVisible();
  await expect(page.getByText(/primary court order/i).first()).toBeVisible();
  const corrections = page.locator('section[aria-labelledby="corrections-heading"]');
  await expect(corrections).toContainText(/mistakenly reprinted/i);
  await expect(corrections).toContainText(/earlier artifact is not retained/i);
  await expect(page.getByText('No place page is published for this record yet.').first()).toBeVisible();
  await expect(page.locator('.stat-grid, #globe-hero-container')).toHaveCount(0);
  await expect(page.getByText(/Canonical entities/)).toHaveCount(0);
  const text = await page.locator('#story').innerText();
  expect(text).toMatch(/not a truth score/i);
  expect(text).not.toMatch(/\d+\s*%|bias score|reliability score|misinformation/i);
});

test('original links survive a failed record', async ({ page }) => {
  await page.route('**/story.json', route => route.abort());
  await page.route('**/api/intelligence/stories/**', route => route.abort());
  await page.goto(STORY);
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Ynez Pipeline — Evidence Dossier' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Read at Los Angeles Times/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open at U.S. Department of Energy' })).toHaveAttribute(
    'href',
    /energy\.gov/
  );
  await expect(page.getByText('could not be loaded')).toBeVisible();
  await expect(page.locator('body[data-story-ready="true"]')).toHaveCount(0);
});

test('a rule-breaking API copy is rejected', async ({ page }) => {
  await page.route('**/api/intelligence/stories/santa-ynez-pipeline', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        storyKey: 'santa-ynez-pipeline',
        storyId: 'story:santa-ynez-pipeline',
        dossierVersion: 'tampered',
        reviewedAt: '2099-01-01',
        rules: { truthScore: true, editorialVerdict: false, proseSummary: true },
        understanding: { proseSummary: 'INVENTED SUMMARY THAT MUST NOT RENDER' },
        grouping: { isEventIdentity: false },
      }),
    });
  });
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  await expect(page.getByText('broke the story rules')).toBeVisible();
  await expect(page.getByText('INVENTED SUMMARY THAT MUST NOT RENDER')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Read at Los Angeles Times/ }).first()).toBeVisible();
});

const WIDTHS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: '390x844', viewport: { width: 390, height: 844 } },
  { name: '360x800', viewport: { width: 360, height: 800 } },
  { name: '360x640', viewport: { width: 360, height: 640 } },
  { name: '320x640', viewport: { width: 320, height: 640 } },
];

for (const width of WIDTHS) {
  test(`story identity is on the first screen at ${width.name}`, async ({ page }) => {
    await page.setViewportSize(width.viewport);
    await page.goto(STORY);
    await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
    await expectInFirstViewport(page, page.getByRole('heading', { level: 1 }), 'title');
    await expectInFirstViewport(page, page.locator('.story-kicker'), 'status');
    await expectInFirstViewport(page, page.locator('.story-places'), 'places');
    await expectInFirstViewport(page, page.locator('.story-latest'), 'latest date');
    await expectInFirstViewport(page, page.getByRole('link', { name: /Read at Los Angeles Times/ }).first(), 'publisher action');
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('#globe-hero-container')).toHaveCount(0);
  });
}

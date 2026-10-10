const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
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
            story: {
              storyId: 'story:santa-ynez-pipeline',
              storyKey: 'santa-ynez-pipeline',
              href: '/story/santa-ynez-pipeline/',
              membershipVersion: '2026-10-08.1',
            },
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
            story: { href: '/story/santa-ynez-pipeline/', storyKey: 'not-the-approved-story' },
          },
          {
            id: 'malicious',
            source: 'Malicious Wire',
            sourceId: 'malicious',
            headline: 'A card with a forged story link',
            summary: null,
            sourceUrl: 'https://example.com/malicious',
            region: 'americas',
            published: '2026-08-20T14:00:00.000Z',
            displayMode: 'headline-link',
            allowedUseStatus: 'unknown',
            translated: true,
            originalLang: 'ja" onclick="alert(1)',
            originalHeadline: '<img src=x onerror=alert(1)>',
            story: { href: 'javascript:alert(1)', storyKey: 'santa-ynez-pipeline', storyId: 'story:santa-ynez-pipeline' },
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
  await expect(page.getByRole('link', { name: /Read at Malicious Wire/ })).toBeVisible();
  await expect(page.locator('#news-grid a[href^="javascript:"], #news-grid img')).toHaveCount(0);
  await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  await context.click();
  await expect(page).toHaveURL(/\/story\/santa-ynez-pipeline\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Ynez Pipeline — Evidence Dossier' })).toBeVisible();
});

test('the homepage desk uses the same server story membership', async ({ page }) => {
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
            headline: 'Judge allows company to continue pumping',
            sourceUrl: LATIMES,
            region: 'americas',
            published: '2026-08-20T12:00:00.000Z',
            displayMode: 'headline-link',
            story: {
              storyId: 'story:santa-ynez-pipeline',
              storyKey: 'santa-ynez-pipeline',
              href: '/story/santa-ynez-pipeline/',
            },
          },
          {
            id: 'other',
            source: 'Fixture Wire',
            headline: 'A different report',
            sourceUrl: 'https://example.com/other-pipeline',
            region: 'americas',
            published: '2026-08-20T13:00:00.000Z',
            displayMode: 'headline-link',
          },
        ],
      }),
    });
  });
  await page.goto('/index.html');
  const context = page.locator('#desk-latest').getByRole('link', { name: 'Context & sources' });
  await expect(context).toHaveCount(1);
  await expect(context).toHaveAttribute('href', '/story/santa-ynez-pipeline/');
  await expect(page.locator('#desk-latest').getByRole('link', { name: /Read at Fixture Wire/ })).toBeVisible();
});

test('chronology does not treat publication order as event order', async ({ page }) => {
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  await expect(page.locator('.story-chrono > li')).toHaveCount(9);
  const differs = page.locator('.story-time-differs');
  await expect(differs).toHaveCount(3);
  await expect(page.getByText('Record date 2026-08-20 is not the event date 2026-08-19.')).toBeVisible();
  await expect(page.getByText('Document date:').first()).toBeVisible();
  await expect(page.getByText('Correction date:').first()).toBeVisible();
  await expect(page.locator('.story-chrono time').first()).toHaveText('March 13, 2026');
  await expect(page.getByText(/Ordered by the dossier timeline date/)).toBeVisible();
});

test('the integrated story makes comparison limits, update provenance and section navigation explicit', async ({ page }) => {
  await page.goto(STORY);
  await expect(page.locator('body')).toHaveClass(/gd-editorial/);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Record at a glance' })).toBeVisible();
  const comparison = page.locator('section[aria-labelledby="comparison-heading"]');
  await expect(comparison).toContainText('1 distinct reporting URL');
  await expect(comparison).toContainText('fewer than two distinct named publishers');
  await expect(page.getByRole('navigation', { name: 'Story sections' }).getByRole('link', { name: 'Corrections' }))
    .toHaveAttribute('href', '#corrections-heading');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Evidence' }))
    .toHaveAttribute('href', '/observatory/coverage/');
  const background = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgb(11, 17, 26)');
  await expectNoHorizontalOverflow(page);
});

test('one named publisher with two original URLs is still not a cross-publisher comparison', async ({ page }) => {
  const path = join(__dirname, '..', 'story', 'santa-ynez-pipeline', 'story.json');
  const shipped = JSON.parse(readFileSync(path, 'utf8'));
  const duplicate = {
    ...shipped.reporting.origins[0],
    url: 'https://example.com/second-report',
    linkLabel: 'Read another report from the same outlet',
  };
  shipped.reporting.origins.push(duplicate);
  shipped.reporting.distinctUrls = 2;
  await page.route('**/story/santa-ynez-pipeline/story.json', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shipped) })
  );
  await page.route('**/api/intelligence/stories/santa-ynez-pipeline', route => route.abort());
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  const comparison = page.locator('section[aria-labelledby="comparison-heading"]');
  await expect(comparison).toContainText('2 distinct reporting URLs');
  await expect(comparison).toContainText('fewer than two distinct named publishers');
  await expect(comparison.locator('.story-compare-list')).toHaveCount(0);
});


test('publisher comparison rejects two named publishers sharing one original report URL', async ({ page }) => {
  const path = join(__dirname, '..', 'story', 'santa-ynez-pipeline', 'story.json');
  const shipped = JSON.parse(readFileSync(path, 'utf8'));
  const original = shipped.reporting.origins[0];
  shipped.reporting.origins.push({
    ...original,
    name: 'Reattributed Fixture Publisher',
    url: original.url + '#mirror',
    linkLabel: 'Read reattributed report',
    independent: true,
    syndicated: false,
  });
  shipped.reporting.distinctUrls = 2; // Deliberately stale, not evidence.
  await page.route('**/story/santa-ynez-pipeline/story.json', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shipped) })
  );
  await page.route('**/api/intelligence/stories/santa-ynez-pipeline', route => route.abort());
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  const comparison = page.locator('section[aria-labelledby="comparison-heading"]');
  await expect(comparison).toContainText('1 distinct reporting URL');
  await expect(comparison).toContainText('Shared links');
  await expect(comparison.locator('.story-compare-list')).toHaveCount(0);
});

test('publisher comparison shows separately attributable originals, without implying corroboration', async ({ page }) => {
  const path = join(__dirname, '..', 'story', 'santa-ynez-pipeline', 'story.json');
  const shipped = JSON.parse(readFileSync(path, 'utf8'));
  shipped.reporting.origins.push({
    ...shipped.reporting.origins[0],
    name: 'Second Fixture Publisher',
    url: 'https://example.com/separately-published-report',
    linkLabel: 'Read separate original',
    independent: true,
    syndicated: false,
  });
  shipped.reporting.distinctUrls = 1; // Prove the browser recalculates the actual origins.
  await page.route('**/story/santa-ynez-pipeline/story.json', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shipped) })
  );
  await page.route('**/api/intelligence/stories/santa-ynez-pipeline', route => route.abort());
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  const comparison = page.locator('section[aria-labelledby="comparison-heading"]');
  await expect(comparison).toContainText('2 distinct reporting URLs');
  await expect(comparison.locator('.story-compare-list > li')).toHaveCount(2);
  await expect(comparison).toContainText('agreement is not automatically corroboration');
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
  // The unresolved list prints a source URL that contains %E2%80%99. That encoding is not a score.
  const prose = text.replace(/https?:\/\/\S+/g, '');
  expect(prose).not.toMatch(/\d+\s*%|bias score|reliability score|misinformation/i);
  await expect(page.getByText('Evaluation fixture')).toHaveCount(0);
  await expect(page.getByText(/Machine-translated/)).toHaveCount(0);
});

test('original links survive a failed record', async ({ page }) => {
  await page.route('**/story.json', route => route.abort());
  await page.route('**/api/intelligence/stories/**', route => route.abort());
  await page.goto(STORY);
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Ynez Pipeline — Evidence Dossier' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Read at Los Angeles Times/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Open at U\.S\. Department of Energy/ })).toHaveAttribute(
    'href',
    /energy\.gov/
  );
  await expect(page.getByText('could not be loaded')).toBeVisible();
  await expect(page.getByText(/Content version 2026-09-03\.1/)).toBeVisible();
  await expect(page.getByText(/Reviewed/).first()).toBeVisible();
  await expect(page.getByText(/is not cited by a claim or a document/)).toBeVisible();
  await expect(page.locator('body[data-story-ready="true"]')).toHaveCount(0);
});

test('unversioned live record cannot replace the saved-story provenance of a reviewed copy', async ({ page }) => {
  const path = join(__dirname, '..', 'story', 'santa-ynez-pipeline', 'story.json');
  const shipped = JSON.parse(readFileSync(path, 'utf8'));
  await page.route('**/api/intelligence/stories/santa-ynez-pipeline', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...shipped, dossierVersion: null, reviewedAt: '2026-10-09' }),
    })
  );
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  await expect(page.locator('#story-load-status')).toContainText('newer copy was rejected');
  await expect(page.locator('body')).toHaveAttribute('data-story-version', shipped.dossierVersion);
  await page.getByRole('button', { name: 'Save story on this device' }).click();
  const local = JSON.parse(await page.evaluate(() =>
    window.localStorage.getItem('globaldeets:saved-story:v1')
  ));
  expect(local.version).toBe(shipped.dossierVersion);
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
  { name: '1440', viewport: { width: 1440, height: 900 } },
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

test('keyboard use, visible focus, disclosure, and Escape', async ({ page }) => {
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to story' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#story')).toBeFocused();
  await page.keyboard.press('Tab');
  const publisher = page.getByRole('link', { name: /Read at Los Angeles Times/ }).first();
  await expect(publisher).toBeFocused();
  const target = await publisher.evaluate(element => {
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return { outline: style.outlineStyle, height: box.height };
  });
  expect(target.outline).not.toBe('none');
  expect(target.height).toBeGreaterThanOrEqual(44);

  const more = page.locator('details.nav-more');
  await more.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(more).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(more).not.toHaveAttribute('open', '');
  await expect(more.locator('summary')).toBeFocused();

  const notes = page.locator('details.story-disclosure');
  await notes.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(notes).toHaveAttribute('open', '');
  await expect(notes).toContainText(/not interchangeable/i);
  await page.keyboard.press('Escape');
  await expect(notes).not.toHaveAttribute('open', '');
  await expect(notes.locator('summary')).toBeFocused();

  const levels = await page.locator('#story :is(h1, h2, h3, h4, h5, h6)').evaluateAll(nodes =>
    nodes.filter(node => !node.closest('[hidden]')).map(node => Number(node.tagName.slice(1)))
  );
  expect(levels[0]).toBe(1);
  for (let index = 1; index < levels.length; index += 1) {
    expect(levels[index]).toBeLessThanOrEqual(levels[index - 1] + 1);
  }

  const eventLink = page.locator('.story-chrono a[href^="#event-"]').first();
  await eventLink.click();
  const headerBottom = await page.locator('body > header').evaluate(element => element.getBoundingClientRect().bottom);
  const targetTop = await page.locator(await eventLink.getAttribute('href')).evaluate(element => element.getBoundingClientRect().top);
  expect(targetTop).toBeGreaterThanOrEqual(headerBottom - 1);
});

test('a slow record shows loading copy and still leaves the story readable', async ({ page }) => {
  await page.route('**/santa-ynez-pipeline/story.json', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.route('**/api/intelligence/stories/**', route => route.abort());
  await page.goto(STORY);
  await expect(page.getByText('Loading the detailed record. Original links above remain available.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Santa Ynez Pipeline — Evidence Dossier' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Read at Los Angeles Times/ }).first()).toBeVisible();
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  await expect(page.getByText('Detailed record loaded.')).toBeVisible();
});

test('a hung story API does not remove the record already on the page', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  await page.route('**/api/intelligence/stories/**', async route => {
    await gate;
    await route.abort();
  });
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Reporting', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Read at Los Angeles Times/ }).first()).toBeVisible();
  await expect(page.getByText('Detailed record loaded.')).toBeVisible();
  release();
});

test('malformed urls and markup are not clickable or injected', async ({ page }) => {
  await page.route('**/santa-ynez-pipeline/story.json', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.chronology[0].label = '<img src=x onerror=alert(1)>';
    json.reporting.origins[0].url = 'javascript:alert(1)';
    json.evidence[0].url = 'data:text/html,<script>alert(1)</script>';
    await route.fulfill({ json });
  });
  await page.route('**/api/intelligence/stories/**', route => route.abort());
  await page.goto(STORY);
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
  await expect(page.locator('#story-body img')).toHaveCount(0);
  await expect(page.locator('#story a[href^="javascript:"], #story a[href^="data:"]')).toHaveCount(0);
  await expect(page.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="reporting-heading"]').getByText('Link not recorded')).toBeVisible();
});

test('several publishers stay separate from the filing', async ({ page }) => {
  await openFixture(page, 'evaluation-several-publishers');
  await expect(page.getByRole('link', { name: /Read at Fixture Ledger/ }).first()).toHaveAttribute(
    'href',
    'https://example.com/fixture/ledger'
  );
  await expect(page.getByRole('link', { name: /Read at Fixture Gazette/ }).first()).toHaveAttribute(
    'href',
    'https://example.com/fixture/gazette'
  );
  await expect(page.locator('[data-reporting="true"]')).toHaveCount(2);
  await expect(page.locator('[data-evidence="true"]').first()).toBeVisible();
  await expect(page.getByText('Primary document in the evidence record').first()).toBeVisible();
  await expect(page.getByText('Publisher reported').first()).toBeVisible();
});

test('a single publisher is not shown as corroboration', async ({ page }) => {
  await openFixture(page, 'evaluation-single-source');
  await expect(page.getByRole('heading', { name: 'Reviewed evidence record' })).toHaveCount(0);
  await expect(page.locator('[data-claim-state="corroborated"]')).toHaveCount(0);
  await expect(page.getByText('not shown as agreement')).toBeVisible();
  await expect(page.getByText('One source stated this.')).toBeVisible();
  const hrefs = await page.getByRole('link', { name: /Read at Fixture Ledger/ }).evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('href'))
  );
  expect(hrefs.length).toBeGreaterThan(0);
  expect(new Set(hrefs)).toEqual(new Set(['https://example.com/fixture/single']));
});

test('no primary document is said plainly', async ({ page }) => {
  await openFixture(page, 'evaluation-no-evidence');
  await expect(page.getByRole('heading', { name: 'Evidence', exact: true })).toBeVisible();
  await expect(page.getByText('No evidence records are currently attached.')).toBeVisible();
  await expect(page.getByText('Missing evidence is not evidence that none exists.').first()).toBeVisible();
  await expect(page.locator('[data-evidence="true"]')).toHaveCount(0);
  await expect(page.getByText('Allegation, not an adjudicated fact')).toBeVisible();
});

test('conflicting accounts stay unresolved', async ({ page }) => {
  await openFixture(page, 'evaluation-conflict');
  await expect(page.getByText('Fixture Ledger alleges the amount was 12.')).toBeVisible();
  await expect(page.getByText('Fixture Gazette denies that amount and states 40.')).toBeVisible();
  await expect(page.getByText('does not pick a winner')).toBeVisible();
  await expect(page.getByText('Allegation, not an adjudicated fact')).toBeVisible();
  await expect(page.getByText('Denial, not a finding')).toBeVisible();
  await expect(page.getByText(/winner is|false claim|misinformation/i)).toHaveCount(0);
});

test('a missing place is not filled from a publisher or feed', async ({ page }) => {
  await openFixture(page, 'evaluation-no-place');
  await expect(page.getByText('No event location is recorded').first()).toBeVisible();
  await expect(page.locator('#story')).not.toContainText('Oslo');
  await expect(page.locator('#story')).not.toContainText('europe');
  await expect(page.getByText(/not in the record/)).toBeVisible();
});

test('a missing day is not invented', async ({ page }) => {
  await openFixture(page, 'evaluation-no-time');
  await expect(page.getByText('does not invent a day or a time of day')).toBeVisible();
  await expect(page.getByText('This update has no record date. No day is invented.')).toBeVisible();
  await expect(page.locator('#story')).not.toContainText('August 1');
  await expect(page.locator('#story')).not.toContainText('January 1');
});

test('a correction keeps the earlier line', async ({ page }) => {
  await openFixture(page, 'evaluation-corrected');
  const corrections = page.locator('section[aria-labelledby="corrections-heading"]');
  await expect(corrections).toContainText('earlier line stays visible');
  await expect(corrections).toContainText('An earlier fixture line said the hearing was closed.');
  await expect(corrections).toContainText(/not retained/i);
});

test('an unsafe fixture link is not clickable and a safe one is', async ({ page }) => {
  await openFixture(page, 'evaluation-unsafe-url');
  await expect(page.locator('#story a[href^="javascript:"], #story a[href^="data:"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Read at Fixture Gazette/ }).first()).toHaveAttribute(
    'href',
    'https://example.com/fixture/safe-report'
  );
  await expect(page.locator('section[aria-labelledby="reporting-heading"]').getByText('Link not recorded')).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain('javascript:');
  expect(html).not.toContain('data:text/html');
});

test('original language stays labeled and separate from machine translation', async ({ page }) => {
  await openFixture(page, 'evaluation-translation');
  await expect(page.getByText('Machine-translated from JA. This is not the original-language report.').first()).toBeVisible();
  await expect(page.getByText('Original language: AR. Not translated.').first()).toBeVisible();
  const japanese = page.locator('.story-original[lang="ja"]').first();
  await expect(japanese).toHaveAttribute('dir', 'auto');
  await expect(japanese).toContainText('評価用の見出しです');
  await expect(page.locator('.story-original[lang="ar"]').first()).toContainText('عنوان للتقييم فقط');
});

const LONG_WIDTHS = [
  { name: '1440', viewport: { width: 1440, height: 900 } },
  { name: '390x844', viewport: { width: 390, height: 844 } },
  { name: '360x640', viewport: { width: 360, height: 640 } },
  { name: '320x640', viewport: { width: 320, height: 640 } },
];

for (const width of LONG_WIDTHS) {
  test(`a long headline wraps at ${width.name}`, async ({ page }) => {
    await page.setViewportSize(width.viewport);
    await openFixture(page, 'evaluation-long-headline');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toContainText('Wrapcheck');
    const metrics = await title.evaluate(element => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { fontSize: parseFloat(style.fontSize), width: box.width };
    });
    expect(metrics.fontSize).toBeGreaterThanOrEqual(20);
    expect(metrics.width).toBeLessThanOrEqual(width.viewport.width);
    const link = page.getByRole('link', { name: /Read at Fixture Gazette/ }).first();
    const linkBox = await link.boundingBox();
    expect(linkBox.height).toBeGreaterThanOrEqual(44);
    expect(linkBox.x).toBeGreaterThanOrEqual(-1);
    expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(width.viewport.width + 1);
    await expectNoHorizontalOverflow(page);
  });
}

let fixtureViews;

function fixtureView(key) {
  if (!fixtureViews) {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { evaluationStoryKeys, projectEvaluationStory } from './functions/lib/story-evaluation-fixtures.js';
        const views = {};
        for (const key of evaluationStoryKeys()) views[key] = projectEvaluationStory(key);
        process.stdout.write(JSON.stringify(views));`,
      ],
      { cwd: join(__dirname, '..'), encoding: 'utf8' }
    );
    if (result.status !== 0) throw new Error(result.stderr || 'fixture projection failed');
    fixtureViews = JSON.parse(result.stdout);
  }
  const view = fixtureViews[key];
  if (!view) throw new Error(`missing evaluation fixture ${key}`);
  return view;
}

async function openFixture(page, key) {
  const view = fixtureView(key);
  await page.route('**/story-states/story.json', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(view),
    })
  );
  await page.goto('/tests/fixtures/story-states/index.html');
  await expect(page.locator('body[data-story-ready="true"]')).toBeAttached();
}

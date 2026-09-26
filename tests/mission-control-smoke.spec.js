const { readFileSync } = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { expect, test } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const SEED_NOW = new Date('2026-09-24T17:00:00Z');
const FILES = ['history.json', 'estate-health.json', 'diagnostics.json', 'mission-control-data.json', 'probes.json', 'audience.json', 'business-events.json', 'executive.json'];

const load = rel => import(pathToFileURL(path.join(ROOT, rel)).href);

/**
 * Drives the REAL collector (probe engine, reconciliation, audience, events, findings, executive summary) with a
 * simulated estate and serves its published files to the page. Governed audience/event sources are synthetic
 * TEST documents in a temp directory; they are never part of the seed or the deploy.
 */
async function collectEvidence({ mutate, start = '2026-10-01T12:00:00Z', governed = false, secondary = false } = {}) {
  const plane = await load('tests/helpers/mission-control-plane.mjs');
  const fx = await load('tests/helpers/mission-control-audience-fixtures.mjs');
  const fakes = await load('tests/helpers/mission-control-fakes.mjs');
  const ids = fakes.registry().properties.map(item => item.propertyId);
  const dir = plane.newDir();
  const options = { start, mutate };
  if (secondary) options.secondary = [{ id: 'github-actions-macos', network: 'GitHub-hosted macOS' }];
  if (governed) {
    options.env = {
      GOLD_SOURCE: plane.writeSource(dir, 'canonical-gold-m1.2.json', fx.syntheticGold({ propertyIds: ids })),
      INSIGHTS_SOURCE: plane.writeSource(dir, 'traffic-insights-1.0.json', fx.syntheticInsights({ propertyIds: ids, growth: { 'aiaimate.com': 0.05, 'heavymoose.com': -0.04 } })),
      EVENTS_SOURCE: plane.writeSource(dir, 'events.json', fx.syntheticEventsFeed({ instrumented: ['goodflippindesign.com', 'aiaimate.com'], records: [['goodflippindesign.com', 'lead', 28, 23], ['goodflippindesign.com', 'visit', 28, 1900], ['aiaimate.com', 'signup', 28, 61]] })),
    };
  }
  const result = await plane.collect(dir, options);
  return { dir, finishedAt: result.run.finishedAt, plane: result.plane };
}

async function serveEvidence(page, dir, transform) {
  await page.route('**/observatory/mission-control/*.json', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (!FILES.includes(name)) return route.fallback();
    let body = readFileSync(path.join(dir, 'latest', name), 'utf8');
    if (transform) body = transform(name, body);
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  });
}

const ready = page => expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();
const noOverflow = async page => {
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
};

test.describe('committed baseline (no probe evidence, no governed sources)', () => {
  test('is honest about what it does not know and never shows a number it cannot source', async ({ page }) => {
    await page.clock.setFixedTime(SEED_NOW);
    await page.goto('/observatory/mission-control/');
    await expect(page.getByRole('heading', { name: 'Mission Control', level: 1 })).toBeVisible();
    await ready(page);
    await expect(page.locator('#evidence-banner')).toContainText('committed baseline');
    const hero = page.locator('.hero');
    await expect(hero).toContainText('Good Flippin Design operates 25 web properties');
    await expect(hero).toContainText('No valid production probe evidence exists');
    await expect(hero.locator('.kpi', { hasText: 'Responding now' })).toContainText('Unknown');
    await expect(hero.locator('.kpi', { hasText: 'Edge traffic' })).toContainText('Not measured');
    await expect(hero.locator('.kpi', { hasText: 'Business outcomes' })).toContainText('Not connected');
    await expect(page.getByText('Usage isn’t measured yet, and nothing here is estimated')).toBeVisible();
    await expect(page.locator('.requirement').first()).toContainText('MISSION_CONTROL_GOLD_TOKEN');
    await expect(page.locator('.requirement').last()).toContainText('MISSION_CONTROL_EVENTS_SOURCE');
    await expect(page.locator('.window-card')).toHaveCount(0);
    await expect(page.locator('.linechart')).toHaveCount(0);
    await expect(page.getByText('Not measured yet').first()).toBeVisible();
    await expect(page.locator('.portfolio .tile')).toHaveCount(25);
    await expect(page.locator('.matrix tbody tr')).toHaveCount(25);
    await expect(page.locator('.tile .pill', { hasText: 'Verified healthy' })).toHaveCount(0);
    await expect(page.locator('#mission-control-error')).toBeHidden();
  });

  test('unknown purpose stays unknown and declared facts carry their source', async ({ page }) => {
    await page.clock.setFixedTime(SEED_NOW);
    await page.goto('/observatory/mission-control/');
    await ready(page);
    const fwomps = page.locator('.tile', { hasText: 'fwomps.com' }).first();
    await expect(fwomps).toContainText('Purpose not declared');
    await expect(fwomps).toContainText('Status not declared');
    const gfd = page.locator('.tile', { hasText: 'Good Flippin Design' }).first();
    await expect(gfd).toContainText('Tier 1');
    await gfd.locator('summary').click();
    await expect(gfd).toContainText("the owner's brand registry");
  });
});

test.describe('live evidence, executive view', () => {
  test('answers the investor questions in the first screen and every chart matches the governed data', async ({ page }) => {
    const { dir, finishedAt, plane } = await collectEvidence({ governed: true, secondary: true });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/');
    await ready(page);

    await expect(page.locator('.hero .headline')).toContainText('20 of 20 properties that publish a site are responding; 4 are verified healthy end-to-end');
    await expect(page.locator('.hero .headline')).toContainText('These are requests, not people');
    await expect(page.locator('.hero .kpi', { hasText: 'Responding now' })).toContainText('20 / 20');
    await expect(page.locator('.hero .kpi', { hasText: 'Edge traffic' })).toContainText('requests, not people');
    await expect(page.locator('.hero .kpi', { hasText: 'Business outcomes' })).toContainText('2 / 20');

    // Decision cockpit: expose the governed diagnostics ranking and investor-claim guardrails without inventing another score.
    const cockpit = page.locator('.decision-cockpit');
    await expect(cockpit.getByRole('heading', { name: 'Decision cockpit' })).toBeVisible();
    await expect(cockpit.locator('.kpi', { hasText: 'Actionable now' })).toContainText(String(plane.diagnostics.summary.actionableNow));
    await expect(cockpit.locator('.kpi', { hasText: 'Decisions needed' })).toContainText(String(plane.diagnostics.summary.decisionNeeded));
    await expect(cockpit.locator('.kpi', { hasText: 'Blocked on authority' })).toContainText(String(plane.diagnostics.summary.blockedOnAuthority));
    const terminalStatuses = plane.diagnostics.agentContract.terminalStatuses;
    const openDiagnostics = plane.diagnostics.items.filter(item => !terminalStatuses.includes(item.status));
    const claimBlockers = openDiagnostics.filter(item => item.escalation?.blocksInvestorClaim);
    await expect(cockpit.locator('.kpi', { hasText: 'Investor-claim blockers' })).toContainText(String(claimBlockers.length));
    if (openDiagnostics.length) await expect(cockpit.locator('.decision-item').first()).toContainText(openDiagnostics[0].title);
    await expect(cockpit).toContainText('Open evidence & score');

    // Contribution chart: bars and the table view equal the audience contract exactly.
    const bars = plane.audience.properties.filter(row => row.requests[28].evidenceState === 'measured').sort((a, b) => b.requests[28].value - a.requests[28].value);
    const card = page.locator('.chart-card', { hasText: 'Which properties carry the traffic?' });
    await card.locator('summary', { hasText: 'View as table' }).click();
    const rows = card.locator('.mc-table-alt tbody tr');
    await expect(rows).toHaveCount(bars.length);
    await expect(rows.first().locator('td').first()).toHaveText(bars[0].requests[28].value.toLocaleString('en-US'));
    const total = bars.reduce((sum, row) => sum + row.requests[28].value, 0);
    expect(total).toBe(plane.audience.estate.requests[28].value);

    // Trajectory: one dot per governed day, each with its exact value.
    const dots = page.locator('.linechart .dot');
    await expect(dots).toHaveCount(plane.audience.series.estateDaily.points.length);
    await expect(dots.first()).toHaveAttribute('aria-label', /Sep 3 [\d,]+/);

    // Composition segments sum to the estate.
    const counts = await page.locator('.segment-chart .seg').allTextContents();
    expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(25);

    await expect(page.locator('.window-card', { hasText: '28 days' })).toContainText(/2\.4M/);
    await expect(page.getByText('Concentration: the top property carries')).toBeVisible();
    await expect(page.locator('.matrix tbody tr')).toHaveCount(25);
    await expect(page.locator('.empty-hero')).toHaveCount(0);
  });

  test('unknown, unverified and unmeasured stay distinct from zero on the page', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({
      governed: true,
      mutate: world => {
        world.sites['aiaimate.com'] = { title: 'AIAIMate', body: '<html><title>AIAIMate</title><script src="https://www.googletagmanager.com/gtag/js?id=G-REAL123456"></script></html>', paths: { '/api/search': { status: 500, contentType: 'application/json', json: {} } } };
      },
    });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/#operator');
    await ready(page);
    const row = page.locator('.prop-row', { hasText: 'AIAIMate' });
    await expect(row).toContainText('Failing');
    await expect(row).toContainText('Tag shipped, unverified');
    await expect(row).toContainText('Owner-declared');
    await expect(row).not.toContainText('Verified healthy');
    const parked = page.locator('.prop-row', { hasText: 'fwomps.com' });
    await expect(parked).toContainText('Nothing published, intent not declared');
    await expect(parked).not.toContainText('Failing');
    await expect(page.locator('.prop-row', { hasText: 'Heavy Moose' })).toContainText('Not instrumented');
  });

  test('evidence expiry withdraws health claims instead of showing them as current', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence();
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 30 * 3600000));
    await page.goto('/observatory/mission-control/');
    await ready(page);
    await expect(page.locator('#evidence-banner')).toContainText('has expired');
    await expect(page.locator('.hero .kpi', { hasText: 'Responding now' })).toContainText('Unknown');
    await expect(page.locator('.hero .headline')).toContainText('expired');
    await expect(page.locator('.segment-chart')).toHaveCount(0);
    await expect(page.locator('.tile .pill', { hasText: 'Verified healthy' })).toHaveCount(0);
    await expect(page.locator('.tile .pill', { hasText: 'Unknown' }).first()).toBeVisible();
  });
});

test.describe('operator view', () => {
  test('the top actionable item is named, ranked with its reasons, and the queue filters answer "what next?"', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({
      governed: true,
      mutate: world => {
        world.sites['aiaimate.com'] = { title: 'AIAIMate', paths: { '/api/search': { status: 500, contentType: 'application/json', json: { error: 'x' } } } };
      },
    });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/#operator');
    await ready(page);

    await expect(page.getByRole('heading', { name: 'What should I work on next, and why?' })).toBeVisible();
    const next = page.locator('.next-up');
    await expect(next).toContainText('AIAIMate responds, but its critical path is failing');
    await expect(next).toContainText('highest-ranked item that can be worked on right now');

    // The first card is opened and shows the score breakdown.
    const top = page.locator('.finding', { hasText: 'critical path is failing' });
    await expect(top.locator('.score-table')).toContainText('severity');
    await expect(top.locator('.score-table')).toContainText('Can be worked on now');
    await expect(top).toContainText('Evidence: fresh');

    const summary = await page.locator('.result-count').textContent();
    const total = Number(/of (\d+) items/.exec(summary)[1]);

    await page.locator('#queue-actionability').selectOption('blocked-on-authority');
    const blocked = page.locator('.finding');
    await expect(blocked.first()).toContainText('Blocked on authority');
    for (const text of await blocked.locator('.finding-chips').allTextContents()) expect(text).toContain('Blocked on authority');
    await page.locator('#queue-actionability').selectOption('all');

    await page.locator('#queue-severity').selectOption('critical');
    await expect(page.locator('.finding')).toHaveCount(1);
    await expect(page.locator('.finding')).toContainText('Certify human audience metrics');
    await page.locator('#queue-severity').selectOption('all');

    await page.locator('#queue-category').selectOption('critical-path');
    await expect(page.locator('.finding').first()).toContainText('Critical path');
    await page.locator('#queue-category').selectOption('all');

    await page.locator('#queue-search').fill('zzzz-no-such-work');
    await expect(page.locator('.finding')).toHaveCount(0);
    await expect(page.getByText('No item matches these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(page.locator('.finding').first()).toBeVisible();

    await page.locator('#queue-search').fill('aiaimate');
    await expect(page.locator('.finding').first()).toContainText('AIAIMate');
    await page.locator('#queue-search').fill('');

    await page.locator('#queue-status').selectOption('all');
    await expect(page.locator('.result-count')).toContainText('of ' + total + ' items');

    await page.locator('#queue-sort').selectOption('severity');
    await expect(page.locator('.finding').first()).toContainText('Critical');
  });

  test('clicking a property chip filters to it, and executive links deep-link into the queue', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({ governed: true });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/#operator');
    await ready(page);
    const chip = page.locator('.finding .chip-button', { hasText: 'Cyan Canoe' }).first();
    await chip.click();
    await expect(page.locator('#queue-subject')).toHaveValue('cyancanoe.com');
    const shown = Number(/Showing (\d+) of (\d+)/.exec(await page.locator('.result-count').textContent())[1]);
    const all = Number(/of (\d+) items/.exec(await page.locator('.result-count').textContent())[1]);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(all);
    await expect(page.locator('.finding').first()).toContainText(/Cyan Canoe|properties/);

    await page.goto('/observatory/mission-control/#executive');
    await expect(page.locator('#view-executive')).toBeVisible();
    await page.locator('#view-executive .inline-link', { hasText: 'Open in queue' }).first().click();
    await expect(page.locator('#view-operator')).toBeVisible();
    await expect(page.locator('#queue-search')).not.toHaveValue('');
  });

  test('property table filters, sorts and discloses evidence', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({ governed: true, secondary: true });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/#operator');
    await ready(page);
    await expect(page.locator('.prop-row')).toHaveCount(25);
    await page.locator('#prop-status').selectOption('nothing-published-intent-unknown');
    await expect(page.locator('.prop-row')).toHaveCount(4);
    await page.locator('#prop-status').selectOption('all');
    await page.locator('#prop-search').fill('fwomps');
    await expect(page.locator('.prop-row')).toHaveCount(1);
    await page.locator('#prop-search').fill('globaldeets');
    const row = page.locator('.prop-row').first();
    await row.locator('summary', { hasText: 'Evidence' }).click();
    await expect(row).toContainText('✓ home');
    await expect(row).toContainText('Vantage github-actions:');
    await expect(row).toContainText('Vantage github-actions-macos');
    await page.locator('#prop-search').fill('');
    await page.locator('#prop-lifecycle').selectOption('incubating');
    await expect(page.locator('.prop-row')).toHaveCount(3);
    await page.locator('#prop-lifecycle').selectOption('all');
    await page.locator('#prop-sort').selectOption('name');
    await expect(page.locator('.prop-row').first()).toContainText('AgentK');
  });
});

test.describe('trust, sharing and accessibility', () => {
  test('fail closed: a document that contradicts itself is withheld, not shown', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({ governed: true });
    await serveEvidence(page, dir, (name, body) => {
      if (name !== 'audience.json') return body;
      const audience = JSON.parse(body);
      audience.source.gold.fixture = true;
      return JSON.stringify(audience);
    });
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/');
    await expect(page.locator('body[data-mission-control-ready="error"]')).toBeVisible();
    await expect(page.locator('#mission-control-error')).toContainText('withheld');
    await expect(page.locator('.hero')).toHaveCount(0);
  });

  test('fail closed: forged numbers (a zero without instrumentation) are refused', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence();
    await serveEvidence(page, dir, (name, body) => {
      if (name !== 'business-events.json') return body;
      const events = JSON.parse(body);
      const property = events.properties.find(item => item.propertyId === 'heavymoose.com');
      property.events.push({ eventType: 'lead', label: 'Lead', readings: { 7: { evidenceState: 'measured', value: 0 }, 28: { evidenceState: 'measured', value: 0 }, 90: { evidenceState: 'measured', value: 0 } } });
      return JSON.stringify(events);
    });
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/');
    await expect(page.locator('body[data-mission-control-ready="error"]')).toBeVisible();
    await expect(page.locator('#mission-control-error')).toContainText('zero without instrumentation');
  });

  test('copy summary puts an as-of stamped, evidence-derived summary on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const { dir, finishedAt } = await collectEvidence({ governed: true });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/');
    await ready(page);
    await page.getByRole('button', { name: 'Copy summary' }).click();
    await expect(page.locator('#copy-status')).toContainText('copied');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('GlobalDeets Mission Control — estate summary');
    expect(text).toContain('production probes observed');
    expect(text).toContain('These are requests, not people');
    expect(text).toContain('Unknown is not zero, reachable is not healthy, and edge requests are not people.');
  });

  test('print layout is a clean light document: no chrome, no controls', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({ governed: true });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/');
    await ready(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.actions')).toBeHidden();
    await expect(page.locator('.footer-links')).toBeHidden();
    await expect(page.locator('.hero')).toBeVisible();
    const colors = await page.evaluate(() => ({ body: window.getComputedStyle(document.body).backgroundColor, text: window.getComputedStyle(document.body).color }));
    expect(colors.body).toBe('rgb(255, 255, 255)');
    expect(colors.text).toBe('rgb(17, 17, 17)');
    await expect(page.locator('.chart-table').first()).toBeHidden();
  });

  test('semantics: tabs, landmarks, named charts and keyboard-reachable marks', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({ governed: true });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/');
    await ready(page);
    await expect(page.getByRole('tablist', { name: 'Choose a view' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Executive' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('main')).toBeVisible();
    for (const chart of await page.locator('[role="img"]').all()) expect(await chart.getAttribute('aria-label')).toBeTruthy();
    await expect(page.locator('.linechart')).toHaveAttribute('aria-label', /usage growing or shrinking/i);
    await page.locator('.linechart .dot').first().focus();
    await expect(page.locator('.mc-tooltip')).toBeVisible();
    await expect(page.locator('.mc-tooltip')).toContainText('requests per day');
    await page.getByRole('tab', { name: 'Executive' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Operator' })).toHaveAttribute('aria-selected', 'true');
    for (const control of await page.locator('#view-operator select, #view-operator input').all()) expect(await control.getAttribute('aria-label')).toBeTruthy();
  });
});

test.describe('narrow screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('executive view fits the viewport with no horizontal overflow', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({ governed: true, secondary: true });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/');
    await ready(page);
    await expect(page.locator('.hero .headline')).toBeVisible();
    await noOverflow(page);
    const box = await page.locator('.matrix-scroll').evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    expect(box.scroll).toBeGreaterThan(box.client);
  });

  test('operator view stacks the property table into labelled cards and never overflows the page', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({ governed: true });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/#operator');
    await ready(page);
    await expect(page.locator('.prop-row').first()).toBeVisible();
    await noOverflow(page);
    const label = await page.locator('.prop-row td').first().evaluate(node => window.getComputedStyle(node, '::before').content);
    expect(label).toContain('Status');
  });

  test('the committed baseline also fits', async ({ page }) => {
    await page.clock.setFixedTime(SEED_NOW);
    await page.goto('/observatory/mission-control/');
    await ready(page);
    await noOverflow(page);
  });
});

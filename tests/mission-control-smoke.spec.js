const { mkdtempSync, readFileSync } = require('fs');
const { tmpdir } = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { expect, test } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const SEED_NOW = new Date('2026-09-24T17:00:00Z');

const coverageFixture = {
  observatoryId: 'coverage-evidence',
  integrity: { valid: true, localReporting: { valid: true } },
  newsCoverage: { totalSources: 21 },
  evidenceCoverage: { dossierCount: 1 },
  gaps: [{ id: 'coverage:fixture', severity: 'high' }],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/intelligence/observatory/coverage', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(coverageFixture) });
  });
});

/**
 * Drives the REAL collector pipeline (probe engine + ledger + diagnostics) with a simulated estate and
 * serves its published files to the page, so browser tests exercise production-shaped evidence.
 */
async function collectEvidence({ mutate, start = '2026-10-01T12:00:00Z' } = {}) {
  const fakes = await import(pathToFileURL(path.join(ROOT, 'tests/helpers/mission-control-fakes.mjs')).href);
  const { runCollection } = await import(pathToFileURL(path.join(ROOT, 'tools/mission-control/lib/collect.mjs')).href);
  const clock = fakes.makeClock(Date.parse(start));
  const world = fakes.healthyWorld(fakes.registry(), clock);
  if (mutate) mutate(world);
  const dir = mkdtempSync(path.join(tmpdir(), 'mc-pw-'));
  const result = await runCollection({ root: ROOT, evidenceDir: dir, deps: fakes.makeDeps(world), env: {}, runId: 'pw-run', confirmDelayMs: 1, skipInventory: true });
  return { dir, finishedAt: result.run.finishedAt };
}

async function serveEvidence(page, dir) {
  await page.route('**/observatory/mission-control/*.json', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (['history.json', 'estate-health.json', 'diagnostics.json', 'mission-control-data.json', 'probes.json'].includes(name)) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(path.join(dir, 'latest', name), 'utf8') });
      return;
    }
    await route.fallback();
  });
}

const ready = page => expect(page.locator('body[data-mission-control-ready="true"]')).toBeVisible();

test('Mission Control renders investor-safe history, estate health, and business interpretation', async ({ page }) => {
  await page.clock.setFixedTime(SEED_NOW);
  await page.goto('/observatory/mission-control/');
  await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible();
  await ready(page);
  await expect(page.locator('#investor-grid').getByText('21/25', { exact: true })).toBeVisible();
  await expect(page.getByText('A governed world-information layer is already live')).toBeVisible();
  await expect(page.getByText('Certify human audience metrics')).toBeVisible();
  await expect(page.getByText(/Raw edge visits cannot be presented as audience/)).toBeVisible();
  await expect(page.getByText('Investor-safe audience', { exact: true })).toBeVisible();
  await expect(page.getByText('Not yet certified')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Truthful trends, including the gaps' })).toBeVisible();
  await expect(page.getByText(/Certified audience history is unavailable/)).toBeVisible();
  await expect(page.locator('#estate-table-body tr')).toHaveCount(25);
  await expect(page.locator('#estate-table-body tr').nth(0)).toContainText('GlobalDeets');
  await expect(page.locator('#estate-table-body tr').nth(1)).toContainText('Culture Sherpa');
  await expect(page.locator('#mission-control-error')).toBeHidden();
});

test('seed state keeps every property unknown and says so: no evidence is not health', async ({ page }) => {
  await page.clock.setFixedTime(SEED_NOW);
  await page.goto('/observatory/mission-control/');
  await ready(page);
  await expect(page.locator('#estate-table-body tr[data-health="health-evidence-incomplete"]')).toHaveCount(25);
  await expect(page.locator('#estate-table-body tr[data-availability="unknown"]')).toHaveCount(25);
  await expect(page.locator('#investor-grid')).toContainText('Verified healthy');
  await expect(page.locator('#investor-grid [data-state="limited"]').first()).toBeVisible();
  await expect(page.locator('#evidence-status')).toContainText('No valid probe run collected yet');
  await expect(page.getByText('Production probe evidence is missing', { exact: false }).or(page.getByText('No production probe evidence has been collected'))).toBeVisible();
});

test('Mission Control filters the escalation-aware operating queue', async ({ page }) => {
  await page.clock.setFixedTime(SEED_NOW);
  await page.goto('/observatory/mission-control/');
  await ready(page);

  await page.locator('#severity-filter').selectOption('critical');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(1);
  await expect(page.getByText('Certify human audience metrics')).toBeVisible();

  await page.locator('#severity-filter').selectOption('all');
  await page.locator('#gap-search').fill('Culture Sherpa');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(1);
  await expect(page.getByText('Quantify Culture Sherpa convergence opportunity')).toBeVisible();

  await page.locator('#gap-search').fill('');
  await page.locator('#status-filter').selectOption('in-progress');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(2);

  await page.locator('#status-filter').selectOption('all');
  await page.locator('#escalation-filter').selectOption('investor-blocking');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(1);
  await expect(page.locator('#gap-list .gap-card')).toContainText('Certify human audience metrics');

  await page.locator('#escalation-filter').selectOption('all');
  await page.locator('#class-filter').selectOption('observability-gap');
  await expect(page.locator('#gap-list .gap-card').first()).toHaveAttribute('data-class', 'observability-gap');
});

test('Mission Control exposes estate observability gaps without implying outages', async ({ page }) => {
  await page.clock.setFixedTime(SEED_NOW);
  await page.goto('/observatory/mission-control/');
  await ready(page);

  await page.locator('#property-observability-filter').selectOption('unobserved');
  await expect(page.locator('#estate-table-body tr')).toHaveCount(4);
  await expect(page.locator('#estate-table-body')).toContainText('fwomps.com');

  await page.locator('#property-search').fill('fwomps.com');
  await expect(page.locator('#estate-table-body tr')).toHaveCount(1);
  await expect(page.locator('#estate-table-body tr')).toContainText('RUM off');
  await expect(page.locator('#estate-table-body tr')).toContainText('Unknown');
});

test('Mission Control changes historical windows without fabricating a trend', async ({ page }) => {
  await page.clock.setFixedTime(SEED_NOW);
  await page.goto('/observatory/mission-control/');
  await ready(page);
  await page.locator('#trend-range').selectOption('90');
  await expect(page.locator('#history-window-note')).toContainText('90-day view');
  await expect(page.locator('#history-operational-note')).toContainText('1 comparable measured snapshot');
  await page.locator('#trend-range').selectOption('7');
  await expect(page.locator('#history-window-note')).toContainText('missing day');
});

test('scheduled evidence: verified health requires the authoritative contract; 200 alone is reachable-unverified', async ({ page }) => {
  const { dir, finishedAt } = await collectEvidence();
  await serveEvidence(page, dir);
  await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
  await page.goto('/observatory/mission-control/');
  await ready(page);

  const rows = page.locator('#estate-table-body tr');
  await expect(rows).toHaveCount(25);
  await expect(rows.nth(0)).toContainText('GlobalDeets');
  await expect(rows.nth(0)).toContainText('Verified Healthy');
  await expect(rows.nth(0)).toContainText('Authoritative contract');
  await expect(rows.nth(1)).toContainText('Culture Sherpa');
  await expect(rows.nth(1)).toContainText('Reachable Unverified');
  await expect(rows.nth(1)).toContainText('Baseline contract');
  await expect(page.locator('#estate-table-body tr[data-health="verified-healthy"]')).toHaveCount(1);
  await expect(page.locator('#estate-table-body tr[data-health="no-service-published"]')).toHaveCount(4);
  await expect(page.locator('#estate-table-body tr[data-health="outage"]')).toHaveCount(0);
  await expect(page.locator('#estate-table-summary')).toContainText('25 availability-probed');
  await expect(page.locator('#estate-table-summary')).toContainText('1 verified healthy');

  await expect(page.locator('#evidence-status [data-freshness="fresh"]').first()).toContainText('Fresh');
  await expect(page.locator('#history-availability-note')).toContainText('1 measured probe snapshot');
  await expect(page.locator('#gap-list')).toContainText('publish no web service');
  await expect(page.locator('#gap-list')).not.toContainText('is unavailable');

  await page.locator('#property-availability-filter').selectOption('no-service-published');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('No Service Published');
});

test('scheduled evidence: outages are confirmed, classified, and escalated by investor criticality', async ({ page }) => {
  const { dir, finishedAt } = await collectEvidence({
    mutate: world => {
      world.sites['agentkagent.com'] = { status: 502, title: 'x' };
      world.sites['culturesherpa.org'] = { status: 500, title: 'x' };
    },
  });
  await serveEvidence(page, dir);
  await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
  await page.goto('/observatory/mission-control/');
  await ready(page);

  // culturesherpa.com is a redirect alias whose destination is down, so it is honestly an outage too.
  await expect(page.locator('#estate-table-body tr[data-health="outage"]')).toHaveCount(3);
  await expect(page.locator('#estate-table-body tr').nth(1)).toContainText('Outage');
  await expect(page.locator('#estate-table-body tr').nth(1)).toContainText('Investor-critical');
  await expect(page.locator('#investor-grid [data-state="attention"]').first()).toBeVisible();

  await page.locator('#class-filter').selectOption('investor-impacting-outage');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(1);
  await expect(page.locator('#gap-list .gap-card')).toContainText('Culture Sherpa is unavailable');
  await expect(page.locator('#gap-list .gap-card')).toContainText('Escalation: Page');

  await page.locator('#class-filter').selectOption('outage');
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(2);
  await expect(page.locator('#gap-list')).toContainText('agentkagent.com');
  await expect(page.locator('#gap-list')).not.toContainText('Investor-Impacting Outage');
});

test('scheduled evidence ages visibly: stale then expired evidence is never shown as current health', async ({ page }) => {
  const { dir, finishedAt } = await collectEvidence();
  await serveEvidence(page, dir);
  await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 30 * 3600000));
  await page.goto('/observatory/mission-control/');
  await ready(page);

  await expect(page.locator('#estate-table-body tr[data-health="evidence-expired"]')).toHaveCount(25);
  await expect(page.locator('#estate-table-body tr[data-health="verified-healthy"]')).toHaveCount(0);
  await expect(page.locator('#evidence-status [data-freshness="expired"]').first()).toContainText('Expired');
  await expect(page.locator('#investor-grid')).toContainText('Unknown');
  await expect(page.locator('#gap-list')).toContainText('Production probe evidence is expired');
  await page.locator('#class-filter').selectOption('stale-evidence');
  await expect(page.locator('#gap-list .gap-card').first()).toHaveAttribute('data-class', 'stale-evidence');
});

test('scheduled evidence: an invalid probe attempt is disclosed and the last valid run keeps aging', async ({ page }) => {
  const first = await collectEvidence({ start: '2026-10-01T06:00:00Z' });
  const fakes = await import(pathToFileURL(path.join(ROOT, 'tests/helpers/mission-control-fakes.mjs')).href);
  const { runCollection } = await import(pathToFileURL(path.join(ROOT, 'tools/mission-control/lib/collect.mjs')).href);
  const clock = fakes.makeClock(Date.parse('2026-10-01T10:00:00Z'));
  const world = fakes.healthyWorld(fakes.registry(), clock);
  world.fetchImpl = fakes.makeFetch({}, clock);
  await runCollection({ root: ROOT, evidenceDir: first.dir, deps: fakes.makeDeps(world), env: {}, runId: 'pw-bad', confirmDelayMs: 1, skipInventory: true });
  await serveEvidence(page, first.dir);
  await page.clock.setFixedTime(new Date('2026-10-01T11:00:00Z'));
  await page.goto('/observatory/mission-control/');
  await ready(page);
  await expect(page.locator('#evidence-status')).toContainText('was invalid and discarded');
  await expect(page.locator('#estate-table-body tr[data-health="outage"]')).toHaveCount(0);
  await expect(page.locator('#gap-list')).toContainText('Latest probe run was invalid');
});

test.describe('Mission Control mobile surface', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('remains readable without document-level horizontal overflow', async ({ page }) => {
    await page.clock.setFixedTime(SEED_NOW);
    await page.goto('/observatory/mission-control/');
    await ready(page);
    await expect(page.getByRole('heading', { name: 'Property health & evidence' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });

  test('live evidence, freshness panel, and reachability chart stay within the mobile viewport', async ({ page }) => {
    const { dir, finishedAt } = await collectEvidence({
      mutate: world => {
        world.sites['agentkagent.com'] = { status: 502, title: 'x' };
      },
    });
    await serveEvidence(page, dir);
    await page.clock.setFixedTime(new Date(Date.parse(finishedAt) + 3600000));
    await page.goto('/observatory/mission-control/');
    await ready(page);
    await expect(page.locator('#evidence-status')).toBeVisible();
    await expect(page.locator('#history-availability')).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    // The wide table scrolls inside its own region instead of forcing page overflow.
    const wrap = page.locator('.estate-table-wrap');
    await expect(wrap).toBeVisible();
    const box = await wrap.evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    expect(box.scroll).toBeGreaterThan(box.client);
  });
});

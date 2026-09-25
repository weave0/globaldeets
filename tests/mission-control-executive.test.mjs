import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, registry } from './helpers/mission-control-fakes.mjs';
import { collect, newDir, tagHost, GA4, writeSource } from './helpers/mission-control-plane.mjs';
import { syntheticEventsFeed, syntheticGold, syntheticInsights } from './helpers/mission-control-audience-fixtures.mjs';
import { expectedPropertyIds, validateDataPlane } from '../tools/mission-control/lib/contracts.mjs';
import { validateExecutive } from '../tools/mission-control/lib/executive.mjs';

const reg = registry();
const ids = reg.properties.map(item => item.propertyId);
const opts = { expectPropertyIds: expectedPropertyIds(reg) };
const seed = name => JSON.parse(readFileSync(join(ROOT, 'observatory/mission-control', name), 'utf8'));

function governed(dir, { gold = {}, insights = {}, events } = {}) {
  const env = {
    GOLD_SOURCE: writeSource(dir, 'canonical-gold-m1.2.json', syntheticGold({ propertyIds: ids, ...gold })),
    INSIGHTS_SOURCE: writeSource(dir, 'traffic-insights-1.0.json', syntheticInsights({ propertyIds: ids, ...insights })),
  };
  if (events) env.EVENTS_SOURCE = writeSource(dir, 'events.json', events);
  return env;
}

test('the committed seed is honest: no probe evidence, awaiting the audience source, no outcomes, and no fixture anywhere', () => {
  const executive = seed('executive.json');
  const audience = seed('audience.json');
  const events = seed('business-events.json');
  assert.equal(audience.source.status, 'awaiting-authorized-source');
  assert.equal(audience.source.gold, null);
  assert.equal(events.source.status, 'not-connected');
  assert.equal(events.source.feed, null);
  assert.equal(events.coverage.instrumented, 0);
  for (const document of [audience, events, executive]) assert.ok(!/"fixture":\s*true/.test(JSON.stringify(document)));
  const texts = executive.headline.statements.map(item => item.text).join(' ');
  assert.match(texts, /No valid production probe evidence/);
  assert.match(texts, /Usage cannot be stated yet/);
  assert.match(texts, /No property reports business outcomes yet/);
  assert.doesNotMatch(texts, /verified healthy|responding/i, 'the seed never claims health it has not measured');
  const seedHistory = seed('history.json');
  assert.ok(seedHistory.snapshots.every(snapshot => !snapshot.audience || snapshot.audience.evidenceState === 'unavailable'));
});

test('every chart is either measured with provenance, or an intentional empty state that says what is missing and what unblocks it', async () => {
  for (const { executive } of [{ executive: seed('executive.json') }, { executive: (await collect(newDir())).plane.executive }]) {
    for (const chart of Object.values(executive.charts)) {
      assert.ok(chart.title && chart.question && chart.unit, chart.id + ' has a title, a question and a unit');
      if (chart.evidenceState === 'empty') {
        assert.equal(chart.data, null, chart.id + ' plots nothing when empty');
        assert.ok(chart.empty.detail.length > 20, chart.id + ' explains why');
      } else {
        assert.ok(chart.provenance, chart.id + ' states its provenance');
        assert.ok(chart.asOf, chart.id + ' states its as-of time');
      }
    }
    assert.equal(executive.charts.audienceTrajectory?.evidenceState ?? executive.charts.trajectory.evidenceState, 'empty');
    assert.match(executive.charts.trajectory.empty.unblockedBy, /MISSION_CONTROL_GOLD_TOKEN/);
  }
});

test('unknown is not failure: blocked, unknown and nothing-published properties are never counted as needing attention', async () => {
  const { plane } = await collect(newDir(), {
    mutate: world => {
      world.sites['brettleeweaver.com'] = { status: 403, title: 'x', body: '<html><title>Just a moment...</title>cf-challenge</html>' };
    },
  });
  const composition = plane.executive.charts.operationalComposition.data;
  const segment = key => composition.segments.find(item => item.key === key);
  assert.ok(segment('unknown').properties.includes('brettleeweaver.com'));
  assert.equal(segment('attention').count, 0);
  assert.equal(composition.segments.reduce((sum, item) => sum + item.count, 0), 25);
  assert.equal(segment('inactive-unknown').count, 4);
  const health = plane.executive.headline.statements.find(item => item.id === 'health');
  assert.equal(health.tone, 'good', 'a blocked property does not turn the estate red');
  assert.match(health.text, /1 property is blocked from view \(not counted as failing\)/);
  assert.match(health.text, /None is failing/);
});

test('with an authoritative failure the headline says so, and a healthy estate is described without overclaiming', async () => {
  const healthy = (await collect(newDir())).plane.executive;
  const text = healthy.headline.statements.find(item => item.id === 'health').text;
  assert.match(text, /^20 of 20 properties that publish a site are responding; 4 are verified healthy end-to-end\./);
  assert.match(text, /4 domains publish nothing\./);

  const broken = (await collect(newDir(), { mutate: world => { world.sites['aiaimate.com'] = { title: 'AIAIMate', paths: { '/api/search': { status: 500, contentType: 'application/json', json: {} } } }; } })).plane.executive;
  const brokenText = broken.headline.statements.find(item => item.id === 'health');
  assert.equal(brokenText.tone, 'bad');
  assert.match(brokenText.text, /1 property needs attention/);
  assert.match(brokenText.text, /^19 of 20/);
  assert.equal(broken.findings.nextUp.id, 'criticalpath:failed:aiaimate.com');
  assert.ok(broken.findings.risks.some(risk => risk.id === 'criticalpath:failed:aiaimate.com'), 'the failing critical path is among the top risks');
  assert.ok(broken.findings.risks.every(risk => risk.actionability && risk.why && risk.action), 'each risk says why it matters and what to do');
});

test('chart data matches the underlying governed evidence exactly (composition, contribution, trajectory, movers, maturity)', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, { env: governed(dir, { gold: {}, insights: { growth: { 'aiaimate.com': 0.05, 'heavymoose.com': -0.05 } } }) });
  const { executive, audience, estate } = plane;
  assert.deepEqual(validateDataPlane(plane, opts), []);

  const contribution = executive.charts.contribution;
  assert.equal(contribution.data.total, audience.estate.requests[28].value);
  for (const bar of contribution.data.bars) {
    const row = audience.properties.find(item => item.propertyId === bar.propertyId);
    assert.equal(bar.value, row.requests[28].value);
    assert.equal(bar.sharePct, row.share28d.value);
  }
  assert.equal(contribution.data.bars.reduce((sum, bar) => sum + bar.value, 0), contribution.data.total);
  assert.deepEqual(contribution.data.bars.map(bar => bar.value), [...contribution.data.bars.map(bar => bar.value)].sort((a, b) => b - a), 'sorted by contribution');

  const trajectory = executive.charts.trajectory;
  assert.deepEqual(trajectory.data.points, audience.series.estateDaily.points);
  assert.equal(trajectory.data.points.length, 28);

  const movers = executive.charts.movers.data;
  assert.deepEqual(movers.growing.map(entry => entry.propertyId), audience.estate.movers.growing.map(entry => entry.propertyId));
  assert.ok(movers.declining.every(entry => entry.pct < 0));

  const composition = executive.charts.operationalComposition.data;
  for (const segmentItem of composition.segments) assert.equal(segmentItem.count, segmentItem.properties.length);
  assert.equal(executive.snapshot.verifiedHealthy, estate.summary.verifiedHealthyZones);

  for (const row of executive.maturity) {
    if (row.denominator) assert.equal(row.pct, Math.round((row.numerator / row.denominator) * 1000) / 10);
  }
  const maturity = id => executive.maturity.find(row => row.id === id);
  assert.equal(maturity('audience').numerator, audience.estate.propertiesMeasured);
  assert.equal(maturity('critical-path').numerator, estate.summary.criticalPathAuthoritativeZones);
  assert.equal(maturity('critical-path').denominator, estate.summary.servingExpectedZones);
  assert.equal(maturity('instrumentation-verified').numerator, 0);
});

test('audience headline states the measured figure with its limits and never calls requests people', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, { env: governed(dir) });
  const usage = plane.executive.headline.statements.find(item => item.id === 'usage').text;
  assert.match(usage, /edge requests in the latest 28 days across 25 of 25 properties/);
  assert.match(usage, /These are requests, not people/);
  assert.ok(usage.includes(plane.audience.estate.requests[28].value.toLocaleString('en-US')));
  assert.doesNotMatch(usage, /visitors|users|humans? (visited|used)/i);
  assert.equal(plane.executive.charts.composition.data.segments[0].class, 'unclassified-edge-requests');
  assert.match(plane.executive.shareText, /Unknown is not zero, reachable is not healthy, and edge requests are not people\./);
});

test('a partial audience is described as a lower bound, and a stale one is withheld from headlines and charts', async () => {
  const partialDir = newDir();
  const partial = (await collect(partialDir, { env: governed(partialDir, { gold: { omit: ['heavymoose.com'] } }) })).plane.executive;
  assert.match(partial.headline.statements.find(item => item.id === 'usage').text, /across 24 of 25 properties \(a lower bound\)/);

  const staleDir = newDir();
  const stale = (await collect(staleDir, { start: '2026-10-08T12:00:00Z', env: governed(staleDir) })).plane.executive;
  assert.match(stale.headline.statements.find(item => item.id === 'usage').text, /Usage cannot be stated yet/);
  assert.equal(stale.charts.contribution.evidenceState, 'empty');
  assert.equal(stale.evidence.classes.find(entry => entry.id === 'audience').state, 'absent');
});

test('outcomes are described as measured only when a governed feed reports them; declared and connectable ones are shown separately', async () => {
  const dir = newDir();
  const feed = syntheticEventsFeed({ instrumented: ['aiaimate.com'], records: [['aiaimate.com', 'signup', 28, 44], ['aiaimate.com', 'signup', 7, 11], ['aiaimate.com', 'signup', 90, 120]] });
  const { plane } = await collect(dir, { env: { EVENTS_SOURCE: writeSource(dir, 'events.json', feed) } });
  const business = plane.executive.business;
  assert.equal(business.status, 'measured');
  assert.equal(business.funnel.evidenceState, 'measured');
  assert.equal(business.funnel.data.stages[0].reading.value, 44);
  assert.ok(business.declaredOutcomes.some(item => item.type === 'signup'));
  assert.ok(business.connectableProducers.some(item => item.propertyId === 'goodflippindesign.com'));
  assert.match(plane.executive.headline.statements.find(item => item.id === 'outcomes').text, /^1 of 20 properties report business outcomes\./);

  const none = (await collect(newDir())).plane.executive;
  assert.equal(none.business.funnel.evidenceState, 'empty');
  assert.match(none.business.funnel.empty.unblockedBy, /MISSION_CONTROL_EVENTS_SOURCE/);
  assert.deepEqual(none.business.connectableProducers.map(item => item.propertyId).sort(), ['aiaimate.com', 'cyancanoe.com', 'goodflippindesign.com']);
});

test('portfolio: every property appears once, grouped by purpose, with its declared status and never an invented one', async () => {
  const { plane } = await collect(newDir());
  const tiles = plane.executive.portfolio.groups.flatMap(group => group.tiles);
  assert.equal(tiles.length, 25);
  assert.equal(new Set(tiles.map(tile => tile.propertyId)).size, 25);
  const byId = id => tiles.find(tile => tile.propertyId === id);
  assert.equal(byId('fwomps.com').purpose, null, 'unknown purpose stays null');
  assert.equal(byId('fwomps.com').lifecycle, 'unknown');
  assert.equal(byId('goodflippindesign.com').primaryOutcome.label, 'Start a project inquiry');
  assert.equal(byId('culturesherpa.com').aliasOf, 'culturesherpa.org');
  assert.equal(plane.executive.portfolio.groups.find(group => group.tiles.some(tile => tile.propertyId === 'globaldeets.com')).categoryId, 'platform');
  assert.ok(tiles.every(tile => tile.operatingStatus.key && tile.expectation.kind));
});

test('the knowledge matrix shows, per property, what is known vs unknown vs not applicable', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, { mutate: world => tagHost(world, 'aiaimate.com', GA4('G-REAL123456')) });
  const matrix = plane.executive.knowledgeMatrix;
  assert.deepEqual(matrix.columns.map(column => column.id), ['availability', 'critical-path', 'telemetry', 'audience', 'outcomes']);
  const cells = id => Object.fromEntries(matrix.rows.find(row => row.propertyId === id).cells.map(cell => [cell.column, cell.state]));
  assert.deepEqual(cells('aiaimate.com'), { availability: 'known', 'critical-path': 'known', telemetry: 'partial', audience: 'unknown', outcomes: 'partial' });
  assert.deepEqual(cells('fwomps.com'), { availability: 'na', 'critical-path': 'na', telemetry: 'na', audience: 'unknown', outcomes: 'na' });
  assert.equal(cells('heavymoose.com')['critical-path'], 'partial', 'homepage-only checks are partial, not verified');
});

test('wins are only claimed when the evidence supports them', async () => {
  assert.deepEqual(seed('executive.json').findings.wins.map(item => item.id), ['win:critical-paths'], 'the seed claims only what configuration proves, never operating results');
  const single = (await collect(newDir())).plane.executive.findings.wins.map(item => item.id);
  assert.ok(single.includes('win:responding'));
  assert.ok(single.includes('win:flagship-verified'));
  assert.ok(!single.includes('win:second-vantage'), 'one vantage is not independent confirmation');
  const double = (await collect(newDir(), { secondary: [{ id: 'macos' }] })).plane.executive.findings.wins.map(item => item.id);
  assert.ok(double.includes('win:second-vantage'));
  const conflicted = (await collect(newDir(), { secondary: [{ id: 'macos', mutate: world => { world.sites['aiaimate.com'] = { status: 503, title: 'x' }; } }] })).plane.executive.findings.wins.map(item => item.id);
  assert.ok(!conflicted.includes('win:second-vantage'), 'a vantage conflict voids the second-vantage win');
});

test('unknowns are listed explicitly with what would close each one', async () => {
  const { plane } = await collect(newDir());
  const unknowns = plane.executive.unknowns;
  assert.ok(unknowns.every(item => item.title && item.detail && item.closedBy));
  assert.ok(unknowns.some(item => item.id === 'unknown:usage'));
  assert.ok(unknowns.some(item => item.id === 'unknown:humans'));
  assert.ok(unknowns.some(item => item.id === 'unknown:outcomes'));
  assert.ok(unknowns.some(item => item.id === 'unknown:telemetry'));
});

test('the executive validator rejects overclaiming and internally inconsistent documents', async () => {
  const { plane } = await collect(newDir());
  const { executive, estate } = plane;
  assert.deepEqual(validateExecutive(executive, { estate }), []);

  const composition = structuredClone(executive);
  composition.charts.operationalComposition.data.segments[0].count += 1;
  assert.ok(validateExecutive(composition, { estate }).some(error => /does not sum to the property total/.test(error)));

  const maturity = structuredClone(executive);
  maturity.maturity[0].pct = 99.9;
  assert.ok(validateExecutive(maturity, { estate }).some(error => /pct does not match/.test(error)));

  const overflow = structuredClone(executive);
  overflow.maturity[0].numerator = overflow.maturity[0].denominator + 1;
  assert.ok(validateExecutive(overflow, { estate }).some(error => /exceeds denominator/.test(error)));

  const claims = structuredClone(executive);
  claims.charts.contribution = { ...claims.charts.contribution, evidenceState: 'measured', data: null };
  assert.ok(validateExecutive(claims, { estate }).some(error => /claims evidence without data/.test(error)));

  const emptyWithData = structuredClone(executive);
  emptyWithData.charts.contribution = { ...emptyWithData.charts.contribution, evidenceState: 'empty', data: { fake: true } };
  assert.ok(validateExecutive(emptyWithData, { estate }).some(error => /must carry no data/.test(error)));

  const noProvenance = structuredClone(executive);
  noProvenance.charts.operationalComposition.provenance = null;
  assert.ok(validateExecutive(noProvenance, { estate }).some(error => /has no provenance/.test(error)));

  const policy = structuredClone(executive);
  policy.policy.edgeTrafficIsHumanAudience = true;
  assert.ok(validateExecutive(policy, { estate }).some(error => /edgeTrafficIsHumanAudience/.test(error)));
});

test('share text is derived from the same evidence and carries its as-of stamp', async () => {
  const { plane } = await collect(newDir());
  const text = plane.executive.shareText;
  assert.match(text, /^GlobalDeets Mission Control — estate summary\nGenerated /);
  assert.ok(text.includes(plane.estate.evidence.probe.runId));
  for (const statement of plane.executive.headline.statements) assert.ok(text.includes(statement.text));
  for (const row of plane.executive.maturity.filter(item => item.denominator)) assert.ok(text.includes(row.numerator + ' of ' + row.denominator));
});

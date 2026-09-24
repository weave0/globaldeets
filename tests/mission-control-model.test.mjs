import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { collect, newDir, writeSource } from './helpers/mission-control-plane.mjs';
import { syntheticGold, syntheticInsights } from './helpers/mission-control-audience-fixtures.mjs';
import { registry } from './helpers/mission-control-fakes.mjs';

const require = createRequire(import.meta.url);
const model = require('../observatory/mission-control/mc-model.js');
const semantics = require('../observatory/mission-control/evidence-semantics.js');
const ids = registry().properties.map(item => item.propertyId);

async function bundle(options = {}) {
  const dir = newDir();
  const env = options.governed ? { GOLD_SOURCE: writeSource(dir, 'canonical-gold-m1.2.json', syntheticGold({ propertyIds: ids })), INSIGHTS_SOURCE: writeSource(dir, 'traffic-insights-1.0.json', syntheticInsights({ propertyIds: ids })) } : {};
  const { plane } = await collect(dir, { env, mutate: options.mutate });
  return { summary: plane.summary, history: plane.history, estate: plane.estate, diagnostics: plane.diagnostics, audience: plane.audience, events: plane.events, executive: plane.executive, plane };
}

test('readings are shown with wording that keeps zero, unknown, unavailable, awaiting and stale apart', () => {
  const show = (reading, freshness, options) => model.describeReading(reading, freshness, options);
  assert.deepEqual(show({ evidenceState: 'measured', value: 1234567 }, null, { compact: true }).text, '1.2M');
  assert.equal(show({ evidenceState: 'measured', value: 0 }).text, '0');
  assert.equal(show({ evidenceState: 'measured', value: 0 }).note, 'measured zero');
  assert.equal(show({ evidenceState: 'partial', value: 950 }).note, 'partial, lower bound');
  assert.equal(show({ evidenceState: 'unavailable', value: null, reason: 'x' }).text, 'Unavailable');
  assert.equal(show({ evidenceState: 'awaiting-authorized-source', value: null, reason: 'x' }).text, 'Awaiting source');
  assert.equal(show({ evidenceState: 'not-connected', value: null, reason: 'x' }).text, 'Not connected');
  assert.equal(show({ evidenceState: 'uninstrumented', value: null, reason: 'x' }).text, 'Not instrumented');
  assert.equal(show({ evidenceState: 'incomparable', value: null, reason: 'x' }).text, 'Not comparable');
  assert.equal(show(undefined).text, 'Unknown');
  assert.equal(show({ evidenceState: 'measured', value: null }).text, 'Unknown', 'a measured state without a number is unknown, never zero');
  const stale = show({ evidenceState: 'measured', value: 500 }, { state: 'expired' });
  assert.equal(stale.text, 'Stale');
  assert.equal(stale.hasValue, false);
  assert.equal(show({ evidenceState: 'measured', value: -4.26 }, null, { percent: true, signed: true }).text, '-4.3%');
  assert.equal(show({ evidenceState: 'measured', value: 12 }, null, { percent: true, signed: true }).text, '+12%');
  for (const text of ['Stale', 'Unavailable', 'Awaiting source', 'Not connected', 'Not instrumented', 'Not comparable', 'Unknown']) assert.notEqual(text, '0');
});

test('formatting helpers are deterministic and UTC-based', () => {
  assert.equal(model.formatDate('2026-10-01T09:05:00Z'), 'Oct 1, 09:05 UTC');
  assert.equal(model.formatDay('2026-09-03'), 'Sep 3');
  assert.equal(model.formatNumber(null), 'Unknown');
  assert.equal(model.formatCompact(950), '950');
  assert.equal(model.formatCompact(15300), '15K');
  assert.equal(model.ageText(0.2), 'under an hour ago');
  assert.equal(model.ageText(30), '30h ago');
  assert.equal(model.ageText(72), '3d ago');
  assert.equal(model.ageText(null), 'age unknown');
});

test('queue filters: severity, category, actionability, property, confidence, freshness, search and status', async () => {
  const { diagnostics } = await bundle({ governed: true });
  const items = diagnostics.items;
  const open = model.filterFindings(items, { status: 'open' });
  assert.ok(open.every(item => !['closed', 'accepted-risk'].includes(item.status)));
  assert.equal(model.filterFindings(items, { status: 'closed' }).length, items.length - open.length);
  assert.ok(model.filterFindings(items, { severity: 'critical' }).every(item => item.severity === 'critical'));
  assert.ok(model.filterFindings(items, { category: 'instrumentation' }).every(item => item.category === 'instrumentation'));
  const blocked = model.filterFindings(items, { actionability: 'blocked-on-authority', status: 'open' });
  assert.ok(blocked.length && blocked.every(item => item.actionability.state === 'blocked-on-authority'));
  const now = model.filterFindings(items, { actionability: 'actionable-now', status: 'open' });
  assert.ok(now.every(item => item.actionability.state === 'actionable-now'));
  assert.equal(new Set([...blocked, ...now].map(item => item.id)).size, blocked.length + now.length, 'actionable and blocked never overlap');
  assert.ok(model.filterFindings(items, { subject: 'heavymoose.com' }).every(item => item.subjects.includes('heavymoose.com')));
  assert.ok(model.filterFindings(items, { confidence: 'high' }).every(item => item.confidence === 'high'));
  assert.ok(model.filterFindings(items, { freshness: 'static' }).every(item => item.freshness.state === 'static'));
  const searched = model.filterFindings(items, { search: 'Placeholder' });
  assert.ok(searched.length && searched.every(item => JSON.stringify(item).toLowerCase().includes('placeholder')));
  assert.equal(model.filterFindings(items, { search: 'zzzz-nothing' }).length, 0);
  assert.equal(model.filterFindings(items, { severity: 'all', category: 'all', actionability: 'all', status: 'all' }).length, items.length, 'all is a no-op');
  const combined = model.filterFindings(items, { severity: 'medium', category: 'instrumentation', status: 'open' });
  assert.ok(combined.every(item => item.severity === 'medium' && item.category === 'instrumentation'));
});

test('queue sorting is stable and matches the published order', async () => {
  const { diagnostics } = await bundle({ governed: true });
  const items = [...diagnostics.items].reverse();
  const byPriority = model.sortFindings(items, 'priority');
  assert.deepEqual(byPriority.map(item => item.id), diagnostics.items.map(item => item.id));
  const bySeverity = model.sortFindings(items, 'severity');
  const rank = model.SEVERITY_ORDER;
  for (let index = 1; index < bySeverity.length; index += 1) assert.ok(rank[bySeverity[index - 1].severity] <= rank[bySeverity[index].severity]);
  const byAge = model.sortFindings(items, 'age');
  for (let index = 1; index < byAge.length; index += 1) assert.ok(byAge[index - 1].ageDays >= byAge[index].ageDays);
  const byScore = model.sortFindings(items, 'score');
  for (let index = 1; index < byScore.length; index += 1) assert.ok(byScore[index - 1].priorityScore >= byScore[index].priorityScore);
  assert.deepEqual(model.sortFindings(items, 'nonsense').map(item => item.id), byPriority.map(item => item.id), 'an unknown sort key falls back to priority');
  assert.equal(items[0].id, diagnostics.items.at(-1).id, 'sorting never mutates its input');
});

test('facet counts add up to the items they describe', async () => {
  const { diagnostics } = await bundle();
  const facets = model.facets(diagnostics.items);
  assert.equal(facets.category.reduce((sum, [, count]) => sum + count, 0), diagnostics.items.length);
  assert.equal(facets.severity.reduce((sum, [, count]) => sum + count, 0), diagnostics.items.length);
  assert.equal(facets.actionability.reduce((sum, [, count]) => sum + count, 0), diagnostics.items.length);
});

test('property filters and sorting use the render-time status, not a stale label', async () => {
  const { estate } = await bundle({ mutate: world => { world.sites['aiaimate.com'] = { title: 'AIAIMate', paths: { '/api/search': { status: 500, contentType: 'application/json', json: {} } } }; } });
  const now = Date.parse(estate.generatedAt) + 3600000;
  const rows = estate.properties.map(row => { const status = model.effectiveStatus(row, now, estate.freshnessPolicy); return { row, status, health: status.health }; });
  assert.equal(rows.find(entry => entry.row.propertyId === 'aiaimate.com').status.key, 'failing');
  assert.equal(model.filterProperties(rows, { status: 'failing' }).length, 1);
  assert.equal(model.filterProperties(rows, { status: 'nothing-published-intent-unknown' }).length, 4);
  assert.equal(model.filterProperties(rows, { lifecycle: 'incubating' }).length, 3);
  assert.equal(model.filterProperties(rows, { category: 'reserved' }).length, 4);
  assert.equal(model.filterProperties(rows, { search: 'fwomp' }).length, 2);
  assert.equal(model.sortProperties(rows, 'status')[0].row.propertyId, 'aiaimate.com', 'needs-attention sorts first');
  assert.equal(model.sortProperties(rows, 'emphasis')[0].row.propertyId, 'globaldeets.com');
  assert.equal(model.sortProperties(rows, 'name')[0].row.profile.name, 'AgentK');

  // Twenty-nine hours later the same evidence has expired: every claim is withdrawn, computed client-side.
  const later = Date.parse(estate.generatedAt) + 29 * 3600000;
  const expired = estate.properties.map(row => model.effectiveStatus(row, later, estate.freshnessPolicy));
  assert.ok(expired.filter(status => !['expected-inactive'].includes(status.key)).every(status => ['unknown', 'nothing-published-intent-unknown', 'nothing-published'].includes(status.key) || status.key === 'unknown'), 'no property claims health or failure from expired evidence');
  assert.ok(!expired.some(status => status.key === 'healthy'));
});

test('the page refuses bundles that contradict their own contracts (fail closed)', async () => {
  const good = await bundle({ governed: true });
  assert.deepEqual(model.validateBundle(good), []);
  const seedLike = await bundle();
  assert.deepEqual(model.validateBundle(seedLike), []);

  const mutated = fn => {
    const copy = structuredClone(good);
    fn(copy);
    return model.validateBundle(copy);
  };
  assert.ok(mutated(copy => { copy.audience.source.gold.fixture = true; }).some(error => /fixture/.test(error)));
  assert.ok(mutated(copy => { copy.audience.policy.edgeTrafficIsHumanAudience = true; }).some(error => /audience policy/.test(error)));
  assert.ok(mutated(copy => { copy.audience.properties[0].requests[28] = { evidenceState: 'unavailable', value: 0, reason: 'x' }; }).some(error => /value without a measured state/.test(error)));
  assert.ok(mutated(copy => { copy.audience.properties[0].requests[28] = { evidenceState: 'measured', value: null }; }).some(error => /without a number/.test(error)));
  assert.ok(mutated(copy => { copy.diagnostics.items[0].priorityScore += 1; }).some(error => /score mismatch/.test(error)));
  assert.ok(mutated(copy => { copy.executive.maturity[0].numerator = 99; }).some(error => /exceeds denominator/.test(error)));
  assert.ok(mutated(copy => { copy.executive.charts.operationalComposition.data.segments[0].count += 3; }).some(error => /composition/.test(error)));
  assert.ok(mutated(copy => { copy.estate.properties[0].observability.state = 'active-verified'; }).some(error => /unverified telemetry claimed/.test(error)));
  assert.ok(mutated(copy => { copy.estate.schemaVersion = '1.1.0'; }).some(error => /schema version/.test(error)));
  assert.ok(mutated(copy => { copy.events.properties.find(item => item.propertyId === 'heavymoose.com').events.push({ eventType: 'lead', readings: { 7: { evidenceState: 'measured', value: 0 }, 28: { evidenceState: 'measured', value: 0 }, 90: { evidenceState: 'measured', value: 0 } } }); }).some(error => /zero without instrumentation/.test(error)));
  assert.ok(mutated(copy => { copy.audience.properties.pop(); }).some(error => /coverage differs/.test(error)));
  assert.ok(mutated(copy => { copy.executive.policy.missingIsZero = true; }).some(error => /executive policy/.test(error)));
  assert.ok(model.validateBundle({ ...good, executive: null }).length > 0);
});

test('share text carries a copy-time stamp, the probe age and every executive statement', async () => {
  const { executive, estate } = await bundle({ governed: true });
  const now = Date.parse(estate.generatedAt) + 2 * 3600000;
  const text = model.buildShareText(executive, { now, probeFreshness: model.freshnessAt(estate.evidence.probe.observedAt, estate.freshnessPolicy.probe, now) });
  const lines = text.split('\n');
  assert.equal(lines[0], 'GlobalDeets Mission Control — estate summary');
  assert.match(lines[2], /^Copied Oct 1, 14:00 UTC; production probes observed Oct 1, 12:00 UTC \(2h ago, fresh\)\.$/);
  for (const statement of executive.headline.statements) assert.ok(text.includes(statement.text));
  assert.ok(text.includes('Unknown is not zero, reachable is not healthy, and edge requests are not people.'));
  const stale = model.buildShareText(executive, { now: now + 30 * 3600000, probeFreshness: model.freshnessAt(estate.evidence.probe.observedAt, estate.freshnessPolicy.probe, now + 30 * 3600000) });
  assert.match(stale, /expired\)\./, 'an aged summary says the evidence has expired');
});

test('operating status is one shared implementation between collector and page', () => {
  assert.equal(semantics.operatingStatusFor('verified-healthy', { kind: 'active-and-serving', lifecycle: 'active' }).key, 'healthy');
  assert.equal(semantics.operatingStatusFor('reachable-unverified', { kind: 'no-declaration', lifecycle: 'unknown' }).key, 'reachable');
  assert.equal(semantics.operatingStatusFor('probe-blocked', { kind: 'x', lifecycle: 'unknown' }).key, 'blocked');
  assert.equal(semantics.operatingStatusFor('no-service-published', { kind: 'nothing-published-intent-unknown', lifecycle: 'unknown' }).key, 'nothing-published-intent-unknown');
  assert.equal(semantics.operatingStatusFor('no-service-published', { kind: 'expected-inactive', lifecycle: 'dormant' }).key, 'expected-inactive');
  assert.equal(semantics.operatingStatusFor('outage', { kind: 'x', lifecycle: 'active' }).key, 'failing');
  assert.equal(semantics.operatingStatusFor('vantage-conflict', { kind: 'x', lifecycle: 'active' }).key, 'conflicting-evidence');
  for (const health of semantics.HEALTH_STATES) assert.ok(semantics.OPERATING_STATUS[semantics.operatingStatusFor(health, { kind: 'x', lifecycle: 'unknown' }).key], health + ' maps to a labelled status');
});

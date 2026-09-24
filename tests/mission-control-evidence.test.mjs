import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { extractOperational, loadGoldSource } from '../tools/mission-control/lib/gold.mjs';
import { buildScheduledSnapshot, initialHistory, pruneHistory, upsertSnapshot, validateHistory } from '../tools/mission-control/lib/ledger.mjs';
import { validateEstate } from '../tools/mission-control/lib/contracts.mjs';
import { buildEstateHealth } from '../tools/mission-control/lib/estate.mjs';
import { registry } from './helpers/mission-control-fakes.mjs';

const require = createRequire(import.meta.url);
const semantics = require('../observatory/mission-control/evidence-semantics.js');
const seed = JSON.parse(readFileSync(new URL('../tools/mission-control/config/history-seed.json', import.meta.url), 'utf8'));
const DAY = 86400000;

test('freshness: fresh/stale/expired thresholds and unknown for unparseable evidence', () => {
  const policy = semantics.FRESHNESS_POLICY.probe;
  const now = '2026-10-01T12:00:00Z';
  const at = hours => new Date(Date.parse(now) - hours * 3600000).toISOString();
  assert.equal(semantics.evaluateFreshness(at(1), policy, now).state, 'fresh');
  assert.equal(semantics.evaluateFreshness(at(8), policy, now).state, 'fresh');
  assert.equal(semantics.evaluateFreshness(at(9), policy, now).state, 'stale');
  assert.equal(semantics.evaluateFreshness(at(24), policy, now).state, 'stale');
  assert.equal(semantics.evaluateFreshness(at(25), policy, now).state, 'expired');
  assert.equal(semantics.evaluateFreshness('garbage', policy, now).state, 'unknown');
  assert.equal(semantics.evaluateFreshness(null, policy, now).ageHours, null);
});

test('health contract: HTTP reachability alone can never be verified-healthy', () => {
  const fresh = { state: 'fresh' };
  const available = { state: 'available', observedAt: 'x' };
  const base = { availability: available, freshness: fresh };
  assert.equal(semantics.classifyHealth({ ...base, criticalPath: { state: 'unknown' } }), 'reachable-unverified');
  assert.equal(semantics.classifyHealth({ ...base, criticalPath: { state: 'pass', level: 'baseline' } }), 'reachable-unverified');
  assert.equal(semantics.classifyHealth({ ...base, criticalPath: { state: 'pass', level: 'authoritative' } }), 'verified-healthy');
  assert.equal(semantics.classifyHealth({ ...base, criticalPath: { state: 'fail', level: 'authoritative' } }), 'critical-path-failed');
  assert.equal(semantics.classifyHealth({ ...base, criticalPath: { state: 'drift', level: 'baseline' } }), 'contract-drift');
  assert.equal(semantics.classifyHealth({ availability: available, criticalPath: { state: 'pass', level: 'authoritative' }, freshness: { state: 'stale' } }), 'evidence-stale');
  assert.equal(semantics.classifyHealth({ availability: available, criticalPath: { state: 'pass', level: 'authoritative' }, freshness: { state: 'expired' } }), 'evidence-expired');
  assert.equal(semantics.classifyHealth({ availability: { state: 'unavailable', observedAt: 'x' }, criticalPath: {}, freshness: { state: 'stale' } }), 'outage');
  assert.equal(semantics.classifyHealth({ availability: { state: 'unknown', blocked: true, observedAt: 'x' }, criticalPath: {}, freshness: fresh }), 'probe-blocked');
  assert.equal(semantics.classifyHealth({ availability: { state: 'no-service-published', observedAt: 'x' }, criticalPath: {}, freshness: fresh }), 'no-service-published');
  assert.equal(semantics.classifyHealth({ availability: { state: 'unknown' }, criticalPath: {}, freshness: { state: 'unknown' } }), 'health-evidence-incomplete');
});

test('the estate validator rejects deploy-success and reachability shortcuts', () => {
  const estate = buildEstateHealth({ registry: registry(), now: '2026-09-24T16:29:00Z' });
  assert.deepEqual(validateEstate(estate, { expectPropertyCount: 25 }), []);
  const forged = structuredClone(estate);
  forged.properties[3].diagnosticState = 'verified-healthy';
  assert.ok(validateEstate(forged).some(error => error.includes('disagrees with health contract')));
  const lying = structuredClone(estate);
  lying.properties[2].availability.state = 'available';
  assert.ok(validateEstate(lying).some(error => error.includes('without observedAt')));
  const deployHealthy = structuredClone(estate);
  deployHealthy.policy.deploySuccessEqualsAvailability = true;
  assert.ok(validateEstate(deployHealthy).some(error => error.includes('deploySuccessEqualsAvailability')));
});

test('seed estate build (no probes) keeps every property unknown with a stated reason and a deploy is not availability', () => {
  const estate = buildEstateHealth({ registry: registry(), now: '2026-09-24T16:29:00Z' });
  assert.equal(estate.summary.availabilityKnownZones, 0);
  assert.equal(estate.summary.verifiedHealthyZones, 0);
  for (const property of estate.properties) {
    assert.equal(property.availability.state, 'unknown');
    assert.match(property.availability.reason, /No probe run/);
    assert.equal(property.diagnosticState, 'health-evidence-incomplete');
  }
  const pages = estate.properties.filter(item => item.deployment.latestProductionDeployAt);
  assert.equal(pages.length, 10, 'deploy evidence exists for ten zones and still does not make them available');
  assert.ok(pages.every(item => item.availability.state === 'unknown'));
});

test('trends only chain comparable points: key changes and gaps split segments and suppress deltas', () => {
  const p = (day, value, key = 'k1') => ({ at: new Date(Date.parse('2026-10-01T00:00:00Z') + day * DAY).toISOString(), value, key });
  const single = semantics.trendSummary([p(0, 10)]);
  assert.equal(single.delta, null);
  assert.equal(single.reason, 'fewer-than-two-comparable-observations');

  const comparable = semantics.trendSummary([p(0, 10), p(1, 15), p(2, 20)]);
  assert.equal(comparable.delta.absolute, 10);
  assert.equal(comparable.delta.pct, 100);

  const definitionChange = semantics.trendSummary([p(0, 10, 'k1'), p(1, 500, 'k2')]);
  assert.equal(definitionChange.delta, null, 'different metric definitions are never differenced');
  assert.equal(definitionChange.segments.length, 2);

  const gap = semantics.trendSummary([p(0, 10), p(1, 12), p(6, 40), p(7, 41)]);
  assert.equal(gap.segments.length, 2, 'a multi-day gap breaks the line instead of interpolating');
  assert.equal(gap.delta.absolute, 1, 'the delta uses only the latest comparable segment');

  const zeroBase = semantics.trendSummary([p(0, 0), p(1, 5)]);
  assert.equal(zeroBase.delta.pct, null, 'percent change from zero is not fabricated');
  assert.equal(semantics.trendSummary([]).reason, 'no-measured-observations');
});

test('window coverage reports missing days instead of implying continuity', () => {
  const now = '2026-10-10T12:00:00Z';
  const snapshots = ['2026-10-04T05:00:00Z', '2026-10-04T17:00:00Z', '2026-10-08T05:00:00Z', '2026-09-01T00:00:00Z'].map(observedAt => ({ observedAt }));
  const coverage = semantics.windowCoverage(snapshots, 7, now);
  assert.deepEqual(coverage, { expectedDays: 7, observedDays: 2, missingDays: 5 });
});

test('ledger: seeded snapshots are immutable, older observations are rejected, reruns are no-ops', () => {
  const history = initialHistory(seed, '2026-10-01T00:00:00Z');
  const estate = buildEstateHealth({ registry: registry(), now: '2026-10-01T12:00:00Z' });
  const snapshot = buildScheduledSnapshot({ estate, operational: null, observedAt: '2026-10-01T12:00:00Z', runId: 'r', dayRollup: null });
  assert.equal(snapshot.availability.evidenceState, 'unavailable');
  assert.equal(snapshot.availability.availableZones, undefined, 'unavailable evidence carries no counts');

  const inserted = upsertSnapshot(history, snapshot);
  assert.equal(inserted.action, 'inserted');
  assert.equal(upsertSnapshot(inserted.history, snapshot).action, 'unchanged');
  const older = { ...snapshot, observedAt: '2026-10-01T11:00:00Z' };
  assert.equal(upsertSnapshot(inserted.history, older).action, 'rejected-older');
  const newer = { ...snapshot, observedAt: '2026-10-01T13:00:00Z' };
  assert.equal(upsertSnapshot(inserted.history, newer).action, 'updated');

  const collision = upsertSnapshot(history, { ...snapshot, snapshotId: seed.snapshots[0].snapshotId });
  assert.equal(collision.action, 'unchanged', 'a seeded snapshot can never be overwritten');
  assert.deepEqual(collision.history.snapshots[0], seed.snapshots[0]);
  assert.deepEqual(validateHistory(inserted.history), []);
});

test('ledger validation rejects fabricated values and uncertified audience claims', () => {
  const history = initialHistory(seed, '2026-10-01T00:00:00Z');
  assert.deepEqual(validateHistory(history), []);

  const zeroFill = structuredClone(history);
  zeroFill.snapshots[1].globaldeetsOperational.edgeRequests = 0;
  assert.ok(validateHistory(zeroFill).some(error => error.includes('value without measured evidence')));

  const forgedAudience = structuredClone(history);
  forgedAudience.snapshots[1].certifiedAudience = { evidenceState: 'measured', value: 36391, unit: 'visitors' };
  assert.ok(validateHistory(forgedAudience).some(error => error.includes('without certification')));

  const safe = structuredClone(history);
  safe.snapshots[0].globaldeetsOperational.investorSafe = true;
  assert.ok(validateHistory(safe).some(error => error.includes('investorSafe')));

  const unordered = structuredClone(history);
  unordered.snapshots.reverse();
  assert.ok(validateHistory(unordered).some(error => error.includes('out of order')));
});

test('retention prunes only old scheduled snapshots, never seeded evidence', () => {
  const history = initialHistory(seed, '2026-10-01T00:00:00Z');
  const old = { snapshotId: '2025-01-01.scheduled', observedAt: '2025-01-01T00:00:00Z', collector: { kind: 'scheduled' } };
  history.snapshots.unshift(old);
  const pruned = pruneHistory(history, '2026-10-01T00:00:00Z');
  assert.equal(pruned.snapshots.some(item => item.snapshotId === old.snapshotId), false);
  assert.equal(pruned.snapshots.length, seed.snapshots.length);
});

// ── Canonical Gold operational-edge seam ────────────────────────────────────────────────────────
const metric = (id, value, overrides = {}) => ({
  metric_id: id,
  evidence_state: 'measured',
  exactness: 'exact',
  value,
  unit: 'requests',
  coverage: { state: 'full_coverage', observed_fraction: 1 },
  observation: { start: '2026-09-01T00:00:00Z', end: '2026-09-29T00:00:00Z', timezone: 'UTC', boundary: 'half_open', partial_current_period: false, extracted_at: '2026-09-29T02:00:00Z', source_observation_id: 'obs' },
  ...overrides,
});
const gold = (overrides = {}, metrics = [metric('gd.edge.requests', 1000), metric('gd.edge.visits', 400), metric('gd.synthetic.visits', 300)]) => ({
  schema_version: '1.2.0',
  contract_name: 'gfd-canonical-gold',
  fixture: false,
  generated_at: '2026-09-29T02:00:00Z',
  pipeline_version: 'p1',
  metrics,
  ...overrides,
});
const bindings = [
  { propertyId: 'globaldeets.com', role: 'edge-requests', metricId: 'gd.edge.requests' },
  { propertyId: 'globaldeets.com', role: 'edge-visits', metricId: 'gd.edge.visits' },
  { propertyId: 'globaldeets.com', role: 'synthetic-health-visits', metricId: 'gd.synthetic.visits' },
];

test('Gold seam: a governed non-fixture document maps to a comparable, never-investor-safe operational point', () => {
  const op = extractOperational(gold(), bindings);
  assert.equal(op.evidenceState, 'measured');
  assert.equal(op.edgeRequests, 1000);
  assert.equal(op.edgeVisits, 400);
  assert.equal(op.residualUnclassifiedVisits, 100);
  assert.equal(op.observationWindow.days, 28);
  assert.equal(op.investorSafe, false);
  assert.match(op.comparabilityKey, /^gold\|1\.2\|28d\|half_open\|UTC\|complete$/);
});

test('Gold seam: fixtures, unbound properties, unmeasured, partial, and mismatched-window metrics are never coerced', () => {
  assert.match(extractOperational(gold({ fixture: true }), bindings).reason, /fixture/);
  assert.match(extractOperational(gold(), []).reason, /goldBindings is empty/);
  assert.match(extractOperational(gold({ contract_name: 'other' }), bindings).reason, /not a gfd-canonical-gold/);
  assert.match(extractOperational(gold({ schema_version: '1.1.0' }), bindings).reason, /Unsupported/);
  assert.match(extractOperational(null, bindings).reason, /could not be read/);

  const unmeasured = gold({}, [metric('gd.edge.requests', null, { evidence_state: 'unavailable' }), metric('gd.edge.visits', 400), metric('gd.synthetic.visits', 300)]);
  const op = extractOperational(unmeasured, bindings);
  assert.equal(op.evidenceState, 'unavailable');
  assert.equal(op.edgeRequests, null);

  const partial = extractOperational(gold({}, [metric('gd.edge.requests', 900, { coverage: { state: 'partial_coverage', observed_fraction: 0.6 } }), metric('gd.edge.visits', 300), metric('gd.synthetic.visits', 100)]), bindings);
  assert.equal(partial.evidenceState, 'partial');
  assert.match(partial.comparabilityKey, /partial$/, 'partial observations never share a key with complete ones');

  const partialPeriod = extractOperational(gold({}, [metric('gd.edge.requests', 900, { observation: { ...metric('x', 1).observation, partial_current_period: true } }), metric('gd.edge.visits', 300), metric('gd.synthetic.visits', 100)]), bindings);
  assert.equal(partialPeriod.evidenceState, 'partial');

  const shifted = gold({}, [metric('gd.edge.requests', 900), metric('gd.edge.visits', 300, { observation: { ...metric('x', 1).observation, end: '2026-09-30T00:00:00Z' } }), metric('gd.synthetic.visits', 100)]);
  assert.match(extractOperational(shifted, bindings).reason, /share one observation window/);
});

test('Gold source loading fails closed and never reads a fixture path by default', async () => {
  const unconfigured = await loadGoldSource({ source: '', fetchImpl: fetch, readFile: async () => '' });
  assert.match(unconfigured.reason, /No Gold source configured/);
  assert.equal(unconfigured.configured, false, 'nothing configured is distinguishable from configured-but-unreadable');
  const httpFail = await loadGoldSource({ source: 'https://gold.example/doc.json', token: 't', fetchImpl: async (_url, init) => { assert.equal(init.headers.authorization, 'Bearer t'); return new Response('no', { status: 401 }); }, readFile: async () => '' });
  assert.equal(httpFail.doc, null);
  assert.match(httpFail.reason, /HTTP 401/);
  assert.equal(httpFail.configured, true);
  assert.equal(httpFail.httpStatus, 401, 'a missing credential is distinguishable from an outage');
  const bad = await loadGoldSource({ source: '/nope.json', fetchImpl: fetch, readFile: async () => { throw new Error('ENOENT'); } });
  assert.match(bad.reason, /unreadable/);
});

test('operational Gold evidence flows into a snapshot with its own comparability key', () => {
  const estate = buildEstateHealth({ registry: registry(), now: '2026-10-01T12:00:00Z' });
  const op = extractOperational(gold(), bindings);
  const snapshot = buildScheduledSnapshot({ estate, operational: op, observedAt: '2026-10-01T12:00:00Z', runId: 'r', dayRollup: null });
  assert.equal(snapshot.globaldeetsOperational.comparabilityKey, op.comparabilityKey);
  const history = upsertSnapshot(initialHistory(seed, '2026-10-01T00:00:00Z'), snapshot).history;
  assert.deepEqual(validateHistory(history), []);
});

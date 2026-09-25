import assert from 'node:assert/strict';
import test from 'node:test';
import { FEED_ORIGIN, collect, newDir } from './helpers/mission-control-plane.mjs';
import { asSource, syntheticGold, syntheticInsights } from './helpers/mission-control-audience-fixtures.mjs';
import { registry } from './helpers/mission-control-fakes.mjs';
import { SOURCE_CONDITIONS, buildAudience, validateAudience } from '../tools/mission-control/lib/audience.mjs';
import { SOURCE_FAILURES, loadGoldSource } from '../tools/mission-control/lib/gold.mjs';
import { expectedPropertyIds, validateDataPlane } from '../tools/mission-control/lib/contracts.mjs';

// GD-036: Mission Control consumes the governed Traffic Intelligence feed automatically. Every way that can go
// wrong is its own condition, and the diagnostics queue follows the real condition.

const reg = registry();
const ids = reg.properties.map(item => item.propertyId);
const opts = { expectPropertyIds: expectedPropertyIds(reg) };
const NOW = '2026-10-01T09:00:00Z';
const TOKEN = 'mcf_' + 'Zk3Qx9Lm2Vb7Nc4Rt8Yw1Hd6Jf5Ga0Se2Uo3Pi4Kq';
const GOLD_URL = FEED_ORIGIN + '/gold/canonical-gold-m1.2.json';
const INSIGHTS_URL = FEED_ORIGIN + '/gold/traffic-insights-1.0.json';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const at = (fetchImpl, token, url = GOLD_URL) => loadGoldSource({ source: url, token, fetchImpl, readFile: async () => '', label: 'Canonical Gold' });

/** A stand-in for the Traffic Intelligence worker: private documents behind the Mission Control feed credential. */
function trafficFeed({ token = TOKEN, gold = () => syntheticGold({ propertyIds: ids }), insights = () => syntheticInsights({ propertyIds: ids }) } = {}) {
  const calls = [];
  const handler = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, authorization: init.headers?.authorization || null });
    const presented = init.headers?.authorization;
    if (!presented) return new Response('Authentication required', { status: 401, headers: { 'content-type': 'text/plain' } });
    if (presented !== 'Bearer ' + token) return new Response('Authentication required', { status: 401, headers: { 'content-type': 'text/plain' } });
    if (url === GOLD_URL) return json(gold());
    if (url === INSIGHTS_URL) return json(insights());
    return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
  };
  handler.calls = calls;
  return handler;
}

const build = (gold, insights) => buildAudience({ registry: reg, now: NOW, gold, insights });
const valid = () => asSource(syntheticGold({ propertyIds: ids }));

test('loader: each way a governed source fails is its own condition, and the credential is never echoed', async () => {
  const cases = [
    ['source-missing', await loadGoldSource({ source: '', token: TOKEN, fetchImpl: fetch, readFile: async () => '' })],
    ['credential-missing', await at(async () => new Response('no', { status: 401 }), undefined)],
    ['credential-missing', await at(async () => new Response('no', { status: 403 }), '')],
    ['credential-rejected', await at(async () => new Response('no', { status: 401 }), TOKEN)],
    ['credential-rejected', await at(async () => new Response('no', { status: 403 }), TOKEN)],
    ['edge-challenge', await at(async () => new Response('<html>Just a moment...</html>', { status: 403, headers: { 'content-type': 'text/html; charset=UTF-8', 'cf-mitigated': 'challenge' } }), TOKEN)],
    ['edge-challenge', await at(async () => new Response('<html>Attention required</html>', { status: 403, headers: { 'content-type': 'text/html' } }), TOKEN)],
    ['transport-failure', await at(async () => new Response('down', { status: 503 }), TOKEN)],
    ['transport-failure', await at(async () => new Response('nope', { status: 404 }), TOKEN)],
    ['transport-failure', await at(async () => { throw new TypeError('fetch failed'); }, TOKEN)],
    ['malformed', await at(async () => new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } }), TOKEN)],
    ['malformed', await loadGoldSource({ source: '/x.json', fetchImpl: fetch, readFile: async () => '{ truncated' })],
  ];
  for (const [kind, result] of cases) {
    assert.equal(result.failureKind, kind, kind + ': ' + result.reason);
    assert.equal(result.doc, null);
    assert.ok(Object.hasOwn(SOURCE_FAILURES, kind), kind + ' is a declared failure');
    assert.ok(!String(result.reason).includes(TOKEN), 'the credential never appears in a reason');
  }
  assert.equal(cases[0][1].configured, false, 'nothing configured is not the same as configured-but-failing');
  assert.equal(cases[3][1].configured, true);
  const ok = await at(async () => json({ hello: 'world' }), TOKEN);
  assert.deepEqual([ok.doc, ok.failureKind, ok.httpStatus], [{ hello: 'world' }, null, 200]);
});

test('loader: the credential is sent only as a bearer header to an https source, never to a file path', async () => {
  const seen = [];
  await at(async (url, init) => { seen.push({ url, headers: init.headers }); return json({}); }, TOKEN);
  assert.equal(seen[0].headers.authorization, 'Bearer ' + TOKEN);
  assert.ok(!seen[0].url.includes(TOKEN), 'never in the URL');
  const file = await loadGoldSource({ source: '/tmp/gold.json', token: TOKEN, fetchImpl: async () => assert.fail('a file source must not fetch'), readFile: async () => '{"a":1}' });
  assert.deepEqual(file.doc, { a: 1 });
});

test('audience: every source failure maps to a distinct condition with a coherent status', () => {
  const expectations = [
    [{ doc: null, configured: false, httpStatus: null, reason: 'No source.', failureKind: 'source-missing' }, 'source-missing', 'awaiting-authorized-source'],
    [{ doc: null, configured: true, httpStatus: 401, reason: 'r', failureKind: 'credential-missing' }, 'credential-missing', 'awaiting-authorized-source'],
    [{ doc: null, configured: true, httpStatus: 401, reason: 'r', failureKind: 'credential-rejected' }, 'credential-rejected', 'awaiting-authorized-source'],
    [{ doc: null, configured: true, httpStatus: 403, reason: 'r', failureKind: 'edge-challenge' }, 'edge-challenge', 'unavailable'],
    [{ doc: null, configured: true, httpStatus: 503, reason: 'r', failureKind: 'transport-failure' }, 'transport-failure', 'unavailable'],
    [{ doc: null, configured: true, httpStatus: 200, reason: 'r', failureKind: 'malformed' }, 'malformed', 'rejected'],
    [asSource(syntheticGold({ propertyIds: ids, fixture: true })), 'fixture', 'rejected'],
    [asSource(syntheticGold({ propertyIds: ids, schema: '2.0.0' })), 'schema-mismatch', 'rejected'],
    [asSource(syntheticGold({ propertyIds: ids, mutate: doc => { doc.contract_name = 'something-else'; } })), 'schema-mismatch', 'rejected'],
    [asSource(syntheticGold({ propertyIds: ids, mutate: doc => { delete doc.metrics; } })), 'malformed', 'rejected'],
    [asSource(syntheticGold({ propertyIds: ids, mutate: doc => { doc.metrics.push({ ...doc.metrics[0] }); } })), 'malformed', 'rejected'],
    [asSource(syntheticGold({ propertyIds: ids, omit: ids })), 'no-measurements', 'unavailable'],
    [valid(), 'connected', 'measured'],
    [asSource(syntheticGold({ propertyIds: ids, generatedAt: '2026-09-25T06:00:00Z' })), 'stale', 'measured'],
  ];
  const seen = new Set();
  for (const [gold, condition, status] of expectations) {
    const audience = build(gold);
    assert.equal(audience.source.condition, condition);
    assert.equal(audience.source.status, status, condition);
    assert.deepEqual(validateAudience(audience, opts), [], condition);
    seen.add(condition);
    if (status !== 'measured') for (const row of audience.properties) assert.equal(row.requests[28].value, null, condition + ' never shows a number');
  }
  assert.deepEqual([...seen].sort(), Object.keys(SOURCE_CONDITIONS).sort(), 'every declared condition is reachable and tested');
});

test('audience: a stale-but-readable source is labelled stale, keeps its readings labelled, and is not mistaken for a failure', () => {
  const audience = build(asSource(syntheticGold({ propertyIds: ids, generatedAt: '2026-09-28T06:00:00Z' })));
  assert.equal(audience.source.condition, 'stale');
  assert.ok(['stale', 'expired'].includes(audience.source.freshness.state));
  assert.equal(audience.source.gold.fixture, false);
});

test('audience: the contract validator rejects a condition that contradicts its status or is undeclared', () => {
  const audience = build(valid());
  assert.deepEqual(validateAudience(audience, opts), []);
  assert.ok(validateAudience({ ...audience, source: { ...audience.source, condition: 'credential-missing' } }, opts).some(error => /cannot accompany/.test(error)));
  assert.ok(validateAudience({ ...audience, source: { ...audience.source, condition: 'made-up' } }, opts).some(error => /source\.condition/.test(error)));
  assert.ok(validateAudience({ ...audience, source: { ...audience.source, condition: undefined } }, opts).some(error => /source\.condition/.test(error)));
});

test('insights: its own conditions are recorded without discarding a good Gold reading', () => {
  const gold = valid();
  const cases = [
    [{ doc: null, configured: true, httpStatus: 401, reason: 'r', failureKind: 'credential-rejected' }, 'unavailable', 'credential-rejected'],
    [asSource(syntheticInsights({ propertyIds: ids, fixture: true })), 'rejected', 'fixture'],
    [asSource(syntheticInsights({ propertyIds: ids, mutate: doc => { doc.schema_version = '9.0.0'; } })), 'rejected', 'schema-mismatch'],
    [asSource(syntheticInsights({ propertyIds: ids, sourceGoldGeneratedAt: '2026-09-30T06:00:00Z' })), 'incomparable', 'snapshot-mismatch'],
    [asSource(syntheticInsights({ propertyIds: ids })), 'measured', 'connected'],
  ];
  for (const [insights, status, condition] of cases) {
    const audience = build(gold, insights);
    assert.equal(audience.source.status, 'measured');
    assert.equal(audience.source.insights.status, status);
    assert.equal(audience.source.insights.condition, condition);
    if (status !== 'measured') assert.ok(Object.values(audience.estate.trend).every(reading => reading.value == null), 'no trend without comparable insights');
  }
});

test('collector: one credential reaches both governed documents; a dedicated insights credential overrides it', async () => {
  const feed = trafficFeed();
  const { plane } = await collect(newDir(), { feed, env: { GOLD_SOURCE: GOLD_URL, GOLD_SOURCE_TOKEN: TOKEN, INSIGHTS_SOURCE: INSIGHTS_URL } });
  assert.deepEqual(feed.calls.map(call => [call.url, call.authorization]), [[GOLD_URL, 'Bearer ' + TOKEN], [INSIGHTS_URL, 'Bearer ' + TOKEN]]);
  assert.equal(plane.audience.source.condition, 'connected');
  assert.equal(plane.audience.source.insights.status, 'measured');

  const split = trafficFeed();
  await collect(newDir(), { feed: split, env: { GOLD_SOURCE: GOLD_URL, GOLD_SOURCE_TOKEN: TOKEN, INSIGHTS_SOURCE: INSIGHTS_URL, INSIGHTS_SOURCE_TOKEN: 'mcf_other' } });
  assert.equal(split.calls.find(call => call.url === INSIGHTS_URL).authorization, 'Bearer mcf_other');
});

test('collector: the insights document defaults to its sibling of the Gold URL, with the same credential', async () => {
  const feed = trafficFeed();
  const { plane } = await collect(newDir(), { feed, env: { GOLD_SOURCE: GOLD_URL, GOLD_SOURCE_TOKEN: TOKEN } });
  assert.equal(feed.calls[1].url, INSIGHTS_URL);
  assert.equal(plane.audience.source.insights.condition, 'connected');
});

test('lifecycle: the audience diagnostic follows the real condition and closes itself once the feed connects', async () => {
  const dir = newDir();
  const find = plane => plane.diagnostics.items.find(item => item.id === 'audience:governed-source');
  const env = { GOLD_SOURCE: GOLD_URL, INSIGHTS_SOURCE: INSIGHTS_URL };
  const feed = trafficFeed();

  // 1. No credential: a distinct, authority-blocked finding that names the real problem.
  let { plane } = await collect(dir, { feed, env, runId: 'r1' });
  assert.equal(plane.audience.source.condition, 'credential-missing');
  assert.equal(find(plane).actionability.state, 'blocked-on-authority');
  assert.match(find(plane).title, /needs a credential/);
  assert.equal(find(plane).evidence[0].condition, 'credential-missing');
  assert.ok(plane.diagnostics.items.filter(item => item.escalation?.blocksInvestorClaim && !['closed', 'accepted-risk'].includes(item.status)).some(item => item.id === 'audience:governed-source'));
  assert.equal(plane.audience.estate.requests[28].value, null);

  // 2. A wrong credential is a different finding from a missing one.
  ({ plane } = await collect(dir, { feed, env: { ...env, GOLD_SOURCE_TOKEN: 'mcf_wrong' }, runId: 'r2', start: '2026-10-01T18:00:00Z' }));
  assert.equal(plane.audience.source.condition, 'credential-rejected');
  assert.match(find(plane).title, /rejected/);
  assert.match(find(plane).nextAction, /MISSION_CONTROL_FEED_TOKEN/);

  // 3. An outage or bot challenge is not blamed on the credential.
  const challenged = async () => new Response('<html>Just a moment</html>', { status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' } });
  ({ plane } = await collect(dir, { feed: challenged, env: { ...env, GOLD_SOURCE_TOKEN: TOKEN }, runId: 'r3', start: '2026-10-02T00:00:00Z' }));
  assert.equal(plane.audience.source.condition, 'edge-challenge');
  assert.notEqual(find(plane).actionability.state, 'blocked-on-authority');
  assert.match(find(plane).title, /edge challenge/);

  // 4. Connected: the audience populates and the finding resolves without anyone closing it.
  ({ plane } = await collect(dir, { feed, env: { ...env, GOLD_SOURCE_TOKEN: TOKEN }, runId: 'r4', start: '2026-10-02T06:00:00Z' }));
  assert.equal(plane.audience.source.status, 'measured');
  assert.equal(plane.audience.source.condition, 'connected');
  const openIds = plane.diagnostics.items.filter(item => !['closed', 'accepted-risk'].includes(item.status)).map(item => item.id);
  assert.ok(!openIds.includes('audience:governed-source'), 'the governed-source finding is no longer open');
  assert.ok(!plane.diagnostics.items.some(item => item.id === 'audience:governed-source' && item.escalation?.blocksInvestorClaim && !['closed', 'accepted-risk'].includes(item.status)), 'and no longer blocks an investor claim');
  assert.equal(plane.audience.estate.requests[28].evidenceState, 'measured');
  assert.equal(plane.audience.estate.requests[7].evidenceState, 'measured');
  assert.equal(plane.audience.estate.requests[90].evidenceState, 'measured');
  assert.equal(plane.audience.estate.propertiesMeasured, ids.length);
  assert.ok(plane.audience.estate.concentration);
  assert.ok(plane.audience.series.estateDaily.points.length > 0);
  assert.deepEqual(validateDataPlane(plane, { expectPropertyCount: ids.length, expectPropertyIds: opts.expectPropertyIds }), []);
});

test('semantics survive the bridge: edge traffic stays unclassified, fixtures never appear as production, missing is not zero', async () => {
  const fixtureFeed = trafficFeed({ gold: () => syntheticGold({ propertyIds: ids, fixture: true }), insights: () => syntheticInsights({ propertyIds: ids, fixture: true }) });
  const { plane: fixturePlane } = await collect(newDir(), { feed: fixtureFeed, env: { GOLD_SOURCE: GOLD_URL, GOLD_SOURCE_TOKEN: TOKEN } });
  assert.equal(fixturePlane.audience.source.condition, 'fixture');
  assert.equal(fixturePlane.audience.estate.requests[28].value, null);
  assert.match(fixturePlane.diagnostics.items.find(item => item.id === 'audience:governed-source').title, /fixture data, not production/);

  const partialFeed = trafficFeed({ gold: () => syntheticGold({ propertyIds: ids, omit: [ids[3]] }) });
  const { plane } = await collect(newDir(), { feed: partialFeed, env: { GOLD_SOURCE: GOLD_URL, GOLD_SOURCE_TOKEN: TOKEN } });
  assert.equal(plane.audience.source.status, 'partial');
  assert.equal(plane.audience.properties.find(row => row.propertyId === ids[3]).requests[28].value, null, 'a property missing from Gold is unknown, not zero');
  assert.equal(plane.audience.policy.edgeTrafficIsHumanAudience, false);
  assert.equal(plane.audience.classification.composition[0].class, 'unclassified-edge-requests');
});

test('the credential never reaches a published document', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, { feed: trafficFeed(), env: { GOLD_SOURCE: GOLD_URL, GOLD_SOURCE_TOKEN: TOKEN } });
  assert.ok(!JSON.stringify(plane).includes(TOKEN));
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const walk = folder => readdirSync(folder).flatMap(name => (statSync(join(folder, name)).isDirectory() ? walk(join(folder, name)) : [join(folder, name)]));
  for (const file of walk(dir)) assert.ok(!readFileSync(file, 'utf8').includes(TOKEN), file + ' must not contain the credential');
  const rejected = await collect(newDir(), { feed: trafficFeed(), env: { GOLD_SOURCE: GOLD_URL, GOLD_SOURCE_TOKEN: TOKEN + 'x' } });
  assert.ok(!JSON.stringify(rejected.plane).includes(TOKEN));
});

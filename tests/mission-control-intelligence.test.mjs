import assert from 'node:assert/strict';
import test from 'node:test';
import { GA4, collect, newDir, tagHost, writeSource } from './helpers/mission-control-plane.mjs';
import { syntheticEventsFeed, syntheticGold, syntheticInsights } from './helpers/mission-control-audience-fixtures.mjs';
import { registry } from './helpers/mission-control-fakes.mjs';
import { validateDataPlane, validateDiagnostics, expectedPropertyIds } from '../tools/mission-control/lib/contracts.mjs';
import { LOW_USE_REQUESTS_28D, scoreItem } from '../tools/mission-control/lib/diagnostics.mjs';

const reg = registry();
const ids = reg.properties.map(item => item.propertyId);
const opts = { expectPropertyIds: expectedPropertyIds(reg) };
const find = (plane, id) => plane.diagnostics.items.find(item => item.id === id);

/** Governed sources on disk, read through the production loading path. */
function sources(dir, { gold = {}, insights = {}, events } = {}) {
  const env = {
    GOLD_SOURCE: writeSource(dir, 'canonical-gold-m1.2.json', syntheticGold({ propertyIds: ids, ...gold })),
  };
  env.INSIGHTS_SOURCE = writeSource(dir, 'traffic-insights-1.0.json', syntheticInsights({ propertyIds: ids, ...insights }));
  if (events) env.EVENTS_SOURCE = writeSource(dir, 'events.json', events);
  return env;
}

test('every finding carries category, confidence, freshness, actionability, subjects and an explainable score', async () => {
  const { plane } = await collect(newDir());
  assert.deepEqual(validateDiagnostics(plane.diagnostics), []);
  for (const item of plane.diagnostics.items) {
    assert.ok(plane.diagnostics.agentContract.categories.includes(item.category), item.id);
    assert.ok(['high', 'medium', 'low'].includes(item.confidence), item.id);
    assert.ok(item.freshness.state && item.freshness.basis, item.id);
    assert.ok(Array.isArray(item.subjects), item.id);
    assert.equal(item.priorityBreakdown.reduce((sum, part) => sum + part.points, 0), item.priorityScore, item.id);
    assert.ok(item.priorityBreakdown.every(part => part.why), 'every factor explains itself');
    if (item.actionability.state === 'blocked-on-authority') assert.ok(item.actionability.blockedBy, item.id + ' names the missing authority');
  }
  assert.ok(plane.diagnostics.priorityModel.summary);
});

test('ranking is deterministic: identical evidence yields byte-identical queues, and score order is monotonic', async () => {
  const a = await collect(newDir());
  const b = await collect(newDir());
  assert.equal(JSON.stringify(a.plane.diagnostics), JSON.stringify(b.plane.diagnostics));
  const open = a.plane.diagnostics.items.filter(item => !['closed', 'accepted-risk'].includes(item.status));
  for (let index = 1; index < open.length; index += 1) assert.ok(open[index - 1].priorityScore >= open[index].priorityScore, 'score never increases down the queue');
  const equal = open.filter((item, index) => index && item.priorityScore === open[index - 1].priorityScore);
  for (const item of equal) {
    const previous = open[open.indexOf(item) - 1];
    assert.ok(previous.priorityHint === undefined && previous.id.localeCompare(item.id) <= 0, 'equal scores break ties by id');
  }
  assert.equal(new Set(a.plane.diagnostics.items.map(item => item.priority)).size, a.plane.diagnostics.items.length);
});

test('scoring: investor-critical, tier, severity and actionability move the score in the documented direction', () => {
  const context = { investorCriticalIds: new Set(['globaldeets.com']), tierById: new Map([['globaldeets.com', 2], ['heavymoose.com', 3]]) };
  const base = { severity: 'medium', businessImpact: 'medium', escalation: { level: 'medium' }, confidence: 'high', actionability: { state: 'actionable-now' }, ageDays: 0, status: 'open' };
  const score = overrides => scoreItem({ ...base, subjects: ['heavymoose.com'], ...overrides }, context).score;
  assert.ok(score({ subjects: ['globaldeets.com'] }) > score({ subjects: ['heavymoose.com'] }), 'investor-critical outranks');
  assert.ok(score({ severity: 'high' }) > score({ severity: 'medium' }));
  assert.ok(score({}) > score({ actionability: { state: 'blocked-on-authority' } }), 'blocked work ranks below workable work');
  assert.ok(score({}) > score({ confidence: 'low' }));
  assert.ok(score({ ageDays: 10 }) > score({ ageDays: 0 }));
  assert.ok(score({ ageDays: 400 }) <= score({ ageDays: 14 }), 'age is capped');
  assert.ok(score({ status: 'closed' }) < score({}), 'closed items sink');
  const wide = scoreItem({ ...base, subjects: ids }, context);
  assert.ok(wide.breakdown.some(part => part.factor === 'estate-wide'));
  assert.ok(!wide.breakdown.some(part => part.factor === 'investor-critical'), 'a finding about the whole estate is not specifically about the flagship');
});

test('a reachable property whose authoritative critical path fails is a high-severity, actionable finding with the failing check named', async () => {
  const { plane } = await collect(newDir(), {
    mutate: world => {
      world.sites['aiaimate.com'] = { title: 'AIAIMate — lessons', paths: { '/api/search': { status: 500, contentType: 'application/json', json: { error: 'Search failed' } } } };
    },
  });
  const row = plane.estate.properties.find(item => item.propertyId === 'aiaimate.com');
  assert.equal(row.diagnosticState, 'critical-path-failed');
  assert.equal(row.profile.operatingStatus.key, 'failing');
  const finding = find(plane, 'criticalpath:failed:aiaimate.com');
  assert.equal(finding.severity, 'high');
  assert.equal(finding.category, 'critical-path');
  assert.equal(finding.actionability.state, 'actionable-now');
  assert.match(finding.observed, /search-api/);
  assert.match(finding.observed, /owner-source-route/);
  assert.match(finding.priorityBreakdown.map(part => part.factor).join(','), /severity/);
});

test('the top actionable item is the broken production function, ahead of blocked strategic gaps', async () => {
  const { plane } = await collect(newDir(), {
    mutate: world => {
      world.sites['aiaimate.com'] = { title: 'AIAIMate', paths: { '/api/search': { status: 500, contentType: 'application/json', json: {} } } };
    },
  });
  assert.equal(plane.diagnostics.summary.nextUp, 'criticalpath:failed:aiaimate.com');
  assert.ok(plane.diagnostics.summary.blockedOnAuthority >= 1);
});

test('an intentionally inactive property is never an outage: nothing published + declared inactive is expected, not a finding', async () => {
  const { plane } = await collect(newDir());
  const parked = plane.estate.properties.find(item => item.propertyId === 'fwomps.com');
  assert.equal(parked.diagnosticState, 'no-service-published');
  assert.equal(parked.profile.operatingStatus.key, 'nothing-published-intent-unknown', 'intent is unknown, so it is not called expected');
  assert.equal(parked.profile.expectation.kind, 'nothing-published-intent-unknown');
  assert.equal(find(plane, 'availability:outage:fwomps.com'), undefined);
  const gap = find(plane, 'availability:no-service-published');
  assert.equal(gap.severity, 'low');
  assert.equal(gap.polarity, 'gap');
  assert.equal(gap.actionability.state, 'decision-needed');
  assert.deepEqual([...gap.subjects].sort(), ['artificelligance.com', 'artificelligence.com', 'fwomp.us', 'fwomps.com']);
});

test('expectation vs production: serving while declared not-live is drift; expected-inactive is expected and quiet', async () => {
  const { plane } = await collect(newDir());
  const news = plane.estate.properties.find(item => item.propertyId === 'goodflippinnews.com');
  assert.equal(news.profile.lifecycle, 'incubating');
  assert.equal(news.profile.expectation.kind, 'serving-but-declared-not-live');
  assert.equal(news.profile.expectation.met, false);
  const drift = find(plane, 'governance:expectation-drift');
  assert.deepEqual([...drift.subjects].sort(), ['goodflippinluck.com', 'goodflippinnews.com']);
  assert.equal(drift.actionability.state, 'decision-needed');
  // Redleopard is incubating with no declared not-live: serving is not drift.
  assert.equal(plane.estate.properties.find(item => item.propertyId === 'redleopardofstpaul.com').profile.expectation.met, null);

  // A declared-dormant property that publishes nothing is expected inactive and raises nothing.
  const { evaluateExpectation, operatingStatusFor } = await import('../tools/mission-control/lib/estate.mjs');
  const availability = { state: 'no-service-published', freshness: { state: 'fresh' } };
  const expectation = evaluateExpectation({ lifecycle: 'dormant', expectedState: 'unknown' }, availability);
  assert.equal(expectation.kind, 'expected-inactive');
  assert.equal(expectation.met, true);
  assert.equal(operatingStatusFor('no-service-published', expectation).key, 'expected-inactive');
  const activeButSilent = evaluateExpectation({ lifecycle: 'active', expectedState: 'unknown' }, availability);
  assert.equal(activeButSilent.met, false);
  assert.equal(activeButSilent.kind, 'declared-active-but-nothing-published');
});

test('instrumentation findings are derived from served pages: placeholder ID, no tag, flag/tag mismatch, unverified reception', async () => {
  const { plane } = await collect(newDir(), {
    mutate: world => {
      tagHost(world, 'heavymoose.com', GA4('G-XXXXXXXXXX'));
      tagHost(world, 'aiaimate.com', GA4('G-REAL123456'));
    },
  });
  const placeholder = find(plane, 'instrumentation:placeholder-tag');
  assert.deepEqual(placeholder.subjects, ['heavymoose.com']);
  assert.match(placeholder.observed, /G-XXXXXXXXXX/);
  assert.equal(placeholder.actionability.state, 'actionable-now');
  assert.ok(find(plane, 'instrumentation:absent').subjects.length >= 15);
  assert.ok(find(plane, 'instrumentation:rum-flag-mismatch'), 'RUM flag on but no beacon is a discrepancy');
  const unverified = find(plane, 'instrumentation:reception-unverified');
  assert.deepEqual(unverified.subjects, ['aiaimate.com']);
  assert.equal(unverified.actionability.state, 'blocked-on-authority');
  assert.equal(find(plane, 'observability:rum-coverage'), undefined, 'the carried-forward flag no longer drives a coverage finding');
});

test('critical-path coverage is reported as an estate quality number with named owners of the gap', async () => {
  const { plane } = await collect(newDir());
  const item = find(plane, 'observability:critical-path-contracts');
  assert.match(item.title, /^16 of 20 serving properties still need an owner-declared critical path$/);
  assert.equal(item.category, 'critical-path');
  assert.equal(item.actionability.state, 'decision-needed');
  assert.ok(!item.subjects.includes('globaldeets.com'));
  assert.equal(plane.estate.summary.criticalPathAuthoritativeZones, 4);
  assert.equal(plane.estate.summary.criticalPathNeedsDeclarationZones, 16);
});

test('audience-derived findings fire only from measured evidence: unknown is never decline, growth, concentration or low use', async () => {
  const { plane } = await collect(newDir());
  for (const rule of ['traffic-decline', 'traffic-growth', 'traffic-concentration', 'traffic-without-outcome', 'low-observable-use']) {
    assert.equal(plane.diagnostics.derivation.derivedRules.includes(rule), false, rule + ' must not be derived without a governed audience');
  }
  const source = find(plane, 'audience:governed-source');
  assert.equal(source.actionability.state, 'blocked-on-authority');
  assert.match(source.actionability.blockedBy, /read credential/);
  assert.match(source.nextAction, /MISSION_CONTROL_GOLD_SOURCE/);
});

test('with a governed audience: decline, growth, concentration, traffic-without-outcome and low use are derived, and the source finding disappears', async () => {
  const dir = newDir();
  const env = sources(dir, {
    gold: { volumes: { 'globaldeets.com': 9_000_000, 'cyancanoe.com': 400, 'goodflippinluck.com': 0 } },
    insights: { volumes: { 'globaldeets.com': 9_000_000, 'cyancanoe.com': 400, 'goodflippinluck.com': 0 }, growth: { 'aiaimate.com': 0.05, 'heavymoose.com': -0.05 } },
  });
  const { plane } = await collect(dir, { env });
  assert.equal(plane.audience.source.status, 'measured', 'a measured zero is still a measurement');
  assert.equal(find(plane, 'audience:governed-source'), undefined);
  assert.ok(find(plane, 'audience:decline:heavymoose.com'));
  assert.equal(find(plane, 'audience:decline:aiaimate.com'), undefined);
  assert.deepEqual(find(plane, 'audience:growth').subjects, ['aiaimate.com']);
  assert.equal(find(plane, 'audience:growth').actionability.state, 'monitor');
  const concentration = find(plane, 'audience:concentration');
  assert.deepEqual(concentration.subjects, ['globaldeets.com']);
  assert.match(concentration.observed, /% of measured edge requests/);
  assert.ok(find(plane, 'business-outcomes:traffic-without-outcome').subjects.includes('globaldeets.com'));
  const lowUse = find(plane, 'infrastructure:low-observable-use');
  assert.deepEqual(lowUse.subjects, ['cyancanoe.com', 'goodflippinluck.com'].filter(id => lowUse.subjects.includes(id)));
  assert.ok(lowUse.subjects.includes('cyancanoe.com'));
  assert.ok(!lowUse.subjects.includes('foxyana.com'), 'only properties on known infrastructure are flagged');
  assert.ok(lowUse.observed.includes(LOW_USE_REQUESTS_28D.toLocaleString('en-US')));
  assert.deepEqual(validateDataPlane(plane, opts), []);
});

test('outcomes without audience and audience without outcomes are separate, honest findings', async () => {
  const dir = newDir();
  const events = syntheticEventsFeed({ instrumented: ['aiaimate.com'], records: [['aiaimate.com', 'signup', 28, 30]] });
  const env = { EVENTS_SOURCE: writeSource(dir, 'events.json', events) };
  const { plane } = await collect(dir, { env });
  assert.equal(plane.events.source.status, 'measured');
  const orphan = find(plane, 'business-outcomes:outcomes-without-audience');
  assert.deepEqual(orphan.subjects, ['aiaimate.com']);
  assert.equal(orphan.actionability.state, 'blocked-on-authority');
  assert.equal(find(plane, 'business-outcomes:coverage').title.startsWith('1 of'), true);
});

test('new production surfaces and Pages projects with no domain are derived from the inventory, never guessed', async () => {
  const cloudflare = async input => {
    const url = String(input);
    const ok = (result, info = { total_pages: 1 }) => new Response(JSON.stringify({ success: true, result, result_info: info }), { status: 200 });
    if (url.includes('/zones')) return ok(reg.properties.map(item => ({ name: item.propertyId, status: 'active' })));
    if (url.includes('/pages/projects/') && url.endsWith('/domains')) {
      if (url.includes('/traffic/')) return ok([{ name: 'traffic.goodflippindesign.com', status: 'active' }]);
      if (url.includes('/globaldeets/')) return ok([{ name: 'globaldeets.com', status: 'active' }, { name: 'www.globaldeets.com', status: 'active' }]);
      return ok([]);
    }
    if (url.includes('/pages/projects')) return ok([{ name: 'globaldeets' }, { name: 'traffic' }, { name: 'orphan-one' }], { total_count: 3 });
    return ok([]);
  };
  const { plane } = await collect(newDir(), { cloudflare, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' } });
  assert.deepEqual(plane.estate.infrastructure.unregisteredSurfaces.map(item => item.hostname), ['traffic.goodflippindesign.com']);
  assert.equal(plane.estate.infrastructure.unregisteredSurfaces[0].parentProperty, 'goodflippindesign.com');
  assert.deepEqual(plane.estate.infrastructure.orphanProjects.map(item => item.project), ['orphan-one']);
  const surface = find(plane, 'infrastructure:unregistered-surfaces');
  assert.equal(surface.category, 'infrastructure');
  assert.match(surface.observed, /traffic\.goodflippindesign\.com/);
  assert.ok(find(plane, 'infrastructure:pages-projects-without-domain'));
  // www and apex of a registered property are never "new surfaces".
  assert.ok(!plane.estate.infrastructure.unregisteredSurfaces.some(item => item.hostname.endsWith('globaldeets.com') && item.hostname.split('.').length <= 3));
});

test('without an inventory the infrastructure facts are unavailable, not empty', async () => {
  const { plane } = await collect(newDir());
  assert.equal(plane.estate.infrastructure.evidenceState, 'unavailable');
  assert.equal(find(plane, 'infrastructure:unregistered-surfaces'), undefined);
});

test('stale evidence is a finding with the age stated, and closed incident items are retained then expire', async () => {
  const dir = newDir();
  await collect(dir, { start: '2026-10-01T12:00:00Z', runId: 's1', mutate: world => { world.sites['agentkagent.com'] = { status: 502, title: 'x' }; } });
  const healed = await collect(dir, { start: '2026-10-01T18:00:00Z', runId: 's2' });
  const closed = find(healed.plane, 'availability:outage:agentkagent.com');
  assert.equal(closed.status, 'closed');
  assert.equal(closed.actionability.state, 'closed');
  assert.deepEqual(validateDiagnostics(healed.plane.diagnostics), []);
  const later = await collect(dir, { start: '2026-10-10T18:00:00Z', runId: 's3' });
  assert.equal(find(later.plane, 'availability:outage:agentkagent.com'), undefined, 'closed items age out after the retention window');
});

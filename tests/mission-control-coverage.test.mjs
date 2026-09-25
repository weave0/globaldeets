import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, registry } from './helpers/mission-control-fakes.mjs';
import { collect, newDir, writeSource } from './helpers/mission-control-plane.mjs';
import { syntheticEventsFeed, syntheticGold, syntheticInsights } from './helpers/mission-control-audience-fixtures.mjs';
import { FACETS, FACET_STATUSES, buildCoverageMatrix, renderCoverageMarkdown, validateCoverageMatrix } from '../tools/mission-control/lib/coverage-matrix.mjs';
import { validateDataPlane, expectedPropertyIds } from '../tools/mission-control/lib/contracts.mjs';
import { buildD1BusinessEventsFeed } from '../tools/mission-control/lib/events-d1.mjs';
import { validateFeed } from '../tools/mission-control/lib/events.mjs';

const reg = registry();
const ids = reg.properties.map(item => item.propertyId);
const row = (doc, id) => doc.rows.find(item => item.propertyId === id);
const rebuild = plane => buildCoverageMatrix({ registry: reg, estate: plane.estate, audience: plane.audience, events: plane.events, diagnostics: plane.diagnostics, now: plane.estate.generatedAt });
const clone = value => JSON.parse(JSON.stringify(value));

test('every registered property is a row, in registry order, whether or not it has any telemetry', async () => {
  const { plane } = await collect(newDir());
  const doc = plane.coverage;
  assert.deepEqual(doc.rows.map(item => item.propertyId), ids);
  assert.equal(doc.totals.properties, ids.length);
  assert.deepEqual(validateCoverageMatrix(doc, { estate: plane.estate }), []);
  assert.deepEqual(validateDataPlane(plane, { expectPropertyCount: ids.length, expectPropertyIds: expectedPropertyIds(reg) }), []);
  for (const id of ['artificelligance.com', 'fwomps.com']) {
    const item = row(doc, id);
    assert.equal(item.facets.production.status, 'not-applicable', id + ' publishes nothing');
    assert.equal(item.facets.declaration.status, 'missing', id + ' has no declared intent, which is itself a finding');
    assert.ok(item.blindSpots.some(spot => spot.facet === 'declaration'), id);
    assert.notEqual(item.severity, 'none');
  }
});

test('the matrix is a pure function of the plane: identical evidence yields identical bytes', async () => {
  const { plane } = await collect(newDir());
  assert.equal(JSON.stringify(rebuild(plane)), JSON.stringify(rebuild(clone(plane))));
  assert.equal(JSON.stringify(rebuild(plane)), JSON.stringify(plane.coverage));
});

test('every facet that is neither verified nor not-applicable names a blind spot, and each blind spot names a real facet', async () => {
  const { plane } = await collect(newDir());
  for (const item of plane.coverage.rows) {
    for (const name of FACETS) {
      const facet = item.facets[name];
      assert.ok(FACET_STATUSES.includes(facet.status), item.propertyId + ' ' + name);
      const gap = !['verified', 'not-applicable'].includes(facet.status);
      assert.equal(item.blindSpots.some(spot => spot.facet === name), gap, item.propertyId + ' ' + name + ' gap/blind-spot mismatch');
    }
    assert.ok(item.blindSpots.every(spot => FACETS.includes(spot.facet) && spot.nextAction));
  }
});

test('a blocked probe is a named gap, never an outage and never health: confidence stays insufficient', async () => {
  const { plane } = await collect(newDir(), { mutate: world => { world.sites['cyancanoe.com'] = { status: 403, headers: { 'cf-mitigated': 'challenge' }, body: 'Just a moment...' }; } });
  const item = row(plane.coverage, 'cyancanoe.com');
  assert.equal(item.facets.production.status, 'blocked');
  assert.equal(item.facets.production.state, 'unknown', 'blocked is not a health state');
  assert.equal(item.facets.criticalPath.status, 'blocked');
  assert.equal(item.confidence.level, 'insufficient');
  assert.equal(item.collection.status, 'blocked');
  assert.match(item.blindSpots.find(spot => spot.facet === 'production').nextAction, /Allow-list/);
  assert.equal(plane.coverage.totals.facets.production.blocked, plane.estate.summary.probeBlockedZones);
});

test('audience: browser reception is "collecting" but not "readable"; only a governed measured source makes counts readable', async () => {
  const dir = newDir();
  const { plane } = await collect(dir);
  for (const item of plane.coverage.rows) {
    assert.equal(item.facets.audience.governedSource.requests28d, null, item.propertyId + ' must not carry counts without a governed source');
    assert.equal(item.facets.audience.readable, false);
  }
  const measured = await collect(newDir(), {
    env: {
      GOLD_SOURCE: writeSource(dir, 'gold.json', syntheticGold({ propertyIds: ids })),
      INSIGHTS_SOURCE: writeSource(dir, 'insights.json', syntheticInsights({ propertyIds: ids })),
    },
  });
  const governed = measured.plane.coverage.rows.filter(item => item.facets.audience.governedSource.measured);
  assert.ok(governed.length > 0, 'a governed source makes at least one property readable');
  for (const item of governed) assert.equal(item.facets.audience.governedSource.requests28d != null, true);
  assert.deepEqual(validateCoverageMatrix(measured.plane.coverage, { estate: measured.plane.estate }), []);
});

test('business events: a producer is installed only when the governed feed says so; a confirmed zero has no last event; a real event names its day', async () => {
  const dir = newDir();
  const feed = syntheticEventsFeed({
    instrumented: ['goodflippindesign.com', 'cyancanoe.com'],
    records: [7, 28, 90].flatMap(days => [['goodflippindesign.com', 'lead', days, 3], ['cyancanoe.com', 'lead', days, 0]]),
    mutate: doc => { for (const record of doc.records) if (record.propertyId === 'goodflippindesign.com') record.lastEventDay = '2026-09-30'; },
  });
  const { plane } = await collect(newDir(), { env: { EVENTS_SOURCE: writeSource(dir, 'events.json', feed) } });
  const gfd = row(plane.coverage, 'goodflippindesign.com').facets.businessEvents;
  assert.equal(gfd.producerInstalled, 'confirmed');
  assert.deepEqual(gfd.lastConfirmedEvent, { day: '2026-09-30', evidenceState: 'measured' });
  assert.equal(gfd.counts28d.lead, 3);
  const cyan = row(plane.coverage, 'cyancanoe.com').facets.businessEvents;
  assert.equal(cyan.producerInstalled, 'confirmed');
  assert.deepEqual(cyan.lastConfirmedEvent, { day: null, evidenceState: 'none-observed' }, 'a measured zero is not an unknown, and it has no last event');
  assert.equal(cyan.counts28d.lead, 0, 'a measured zero is a number, not an absence');
  // Not instrumented: never a day, never a count, never a confirmed producer.
  const aia = row(plane.coverage, 'aiaimate.com').facets.businessEvents;
  assert.notEqual(aia.producerInstalled, 'confirmed');
  assert.equal(aia.lastConfirmedEvent.day, null);
  assert.deepEqual(aia.counts28d, {});
  assert.equal(plane.coverage.totals.withProducerConfirmed, 2);
  assert.equal(plane.coverage.totals.withLastConfirmedEvent, 1);
  assert.deepEqual(validateCoverageMatrix(plane.coverage, { estate: plane.estate }), []);
});

test('an unreadable event store is awaiting authority for every applicable property, and the diagnostic names the real blocker', async () => {
  const { plane } = await collect(newDir(), {
    env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a', EVENTS_D1_DATABASE_ID: 'db' },
    cloudflare: async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'The given account is not valid or is not authorized to access this service' }] }), { status: 403, headers: { 'content-type': 'application/json' } }),
  });
  assert.equal(plane.events.source.status, 'awaiting-authorized-source');
  const applicable = plane.coverage.rows.filter(item => item.facets.businessEvents.status !== 'not-applicable');
  assert.ok(applicable.length > 0);
  for (const item of applicable) {
    assert.equal(item.facets.businessEvents.status, 'awaiting-authority', item.propertyId);
    assert.notEqual(item.facets.businessEvents.producerInstalled, 'confirmed', 'a producer is never confirmed by configuration alone');
    assert.equal(item.facets.businessEvents.count28d, null);
  }
  const diagnostic = plane.diagnostics.items.find(entry => entry.id === 'business-outcomes:coverage');
  assert.equal(diagnostic.actionability.state, 'blocked-on-authority');
  assert.match(diagnostic.observed, /cannot read it/);
  assert.doesNotMatch(diagnostic.nextAction, /set the events feed secrets/);
  assert.match(diagnostic.nextAction, /D1 read access/);
});

test('estate-wide diagnostics rank the estate gap but never stamp their severity onto every property row', async () => {
  const { plane } = await collect(newDir());
  const critical = plane.diagnostics.items.filter(entry => entry.severity === 'critical' && !entry.subjects.length && entry.status !== 'closed');
  if (critical.length) {
    assert.ok(plane.coverage.gaps.some(gap => gap.severity === 'critical'), 'the estate-level gap list carries the critical estate-wide finding');
    assert.ok(plane.coverage.rows.every(item => item.severity !== 'critical'), 'rows carry property-scoped severity only');
    assert.ok(plane.coverage.rows.some(item => item.blindSpots.some(spot => spot.scope === 'estate-wide')));
  }
});

test('surfaces discovered in Cloudflare but absent from the registry are listed, and dropping one fails validation', async () => {
  const { plane } = await collect(newDir(), {
    env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' },
    cloudflare: async input => {
      const url = String(input);
      const ok = result => new Response(JSON.stringify({ success: true, result, result_info: { page: 1, per_page: 50, total_pages: 1, total_count: result.length } }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/pages/projects/') && url.endsWith('/domains')) return ok([{ name: 'ghost.goodflippindesign.com', status: 'active' }]);
      if (url.includes('/pages/projects')) return ok([{ name: 'ghost', canonical_deployment: { created_on: '2026-09-01T00:00:00Z' } }, { name: 'stray-project' }]);
      if (url.includes('/zones')) return ok(ids.map(name => ({ name, status: 'active' })));
      return new Response(JSON.stringify({ success: false, errors: [{ message: 'unsupported in test' }] }), { status: 400, headers: { 'content-type': 'application/json' } });
    },
  });
  const surfaces = plane.coverage.surfaces.map(item => item.id);
  const infra = plane.estate.infrastructure;
  assert.equal(plane.coverage.surfaces.length, (infra.unregisteredSurfaces || []).length + (infra.orphanProjects || []).length);
  assert.ok(surfaces.length > 0, 'test estate must discover at least one surface');
  assert.ok(plane.coverage.surfaces.every(item => item.coverage === 'not-monitored'));
  const dropped = clone(plane.coverage);
  dropped.surfaces.pop();
  assert.ok(validateCoverageMatrix(dropped, { estate: plane.estate }).some(error => /surfaces are not all accounted for/.test(error)));
});

test('the validator rejects a matrix that outruns its evidence', async () => {
  const { plane } = await collect(newDir(), { mutate: world => { world.sites['cyancanoe.com'] = { status: 403, headers: { 'cf-mitigated': 'challenge' }, body: 'Just a moment...' }; } });
  const bad = (mutate, pattern) => {
    const doc = clone(plane.coverage);
    mutate(doc);
    assert.ok(validateCoverageMatrix(doc, { estate: plane.estate }).some(error => pattern.test(error)), String(pattern));
  };
  bad(doc => { row(doc, 'cyancanoe.com').confidence.level = 'high'; }, /claims confidence without verified availability/);
  bad(doc => { row(doc, 'cyancanoe.com').facets.production.state = 'available'; }, /presents a blocked probe as a health state/);
  bad(doc => { row(doc, 'cyancanoe.com').blindSpots = []; }, /no blind spot for its gap/);
  bad(doc => { row(doc, 'heavymoose.com').facets.businessEvents.counts28d = { lead: 0 }; }, /event count without verified instrumentation/);
  bad(doc => { row(doc, 'heavymoose.com').facets.businessEvents.lastConfirmedEvent = { day: '2026-09-30', evidenceState: 'measured' }; }, /confirmed event without a confirmed producer/);
  bad(doc => { row(doc, 'heavymoose.com').facets.audience.governedSource.requests28d = 5; }, /requests that are not measured/);
  bad(doc => { doc.rows.reverse(); }, /exactly the registered properties/);
  bad(doc => { doc.policy.unknownIsHealthy = true; }, /policy\.unknownIsHealthy/);
  bad(doc => { row(doc, 'heavymoose.com').facets.history.status = 'bogus'; }, /facet history/);
});

test('freshness reports what was never collected instead of averaging it into the age of what was', async () => {
  const { plane } = await collect(newDir());
  const item = row(plane.coverage, 'aiaimate.com');
  assert.equal(item.freshness.availability, 'fresh');
  assert.ok(item.freshness.neverCollected.includes('audience'));
  const collected = ['availability', 'criticalPath', 'audience', 'businessEvents', 'inventory'].map(name => item.freshness[name]).filter(state => state !== 'unknown');
  const order = ['fresh', 'stale', 'expired'];
  assert.equal(item.freshness.worst, collected.reduce((acc, state) => (order.indexOf(state) > order.indexOf(acc) ? state : acc), 'fresh'), 'the worst age is taken over what was collected; unknown is listed separately');
  assert.ok(!collected.includes('unknown'));
});

test('evidence published before the matrix existed is still a complete, valid set, and the next collection adds it', async () => {
  const dir = newDir();
  await collect(dir, { runId: 'first' });
  const file = join(dir, 'latest', 'coverage-matrix.json');
  assert.ok(existsSync(file));
  rmSync(file);
  const second = await collect(dir, { runId: 'second', start: '2026-10-01T18:00:00Z' });
  assert.ok(existsSync(file), 'the matrix is rewritten');
  assert.deepEqual(validateCoverageMatrix(JSON.parse(readFileSync(file, 'utf8')), { estate: second.plane.estate }), []);
});

test('the committed seed matrix accounts for the whole registry and claims nothing it has not measured', () => {
  const doc = JSON.parse(readFileSync(join(ROOT, 'observatory/mission-control/coverage-matrix.json'), 'utf8'));
  assert.deepEqual(doc.rows.map(item => item.propertyId), ids);
  for (const item of doc.rows) {
    assert.notEqual(item.facets.production.status, 'verified', 'the seed has no probe evidence');
    assert.equal(item.confidence.level, 'insufficient');
    assert.equal(item.facets.businessEvents.lastConfirmedEvent.day, null);
  }
});

test('the markdown report shows every property and the highest-severity gaps', async () => {
  const { plane } = await collect(newDir());
  const text = renderCoverageMarkdown(plane.coverage);
  for (const id of ids) assert.ok(text.includes('| ' + id + ' |'), id);
  assert.match(text, /## Highest-severity gaps/);
  assert.match(text, /## Surfaces outside the registry/);
});

test('D1 feed: lastEventDay is the newest day with events (today included), null when none, and the feed still validates', () => {
  const feed = buildD1BusinessEventsFeed({
    now: '2026-09-25T16:30:00.000Z',
    producers: [{ property_id: 'goodflippindesign.com', event_type: 'lead' }, { property_id: 'cyancanoe.com', event_type: 'lead' }],
    daily: [
      { property_id: 'goodflippindesign.com', event_type: 'lead', day: '2026-09-20', count: 1 },
      { property_id: 'goodflippindesign.com', event_type: 'lead', day: '2026-09-25', count: 4 },
      { property_id: 'cyancanoe.com', event_type: 'lead', day: '2026-09-24', count: 0 },
      { property_id: 'goodflippindesign.com', event_type: 'lead', day: '2026-09-27', count: 9 },
    ],
  });
  const record = (id, days) => feed.records.find(item => item.propertyId === id && item.window.days === days);
  assert.equal(record('goodflippindesign.com', 28).lastEventDay, '2026-09-25', 'today counts as the latest event, a future day never does');
  assert.equal(record('goodflippindesign.com', 28).count, 1, 'the partial current day is still excluded from completed-window counts');
  assert.equal(record('cyancanoe.com', 28).lastEventDay, null, 'a zero-count day is not an event');
  assert.equal(validateFeed(feed, reg), null);
  feed.records[0].lastEventDay = 'yesterday';
  assert.match(validateFeed(feed, reg), /lastEventDay must be a UTC date/);
});

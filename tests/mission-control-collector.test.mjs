import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CollectionError, runCollection } from '../tools/mission-control/lib/collect.mjs';
import { EvidenceCorruptError, PUBLISHED_FILES } from '../tools/mission-control/lib/evidence.mjs';
import { validateDataPlane } from '../tools/mission-control/lib/contracts.mjs';
import { ROOT, healthyWorld, makeClock, makeDeps, makeFetch, registry } from './helpers/mission-control-fakes.mjs';

const read = (dir, ...parts) => JSON.parse(readFileSync(join(dir, ...parts), 'utf8'));
const readRaw = (dir, name) => readFileSync(join(dir, 'latest', name), 'utf8');
const newDir = () => mkdtempSync(join(tmpdir(), 'mc-evidence-'));

async function collect(dir, { start = Date.parse('2026-10-01T12:00:00Z'), mutate, runId = 'run-1', depsExtra, env } = {}) {
  const clock = makeClock(start);
  const world = healthyWorld(registry(), clock);
  if (mutate) mutate(world);
  const deps = makeDeps(world, depsExtra);
  const result = await runCollection({ root: ROOT, evidenceDir: dir, deps, env: env || {}, runId, confirmDelayMs: 1, skipInventory: true });
  return { ...result, world, clock };
}

test('first scheduled collection seeds history, probes all 25 zones, and replaces unknowns only where proven', async () => {
  const dir = newDir();
  const { plane } = await collect(dir);
  const { estate, history, diagnostics } = plane;

  assert.equal(estate.propertyCount, 25);
  assert.equal(estate.properties[0].propertyId, 'globaldeets.com');
  assert.equal(estate.properties[1].propertyId, 'culturesherpa.org');
  assert.equal(estate.summary.availableZones, 21);
  assert.equal(estate.summary.noServiceZones, 4);
  assert.equal(estate.summary.availabilityKnownZones, 25);
  assert.equal(estate.summary.unavailableZones, 0);

  // Only the authoritative contract can prove health; HTTP 200 elsewhere is reachable-unverified.
  assert.equal(estate.summary.verifiedHealthyZones, 1);
  assert.equal(estate.properties[0].diagnosticState, 'verified-healthy');
  const cs = estate.properties[1];
  assert.equal(cs.availability.state, 'available');
  assert.equal(cs.diagnosticState, 'reachable-unverified');
  assert.equal(cs.criticalPath.level, 'baseline');
  assert.equal(estate.properties.find(item => item.propertyId === 'culturesherpa.com').criticalPath.state, 'unknown');
  assert.equal(estate.properties.find(item => item.propertyId === 'fwomps.com').diagnosticState, 'no-service-published');

  // The GD-029 seed snapshots are retained untouched and a dated scheduled snapshot was appended.
  assert.equal(history.snapshots.length, 3);
  assert.deepEqual(history.snapshots.slice(0, 2).map(item => item.snapshotId), ['2026-09-23.2', '2026-09-24.1']);
  const scheduled = history.snapshots[2];
  assert.equal(scheduled.snapshotId, '2026-10-01.scheduled');
  assert.equal(scheduled.availability.evidenceState, 'measured');
  assert.equal(scheduled.availability.availableZones, 21);
  assert.equal(scheduled.estate.evidenceState, 'carried-forward', 'unrefreshed inventory is never labelled a fresh measurement');
  assert.equal(scheduled.globaldeetsOperational.evidenceState, 'unavailable');
  assert.equal(scheduled.globaldeetsOperational.edgeRequests, null, 'missing evidence is never zero');
  assert.equal(scheduled.certifiedAudience.value, null);
  assert.equal(scheduled.certifiedAudience.certified, false);

  assert.ok(!diagnostics.items.some(item => item.id.startsWith('availability:outage')));
  assert.ok(diagnostics.items.some(item => item.id === 'availability:no-service-published' && item.escalation.class === 'maintenance'));
  assert.ok(!diagnostics.items.some(item => item.id === 'evidence:probe-missing'), 'probe evidence now exists');
  assert.deepEqual(validateDataPlane(plane, { expectPropertyCount: 25 }), []);
  for (const name of PUBLISHED_FILES) assert.ok(existsSync(join(dir, 'latest', name)), name);
});

test('collection is idempotent: replaying the same run yields byte-identical evidence', async () => {
  const dir = newDir();
  await collect(dir);
  const first = Object.fromEntries(PUBLISHED_FILES.map(name => [name, readRaw(dir, name)]));
  await collect(dir);
  for (const name of PUBLISHED_FILES) assert.equal(readRaw(dir, name), first[name], name + ' changed on identical replay');
  assert.equal(read(dir, 'latest', 'history.json').snapshots.length, 3);
});

test('reruns on the same UTC day upsert one snapshot; a new day appends; older observations never overwrite', async () => {
  const dir = newDir();
  await collect(dir, { runId: 'a', start: Date.parse('2026-10-01T06:00:00Z') });
  await collect(dir, { runId: 'b', start: Date.parse('2026-10-01T18:00:00Z') });
  let history = read(dir, 'latest', 'history.json');
  const sameDay = history.snapshots.filter(item => item.snapshotId === '2026-10-01.scheduled');
  assert.equal(sameDay.length, 1);
  assert.equal(sameDay[0].collector.runId, 'b');
  assert.equal(sameDay[0].availability.dayRollup.runs, 2);

  await collect(dir, { runId: 'c', start: Date.parse('2026-10-02T06:00:00Z') });
  history = read(dir, 'latest', 'history.json');
  assert.equal(history.snapshots.filter(item => item.collector?.kind === 'scheduled').length, 2);

  // A delayed run that observed earlier than the stored snapshot cannot rewrite it.
  await collect(dir, { runId: 'late', start: Date.parse('2026-10-02T01:00:00Z') });
  const after = read(dir, 'latest', 'history.json').snapshots.find(item => item.snapshotId === '2026-10-02.scheduled');
  assert.equal(after.collector.runId, 'c');
});

test('an outage is confirmed, escalated by investor criticality, preserved in age, and closed on recovery', async () => {
  const dir = newDir();
  const down = world => {
    world.sites['agentkagent.com'] = { status: 502, title: 'x' };
    world.sites['culturesherpa.org'] = { status: 500, title: 'x' };
  };
  const { plane } = await collect(dir, { mutate: down, runId: 'o1', start: Date.parse('2026-10-01T06:00:00Z') });
  const outageAgent = plane.diagnostics.items.find(item => item.id === 'availability:outage:agentkagent.com');
  const outageCs = plane.diagnostics.items.find(item => item.id === 'availability:outage:culturesherpa.org');
  assert.equal(outageAgent.escalation.class, 'outage');
  assert.equal(outageAgent.severity, 'high');
  assert.equal(outageCs.escalation.class, 'investor-impacting-outage');
  assert.equal(outageCs.escalation.level, 'page');
  assert.equal(outageCs.severity, 'critical');
  assert.ok(outageCs.nextAction && outageCs.observed.includes('http-5xx'));
  assert.equal(plane.estate.properties[1].availability.confidence, 'confirmed');
  assert.equal(plane.diagnostics.items[0].id, 'measurement:audience-certification', 'investor-blocking sorts before pages');
  assert.equal(plane.diagnostics.items[1].id, 'availability:outage:culturesherpa.org');

  // Still down a day later: age accrues from the first observation.
  const still = await collect(dir, { mutate: down, runId: 'o2', start: Date.parse('2026-10-03T06:00:00Z') });
  assert.equal(still.plane.diagnostics.items.find(item => item.id === 'availability:outage:agentkagent.com').ageDays, 2);

  // Recovered: the item is retained closed, not silently deleted.
  const healed = await collect(dir, { runId: 'o3', start: Date.parse('2026-10-03T12:00:00Z') });
  const closed = healed.plane.diagnostics.items.find(item => item.id === 'availability:outage:agentkagent.com');
  assert.equal(closed.status, 'closed');
  assert.ok(closed.closedAt);
});

test('an unconfirmed single-run failure is degraded, not an outage', async () => {
  const dir = newDir();
  let sequence = 0;
  const { plane } = await collect(dir, {
    mutate: world => {
      const inner = world.fetchImpl;
      world.fetchImpl = async (input, init) => {
        if (String(input) === 'https://cyancanoe.com/') {
          sequence += 1;
          if (sequence <= 3) return new Response('down', { status: 503 });
        }
        return inner(input, init);
      };
    },
  });
  const record = plane.estate.properties.find(item => item.propertyId === 'cyancanoe.com');
  assert.equal(record.availability.state, 'degraded');
  assert.match(record.availability.reason, /Intermittent/);
  assert.ok(plane.diagnostics.items.some(item => item.id === 'availability:degraded:cyancanoe.com'));
  assert.ok(!plane.diagnostics.items.some(item => item.id === 'availability:outage:cyancanoe.com'));
});

test('an invalid probe vantage preserves the last valid evidence and surfaces a diagnostic', async () => {
  const dir = newDir();
  await collect(dir, { runId: 'good', start: Date.parse('2026-10-01T06:00:00Z') });
  const goodRun = readFileSync(join(dir, 'state', 'latest-valid-run.json'), 'utf8');

  const bad = await collect(dir, {
    runId: 'bad',
    start: Date.parse('2026-10-01T10:00:00Z'),
    mutate: world => {
      world.fetchImpl = makeFetch({}, world.clock);
    },
  });
  assert.equal(bad.run.validity, 'invalid-vantage');
  assert.equal(readFileSync(join(dir, 'state', 'latest-valid-run.json'), 'utf8'), goodRun, 'last valid run must not be replaced');
  const estate = bad.plane.estate;
  assert.equal(estate.evidence.probe.runId, 'good');
  assert.equal(estate.evidence.probe.validity, 'valid');
  assert.equal(estate.summary.unavailableZones, 0, 'a broken runner never fabricates outages');
  assert.equal(estate.evidence.probe.latestAttempt.validity, 'invalid-vantage');
  assert.ok(bad.plane.diagnostics.items.some(item => item.id === 'evidence:probe-invalid-vantage' && item.escalation.class === 'stale-evidence'));
});

test('unreadable or invalid existing evidence aborts collection without touching it', async () => {
  const dir = newDir();
  await collect(dir);
  const before = readRaw(dir, 'history.json');
  writeFileSync(join(dir, 'latest', 'diagnostics.json'), '{ not json');
  await assert.rejects(() => collect(dir, { runId: 'again' }), EvidenceCorruptError);
  writeFileSync(join(dir, 'latest', 'diagnostics.json'), '{}');

  const history = JSON.parse(before);
  history.snapshots.push(structuredClone(history.snapshots[0]));
  writeFileSync(join(dir, 'latest', 'history.json'), JSON.stringify(history));
  const tampered = readRaw(dir, 'history.json');
  await assert.rejects(() => collect(dir, { runId: 'again2' }), CollectionError);
  assert.equal(readRaw(dir, 'history.json'), tampered, 'invalid history must not be overwritten');
});

test('probe evidence ages: stale keeps outages alarmed, expired collapses to unknown, and a stale-evidence diagnostic appears', async () => {
  const dir = newDir();
  const down = world => {
    world.sites['agentkagent.com'] = { status: 502, title: 'x' };
  };
  await collect(dir, { mutate: down, runId: 'age-1', start: Date.parse('2026-10-01T00:00:00Z') });
  const { buildEstateHealth } = await import('../tools/mission-control/lib/estate.mjs');
  const { buildDiagnostics } = await import('../tools/mission-control/lib/diagnostics.mjs');
  const { loadConfig } = await import('../tools/mission-control/lib/collect.mjs');
  const config = loadConfig(ROOT);
  const latest = read(dir, 'state', 'latest-valid-run.json');
  const history = read(dir, 'latest', 'history.json');

  const at = hours => new Date(Date.parse(latest.finishedAt) + hours * 3600000).toISOString();
  const stale = buildEstateHealth({ registry: config.registry, probeRun: latest, now: at(12) });
  assert.equal(stale.evidence.probe.freshness.state, 'stale');
  assert.equal(stale.properties.find(item => item.propertyId === 'agentkagent.com').diagnosticState, 'outage', 'a confirmed outage keeps its alarm while stale');
  assert.equal(stale.properties.find(item => item.propertyId === 'aiaimate.com').diagnosticState, 'evidence-stale');
  assert.equal(stale.summary.verifiedHealthyZones, 0, 'stale evidence cannot claim verified health');

  const expired = buildEstateHealth({ registry: config.registry, probeRun: latest, now: at(30) });
  assert.equal(expired.evidence.probe.freshness.state, 'expired');
  assert.ok(expired.properties.every(item => item.availability.freshness.state === 'expired'));
  assert.equal(expired.summary.availabilityKnownZones, 0);
  assert.ok(expired.properties.every(item => ['evidence-expired'].includes(item.diagnosticState)));

  const diagnostics = buildDiagnostics({ estate: expired, history, manual: config.manual, now: at(30) });
  const item = diagnostics.items.find(entry => entry.id === 'evidence:probe-stale');
  assert.equal(item.severity, 'high');
  assert.equal(item.escalation.class, 'stale-evidence');
});

test('inventory refresh replaces carried-forward facts only when the Cloudflare token can read them', async () => {
  const dir = newDir();
  const clock = makeClock(Date.parse('2026-10-01T12:00:00Z'));
  const world = healthyWorld(registry(), clock);
  const cfFetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://api.cloudflare.com/')) return world.fetchImpl(input, init);
    const ok = result => new Response(JSON.stringify({ success: true, result, result_info: { total_pages: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.includes('/zones')) return ok([{ name: 'globaldeets.com', status: 'active' }]);
    if (url.includes('/domains')) return ok([{ name: 'globaldeets.com', status: 'active' }]);
    if (url.includes('/pages/projects')) return ok([{ name: 'globaldeets', canonical_deployment: { created_on: '2026-10-01T09:00:00Z' } }]);
    return new Response('{}', { status: 404 });
  };
  const deps = makeDeps(world, { fetchImpl: cfFetch });
  const result = await runCollection({ root: ROOT, evidenceDir: dir, deps, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, runId: 'inv', confirmDelayMs: 1 });
  assert.equal(result.plane.estate.evidence.inventory.refreshed, true);
  const gd = result.plane.estate.properties[0];
  assert.equal(gd.deployment.latestProductionDeployAt, '2026-10-01T09:00:00Z');
  // Zones the token did not list are labelled, not silently kept active.
  assert.equal(result.plane.estate.properties.find(item => item.propertyId === 'fwomps.com').zone.status, 'not-listed');

  // Token without permission: facts are carried forward.
  const denied = makeDeps(world, { fetchImpl: async (input, init) => (String(input).startsWith('https://api.cloudflare.com/') ? new Response('{"success":false,"errors":[{"message":"forbidden"}]}', { status: 403 }) : world.fetchImpl(input, init)) });
  const dir2 = newDir();
  const carried = await runCollection({ root: ROOT, evidenceDir: dir2, deps: denied, env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, runId: 'inv2', confirmDelayMs: 1 });
  assert.equal(carried.plane.estate.evidence.inventory.refreshed, false);
  assert.match(carried.inventoryNote, /could not read inventory/);
});

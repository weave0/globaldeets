import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT, registry } from './helpers/mission-control-fakes.mjs';
import { collect, newDir, writeSource } from './helpers/mission-control-plane.mjs';
import { syntheticGold, syntheticInsights } from './helpers/mission-control-audience-fixtures.mjs';
import { CollectionError } from '../tools/mission-control/lib/collect.mjs';
import { LEGACY_PUBLISHED_FILES, WRITTEN_FILES } from '../tools/mission-control/lib/evidence.mjs';
import { validateHistory } from '../tools/mission-control/lib/ledger.mjs';

const ids = registry().properties.map(item => item.propertyId);
const read = (dir, name) => JSON.parse(readFileSync(join(dir, 'latest', name), 'utf8'));

/** Downgrades a freshly published data plane into the shape GD-030 published: five files, estate schema 1.x, no GD-031 fields. */
function downgradeToGd030(dir) {
  const latest = join(dir, 'latest');
  const estate = read(dir, 'estate-health.json');
  estate.schemaVersion = '1.1.0';
  for (const property of estate.properties) {
    delete property.profile;
    delete property.observability.reception;
    property.observability = { state: property.observability.rum === 'on' ? 'observed' : 'unobserved', rum: property.observability.rum, evidenceState: 'measured', source: 'Cloudflare zone RUM setting' };
  }
  writeFileSync(join(latest, 'estate-health.json'), JSON.stringify(estate, null, 2));
  const diagnostics = read(dir, 'diagnostics.json');
  diagnostics.schemaVersion = '1.1.0';
  writeFileSync(join(latest, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
  const history = read(dir, 'history.json');
  history.schemaVersion = '1.1.0';
  for (const snapshot of history.snapshots) {
    delete snapshot.audience;
    delete snapshot.instrumentation;
  }
  writeFileSync(join(latest, 'history.json'), JSON.stringify(history, null, 2));
  // A GD-030 evidence branch only ever held five published files.
  removeNewFiles(dir);
}

function removeNewFiles(dir) {
  for (const name of ['audience.json', 'business-events.json', 'executive.json', 'coverage-matrix.json']) rmSync(join(dir, 'latest', name), { force: true });
}

test('GD-030 evidence (five files, estate schema 1.x) is read, its history preserved, and superseded by the full GD-031 data plane', async () => {
  const dir = newDir();
  await collect(dir, { start: '2026-10-01T12:00:00Z', runId: 'first' });
  downgradeToGd030(dir);
  assert.deepEqual(readdirSync(join(dir, 'latest')).sort(), [...LEGACY_PUBLISHED_FILES].sort());
  const before = read(dir, 'history.json');

  const logs = [];
  const clockedStart = '2026-10-01T18:00:00Z';
  const { runCollection } = await import('../tools/mission-control/lib/collect.mjs');
  const { healthyWorld, makeClock, makeDeps } = await import('./helpers/mission-control-fakes.mjs');
  const clock = makeClock(Date.parse(clockedStart));
  const result = await runCollection({ root: ROOT, evidenceDir: dir, deps: makeDeps(healthyWorld(registry(), clock)), runId: 'second', confirmDelayMs: 1, skipInventory: true, log: message => logs.push(message) });
  assert.ok(logs.some(line => /migrating GD-030 evidence/.test(line)));
  assert.deepEqual(readdirSync(join(dir, 'latest')).sort(), [...WRITTEN_FILES].sort());
  assert.equal(read(dir, 'estate-health.json').schemaVersion, '2.0.0');
  assert.equal(read(dir, 'history.json').schemaVersion, '1.2.0');
  const after = read(dir, 'history.json');
  for (const snapshot of before.snapshots.filter(item => item.collector?.kind !== 'scheduled')) {
    assert.deepEqual(after.snapshots.find(item => item.snapshotId === snapshot.snapshotId), snapshot, 'seeded snapshots are immutable across the migration');
  }
  assert.ok(after.snapshots.length >= before.snapshots.length);
  assert.ok(after.snapshots.some(item => item.audience && item.instrumentation), 'new snapshots carry the GD-031 sections');
  assert.deepEqual(validateHistory(after), []);
  assert.ok(result.plane.executive);
});

test('legacy snapshots without GD-031 sections stay valid and readable; nothing is backfilled', async () => {
  const seedHistory = JSON.parse(readFileSync(join(ROOT, 'tools/mission-control/config/history-seed.json'), 'utf8'));
  const history = { contractName: 'globaldeets-mission-control-history', supportedWindowsDays: [7, 28, 90], policy: { missingSnapshotIsZero: false, certifiedAudienceMayUseOperationalTelemetry: false }, snapshots: seedHistory.snapshots };
  assert.deepEqual(validateHistory(history), []);
  assert.ok(history.snapshots.every(snapshot => snapshot.audience === undefined), 'old snapshots carry no invented audience');
});

test('corrupted, incomplete or invalid existing evidence fails closed and is never overwritten', async () => {
  const dir = newDir();
  await collect(dir, { runId: 'good' });
  const historyPath = join(dir, 'latest', 'history.json');
  const good = readFileSync(historyPath, 'utf8');

  // A duplicated snapshot id is a damaged ledger.
  const damaged = JSON.parse(good);
  damaged.snapshots.push(structuredClone(damaged.snapshots[0]));
  writeFileSync(historyPath, JSON.stringify(damaged));
  await assert.rejects(() => collect(dir, { runId: 'bad-1' }), error => error instanceof CollectionError && /Existing published evidence is invalid/.test(error.message));
  assert.equal(readFileSync(historyPath, 'utf8'), JSON.stringify(damaged), 'the damaged file was left untouched for inspection');

  // Unparseable JSON.
  writeFileSync(historyPath, '{ nope');
  await assert.rejects(() => collect(dir, { runId: 'bad-2' }), /Cannot parse/);

  // A legacy set missing one of its files is incomplete.
  writeFileSync(historyPath, good);
  rmSync(join(dir, 'latest', 'diagnostics.json'));
  await assert.rejects(() => collect(dir, { runId: 'bad-3' }), error => error instanceof CollectionError && /incomplete/.test(error.message));

  // A tampered health verdict in an otherwise complete set.
  writeFileSync(join(dir, 'latest', 'diagnostics.json'), JSON.stringify(read(dir, 'estate-health.json') && { contractName: 'globaldeets-diagnostics-queue', items: [] }));
  const estatePath = join(dir, 'latest', 'estate-health.json');
  const estate = read(dir, 'estate-health.json');
  estate.properties[0].diagnosticState = 'verified-healthy';
  estate.properties[0].availability.state = 'unknown';
  writeFileSync(estatePath, JSON.stringify(estate));
  await assert.rejects(() => collect(dir, { runId: 'bad-4' }), error => error instanceof CollectionError);
});

test('a dry run assembles and validates everything but persists nothing', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, { dryRun: true });
  assert.ok(plane.executive);
  assert.equal(existsSync(join(dir, 'latest')), false, 'no evidence directory is written');
  assert.equal(existsSync(join(dir, 'state')), false);
});

test('a fixture Gold document in the production loading path never becomes audience evidence or a history point', async () => {
  const dir = newDir();
  const env = {
    GOLD_SOURCE: writeSource(dir, 'canonical-gold-m1.2.json', syntheticGold({ propertyIds: ids, fixture: true })),
    INSIGHTS_SOURCE: writeSource(dir, 'traffic-insights-1.0.json', syntheticInsights({ propertyIds: ids, fixture: true })),
  };
  const { plane } = await collect(dir, { env });
  assert.equal(plane.audience.source.status, 'rejected');
  assert.equal(plane.audience.estate.requests[28].value, null);
  const snapshot = plane.history.snapshots.at(-1);
  assert.equal(snapshot.audience.evidenceState, 'unavailable');
  assert.equal(snapshot.audience.edgeRequests, undefined);
  assert.ok(!JSON.stringify(read(dir, 'executive.json')).includes('test-synthetic'));
});

test('a measured audience is retained in history as a governed point, with its comparability key and no person counts', async () => {
  const dir = newDir();
  const env = {
    GOLD_SOURCE: writeSource(dir, 'canonical-gold-m1.2.json', syntheticGold({ propertyIds: ids })),
    INSIGHTS_SOURCE: writeSource(dir, 'traffic-insights-1.0.json', syntheticInsights({ propertyIds: ids })),
  };
  const { plane } = await collect(dir, { env });
  const point = plane.history.snapshots.at(-1).audience;
  assert.equal(point.evidenceState, 'measured');
  assert.equal(point.edgeRequests[28], plane.audience.estate.requests[28].value);
  assert.match(point.comparabilityKey, /^audience\|gold-1\.2\|properties=25\|gold\|1\.2\|28d\|/);
  assert.equal(point.sourceGeneratedAt, '2026-10-01T06:00:00Z');
  assert.match(point.limitations, /not people/);
  assert.deepEqual(validateHistory(plane.history), []);

  const forged = structuredClone(plane.history);
  forged.snapshots.at(-1).audience.sourceGeneratedAt = null;
  assert.ok(validateHistory(forged).some(error => /measured without governed source provenance/.test(error)));
  const valuesWithoutEvidence = structuredClone(plane.history);
  valuesWithoutEvidence.snapshots.at(-1).audience = { evidenceState: 'unavailable', edgeRequests: { 7: 1, 28: 2, 90: 3 } };
  assert.ok(validateHistory(valuesWithoutEvidence).some(error => /values without measured evidence/.test(error)));
});

test('the overlay refuses legacy (pre-GD-031) evidence and keeps the seed; a complete valid set is overlaid', async () => {
  const run = (script, args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { cwd: ROOT, encoding: 'utf8' });
  const dist = mkdtempSync(join(tmpdir(), 'mc-dist-'));
  cpSync(join(ROOT, 'observatory/mission-control'), join(dist, 'observatory/mission-control'), { recursive: true });
  const seedBytes = readFileSync(join(dist, 'observatory/mission-control/estate-health.json'), 'utf8');

  const legacyDir = newDir();
  await collect(legacyDir);
  removeNewFiles(legacyDir);
  const legacy = run('tools/mission-control/overlay.mjs', ['--evidence=' + legacyDir, '--dist=' + dist]);
  assert.equal(legacy.status, 0);
  assert.match(legacy.stdout + legacy.stderr, /incomplete \(or published before GD-031\)/);
  assert.equal(readFileSync(join(dist, 'observatory/mission-control/estate-health.json'), 'utf8'), seedBytes);
  assert.equal(run('tools/mission-control/overlay.mjs', ['--evidence=' + legacyDir, '--dist=' + dist, '--strict']).status, 1);

  const fullDir = newDir();
  await collect(fullDir);
  const full = run('tools/mission-control/overlay.mjs', ['--evidence=' + fullDir, '--dist=' + dist, '--strict']);
  assert.equal(full.status, 0, full.stderr);
  assert.notEqual(readFileSync(join(dist, 'observatory/mission-control/estate-health.json'), 'utf8'), seedBytes);
  assert.ok(existsSync(join(dist, 'observatory/mission-control/executive.json')));

  // A corrupted member of an otherwise complete set is not overlaid.
  const corrupt = newDir();
  await collect(corrupt);
  const audience = read(corrupt, 'audience.json');
  audience.policy.edgeTrafficIsHumanAudience = true;
  writeFileSync(join(corrupt, 'latest', 'audience.json'), JSON.stringify(audience));
  const refused = run('tools/mission-control/overlay.mjs', ['--evidence=' + corrupt, '--dist=' + dist, '--strict']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /failed validation/);
});

test('a partially published GD-031 set (legacy files plus only some new ones) is never overwritten', async () => {
  const dir = newDir();
  await collect(dir, { runId: 'full' });
  rmSync(join(dir, 'latest', 'executive.json'));
  await assert.rejects(() => collect(dir, { runId: 'partial' }), error => error instanceof CollectionError && /incomplete/.test(error.message) && /executive\.json/.test(error.errors.join(' ')));
  rmSync(join(dir, 'latest', 'audience.json'));
  await assert.rejects(() => collect(dir, { runId: 'partial-2' }), /incomplete/);
});

test('a legacy set with a corrupted summary or probes document fails closed', async () => {
  for (const [file, mutate] of [['mission-control-data.json', doc => { doc.missionControlId = 'other'; }], ['probes.json', doc => { doc.contractName = 'other'; }]]) {
    const dir = newDir();
    await collect(dir, { runId: 'full' });
    downgradeToGd030(dir);
    const path = join(dir, 'latest', file);
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    mutate(doc);
    writeFileSync(path, JSON.stringify(doc));
    await assert.rejects(() => collect(dir, { runId: 'migrate' }), error => error instanceof CollectionError && /invalid/.test(error.message));
  }
});

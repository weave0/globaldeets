import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CollectionError, loadConfig, runCollection } from '../tools/mission-control/lib/collect.mjs';
import { PUBLISHED_FILES } from '../tools/mission-control/lib/evidence.mjs';
import { validateDataPlane } from '../tools/mission-control/lib/contracts.mjs';
import { buildDiagnostics } from '../tools/mission-control/lib/diagnostics.mjs';
import { buildEstateHealth } from '../tools/mission-control/lib/estate.mjs';
import { probeProperty, resolveHost } from '../tools/mission-control/lib/probe.mjs';
import { ROOT, healthyWorld, makeClock, makeDeps, quickRegistry, registry } from './helpers/mission-control-fakes.mjs';

const read = (dir, ...parts) => JSON.parse(readFileSync(join(dir, ...parts), 'utf8'));
const readRaw = (dir, name) => readFileSync(join(dir, 'latest', name), 'utf8');
const newDir = () => mkdtempSync(join(tmpdir(), 'mc-hardening-'));

async function collect(dir, { start = Date.parse('2026-10-01T12:00:00Z'), mutate, runId = 'run-1' } = {}) {
  const clock = makeClock(start);
  const world = healthyWorld(registry(), clock);
  if (mutate) mutate(world);
  const result = await runCollection({ root: ROOT, evidenceDir: dir, deps: makeDeps(world), env: {}, runId, confirmDelayMs: 1, skipInventory: true });
  return { ...result, world };
}

test('the whole existing published set is validated: partial or malformed sets abort without writes', async () => {
  const dir = newDir();
  await collect(dir);
  const snapshot = Object.fromEntries(PUBLISHED_FILES.map(name => [name, readRaw(dir, name)]));

  // Valid JSON but an invalid estate must not be silently overwritten.
  const estate = JSON.parse(snapshot['estate-health.json']);
  estate.properties[5].diagnosticState = 'verified-healthy';
  writeFileSync(join(dir, 'latest', 'estate-health.json'), JSON.stringify(estate));
  await assert.rejects(() => collect(dir, { runId: 'bad-estate' }), CollectionError);
  assert.equal(JSON.parse(readRaw(dir, 'estate-health.json')).properties[5].diagnosticState, 'verified-healthy', 'left untouched for inspection');

  // A published set with a missing member is refused outright.
  writeFileSync(join(dir, 'latest', 'estate-health.json'), snapshot['estate-health.json']);
  rmSync(join(dir, 'latest', 'probes.json'));
  await assert.rejects(() => collect(dir, { runId: 'partial' }), /incomplete/);

  // A malformed probes.json is refused too.
  writeFileSync(join(dir, 'latest', 'probes.json'), JSON.stringify({ contractName: 'wrong' }));
  await assert.rejects(() => collect(dir, { runId: 'bad-probes' }), CollectionError);
});

test('publication is a directory swap and a crashed swap is recovered, never mixed', async () => {
  const dir = newDir();
  await collect(dir, { runId: 'first' });
  const before = readRaw(dir, 'estate-health.json');

  // Simulate a crash after latest -> latest.prev but before latest.next -> latest.
  renameSync(join(dir, 'latest'), join(dir, 'latest.prev'));
  mkdirSync(join(dir, 'latest.next'));
  writeFileSync(join(dir, 'latest.next', 'history.json'), '{"half":"written"}');
  await collect(dir, { runId: 'second', start: Date.parse('2026-10-01T18:00:00Z') });
  assert.equal(existsSync(join(dir, 'latest.prev')), false);
  assert.equal(existsSync(join(dir, 'latest.next')), false);
  const after = JSON.parse(readRaw(dir, 'estate-health.json'));
  assert.equal(after.evidence.probe.runId, 'second');
  assert.notEqual(readRaw(dir, 'estate-health.json'), before);
  const plane = { history: read(dir, 'latest', 'history.json'), estate: after, diagnostics: read(dir, 'latest', 'diagnostics.json'), summary: read(dir, 'latest', 'mission-control-data.json'), probes: read(dir, 'latest', 'probes.json') };
  assert.deepEqual(validateDataPlane(plane, { expectPropertyCount: 25 }), []);
});

test('validators require exactly the registered properties, once each', async () => {
  const dir = newDir();
  const { plane } = await collect(dir);
  const ids = registry().properties.sort((a, b) => a.emphasisRank - b.emphasisRank).map(item => item.propertyId);
  assert.deepEqual(validateDataPlane(plane, { expectPropertyCount: 25, expectPropertyIds: ids }), []);

  const swapped = structuredClone(plane);
  swapped.estate.properties[10].propertyId = 'not-registered.example';
  assert.ok(validateDataPlane(swapped, { expectPropertyCount: 25, expectPropertyIds: ids }).some(error => error.includes('exactly the registered properties')));

  const truncated = structuredClone(plane);
  truncated.probes.latest.properties = truncated.probes.latest.properties.slice(0, 24);
  assert.ok(validateDataPlane(truncated, { expectPropertyCount: 25, expectPropertyIds: ids }).some(error => error.includes('each registered property exactly once')));

  const duplicated = structuredClone(plane);
  duplicated.probes.latest.properties[24] = structuredClone(duplicated.probes.latest.properties[0]);
  assert.ok(validateDataPlane(duplicated, { expectPropertyCount: 25, expectPropertyIds: ids }).some(error => error.includes('each registered property exactly once')));
});

test('a declared-service DNS failure is an outage only after the delayed re-probe also fails', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, {
    mutate: world => {
      // agentkagent.com stops resolving entirely (declared service).
      delete world.sites['agentkagent.com'];
      world.served.delete('agentkagent.com');
    },
  });
  const record = plane.estate.properties.find(item => item.propertyId === 'agentkagent.com');
  assert.equal(record.availability.state, 'unavailable');
  assert.equal(record.availability.confidence, 'confirmed');
  assert.ok(['dns-nxdomain', 'dns-no-address-records'].includes(record.availability.failureClass));
  assert.match(record.availability.reason, /Confirmed by an independent re-probe/);
});

test('contract counts come from the registry, not from probe results (seed and live agree)', async () => {
  const seed = JSON.parse(readFileSync(join(ROOT, 'observatory/mission-control/diagnostics.json'), 'utf8'));
  const seedItem = seed.items.find(item => item.id === 'observability:critical-path-contracts');
  assert.match(seedItem.observed, /^1 of 25 properties have an authoritative critical-path contract; 19 have only a homepage identity baseline;/);
  const dir = newDir();
  const { plane } = await collect(dir);
  const liveItem = plane.diagnostics.items.find(item => item.id === 'observability:critical-path-contracts');
  assert.match(liveItem.observed, /^1 of 25 properties have an authoritative critical-path contract; 19 have only a homepage identity baseline;/);
  for (const property of plane.estate.properties.filter(item => item.criticalPath.state === 'unknown' && item.criticalPath.contract)) {
    assert.ok(property.criticalPath.contract.level, 'a registered contract is reported even when not yet evaluated');
  }
});

test('the seed thesis never claims availability evidence that the seed does not contain', () => {
  const summary = JSON.parse(readFileSync(join(ROOT, 'observatory/mission-control/mission-control-data.json'), 'utf8'));
  const platform = summary.investmentThesis.find(item => item.label === 'Platform');
  assert.doesNotMatch(platform.statement, /real availability evidence/i);
  assert.match(platform.statement, /when it exists/);
});

test('a Gold document with no edge-visit binding never renders a fabricated zero', () => {
  const config = loadConfig(ROOT);
  const history = structuredClone(config.historySeed);
  history.snapshots.push({
    snapshotId: '2026-10-02.scheduled',
    observedAt: '2026-10-02T00:00:00Z',
    collector: { kind: 'scheduled' },
    globaldeetsOperational: { evidenceState: 'measured', edgeRequests: 500, edgeVisits: null, syntheticHealthVisits: null, observationWindow: { start: 'a', end: 'b', days: 28 } },
    certifiedAudience: { evidenceState: 'unavailable', value: null },
  });
  const estate = buildEstateHealth({ registry: config.registry, now: '2026-10-02T01:00:00Z' });
  const diagnostics = buildDiagnostics({ estate, history, manual: config.manual, now: '2026-10-02T01:00:00Z' });
  const audience = diagnostics.items.find(item => item.id === 'measurement:audience-certification');
  assert.match(audience.observed, /reports no edge-visit count \(unavailable, not zero\)/);
  assert.doesNotMatch(audience.observed, /contains 0 raw visits/);
});

test('DNS: any NXDOMAIN answer is nxdomain, all-ENODATA is a name without addresses', async () => {
  const answer = code => () => Promise.reject(Object.assign(new Error(code), { code }));
  assert.equal((await resolveHost('x', { resolve4: answer('ENOTFOUND'), resolve6: answer('ENODATA') })).state, 'nxdomain');
  assert.equal((await resolveHost('x', { resolve4: answer('ENODATA'), resolve6: answer('ENODATA') })).state, 'no-address-records');
  assert.equal((await resolveHost('x', { resolve4: answer('ESERVFAIL'), resolve6: answer('ENODATA') })).state, 'error');
  assert.equal((await resolveHost('x', { resolve4: () => Promise.resolve(['1.1.1.1']), resolve6: answer('ENODATA') })).state, 'resolved');
});

test('bounded body reads never retain more than the configured cap even when one chunk crosses it', async () => {
  const reg = quickRegistry();
  const clock = makeClock();
  const world = healthyWorld(reg, clock);
  world.sites['agentkagent.com'] = { title: 'AgentK', body: '<title>AgentK</title>' + 'x'.repeat(200000) };
  reg.probeContract.maxBodyBytes = 1024;
  const property = reg.properties.find(item => item.propertyId === 'agentkagent.com');
  const record = await probeProperty(property, { ...makeDeps(world), contract: reg.probeContract });
  assert.equal(record.observation.state, 'available');
  assert.ok(record.http.bytes <= 1024, 'kept ' + record.http.bytes + ' bytes');
});

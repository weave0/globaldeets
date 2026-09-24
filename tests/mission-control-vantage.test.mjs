import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { collect, newDir } from './helpers/mission-control-plane.mjs';
import { effectiveObservation, reconcileVantages, validateSecondaryRun } from '../tools/mission-control/lib/vantage.mjs';
import { validateEstate, validateDataPlane, expectedPropertyIds } from '../tools/mission-control/lib/contracts.mjs';
import { registry } from './helpers/mission-control-fakes.mjs';

const require = createRequire(import.meta.url);
const semantics = require('../observatory/mission-control/evidence-semantics.js');

const run = (vantage, observation, extra = {}) => ({ run: { vantage, network: vantage + '-net', finishedAt: '2026-10-01T12:00:00Z' }, record: { observation, http: { status: extra.status ?? null, durationMs: 10 } } });
const ok = { state: 'available', blocked: false };
const down = { state: 'unavailable', blocked: false, confirmed: true, failureClass: 'http-5xx' };
const blocked = { state: 'unknown', blocked: true, failureClass: 'edge-challenge' };

test('reconcile: agreement, partial (one vantage blocked), conflict, single, inconclusive', () => {
  assert.equal(reconcileVantages([run('a', ok)]).agreement, 'single-vantage');
  assert.equal(reconcileVantages([run('a', ok), run('b', ok)]).agreement, 'agree');
  const partial = reconcileVantages([run('a', blocked), run('b', ok)]);
  assert.equal(partial.agreement, 'partial');
  assert.equal(partial.state, 'available');
  assert.equal(partial.authoritativeIndex, 1, 'the conclusive vantage is used');
  const conflict = reconcileVantages([run('a', ok), run('b', down)]);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.agreement, 'conflict');
  assert.equal(conflict.state, null, 'neither answer is chosen');
  const inconclusive = reconcileVantages([run('a', blocked), run('b', blocked)]);
  assert.equal(inconclusive.agreement, 'inconclusive');
  assert.equal(inconclusive.conflict, false);
});

test('reconcile: available vs degraded is not a conflict and the worse state wins; an unconfirmed failure is only degraded', () => {
  const mild = reconcileVantages([run('a', ok), run('b', { state: 'degraded', blocked: false, failureClass: null })]);
  assert.equal(mild.conflict, false);
  assert.equal(mild.state, 'degraded');
  assert.equal(effectiveObservation({ state: 'unavailable', confirmed: false, failureClass: 'x' }).state, 'degraded');
  assert.equal(effectiveObservation({ state: 'unavailable', confirmed: true }).state, 'unavailable');
  assert.equal(effectiveObservation({ state: 'unknown', failureClass: 'vantage-failure' }).conclusive, false);
  const unconfirmedDown = reconcileVantages([run('a', ok), run('b', { state: 'unavailable', blocked: false, confirmed: false, failureClass: 'http-5xx' })]);
  assert.equal(unconfirmedDown.conflict, false, 'a single unconfirmed failure never conflicts with a healthy vantage');
});

test('reconcile: serving on one vantage and publishing nothing on another is a conflict', () => {
  const result = reconcileVantages([run('a', ok), run('b', { state: 'no-service-published', blocked: false })]);
  assert.equal(result.conflict, true);
});

test('secondary validation: contract, validity, distinct vantage id, exact property coverage, and a sane time window', () => {
  const reg = registry();
  const ids = expectedPropertyIds(reg);
  const primary = { vantage: 'github-actions', finishedAt: '2026-10-01T12:00:00Z' };
  const good = { contractName: 'globaldeets-probe-run', validity: 'valid', vantage: 'macos', finishedAt: '2026-10-01T12:05:00Z', properties: ids.map(propertyId => ({ propertyId, observation: { state: 'available' } })) };
  assert.deepEqual(validateSecondaryRun(good, { expectPropertyIds: ids, primary }), []);
  assert.ok(validateSecondaryRun({ ...good, contractName: 'x' }, { expectPropertyIds: ids, primary })[0].includes('contractName'));
  assert.ok(validateSecondaryRun({ ...good, validity: 'invalid-vantage' }, { expectPropertyIds: ids, primary }).some(error => /not valid/.test(error)));
  assert.ok(validateSecondaryRun({ ...good, vantage: 'github-actions' }, { expectPropertyIds: ids, primary }).some(error => /must differ/.test(error)));
  assert.ok(validateSecondaryRun({ ...good, properties: good.properties.slice(1) }, { expectPropertyIds: ids, primary }).some(error => /exactly once/.test(error)));
  assert.ok(validateSecondaryRun({ ...good, finishedAt: '2026-10-01T20:00:00Z' }, { expectPropertyIds: ids, primary }).some(error => /3 hours/.test(error)));
});

test('end to end: a property challenged from one vantage but reachable from another is reachable, not probe-blocked, and the blocked vantage stays visible', async () => {
  const dir = newDir();
  const challenge = world => {
    world.sites['goodflippindesign.com'] = { status: 403, title: 'Just a moment...', body: '<html><title>Just a moment...</title>cf-challenge</html>' };
  };
  const { plane } = await collect(dir, { mutate: challenge, secondary: [{ id: 'macos', network: 'macOS runner' }] });
  const row = plane.estate.properties.find(item => item.propertyId === 'goodflippindesign.com');
  assert.equal(row.availability.state, 'available');
  assert.equal(row.availability.blocked, false);
  assert.equal(row.availability.agreement, 'partial');
  assert.equal(row.availability.evidence.vantage, 'macos');
  const github = row.availability.vantages.find(item => item.vantage === 'github-actions');
  assert.equal(github.blocked, true);
  assert.equal(github.conclusive, false);
  assert.match(row.availability.reason, /Set aside as inconclusive: github-actions \(blocked\)/);
  assert.notEqual(row.diagnosticState, 'probe-blocked');
  assert.equal(plane.estate.summary.probeBlockedZones, 0);
  assert.equal(plane.estate.evidence.probe.vantageCount, 2);
  assert.deepEqual(plane.estate.evidence.probe.vantages.map(item => item.role), ['primary', 'secondary']);
  assert.ok(plane.diagnostics.items.some(item => item.id === 'evidence:vantage-partial' && item.subjects.includes('goodflippindesign.com')));
  assert.equal(plane.diagnostics.items.find(item => item.id === 'observability:single-probe-vantage'), undefined, 'a second vantage closes the single-vantage finding');
  assert.deepEqual(validateEstate(plane.estate), []);
});

test('end to end: blocked from every vantage stays probe-blocked (insufficient evidence, not an outage)', async () => {
  const dir = newDir();
  const challenge = world => {
    world.sites['goodflippindesign.com'] = { status: 403, title: 'x', body: '<html><title>Just a moment...</title>cf-challenge</html>' };
  };
  const { plane } = await collect(dir, { mutate: challenge, secondary: [{ id: 'macos', mutate: challenge }] });
  const row = plane.estate.properties.find(item => item.propertyId === 'goodflippindesign.com');
  assert.equal(row.diagnosticState, 'probe-blocked');
  assert.equal(row.availability.agreement, 'inconclusive');
  assert.equal(plane.estate.summary.probeBlockedZones, 1);
  const finding = plane.diagnostics.items.find(item => item.id === 'availability:probe-blocked');
  assert.equal(finding.actionability.state, 'blocked-on-authority');
  assert.match(finding.actionability.blockedBy, /WAF/);
});

test('end to end: vantages that conclusively disagree become a conflict, never a silently chosen answer', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, {
    secondary: [{ id: 'macos', mutate: world => { world.sites['aiaimate.com'] = { status: 503, title: 'x' }; } }],
  });
  const row = plane.estate.properties.find(item => item.propertyId === 'aiaimate.com');
  assert.equal(row.diagnosticState, 'vantage-conflict');
  assert.equal(row.availability.conflict, true);
  assert.equal(row.availability.state, 'unknown');
  assert.match(row.availability.reason, /Vantages disagree/);
  assert.match(row.availability.reason, /github-actions: available/);
  assert.match(row.availability.reason, /macos: unavailable/);
  assert.equal(row.profile.operatingStatus.key, 'conflicting-evidence');
  assert.equal(plane.estate.summary.conflictingZones, 1);
  assert.equal(plane.estate.summary.availableZones, 20, 'of 21 serving properties, the conflicting one is in no availability bucket');
  const finding = plane.diagnostics.items.find(item => item.id === 'availability:vantage-conflict:aiaimate.com');
  assert.ok(finding);
  assert.equal(finding.category, 'evidence-quality');
  assert.equal(plane.diagnostics.items.find(item => item.id === 'availability:outage:aiaimate.com'), undefined, 'a conflict is not an outage');
  assert.equal(semantics.HEALTH_STATES.includes('vantage-conflict'), true);
  assert.deepEqual(validateEstate(plane.estate), []);
  const snapshot = plane.history.snapshots.at(-1);
  assert.equal(snapshot.availability.unknownZones >= 1, true, 'a conflict is counted as unknown in history, never as available or down');
});

test('an invalid, stale or malformed secondary run is rejected and cannot affect primary evidence', async () => {
  const dir = newDir();
  const { plane, secondary } = await collect(dir, {
    secondary: [
      { id: 'badvantage', tamper: item => { item.validity = 'invalid-vantage'; } },
      { id: 'partial', tamper: item => { item.properties = item.properties.slice(2); } },
      { id: 'macos' },
    ],
  });
  assert.deepEqual(secondary.notes.filter(note => !note.accepted).map(note => note.vantage).sort(), ['badvantage', 'partial']);
  assert.equal(plane.estate.evidence.probe.vantageCount, 2, 'only the valid secondary counts');
  assert.deepEqual(validateEstate(plane.estate), []);
});

test('a corrupted secondary file is ignored with a note and never breaks collection', async () => {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = newDir();
  const vantages = join(dir, 'vantages');
  mkdirSync(vantages, { recursive: true });
  writeFileSync(join(vantages, 'vantage-broken.json'), '{ not json');
  const { runCollection } = await import('../tools/mission-control/lib/collect.mjs');
  const { ROOT, healthyWorld, makeClock, makeDeps } = await import('./helpers/mission-control-fakes.mjs');
  const clock = makeClock(Date.parse('2026-10-01T12:00:00Z'));
  const result = await runCollection({ root: ROOT, evidenceDir: dir, secondaryDir: vantages, deps: makeDeps(healthyWorld(registry(), clock)), runId: 'r', confirmDelayMs: 1, skipInventory: true });
  assert.equal(result.secondary.notes[0].accepted, false);
  assert.match(result.secondary.notes[0].reason, /unreadable/);
  assert.equal(result.plane.estate.evidence.probe.vantageCount, 1);
  assert.deepEqual(validateDataPlane(result.plane, { expectPropertyIds: expectedPropertyIds(registry()) }), []);
});

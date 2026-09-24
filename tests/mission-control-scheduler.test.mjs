import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runCollection } from '../tools/mission-control/lib/collect.mjs';
import { PUBLISHED_FILES } from '../tools/mission-control/lib/evidence.mjs';
import { ROOT, healthyWorld, makeClock, makeDeps, registry } from './helpers/mission-control-fakes.mjs';

const workflow = readFileSync(join(ROOT, '.github/workflows/mission-control-evidence.yml'), 'utf8');
const deployWorkflow = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
const ciWorkflow = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

const run = (script, args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { cwd: ROOT, encoding: 'utf8' });

test('committed seed data plane exactly matches the deterministic build (no hand-edited history)', () => {
  const result = run('tools/mission-control/build.mjs', ['--check']);
  assert.equal(result.status, 0, result.stderr);
});

test('scheduler: runs on a cron and on demand, serialised, never cancelling a collection mid-write', () => {
  assert.match(workflow, /schedule:\s*\n\s*- cron: "\d+ \*\/6 \* \* \*"/, 'six-hourly cron matching the probe freshness policy');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /group: mission-control-evidence\s*\n\s*cancel-in-progress: false/);
  assert.match(workflow, /group: pages-deploy-refs\/heads\/main\s*\n\s*cancel-in-progress: false/, 'shares the Pages deploy group');
});

test('scheduler: evidence is committed only after collection validates and only to the evidence branch', () => {
  const collect = workflow.indexOf('tools/mission-control/collect.mjs');
  const commit = workflow.indexOf('git commit -m "Mission Control evidence');
  const push = workflow.indexOf('git push origin HEAD:mission-control-evidence');
  const tests = workflow.indexOf('node --test tests/mission-control-probe.test.mjs');
  assert.ok(tests > -1 && collect > tests, 'contract tests run before collection');
  assert.ok(collect > -1 && commit > collect && push > commit, 'collect -> commit -> push ordering');
  assert.doesNotMatch(workflow, /git push origin (main|HEAD:main)/, 'never pushes to main');
  assert.match(workflow, /exit "\$\{code\}"/, 'a hard collector failure fails the step and commits nothing');
  assert.match(workflow, /\[ "\$\{code\}" -ne 0 \] && \[ "\$\{code\}" -ne 2 \]/, 'only success or recorded-invalid-vantage may publish');
  const collectJob = workflow.slice(workflow.indexOf('  collect:'), workflow.indexOf('  deploy:'));
  assert.match(collectJob, /contents: write/);
  assert.doesNotMatch(collectJob, /deployments: write/, 'collection cannot deploy');
});

test('scheduler: deploys with strict overlay, verifies production evidence, and alerts on failure', () => {
  assert.match(workflow, /MISSION_CONTROL_EVIDENCE_STRICT: "1"/);
  assert.match(workflow, /verify-mission-control-prod\.js[^\n]*--require-probe-evidence/);
  assert.match(workflow, /--min-generated-at=/);
  assert.match(workflow, /needs\.collect\.outputs\.committed == 'true'/, 'deploy only when evidence changed');
  assert.match(workflow, /alert:[\s\S]*gh issue create[\s\S]*gh issue close/, 'failure opens an issue and recovery closes it');
  assert.match(workflow, /issues: write/);
});

test('main-push deploy also carries the validated evidence and verifies the data plane', () => {
  assert.match(deployWorkflow, /mission-control-evidence/);
  assert.match(deployWorkflow, /MISSION_CONTROL_EVIDENCE_DIR: \.evidence/);
  assert.match(deployWorkflow, /verify-mission-control-prod\.js/);
});

test('CI protects the data plane: drift check, contract tests, and syntax checks', () => {
  assert.match(ciWorkflow, /mission-control\/build\.mjs --check/);
  assert.match(ciWorkflow, /node --check tools\/mission-control\/collect\.mjs/);
  assert.match(ciWorkflow, /node --check observatory\/mission-control\/evidence-semantics\.js/);
  assert.match(ciWorkflow, /node --check tools\/verify-mission-control-prod\.js/);
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  for (const file of ['probe', 'collector', 'evidence', 'scheduler']) assert.match(pkg.scripts['test:functions'], new RegExp(`mission-control-${file}\\.test\\.mjs`));
});

async function makeEvidence() {
  const dir = mkdtempSync(join(tmpdir(), 'mc-overlay-'));
  const clock = makeClock(Date.parse('2026-10-01T12:00:00Z'));
  const world = healthyWorld(registry(), clock);
  await runCollection({ root: ROOT, evidenceDir: dir, deps: makeDeps(world), env: {}, runId: 'overlay-run', confirmDelayMs: 1, skipInventory: true });
  return dir;
}

function fakeDist() {
  const dist = mkdtempSync(join(tmpdir(), 'mc-dist-'));
  mkdirSync(join(dist, 'observatory', 'mission-control'), { recursive: true });
  cpSync(join(ROOT, 'observatory', 'mission-control'), join(dist, 'observatory', 'mission-control'), { recursive: true });
  return dist;
}

test('overlay replaces the seed with validated evidence at deploy time', async () => {
  const evidence = await makeEvidence();
  const dist = fakeDist();
  const before = JSON.parse(readFileSync(join(dist, 'observatory/mission-control/estate-health.json'), 'utf8'));
  assert.equal(before.summary.availabilityKnownZones, 0);
  const result = run('tools/mission-control/overlay.mjs', [`--evidence=${evidence}`, `--dist=${dist}`, '--strict']);
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(readFileSync(join(dist, 'observatory/mission-control/estate-health.json'), 'utf8'));
  assert.equal(after.evidence.probe.runId, 'overlay-run');
  assert.equal(after.summary.availabilityKnownZones, 25);
  for (const name of PUBLISHED_FILES) assert.ok(existsSync(join(dist, 'observatory/mission-control', name)));
});

test('overlay fails safe: corrupt, incomplete, or missing evidence never replaces the seed', async () => {
  const evidence = await makeEvidence();
  const seedBytes = readFileSync(join(ROOT, 'observatory/mission-control/estate-health.json'), 'utf8');

  const corrupt = fakeDist();
  const tampered = JSON.parse(readFileSync(join(evidence, 'latest', 'estate-health.json'), 'utf8'));
  tampered.properties[3].diagnosticState = 'verified-healthy';
  writeFileSync(join(evidence, 'latest', 'estate-health.json'), JSON.stringify(tampered));
  let result = run('tools/mission-control/overlay.mjs', [`--evidence=${evidence}`, `--dist=${corrupt}`]);
  assert.equal(result.status, 0, 'non-strict deploys continue on the seed');
  assert.match(result.stderr + result.stdout, /overlay skipped/);
  assert.equal(readFileSync(join(corrupt, 'observatory/mission-control/estate-health.json'), 'utf8'), seedBytes);
  result = run('tools/mission-control/overlay.mjs', [`--evidence=${evidence}`, `--dist=${corrupt}`, '--strict']);
  assert.equal(result.status, 1, 'strict mode refuses to deploy unvalidated evidence');

  const missing = fakeDist();
  result = run('tools/mission-control/overlay.mjs', [`--evidence=${join(tmpdir(), 'does-not-exist-mc')}`, `--dist=${missing}`]);
  assert.equal(result.status, 0);
  assert.equal(readFileSync(join(missing, 'observatory/mission-control/estate-health.json'), 'utf8'), seedBytes);
});

test('registry contract: 25 zones, GlobalDeets first, Culture Sherpa second, honest critical-path contracts', () => {
  const reg = registry();
  assert.equal(reg.properties.length, 25);
  const ranked = [...reg.properties].sort((a, b) => a.emphasisRank - b.emphasisRank);
  assert.equal(ranked[0].propertyId, 'globaldeets.com');
  assert.equal(ranked[1].propertyId, 'culturesherpa.org');
  assert.deepEqual(reg.properties.filter(item => item.investorCritical).map(item => item.propertyId).sort(), ['culturesherpa.org', 'globaldeets.com']);
  const authoritative = reg.properties.filter(item => item.probe.criticalPath?.level === 'authoritative').map(item => item.propertyId);
  assert.deepEqual(authoritative, ['globaldeets.com'], 'only the owned, verified property claims an authoritative contract');
  for (const property of reg.properties.filter(item => item.probe.criticalPath?.level === 'baseline')) {
    assert.match(property.probe.criticalPath.basis, /never as an outage/);
  }
  const parked = reg.properties.filter(item => item.probe.expectation === 'unspecified').map(item => item.propertyId).sort();
  assert.deepEqual(parked, ['artificelligance.com', 'artificelligence.com', 'fwomp.us', 'fwomps.com']);
  assert.equal(reg.goldBindings.length, 0, 'no Gold metric is bound until a governed source exists');
});

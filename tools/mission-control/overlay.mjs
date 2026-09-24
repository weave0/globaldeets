#!/usr/bin/env node
/**
 * Overlays the latest validated evidence over a staged deploy artifact.
 *   node tools/mission-control/overlay.mjs --evidence=<dir> --dist=dist [--strict]
 * Invalid or missing evidence never reaches production: the seed fallback stays in place (or --strict fails).
 * Evidence published before GD-031 (the legacy five-file set) is not overlaid: it lacks the GD-031 documents the
 * page renders, so the seed stays until the next collection publishes the full data plane.
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/collect.mjs';
import { expectedPropertyIds, validateDataPlane } from './lib/contracts.mjs';
import { PLANE_KEYS, PUBLISHED_FILES } from './lib/evidence.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = name => process.argv.find(item => item.startsWith('--' + name + '='))?.slice(name.length + 3) || null;
const strict = process.argv.includes('--strict');
const evidenceDir = arg('evidence') ? resolve(arg('evidence')) : null;
const dist = resolve(arg('dist') || 'dist');

function skip(message) {
  console.warn((strict ? '' : '::warning::') + 'Mission Control evidence overlay skipped: ' + message);
  process.exit(strict ? 1 : 0);
}

if (!evidenceDir || !existsSync(join(evidenceDir, 'latest'))) skip('no evidence directory (seed fallback deployed).');
const latest = join(evidenceDir, 'latest');
if (!PUBLISHED_FILES.every(name => existsSync(join(latest, name)))) skip('evidence set incomplete (or published before GD-031).');

let plane;
try {
  plane = Object.fromEntries(PUBLISHED_FILES.map(name => [PLANE_KEYS[name], JSON.parse(readFileSync(join(latest, name), 'utf8'))]));
} catch (error) {
  skip('evidence unreadable: ' + error.message);
}
const config = loadConfig(root);
const errors = validateDataPlane(plane, { expectPropertyCount: config.registry.properties.length, expectPropertyIds: expectedPropertyIds(config.registry) });
if (errors.length) skip('evidence failed validation: ' + errors.slice(0, 5).join('; '));

const target = join(dist, 'observatory', 'mission-control');
for (const name of PUBLISHED_FILES) copyFileSync(join(latest, name), join(target, name));
console.log('Mission Control evidence overlaid: probe run ' + (plane.estate.evidence.probe.runId || 'none') + ', observed ' + (plane.estate.evidence.probe.observedAt || 'never') + ', ' + plane.history.snapshots.length + ' snapshots.');

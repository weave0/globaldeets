#!/usr/bin/env node
/**
 * Builds the committed seed data plane (registry + carried-forward facts, no probe evidence) so the source
 * tree is always a valid deterministic fallback. `--check` fails on drift; the scheduled collector's
 * evidence overlays these files at deploy time.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/collect.mjs';
import { assemblePlane } from './lib/plane.mjs';
import { expectedPropertyIds, validateDataPlane, validateRegistry } from './lib/contracts.mjs';
import { PUBLISHED_FILES, planeDocuments } from './lib/evidence.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outDir = resolve(root, process.argv.find(item => item.startsWith('--out='))?.slice(6) || 'observatory/mission-control');
const check = process.argv.includes('--check');

const config = loadConfig(root);
const registryErrors = validateRegistry(config.registry);
if (registryErrors.length) {
  console.error(registryErrors.join('\n'));
  process.exit(1);
}
const plane = assemblePlane({ ...config, now: config.registry.inventory.asOf, scheduleSnapshot: false });
const errors = validateDataPlane(plane, { expectPropertyCount: config.registry.properties.length, expectPropertyIds: expectedPropertyIds(config.registry) });
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const outputs = planeDocuments(plane);
let drift = 0;
mkdirSync(outDir, { recursive: true });
for (const name of PUBLISHED_FILES) {
  const content = JSON.stringify(outputs[name], null, 2) + '\n';
  const path = join(outDir, name);
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) {
      console.error('DRIFT: ' + name + ' does not match the seed build (run: node tools/mission-control/build.mjs)');
      drift += 1;
    }
  } else {
    writeFileSync(path, content);
  }
}
if (drift) process.exit(1);
console.log(check ? 'Seed data plane matches build.' : 'Seed data plane written to ' + outDir);

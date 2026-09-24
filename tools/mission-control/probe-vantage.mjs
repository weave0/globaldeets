#!/usr/bin/env node
/**
 * Secondary probe vantage (GD-031). Runs the same probe engine as the primary collector from a DIFFERENT network
 * (for example a macOS runner) and writes the raw run to <out>/vantage-<id>.json. The primary collector reads it
 * with --secondary-dir, validates it, and reconciles the two vantages; disagreement becomes evidence, never a
 * silently chosen answer. This command writes no evidence branch state and cannot affect health by itself.
 *
 *   node tools/mission-control/probe-vantage.mjs --id=github-actions-macos --network="GitHub-hosted macOS (MacStadium)" --out=vantages
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/collect.mjs';
import { confirmFailures, probeEstate } from './lib/probe.mjs';
import { defaultDeps } from './lib/runtime.mjs';
import { validateRegistry } from './lib/contracts.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = name => process.argv.find(item => item.startsWith('--' + name + '='))?.slice(name.length + 3) || null;

const id = arg('id');
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('--id=<vantage-id> is required (lowercase letters, digits and dashes).');
  process.exit(1);
}
const out = resolve(arg('out') || 'vantages');
const config = loadConfig(root);
const registryErrors = validateRegistry(config.registry);
if (registryErrors.length) {
  console.error(registryErrors.join('\n'));
  process.exit(1);
}
if (arg('confirm-delay-ms') != null) config.registry.probeContract.confirmationDelayMs = Number(arg('confirm-delay-ms'));

const deps = defaultDeps();
let run = await probeEstate(config.registry, deps, { runId: 'vantage-' + id + '-' + (process.env.GITHUB_RUN_ID || Date.now()), vantage: id, network: arg('network') });
run = await confirmFailures(config.registry, run, deps);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'vantage-' + id + '.json'), JSON.stringify(run, null, 2) + '\n');
const count = state => run.properties.filter(item => item.observation.state === state).length;
console.log('[vantage ' + id + '] validity=' + run.validity + ' available=' + count('available') + ' degraded=' + count('degraded') + ' unavailable=' + count('unavailable') + ' no-service=' + count('no-service-published') + ' blocked=' + run.properties.filter(item => item.observation.blocked).length);
if (run.validity !== 'valid') process.exitCode = 2;

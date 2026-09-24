#!/usr/bin/env node
/** CLI for scheduled Mission Control evidence collection. Exit 1 leaves existing evidence untouched. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CollectionError, runCollection } from './lib/collect.mjs';
import { defaultDeps } from './lib/runtime.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = name => {
  const found = process.argv.find(item => item.startsWith('--' + name + '='));
  return found ? found.slice(name.length + 3) : null;
};

const evidenceDir = resolve(arg('evidence-dir') || '.evidence');
const runId = 'run-' + (process.env.GITHUB_RUN_ID || Date.now()) + '-' + (process.env.GITHUB_RUN_ATTEMPT || '1');

try {
  const result = await runCollection({
    root,
    evidenceDir,
    secondaryDir: arg('secondary-dir') ? resolve(arg('secondary-dir')) : null,
    dryRun: process.argv.includes('--dry-run'),
    deps: defaultDeps(),
    env: process.env,
    runId,
    confirmDelayMs: arg('confirm-delay-ms') == null ? undefined : Number(arg('confirm-delay-ms')),
    skipInventory: process.argv.includes('--no-inventory'),
    log: message => console.log('[mission-control] ' + message),
  });
  const summary = result.plane.estate.summary;
  console.log('[mission-control] ' + (process.argv.includes('--dry-run') ? 'dry run (nothing persisted): ' : 'published: ') + JSON.stringify({ run: result.run.runId, validity: result.run.validity, snapshot: result.plane.snapshotAction, ...summary }));
  console.log('[mission-control] inventory: ' + result.inventoryNote);
  console.log('[mission-control] audience: ' + result.plane.audience.source.status + '; business events: ' + result.plane.events.source.status + '; queue: ' + JSON.stringify(result.plane.diagnostics.summary));
  for (const property of result.plane.estate.properties) {
    if (['failing', 'degraded', 'conflicting-evidence', 'blocked'].includes(property.profile.operatingStatus.key)) console.log('[mission-control] attention: ' + property.propertyId + ' ' + property.diagnosticState + ' (' + property.availability.reason + ')');
  }
  if (result.run.validity !== 'valid') {
    console.error('[mission-control] probe vantage invalid; last valid evidence preserved and staleness will surface');
    process.exitCode = 2;
  }
} catch (error) {
  console.error('[mission-control] collection failed; existing evidence preserved: ' + error.message);
  if (error instanceof CollectionError) for (const item of error.errors) console.error('  - ' + item);
  process.exitCode = 1;
}

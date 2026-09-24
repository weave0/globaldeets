/**
 * Scheduled evidence collection: probe -> (inventory, Gold) -> assemble -> validate -> persist.
 * Nothing is written unless the whole data plane validates, so the last valid evidence survives any failure.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { confirmFailures, probeEstate } from './probe.mjs';
import { extractOperational, loadGoldSource } from './gold.mjs';
import { refreshInventory } from './cloudflare-inventory.mjs';
import { assemblePlane, compactRun } from './plane.mjs';
import { validateDataPlane, validateRegistry } from './contracts.mjs';
import { validateHistory } from './ledger.mjs';
import { loadEvidence, persistEvidence } from './evidence.mjs';

export class CollectionError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.errors = errors;
  }
}

export function loadConfig(root) {
  const read = name => JSON.parse(readFileSync(join(root, 'tools/mission-control/config', name), 'utf8'));
  return {
    registry: read('estate-registry.json'),
    manual: read('diagnostics-manual.json'),
    staticSummary: read('summary-static.json'),
    historySeed: read('history-seed.json'),
  };
}

export async function runCollection({ root, evidenceDir, deps, env = {}, runId, confirmDelayMs, skipInventory = false, log = () => {} }) {
  const config = loadConfig(root);
  const registryErrors = validateRegistry(config.registry);
  if (registryErrors.length) throw new CollectionError('Registry invalid', registryErrors);
  if (confirmDelayMs != null) config.registry.probeContract.confirmationDelayMs = confirmDelayMs;

  // Fail closed on unreadable/invalid existing evidence.
  const evidence = loadEvidence(evidenceDir);
  if (evidence.history) {
    const historyErrors = validateHistory(evidence.history);
    if (historyErrors.length) throw new CollectionError('Existing history is invalid; refusing to overwrite', historyErrors);
  }

  let run = await probeEstate(config.registry, deps, { runId });
  run = await confirmFailures(config.registry, run, deps);

  const latestAttempt = { runId: run.runId, at: run.finishedAt, validity: run.validity };
  const latestValidRun = run.validity === 'valid' ? run : evidence.latestValidRun;
  const now = run.finishedAt;
  log('probe run ' + run.runId + ' validity=' + run.validity);

  let inventory = evidence.inventory;
  let inventoryNote = 'skipped';
  if (!skipInventory) {
    const refreshed = await refreshInventory({ token: env.CLOUDFLARE_API_TOKEN, accountId: env.CLOUDFLARE_ACCOUNT_ID, fetchImpl: deps.fetchImpl, now: deps.now });
    if (refreshed.inventory) inventory = refreshed.inventory;
    inventoryNote = refreshed.reason || 'refreshed';
  }

  const gold = await loadGoldSource({ source: env.GOLD_SOURCE, token: env.GOLD_SOURCE_TOKEN, fetchImpl: deps.fetchImpl, readFile: deps.readFile });
  const operational = extractOperational(gold.doc, config.registry.goldBindings, 'globaldeets.com');
  if (gold.reason && operational.evidenceState === 'unavailable') operational.reason = gold.reason;

  const compact = [...evidence.compactRuns.filter(item => item.runId !== run.runId), compactRun(run)];

  const plane = assemblePlane({
    registry: config.registry,
    manual: config.manual,
    staticSummary: config.staticSummary,
    historySeed: config.historySeed,
    history: evidence.history,
    inventory,
    latestValidRun,
    latestAttempt,
    compactRuns: compact,
    previousDiagnostics: evidence.previousDiagnostics,
    operational,
    now,
    scheduleSnapshot: true,
  });

  const errors = validateDataPlane(plane, { expectPropertyCount: config.registry.properties.length });
  if (errors.length) throw new CollectionError('Assembled data plane failed validation; last valid evidence preserved', errors);

  const collectionLog = {
    entries: [
      ...evidence.collectionLog.entries,
      { runId: run.runId, at: now, validity: run.validity, snapshotAction: plane.snapshotAction, inventory: inventoryNote, gold: operational.evidenceState },
    ].slice(-100),
  };
  persistEvidence(evidenceDir, {
    plane,
    latestValidRun: run.validity === 'valid' ? run : null,
    inventory: skipInventory ? null : inventory,
    compactRuns: compact,
    collectionLog,
    now,
  });
  return { plane, run, inventoryNote };
}

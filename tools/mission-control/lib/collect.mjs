/**
 * Scheduled evidence collection: probe -> (inventory, RUM reception, governed audience, business events) ->
 * assemble -> validate -> persist. Nothing is written unless the whole data plane validates, so the last
 * valid evidence survives any failure.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { confirmFailures, probeEstate } from './probe.mjs';
import { defaultInsightsSource, extractOperational, loadGoldSource } from './gold.mjs';
import { mergeInventory, refreshInventory } from './cloudflare-inventory.mjs';
import { fetchRumReception } from './rum-reception.mjs';
import { validateSecondaryRun } from './vantage.mjs';
import { assemblePlane, compactRun } from './plane.mjs';
import { expectedPropertyIds, validateDataPlane, validateLegacyDataPlane, validateRegistry } from './contracts.mjs';
import { LEGACY_PUBLISHED_FILES, PUBLISHED_FILES, loadEvidence, persistEvidence } from './evidence.mjs';

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

/**
 * Reads secondary vantage runs (vantage-*.json) and keeps only those that validate. A rejected secondary run is
 * reported, never trusted, and can never take down the primary evidence.
 */
export function loadSecondaryRuns(dir, { expectPropertyIds, primary }) {
  const accepted = [];
  const notes = [];
  if (!dir || !existsSync(dir)) return { runs: accepted, notes: dir ? [{ file: dir, accepted: false, reason: 'directory does not exist' }] : [] };
  for (const file of readdirSync(dir).filter(name => /^vantage-.*\.json$/.test(name)).sort()) {
    let run;
    try {
      run = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      notes.push({ file, accepted: false, reason: 'unreadable: ' + error.message });
      continue;
    }
    const errors = validateSecondaryRun(run, { expectPropertyIds, primary });
    // Two files claiming one vantage are one witness, not two.
    if (!errors.length && accepted.some(item => item.vantage === run.vantage)) errors.push('duplicate vantage id ' + run.vantage);
    if (errors.length) notes.push({ file, vantage: run?.vantage || null, accepted: false, reason: errors.slice(0, 3).join('; ') });
    else {
      accepted.push(run);
      notes.push({ file, vantage: run.vantage, accepted: true, reason: null });
    }
  }
  return { runs: accepted, notes };
}

export async function runCollection({ root, evidenceDir, secondaryDir = null, dryRun = false, deps, env = {}, runId, confirmDelayMs, skipInventory = false, log = () => {} }) {
  const config = loadConfig(root);
  const registryErrors = validateRegistry(config.registry);
  if (registryErrors.length) throw new CollectionError('Registry invalid', registryErrors);
  if (confirmDelayMs != null) config.registry.probeContract.confirmationDelayMs = confirmDelayMs;

  // Fail closed on unreadable/invalid existing evidence. Evidence published before GD-031 (the legacy five-file
  // set) is checked for readability and integrity, then superseded by the full data plane.
  const evidence = loadEvidence(evidenceDir);
  const present = PUBLISHED_FILES.filter(name => evidence.published[name]);
  const legacyPresent = LEGACY_PUBLISHED_FILES.filter(name => evidence.published[name]);
  // The only acceptable existing sets are the exact GD-030 legacy set (migration) or the complete GD-031 set.
  // Anything in between is a partially published or damaged plane and is never overwritten.
  const exactLegacy = present.length === LEGACY_PUBLISHED_FILES.length && legacyPresent.length === LEGACY_PUBLISHED_FILES.length;
  if (present.length && !exactLegacy && present.length !== PUBLISHED_FILES.length) {
    throw new CollectionError('Existing published evidence set is incomplete; refusing to overwrite', PUBLISHED_FILES.filter(name => !evidence.published[name]).map(name => 'missing ' + name));
  }
  if (present.length) {
    const existing = evidence.published;
    const plane = { history: existing['history.json'], estate: existing['estate-health.json'], diagnostics: existing['diagnostics.json'], summary: existing['mission-control-data.json'], probes: existing['probes.json'], audience: existing['audience.json'], events: existing['business-events.json'], executive: existing['executive.json'] };
    const isLegacy = !/^2\./.test(String(plane.estate?.schemaVersion));
    const existingErrors = isLegacy ? validateLegacyDataPlane(plane) : validateDataPlane(plane);
    if (existingErrors.length) throw new CollectionError('Existing published evidence is invalid; refusing to overwrite', existingErrors);
    if (isLegacy) log('migrating GD-030 evidence (estate schema ' + plane.estate.schemaVersion + ') to the GD-031 data plane; history is preserved');
  }

  let run = await probeEstate(config.registry, deps, { runId });
  run = await confirmFailures(config.registry, run, deps);

  const latestAttempt = { runId: run.runId, at: run.finishedAt, validity: run.validity };
  const latestValidRun = run.validity === 'valid' ? run : evidence.latestValidRun;
  const now = run.finishedAt;
  log('probe run ' + run.runId + ' validity=' + run.validity);

  const expectPropertyIds = expectedPropertyIds(config.registry);
  const secondary = loadSecondaryRuns(secondaryDir, { expectPropertyIds, primary: latestValidRun });
  for (const note of secondary.notes) log('secondary vantage ' + (note.vantage || note.file) + ': ' + (note.accepted ? 'accepted' : 'rejected (' + note.reason + ')'));
  // Secondary vantages corroborate only a run that is itself valid; a stale primary is never propped up by a fresh secondary.
  const secondaryRuns = run.validity === 'valid' ? secondary.runs : [];

  let inventory = evidence.inventory;
  let inventoryNote = 'skipped';
  if (!skipInventory) {
    const refreshed = await refreshInventory({ token: env.CLOUDFLARE_API_TOKEN, accountId: env.CLOUDFLARE_ACCOUNT_ID, fetchImpl: deps.fetchImpl, now: deps.now });
    if (refreshed.inventory) inventory = mergeInventory(evidence.inventory, refreshed.inventory);
    inventoryNote = refreshed.reason || 'refreshed';
  }

  const rumReception = skipInventory ? null : await fetchRumReception({ token: env.CLOUDFLARE_API_TOKEN, accountId: env.CLOUDFLARE_ACCOUNT_ID, fetchImpl: deps.fetchImpl, now: deps.now });
  if (rumReception) log('rum reception: ' + (rumReception.status === 'measured' ? 'measured for ' + Object.keys(rumReception.byHost).length + ' hosts' : rumReception.reason));

  const goldSource = env.GOLD_SOURCE || null;
  const gold = await loadGoldSource({ source: goldSource, token: env.GOLD_SOURCE_TOKEN, fetchImpl: deps.fetchImpl, readFile: deps.readFile, label: 'Canonical Gold' });
  const insightsSource = env.INSIGHTS_SOURCE || defaultInsightsSource(goldSource);
  const insights = await loadGoldSource({ source: insightsSource, token: env.INSIGHTS_SOURCE_TOKEN || env.GOLD_SOURCE_TOKEN, fetchImpl: deps.fetchImpl, readFile: deps.readFile, label: 'Traffic Insights' });
  const eventsFeed = await loadGoldSource({ source: env.EVENTS_SOURCE || null, token: env.EVENTS_SOURCE_TOKEN, fetchImpl: deps.fetchImpl, readFile: deps.readFile, label: 'Business-event feed' });
  log('audience source: ' + (gold.configured ? (gold.doc ? 'read' : gold.reason) : 'not configured') + '; events feed: ' + (eventsFeed.configured ? (eventsFeed.doc ? 'read' : eventsFeed.reason) : 'not configured'));

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
    secondaryRuns,
    latestAttempt,
    compactRuns: compact,
    previousDiagnostics: evidence.previousDiagnostics,
    operational,
    rumReception,
    goldInput: gold,
    insightsInput: insights,
    eventsInput: eventsFeed,
    now,
    scheduleSnapshot: true,
  });

  const errors = validateDataPlane(plane, { expectPropertyCount: config.registry.properties.length, expectPropertyIds });
  if (errors.length) throw new CollectionError('Assembled data plane failed validation; last valid evidence preserved', errors);

  const collectionLog = {
    entries: [
      ...evidence.collectionLog.entries,
      {
        runId: run.runId,
        at: now,
        validity: run.validity,
        snapshotAction: plane.snapshotAction,
        inventory: inventoryNote,
        gold: operational.evidenceState,
        audience: plane.audience.source.status,
        businessEvents: plane.events.source.status,
        rumReception: plane.estate.evidence.rumReception.status,
        vantages: [run.vantage, ...secondaryRuns.map(item => item.vantage)],
        secondary: secondary.notes.map(note => ({ vantage: note.vantage || null, accepted: note.accepted, reason: note.reason })),
      },
    ].slice(-100),
  };
  // A dry run assembles and validates everything (so production-only problems surface) but persists nothing.
  if (!dryRun) {
    persistEvidence(evidenceDir, {
      plane,
      latestValidRun: run.validity === 'valid' ? run : null,
      inventory: skipInventory ? null : inventory,
      compactRuns: compact,
      collectionLog,
      now,
    });
  }
  return { plane, run, inventoryNote, secondary };
}

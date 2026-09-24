/**
 * Evidence-store I/O. Reads fail closed: unreadable or invalid existing evidence aborts collection
 * instead of being overwritten, so a bad run can never corrupt accumulated history.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export class EvidenceCorruptError extends Error {}

export const PUBLISHED_FILES = ['history.json', 'estate-health.json', 'diagnostics.json', 'mission-control-data.json', 'probes.json'];
const PROBE_RUN_RETENTION_DAYS = 120;

export function readJsonStrict(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new EvidenceCorruptError('Cannot parse ' + path + ': ' + error.message);
  }
}

function optional(path) {
  return existsSync(path) ? readJsonStrict(path) : null;
}

export function loadEvidence(dir) {
  const latest = join(dir, 'latest');
  const state = join(dir, 'state');
  const runsDir = join(state, 'probe-runs');
  const compactRuns = [];
  if (existsSync(runsDir)) {
    for (const file of readdirSync(runsDir).filter(name => name.endsWith('.json')).sort()) {
      const doc = readJsonStrict(join(runsDir, file));
      if (!Array.isArray(doc.runs)) throw new EvidenceCorruptError('Malformed probe-run file ' + file);
      compactRuns.push(...doc.runs);
    }
  }
  return {
    history: optional(join(latest, 'history.json')),
    previousDiagnostics: optional(join(latest, 'diagnostics.json')),
    latestValidRun: optional(join(state, 'latest-valid-run.json')),
    inventory: optional(join(state, 'inventory.json')),
    collectionLog: optional(join(state, 'collection-log.json')) || { entries: [] },
    compactRuns,
  };
}

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp-' + process.pid;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

const pretty = value => JSON.stringify(value, null, 2) + '\n';

export function persistEvidence(dir, { plane, latestValidRun, inventory, compactRuns, collectionLog, now }) {
  // State first, published set last: a crash leaves the previous published evidence intact.
  const state = join(dir, 'state');
  if (latestValidRun) atomicWrite(join(state, 'latest-valid-run.json'), pretty(latestValidRun));
  if (inventory) atomicWrite(join(state, 'inventory.json'), pretty(inventory));
  atomicWrite(join(state, 'collection-log.json'), pretty(collectionLog));

  const byDate = new Map();
  const cutoff = Date.parse(now) - PROBE_RUN_RETENTION_DAYS * 86400000;
  for (const run of compactRuns) {
    if (Date.parse(run.finishedAt) < cutoff) continue;
    const date = run.finishedAt.slice(0, 10);
    byDate.set(date, [...(byDate.get(date) || []), run]);
  }
  const runsDir = join(state, 'probe-runs');
  if (existsSync(runsDir)) {
    for (const file of readdirSync(runsDir)) if (!byDate.has(file.replace(/\.json$/, ''))) rmSync(join(runsDir, file));
  }
  for (const [date, runs] of byDate) atomicWrite(join(runsDir, date + '.json'), pretty({ date, runs }));

  const latest = join(dir, 'latest');
  atomicWrite(join(latest, 'history.json'), pretty(plane.history));
  atomicWrite(join(latest, 'estate-health.json'), pretty(plane.estate));
  atomicWrite(join(latest, 'diagnostics.json'), pretty(plane.diagnostics));
  atomicWrite(join(latest, 'mission-control-data.json'), pretty(plane.summary));
  atomicWrite(join(latest, 'probes.json'), pretty(plane.probes));
}

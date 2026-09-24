/**
 * Assembles the full Mission Control data plane from evidence. Pure and deterministic:
 * the only clock is the `now` input.
 */
import { buildEstateHealth } from './estate.mjs';
import { buildDiagnostics } from './diagnostics.mjs';
import { buildScheduledSnapshot, initialHistory, pruneHistory, upsertSnapshot } from './ledger.mjs';

export function compactRun(run) {
  return {
    runId: run.runId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    validity: run.validity,
    vantage: run.vantage,
    properties: run.properties.map(item => ({
      propertyId: item.propertyId,
      observation: { state: item.observation.state, failureClass: item.observation.failureClass || null, confirmed: item.observation.confirmed ?? null },
      http: item.http ? { status: item.http.status ?? null, durationMs: item.http.durationMs ?? null } : null,
    })),
  };
}

function runCounts(run) {
  const count = state => run.properties.filter(item => item.observation.state === state).length;
  return { available: count('available'), unavailable: count('unavailable') };
}

function dayRollupFor(date, compactRuns) {
  const sameDay = compactRuns.filter(run => run.validity === 'valid' && run.finishedAt.slice(0, 10) === date);
  if (!sameDay.length) return null;
  const counts = sameDay.map(runCounts);
  return {
    runs: sameDay.length,
    worstAvailableZones: Math.min(...counts.map(item => item.available)),
    worstUnavailableZones: Math.max(...counts.map(item => item.unavailable)),
  };
}

function trafficSummary(history, staticSummary) {
  const measured = [...history.snapshots].reverse().find(snapshot => snapshot.globaldeetsOperational?.evidenceState === 'measured');
  if (!measured) {
    return {
      sourceSnapshotId: null,
      asOf: null,
      window: null,
      edgeRequests: null,
      edgeVisits: null,
      syntheticHealthVisits: null,
      syntheticHealthPath: staticSummary.globaldeetsTraffic?.syntheticHealthPath || null,
      audienceStatus: 'measurement-constrained',
      investorSafe: false,
      note: 'No comparable edge-traffic observation is retained. Nothing is inferred.',
    };
  }
  const op = measured.globaldeetsOperational;
  return {
    sourceSnapshotId: measured.snapshotId,
    asOf: measured.observedAt,
    window: op.observationWindow,
    edgeRequests: op.edgeRequests,
    edgeVisits: op.edgeVisits,
    syntheticHealthVisits: op.syntheticHealthVisits,
    syntheticHealthPath: staticSummary.globaldeetsTraffic?.syntheticHealthPath || null,
    audienceStatus: 'measurement-constrained',
    investorSafe: false,
    note: 'This is operational telemetry from the latest comparable edge snapshot, not a certified audience refresh.',
  };
}

export function assemblePlane({
  registry,
  manual,
  staticSummary,
  historySeed,
  history: existingHistory = null,
  inventory = null,
  latestValidRun = null,
  latestAttempt = null,
  compactRuns = [],
  previousDiagnostics = null,
  operational = null,
  now,
  scheduleSnapshot = false,
}) {
  let history = existingHistory || initialHistory(historySeed, now);
  const recentCutoff = Date.parse(now) - 7 * 86400000;
  const recentRuns = compactRuns.filter(run => Date.parse(run.finishedAt) >= recentCutoff);

  let estate = buildEstateHealth({ registry, inventory, probeRun: latestValidRun, latestAttempt, recentRuns, now });

  let snapshotAction = 'none';
  if (scheduleSnapshot) {
    const snapshot = buildScheduledSnapshot({
      estate,
      operational,
      observedAt: now,
      runId: latestAttempt?.runId || latestValidRun?.runId || 'unknown',
      dayRollup: dayRollupFor(now.slice(0, 10), compactRuns),
    });
    const result = upsertSnapshot(history, snapshot);
    history = pruneHistory(result.history, now);
    snapshotAction = result.action;
  }

  const diagnostics = buildDiagnostics({ estate, history, manual, previous: previousDiagnostics, latestAttempt, now });

  const missingRum = estate.properties.filter(item => item.observability.state === 'unobserved').map(item => item.propertyId);
  const summary = {
    missionControlId: staticSummary.missionControlId,
    snapshotVersion: history.snapshots.length ? history.snapshots[history.snapshots.length - 1].snapshotId : 'unseeded',
    generatedAt: now,
    investorClaimsPolicy: staticSummary.investorClaimsPolicy,
    dataPlane: staticSummary.dataPlane,
    estate: {
      activeZones: estate.summary.activeZones,
      rumObservedZones: estate.summary.rumObservedZones,
      rumCoveragePct: Math.round((estate.summary.rumObservedZones / estate.summary.activeZones) * 100),
      missingRumZones: missingRum,
      source: estate.evidence.inventory.source,
      inventoryAsOf: estate.evidence.inventory.asOf,
    },
    globaldeetsTraffic: trafficSummary(history, staticSummary),
    investmentThesis: staticSummary.investmentThesis,
  };

  const probes = {
    contractName: 'globaldeets-probes',
    schemaVersion: '1.0.0',
    generatedAt: now,
    note: 'Raw latest valid production probe run plus compact recent run summaries, for agents. Health is derived in estate-health.json under the explicit health contract.',
    latestAttempt,
    latest: latestValidRun,
    recentRuns: compactRuns.filter(run => Date.parse(run.finishedAt) >= Date.parse(now) - 28 * 86400000),
  };

  estate = { ...estate };
  return { history, estate, diagnostics, summary, probes, snapshotAction };
}

/**
 * Assembles the full Mission Control data plane from evidence. Pure and deterministic:
 * the only clock is the `now` input.
 *
 * Order matters: estate -> audience + business events -> history snapshot -> diagnostics (which score and
 * rank findings using all of them) -> executive summary and estate coverage matrix (both derive from all of the above).
 */
import { buildEstateHealth } from './estate.mjs';
import { buildDiagnostics } from './diagnostics.mjs';
import { buildAudience } from './audience.mjs';
import { buildBusinessEvents } from './events.mjs';
import { buildExecutive } from './executive.mjs';
import { buildCoverageMatrix } from './coverage-matrix.mjs';
import { buildScheduledSnapshot, HISTORY_SCHEMA_VERSION, INGESTION_SEAMS, initialHistory, pruneHistory, upsertSnapshot } from './ledger.mjs';

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

function compactSecondary(run) {
  return {
    vantage: run.vantage,
    network: run.network || null,
    runId: run.runId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    validity: run.validity,
    canaries: run.canaries,
    properties: run.properties.map(item => ({
      propertyId: item.propertyId,
      observation: { state: item.observation.state, blocked: Boolean(item.observation.blocked), failureClass: item.observation.failureClass || null, confirmed: item.observation.confirmed ?? null },
      http: item.http ? { status: item.http.status ?? null, durationMs: item.http.durationMs ?? null } : null,
      criticalPath: { state: item.criticalPath?.state || 'unknown' },
    })),
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
  secondaryRuns = [],
  latestAttempt = null,
  compactRuns = [],
  previousDiagnostics = null,
  operational = null,
  rumReception = null,
  goldInput = null,
  insightsInput = null,
  eventsInput = null,
  now,
  scheduleSnapshot = false,
}) {
  let history = existingHistory || initialHistory(historySeed, now);
  history = { ...history, schemaVersion: HISTORY_SCHEMA_VERSION, ingestionSeams: INGESTION_SEAMS };
  const recentCutoff = Date.parse(now) - 7 * 86400000;
  const recentRuns = compactRuns.filter(run => Date.parse(run.finishedAt) >= recentCutoff);

  const estate = buildEstateHealth({ registry, inventory, probeRun: latestValidRun, secondaryRuns, latestAttempt, recentRuns, rumReception, now });
  const audience = buildAudience({ registry, now, gold: goldInput, insights: insightsInput });
  const availabilityById = new Map(estate.properties.map(row => [row.propertyId, row.availability.freshness.state === 'expired' ? 'unknown' : row.availability.state]));
  const events = buildBusinessEvents({ registry, now, feed: eventsInput, availabilityById });

  let snapshotAction = 'none';
  if (scheduleSnapshot) {
    const snapshot = buildScheduledSnapshot({
      estate,
      operational,
      audience,
      events,
      observedAt: now,
      runId: latestAttempt?.runId || latestValidRun?.runId || 'unknown',
      dayRollup: dayRollupFor(now.slice(0, 10), compactRuns),
    });
    const result = upsertSnapshot(history, snapshot);
    history = pruneHistory(result.history, now);
    snapshotAction = result.action;
  }

  const diagnostics = buildDiagnostics({ estate, history, manual, previous: previousDiagnostics, latestAttempt, audience, events, now });
  const executive = buildExecutive({ registry, estate, audience, events, diagnostics, history, now });
  const coverage = buildCoverageMatrix({ registry, estate, audience, events, diagnostics, now });

  const missingRum = estate.properties.filter(item => item.observability.rum !== 'on').map(item => item.propertyId);
  const summary = {
    missionControlId: staticSummary.missionControlId,
    snapshotVersion: history.snapshots.length ? history.snapshots[history.snapshots.length - 1].snapshotId : 'unseeded',
    generatedAt: now,
    investorClaimsPolicy: staticSummary.investorClaimsPolicy,
    dataPlane: staticSummary.dataPlane,
    estate: {
      activeZones: estate.summary.activeZones,
      // The Cloudflare RUM flag is a carried-forward SETTING. It is not evidence that telemetry is collected.
      rumSettingOnZones: estate.summary.rumObservedZones,
      rumSettingCoveragePct: Math.round((estate.summary.rumObservedZones / estate.summary.activeZones) * 100),
      rumSettingOffZones: missingRum,
      instrumentation: estate.summary.instrumentation,
      source: estate.evidence.inventory.source,
      inventoryAsOf: estate.evidence.inventory.asOf,
    },
    audience: { status: audience.source.status, propertiesMeasured: audience.estate.propertiesMeasured, edgeRequests28d: audience.estate.requests[28].value, observedAt: audience.source.observedAt },
    businessEvents: { status: events.source.status, instrumented: events.coverage.instrumented },
    globaldeetsTraffic: trafficSummary(history, staticSummary),
    investmentThesis: staticSummary.investmentThesis,
  };

  const probes = {
    contractName: 'globaldeets-probes',
    schemaVersion: '1.1.0',
    generatedAt: now,
    note: 'Raw latest valid production probe run plus compact recent run summaries and secondary vantage observations, for agents. Health is derived in estate-health.json under the explicit health contract.',
    latestAttempt,
    latest: latestValidRun,
    secondaryVantages: secondaryRuns.map(compactSecondary),
    recentRuns: compactRuns.filter(run => Date.parse(run.finishedAt) >= Date.parse(now) - 28 * 86400000),
  };

  return { history, estate, diagnostics, summary, probes, audience, events, executive, coverage, snapshotAction };
}

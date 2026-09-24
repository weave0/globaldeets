/**
 * Historical snapshot ledger (GD-030).
 *
 * The ledger accumulates dated snapshots. It is append/upsert-only for scheduled snapshots, never
 * touches seeded snapshots, never converts missing evidence to zero, and is idempotent: replaying the
 * same observation yields byte-identical history, and an older observation can never overwrite a newer one.
 */
export const HISTORY_CONTRACT_NAME = 'globaldeets-mission-control-history';
export const HISTORY_SCHEMA_VERSION = '1.1.0';
export const SNAPSHOT_RETENTION_DAYS = 400;

export const INGESTION_SEAMS = Object.freeze([
  {
    seam: 'certified-audience',
    accepts: ['GA4', 'Cloudflare Web Analytics/RUM', 'first-party browser telemetry'],
    requiredFields: ['observedAt', 'window', 'metric', 'value', 'unit', 'evidenceState', 'certified', 'classification', 'source', 'limitations'],
    status: 'awaiting-certified-source',
    note: 'No source is connected. Nothing may populate certifiedAudience unless it carries provenance and explicit bot/monitor/API/asset/probe exclusions.',
  },
  {
    seam: 'operational-edge',
    accepts: ['Cloudflare zone analytics', 'GFD Canonical Gold 1.2'],
    requiredFields: ['observedAt', 'window', 'metric', 'value', 'unit', 'evidenceState', 'source', 'comparabilityKey'],
    status: 'supported-awaiting-governed-source',
    note: 'Consumed from Canonical Gold 1.2 via registry goldBindings when a non-fixture source is configured; fixtures are rejected.',
  },
  {
    seam: 'estate-availability',
    accepts: ['production probes'],
    requiredFields: ['observedAt', 'propertyId', 'signal', 'state', 'source'],
    status: 'live-scheduled',
    note: 'Scheduled GitHub Actions collector probes all active zones and stores dated evidence on the mission-control-evidence branch.',
  },
  {
    seam: 'business-events',
    accepts: ['first-party event telemetry', 'GA4 events'],
    requiredFields: ['observedAt', 'window', 'eventType', 'value', 'unit', 'evidenceState', 'attribution', 'source'],
    status: 'awaiting-taxonomy',
    note: 'No taxonomy or source is connected. No funnel or conversion figure may be fabricated.',
  },
]);

export function initialHistory(seed, now) {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    contractName: HISTORY_CONTRACT_NAME,
    generatedAt: seed?.generatedAt || now,
    supportedWindowsDays: [7, 28, 90],
    policy: {
      missingSnapshotIsZero: false,
      certifiedAudienceMayUseOperationalTelemetry: false,
      chartMustExposeEvidenceState: true,
      trendsRequireComparableDefinitions: true,
      staleCarriedForwardIsMeasured: false,
    },
    snapshots: (seed?.snapshots || []).map(snapshot => structuredClone(snapshot)),
    ingestionSeams: INGESTION_SEAMS,
  };
}

function pct(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

/** Builds one dated scheduled snapshot from the built estate contract and optional operational evidence. */
export function buildScheduledSnapshot({ estate, operational, observedAt, runId, dayRollup }) {
  const summary = estate.summary;
  const inventory = estate.evidence.inventory;
  const probe = estate.evidence.probe;
  // RUM coverage is only a fresh measurement when the RUM facet itself was read in a fresh refresh.
  const inventoryCurrent = inventory.facets?.rum === true && inventory.freshness.state === 'fresh';
  const conclusive = summary.availableZones + summary.degradedZones + summary.unavailableZones;
  const probeUsable = probe.validity === 'valid' && probe.freshness.state !== 'expired';
  const date = observedAt.slice(0, 10);

  return {
    snapshotId: date + '.scheduled',
    observedAt,
    collector: { kind: 'scheduled', runId },
    estate: {
      activeZones: summary.activeZones,
      rumObservedZones: summary.rumObservedZones,
      rumCoveragePct: pct(summary.rumObservedZones, summary.activeZones),
      // Carried-forward inventory is labelled as such and is never plotted as a fresh measurement.
      evidenceState: inventoryCurrent ? 'measured' : 'carried-forward',
      inventoryObservedAt: inventory.asOf,
      comparabilityKey: 'estate-rum|v1',
    },
    availability: probeUsable
      ? {
          evidenceState: 'measured',
          probeRunId: probe.runId,
          probeObservedAt: probe.observedAt,
          comparabilityKey: 'estate-availability|v1|properties=' + estate.propertyCount,
          propertyCount: estate.propertyCount,
          conclusiveServiceZones: conclusive,
          availableZones: summary.availableZones,
          degradedZones: summary.degradedZones,
          unavailableZones: summary.unavailableZones,
          noServiceZones: summary.noServiceZones,
          blockedZones: summary.probeBlockedZones,
          unknownZones: estate.propertyCount - summary.availabilityKnownZones - summary.probeBlockedZones,
          verifiedHealthyZones: summary.verifiedHealthyZones,
          availableRatioPct: pct(summary.availableZones, conclusive),
          dayRollup: dayRollup || null,
        }
      : {
          evidenceState: 'unavailable',
          probeRunId: probe.runId,
          probeObservedAt: probe.observedAt,
          comparabilityKey: 'estate-availability|v1|properties=' + estate.propertyCount,
          reason: probe.validity === 'none' ? 'No valid probe run exists.' : 'Latest valid probe run is ' + probe.freshness.state + '.',
        },
    globaldeetsOperational:
      operational ||
      {
        observationWindow: null,
        edgeRequests: null,
        edgeVisits: null,
        syntheticHealthVisits: null,
        residualUnclassifiedVisits: null,
        evidenceState: 'unavailable',
        investorSafe: false,
        reason: 'No governed Canonical Gold source is configured for a non-fixture GlobalDeets edge observation.',
      },
    certifiedAudience: {
      evidenceState: 'unavailable',
      value: null,
      unit: null,
      certified: false,
      reason: 'No certified audience source is connected; edge and probe traffic are not human audience.',
    },
    businessEvents: {
      evidenceState: 'unavailable',
      reason: 'No business-event taxonomy or source is connected.',
    },
  };
}

/**
 * Upserts a scheduled snapshot. Returns { history, action }.
 * action: inserted | updated | unchanged | rejected-older
 */
export function upsertSnapshot(history, snapshot) {
  const existingIndex = history.snapshots.findIndex(item => item.snapshotId === snapshot.snapshotId);
  const next = structuredClone(history);
  if (existingIndex === -1) {
    next.snapshots.push(snapshot);
    next.snapshots.sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.snapshotId.localeCompare(b.snapshotId));
    next.generatedAt = maxObservedAt(next.snapshots);
    return { history: next, action: 'inserted' };
  }
  const existing = history.snapshots[existingIndex];
  if (existing.collector?.kind !== 'scheduled') {
    // Seeded/manual snapshots are immutable evidence.
    return { history, action: 'unchanged' };
  }
  if (snapshot.observedAt < existing.observedAt) return { history, action: 'rejected-older' };
  if (JSON.stringify(existing) === JSON.stringify(snapshot)) return { history, action: 'unchanged' };
  next.snapshots[existingIndex] = snapshot;
  next.snapshots.sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.snapshotId.localeCompare(b.snapshotId));
  next.generatedAt = maxObservedAt(next.snapshots);
  return { history: next, action: 'updated' };
}

function maxObservedAt(snapshots) {
  return snapshots.reduce((max, item) => (item.observedAt > max ? item.observedAt : max), snapshots[0]?.observedAt || '');
}

export function pruneHistory(history, now) {
  const cutoff = Date.parse(now) - SNAPSHOT_RETENTION_DAYS * 86400000;
  const kept = history.snapshots.filter(item => item.collector?.kind !== 'scheduled' || Date.parse(item.observedAt) >= cutoff);
  return kept.length === history.snapshots.length ? history : { ...history, snapshots: kept };
}

/** Structural validation. Returns a list of error strings (empty when valid). */
export function validateHistory(history) {
  const errors = [];
  if (history?.contractName !== HISTORY_CONTRACT_NAME) errors.push('history: contractName');
  if (!Array.isArray(history?.snapshots)) return [...errors, 'history: snapshots must be an array'];
  if (!Array.isArray(history.supportedWindowsDays) || history.supportedWindowsDays.join() !== '7,28,90') errors.push('history: supportedWindowsDays');
  if (history.policy?.missingSnapshotIsZero !== false) errors.push('history: policy.missingSnapshotIsZero');
  if (history.policy?.certifiedAudienceMayUseOperationalTelemetry !== false) errors.push('history: policy.certifiedAudienceMayUseOperationalTelemetry');
  const ids = new Set();
  let previous = '';
  for (const snapshot of history.snapshots) {
    if (!snapshot.snapshotId || ids.has(snapshot.snapshotId)) errors.push('history: duplicate or missing snapshotId ' + snapshot.snapshotId);
    ids.add(snapshot.snapshotId);
    if (!Number.isFinite(Date.parse(snapshot.observedAt))) errors.push('history: invalid observedAt ' + snapshot.snapshotId);
    if (snapshot.observedAt < previous) errors.push('history: snapshots out of order at ' + snapshot.snapshotId);
    previous = snapshot.observedAt;
    for (const [section, valueKey] of [['globaldeetsOperational', 'edgeRequests'], ['certifiedAudience', 'value']]) {
      const part = snapshot[section];
      if (!part) continue;
      if (!['measured', 'partial'].includes(part.evidenceState) && part[valueKey] != null) errors.push('history: ' + snapshot.snapshotId + '.' + section + ' has a value without measured evidence');
      if (['measured', 'partial'].includes(part.evidenceState) && typeof part[valueKey] !== 'number') errors.push('history: ' + snapshot.snapshotId + '.' + section + ' measured but non-numeric');
    }
    if (snapshot.certifiedAudience?.evidenceState === 'measured' && snapshot.certifiedAudience.certified !== true) errors.push('history: ' + snapshot.snapshotId + ' certifiedAudience measured without certification');
    if (snapshot.globaldeetsOperational?.investorSafe === true) errors.push('history: ' + snapshot.snapshotId + ' operational telemetry marked investorSafe');
    const availability = snapshot.availability;
    if (availability?.evidenceState === 'measured') {
      for (const key of ['availableZones', 'degradedZones', 'unavailableZones', 'noServiceZones', 'blockedZones', 'unknownZones']) {
        if (!Number.isInteger(availability[key]) || availability[key] < 0) errors.push('history: ' + snapshot.snapshotId + '.availability.' + key);
      }
      const total = availability.availableZones + availability.degradedZones + availability.unavailableZones + availability.noServiceZones + availability.blockedZones + availability.unknownZones;
      if (total !== availability.propertyCount) errors.push('history: ' + snapshot.snapshotId + '.availability zone states do not sum to propertyCount');
    }
  }
  return errors;
}

/**
 * Builds the estate-health contract from the registry, refreshed inventory facts, and probe evidence.
 * Pure: identical inputs always yield byte-identical output (generatedAt is an input, never the clock).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

export const ESTATE_CONTRACT_NAME = 'globaldeets-estate-health';
export const ESTATE_SCHEMA_VERSION = '1.1.0';

export const HEALTH_CONTRACT = Object.freeze({
  version: '1.0.0',
  states: semantics.HEALTH_STATES,
  rules: Object.freeze([
    'verified-healthy requires FRESH conclusive availability AND an authoritative critical-path pass.',
    'HTTP 2xx alone yields reachable-unverified, never verified-healthy.',
    'A successful deploy is not availability evidence.',
    'A blocked probe (edge challenge, 401/403, 429) is insufficient evidence, not an outage.',
    'A zone that publishes no web address and declares no service is no-service-published, not an outage.',
    'Provider topology (Pages, Workers, external hosts) never by itself makes a property unhealthy.',
    'Baseline (non-authoritative) contract mismatches are contract-drift for review, never outages.',
    'Expired evidence is presented as unknown; a confirmed outage keeps its alarm while it ages.',
    'A probe run whose independent canaries were unreachable is invalid and yields unknown for every property.',
  ]),
});

const RECENT_WINDOW_DAYS = 7;

/** Merges refreshed Cloudflare inventory facts (if any) over the registry's carried-forward facts. */
export function applyInventory(registry, inventory) {
  // The inventory is as old as its OLDEST refreshed facet; carried-forward facets are as old as the registry read.
  const facetTimes = [inventory?.zones ? inventory.zonesObservedAt || inventory.observedAt : null, inventory?.pagesProjects ? inventory.pagesObservedAt || inventory.observedAt : null].filter(Boolean).sort();
  const inventoryMeta = {
    asOf: facetTimes[0] || registry.inventory.asOf,
    baselineAsOf: registry.inventory.asOf,
    source: inventory?.source || registry.inventory.source,
    refreshed: Boolean(inventory?.observedAt),
    // Facets actually read from Cloudflare in the latest refresh. RUM settings are not read by the collector yet,
    // so RUM coverage is always a carried-forward fact and is never labelled a fresh measurement.
    facets: {
      zones: inventory?.zones ? inventory.zonesObservedAt || inventory.observedAt : null,
      pages: inventory?.pagesProjects ? inventory.pagesObservedAt || inventory.observedAt : null,
      rum: null,
    },
  };
  if (!inventory) return { properties: registry.properties, inventoryMeta };

  const zoneStatus = new Map((inventory.zones || []).map(zone => [zone.name, zone.status]));
  const domainProject = new Map();
  for (const project of inventory.pagesProjects || []) {
    for (const domain of project.domains || []) {
      const current = domainProject.get(domain.name);
      if (!current || domain.status === 'active') domainProject.set(domain.name, { project, status: domain.status });
    }
  }
  const projectUse = new Map();
  for (const entry of domainProject.values()) projectUse.set(entry.project.name, (projectUse.get(entry.project.name) || 0) + 1);

  const properties = registry.properties.map(property => {
    const next = { ...property, zone: { ...property.zone } };
    if (inventory.zones && zoneStatus.has(property.propertyId)) next.zone.status = zoneStatus.get(property.propertyId);
    else if (inventory.zones) next.zone.status = 'not-listed';
    const mapped = domainProject.get(property.propertyId);
    if (inventory.pagesProjects && mapped) {
      const active = mapped.status === 'active';
      next.deployment = {
        provider: 'cloudflare-pages',
        project: mapped.project.name,
        servingDomainState: active ? 'observed' : 'no_active_domain',
        sharedProject: (projectUse.get(mapped.project.name) || 0) > 1,
        latestProductionDeployAt: active ? mapped.project.latestProductionDeployAt || null : null,
        evidenceState: 'measured',
        note: active ? null : 'Pages project exists, but mapped custom domains are deactivated; deploy freshness is not treated as serving freshness.',
      };
      next.lastMeaningfulActivity = active && mapped.project.latestProductionDeployAt
        ? { at: mapped.project.latestProductionDeployAt, kind: 'production-deploy', evidenceState: 'measured' }
        : property.lastMeaningfulActivity;
    }
    return next;
  });
  return { properties, inventoryMeta };
}

function recentStats(propertyId, recentRuns) {
  let conclusive = 0;
  let available = 0;
  let runs = 0;
  for (const run of recentRuns) {
    if (run.validity !== 'valid') continue;
    const item = run.properties.find(entry => entry.propertyId === propertyId);
    if (!item) continue;
    runs += 1;
    const state = item.observation.state;
    if (['available', 'degraded', 'unavailable'].includes(state)) {
      conclusive += 1;
      if (state === 'available') available += 1;
    }
  }
  return {
    windowDays: RECENT_WINDOW_DAYS,
    runs,
    conclusiveRuns: conclusive,
    availableRuns: available,
    availabilityRatio: conclusive ? Math.round((available / conclusive) * 1000) / 1000 : null,
  };
}

function availabilityFor(property, observation, probeObservedAt, freshness) {
  if (!observation || !probeObservedAt) {
    return {
      state: 'unknown',
      evidenceState: 'unavailable',
      blocked: false,
      observedAt: null,
      confidence: null,
      failureClass: null,
      reason: 'No probe run has been collected for this property yet.',
      nextAction: 'Run scheduled evidence collection; unknown is preserved until a valid probe observation exists.',
      freshness,
    };
  }
  let state = observation.state;
  let confidence = null;
  if (state === 'unavailable') {
    const confirmed = observation.confirmed === true;
    confidence = confirmed ? 'confirmed' : 'single-observation';
    // An unconfirmed failure is never declared an outage.
    if (!confirmed) state = 'degraded';
  } else if (['available', 'degraded', 'no-service-published'].includes(state)) {
    confidence = 'confirmed';
  }
  if (observation.failureClass === 'vantage-failure') confidence = null;
  const measured = observation.failureClass !== 'vantage-failure';
  return {
    state,
    evidenceState: measured ? 'measured' : 'unavailable',
    blocked: Boolean(observation.blocked),
    observedAt: probeObservedAt,
    confidence,
    failureClass: observation.failureClass || null,
    reason: observation.reason,
    nextAction: observation.nextAction || null,
    freshness,
  };
}

/**
 * @param {object} input registry, inventory, probeRun (latest VALID run), latestAttempt, recentRuns, now (ISO string)
 */
export function buildEstateHealth({ registry, inventory = null, probeRun = null, latestAttempt = null, recentRuns = [], now }) {
  const { properties: baseProperties, inventoryMeta } = applyInventory(registry, inventory);
  const policy = semantics.FRESHNESS_POLICY;
  const probeObservedAt = probeRun ? probeRun.finishedAt || probeRun.startedAt : null;
  const probeFreshness = probeObservedAt
    ? semantics.evaluateFreshness(probeObservedAt, policy.probe, now)
    : { state: 'unknown', ageHours: null, freshUntil: null, expiresAt: null };
  const inventoryFreshness = semantics.evaluateFreshness(inventoryMeta.asOf, policy.inventory, now);

  const rows = baseProperties.map(property => {
    const observation = probeRun ? probeRun.properties.find(item => item.propertyId === property.propertyId) : null;
    const availability = availabilityFor(property, observation?.observation, probeObservedAt, probeFreshness);
    const probeDetail = observation
      ? {
          dns: observation.dns ? { state: observation.dns.state, addresses: observation.dns.addresses, errorCode: observation.dns.errorCode } : null,
          http: observation.http
            ? {
                state: observation.http.state,
                status: observation.http.status ?? null,
                finalUrl: observation.http.finalUrl ?? null,
                redirects: observation.http.redirects?.length ?? 0,
                durationMs: observation.http.durationMs ?? null,
                attempts: observation.http.attempts ?? 0,
              }
            : null,
          tls: observation.tls || null,
        }
      : null;
    if (probeDetail) availability.evidence = probeDetail;
    availability.recent = recentStats(property.propertyId, recentRuns);

    const cp = observation?.criticalPath;
    const criticalPath = cp && probeObservedAt
      ? {
          state: cp.state,
          evidenceState: cp.state === 'unknown' ? 'unavailable' : 'measured',
          level: cp.level,
          basis: cp.basis,
          observedAt: probeObservedAt,
          checks: cp.checks,
          reason: cp.reason,
          freshness: probeFreshness,
        }
      : {
          state: 'unknown',
          evidenceState: 'unavailable',
          level: null,
          basis: null,
          observedAt: null,
          checks: [],
          reason: property.probe.criticalPath
            ? 'Critical-path contract is defined but no valid probe observation exists yet.'
            : property.probe.criticalPathReason || 'No honest critical-path contract exists for this property yet; only availability is probed.',
          freshness: probeFreshness,
        };
    // The registered contract is reported even before any probe evaluates it, so agents and copy never
    // confuse "no contract" with "contract not yet evaluated".
    criticalPath.contract = property.probe.criticalPath
      ? { level: property.probe.criticalPath.level, checkCount: property.probe.criticalPath.checks.length, basis: property.probe.criticalPath.basis }
      : null;
    const health = semantics.classifyHealth({ availability, criticalPath, freshness: probeFreshness });
    const rumOn = property.rum === 'on';
    return {
      propertyId: property.propertyId,
      displayName: property.displayName,
      emphasisRank: property.emphasisRank,
      investorCritical: Boolean(property.investorCritical),
      zone: { status: property.zone.status, evidenceState: 'measured', source: 'Cloudflare zone inventory' },
      observability: {
        state: rumOn ? 'observed' : 'unobserved',
        rum: property.rum,
        evidenceState: 'measured',
        source: 'Cloudflare zone RUM setting',
      },
      availability,
      criticalPath,
      deployment: property.deployment,
      lastMeaningfulActivity: property.lastMeaningfulActivity,
      probeExpectation: { expectation: property.probe.expectation, basis: property.probe.expectationBasis },
      diagnosticState: health,
      evidenceAsOf: probeObservedAt || inventoryMeta.asOf,
    };
  });

  const count = predicate => rows.filter(predicate).length;
  const summary = {
    activeZones: count(row => row.zone.status === 'active'),
    rumObservedZones: count(row => row.observability.state === 'observed'),
    rumUnobservedZones: count(row => row.observability.state === 'unobserved'),
    availabilityKnownZones: count(row => ['available', 'degraded', 'unavailable', 'no-service-published'].includes(row.availability.state) && row.availability.freshness.state !== 'expired' && row.availability.evidenceState === 'measured' && !row.availability.blocked),
    availableZones: count(row => row.availability.state === 'available' && row.availability.freshness.state !== 'expired'),
    degradedZones: count(row => row.availability.state === 'degraded' && row.availability.freshness.state !== 'expired'),
    unavailableZones: count(row => row.availability.state === 'unavailable' && row.availability.freshness.state !== 'expired'),
    noServiceZones: count(row => row.availability.state === 'no-service-published'),
    probeBlockedZones: count(row => row.availability.blocked),
    criticalPathKnownZones: count(row => ['pass', 'fail', 'drift'].includes(row.criticalPath.state) && row.criticalPath.freshness.state !== 'expired'),
    criticalPathContractZones: baseProperties.filter(property => property.probe.criticalPath).length,
    verifiedHealthyZones: count(row => row.diagnosticState === 'verified-healthy'),
    pagesMappedActiveZones: count(row => row.deployment.servingDomainState === 'observed'),
  };

  return {
    schemaVersion: ESTATE_SCHEMA_VERSION,
    contractName: ESTATE_CONTRACT_NAME,
    generatedAt: now,
    propertyCount: rows.length,
    policy: {
      unknownIsHealthy: false,
      missingIsZero: false,
      deploySuccessEqualsAvailability: false,
      zoneEqualsIndependentAudience: false,
      httpReachabilityEqualsHealth: false,
      providerTopologyIsUnhealthy: false,
      expiredEvidenceIsCurrent: false,
    },
    healthContract: HEALTH_CONTRACT,
    freshnessPolicy: policy,
    evidence: {
      probe: probeRun
        ? {
            runId: probeRun.runId,
            observedAt: probeObservedAt,
            validity: probeRun.validity,
            vantage: probeRun.vantage,
            vantageCount: probeRun.vantageCount,
            canaries: probeRun.canaries,
            syntheticTraffic: probeRun.syntheticTraffic,
            freshness: probeFreshness,
            latestAttempt,
          }
        : { runId: null, observedAt: null, validity: 'none', vantage: null, vantageCount: 0, canaries: [], syntheticTraffic: null, freshness: probeFreshness, latestAttempt },
      inventory: { ...inventoryMeta, freshness: inventoryFreshness },
    },
    summary,
    sourceNotes: [
      'Zone, RUM, and Pages facts come from the Cloudflare account inventory; they are refreshed by the collector when the token permits and otherwise carried forward and labelled by age.',
      'Availability and critical-path state come only from scheduled production probes; a successful deploy is not treated as uptime.',
      'Probe traffic is synthetic monitor traffic (see evidence.probe.syntheticTraffic) and must be excluded from audience classification.',
      'Properties without an honest critical-path contract keep criticalPath: unknown.',
    ],
    properties: rows,
  };
}

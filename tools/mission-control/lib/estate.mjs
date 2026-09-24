/**
 * Builds the estate-health contract from the registry, refreshed inventory facts, and probe evidence.
 * Pure: identical inputs always yield byte-identical output (generatedAt is an input, never the clock).
 *
 * GD-031 additions: property purpose/lifecycle profile with expectation-vs-observed, live instrumentation
 * truth, multi-vantage reconciliation, critical-path maturity, and infrastructure discovery from the
 * Pages inventory.
 */
import { createRequire } from 'node:module';
import { classifyInstrumentation, summarizeInstrumentation } from './instrumentation.mjs';
import { receptionFor } from './rum-reception.mjs';
import { reconcileVantages } from './vantage.mjs';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

export const ESTATE_CONTRACT_NAME = 'globaldeets-estate-health';
export const ESTATE_SCHEMA_VERSION = '2.0.0';

export const HEALTH_CONTRACT = Object.freeze({
  version: '1.1.0',
  states: semantics.HEALTH_STATES,
  rules: Object.freeze([
    'verified-healthy requires FRESH conclusive availability AND an authoritative critical-path pass.',
    'HTTP 2xx alone yields reachable-unverified, never verified-healthy.',
    'A successful deploy is not availability evidence.',
    'A blocked probe (edge challenge, 401/403, 429) is insufficient evidence, not an outage.',
    'A blocked vantage is set aside when another vantage is conclusive; the blocked vantage stays visible as evidence.',
    'Vantages that conclusively disagree yield vantage-conflict; neither answer is silently chosen.',
    'A zone that publishes no web address and declares no service is no-service-published, not an outage.',
    'A declared-inactive or unknown-intent property that publishes nothing is never an outage.',
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
    // Facets actually read from Cloudflare in the latest refresh. RUM settings are not read by the collector,
    // so the RUM flag is always a carried-forward setting and is never labelled a fresh measurement.
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

/**
 * Infrastructure discovery from the Pages inventory: custom-domain surfaces outside the governed registry and
 * projects that consume the platform without any custom domain. Facts only; findings are derived elsewhere.
 */
export function buildInfrastructure(registry, inventory) {
  if (!inventory?.pagesProjects) {
    return { evidenceState: 'unavailable', reason: 'The Pages inventory was not refreshed, so surfaces and projects cannot be reconciled.', observedAt: null, projectCount: null, unregisteredSurfaces: [], orphanProjects: [] };
  }
  const known = new Set(registry.properties.flatMap(property => [property.propertyId, 'www.' + property.propertyId]));
  for (const surface of registry.knownSurfaces || []) known.add(surface.hostname);
  const zones = new Set(registry.properties.map(property => property.propertyId));
  const surfaces = [];
  const orphanProjects = [];
  for (const project of inventory.pagesProjects) {
    const domains = project.domains || [];
    if (!domains.length) {
      orphanProjects.push({ project: project.name, latestProductionDeployAt: project.latestProductionDeployAt || null });
      continue;
    }
    for (const domain of domains) {
      if (known.has(domain.name)) continue;
      const parent = [...zones].find(zone => domain.name.endsWith('.' + zone)) || null;
      surfaces.push({ hostname: domain.name, project: project.name, status: domain.status, parentProperty: parent, registered: false, latestProductionDeployAt: project.latestProductionDeployAt || null });
    }
  }
  surfaces.sort((a, b) => a.hostname.localeCompare(b.hostname));
  orphanProjects.sort((a, b) => a.project.localeCompare(b.project));
  return {
    evidenceState: 'measured',
    reason: null,
    observedAt: inventory.pagesObservedAt || inventory.observedAt,
    projectCount: inventory.pagesProjects.length,
    unregisteredSurfaces: surfaces,
    orphanProjects,
  };
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

const NOT_SERVING_LIFECYCLES = ['intentionally-unpublished', 'dormant', 'deprecated'];

/**
 * Compares what the owner declared (lifecycle / expected state) with what production shows. The result never
 * changes health; it decides whether a state is EXPECTED, so an intentionally inactive property is not an outage.
 */
export function evaluateExpectation(profile, availability) {
  const lifecycle = profile?.lifecycle || 'unknown';
  const declaredNotLive = profile?.expectedState === 'not-live';
  const freshAvailability = availability.freshness?.state !== 'expired' ? availability.state : 'unknown';
  const serving = ['available', 'degraded'].includes(freshAvailability);
  const nothing = freshAvailability === 'no-service-published';
  let met = null;
  let kind = 'no-declaration';
  let note = 'The owner has not declared an expected state for this property.';
  if (declaredNotLive && serving) {
    met = false;
    kind = 'serving-but-declared-not-live';
    note = 'The owner registry says this property is not live, but production serves public content.';
  } else if (declaredNotLive && nothing) {
    met = true;
    kind = 'expected-inactive';
    note = 'Declared not live and publishing nothing, as expected.';
  } else if (NOT_SERVING_LIFECYCLES.includes(lifecycle) && nothing) {
    met = true;
    kind = 'expected-inactive';
    note = 'Declared ' + lifecycle.replace(/-/g, ' ') + ' and publishing nothing, as expected.';
  } else if (NOT_SERVING_LIFECYCLES.includes(lifecycle) && serving) {
    met = false;
    kind = 'serving-but-declared-inactive';
    note = 'Declared ' + lifecycle.replace(/-/g, ' ') + ', but production serves public content.';
  } else if (lifecycle === 'active' && nothing) {
    met = false;
    kind = 'declared-active-but-nothing-published';
    note = 'Declared active, but no web service is published.';
  } else if (lifecycle === 'active' && serving) {
    met = true;
    kind = 'active-and-serving';
    note = 'Declared active and serving.';
  } else if (lifecycle === 'incubating' && serving) {
    met = null;
    kind = 'incubating-and-serving';
    note = 'Incubating and already serving public content.';
  } else if (lifecycle === 'alias') {
    met = null;
    kind = 'alias';
    note = 'An additional address for ' + (profile.aliasOf || 'another property') + '.';
  } else if (nothing) {
    kind = 'nothing-published-intent-unknown';
    note = 'Nothing is published and the owner has not said whether that is intended.';
  }
  return { lifecycle, expectedState: profile?.expectedState || 'unknown', observedMode: serving ? 'serving' : nothing ? 'nothing-published' : freshAvailability === 'unavailable' ? 'not-responding' : 'unknown', met, kind, note };
}

/** Human-facing operating status. One implementation, shared with the browser, so the page never disagrees. */
export const operatingStatusFor = semantics.operatingStatusFor;

function hostOf(property) {
  return new URL(property.probe.origin).hostname;
}

/**
 * @param {object} input registry, inventory, probeRun (latest VALID primary run), secondaryRuns (validated),
 *                       latestAttempt, recentRuns, rumReception, now (ISO string)
 */
export function buildEstateHealth({ registry, inventory = null, probeRun = null, secondaryRuns = [], latestAttempt = null, recentRuns = [], rumReception = null, now }) {
  const { properties: baseProperties, inventoryMeta } = applyInventory(registry, inventory);
  const policy = semantics.FRESHNESS_POLICY;
  const probeObservedAt = probeRun ? probeRun.finishedAt || probeRun.startedAt : null;
  const probeFreshness = probeObservedAt
    ? semantics.evaluateFreshness(probeObservedAt, policy.probe, now)
    : { state: 'unknown', ageHours: null, freshUntil: null, expiresAt: null };
  const inventoryFreshness = semantics.evaluateFreshness(inventoryMeta.asOf, policy.inventory, now);
  const runs = probeRun ? [probeRun, ...secondaryRuns] : [];
  const runFreshness = run => semantics.evaluateFreshness(run.finishedAt || run.startedAt, policy.probe, now);

  const rows = baseProperties.map(property => {
    const entries = runs.map(run => ({ run, record: run.properties.find(item => item.propertyId === property.propertyId) || null }));
    const reconciled = entries.length ? reconcileVantages(entries) : null;
    const authoritative = reconciled ? entries[reconciled.authoritativeIndex] : null;
    const observation = authoritative?.record || null;
    const observedAt = authoritative ? authoritative.run.finishedAt || authoritative.run.startedAt : null;
    const rowFreshness = authoritative ? runFreshness(authoritative.run) : probeFreshness;

    const availability = availabilityFor(property, observation?.observation, observedAt, rowFreshness);
    if (reconciled) {
      availability.agreement = reconciled.agreement;
      availability.vantages = reconciled.vantages;
      if (reconciled.conflict) {
        const summary = reconciled.vantages.filter(item => item.conclusive).map(item => item.vantage + ': ' + item.state + (item.httpStatus ? ' (HTTP ' + item.httpStatus + ')' : ''));
        availability.state = 'unknown';
        availability.evidenceState = 'measured';
        availability.blocked = false;
        availability.conflict = true;
        availability.confidence = null;
        availability.failureClass = 'vantage-conflict';
        availability.observedAt = probeObservedAt;
        availability.freshness = probeFreshness;
        availability.reason = 'Vantages disagree about this property (' + summary.join('; ') + '). Neither answer is chosen.';
        availability.nextAction = 'Compare the vantages: a regional or network-specific failure, a geo/bot rule, or a partial outage. Re-run collection and check the property from a third network.';
      } else if (reconciled.agreement === 'partial' && observation) {
        const setAside = reconciled.vantages.filter(item => !item.conclusive).map(item => item.vantage + (item.blocked ? ' (blocked)' : ' (inconclusive)'));
        availability.reason = availability.reason + ' Set aside as inconclusive: ' + setAside.join(', ') + '.';
      }
    }
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
                cfMitigated: observation.http.cfMitigated ?? null,
                attempts: observation.http.attempts ?? 0,
              }
            : null,
          tls: observation.tls || null,
          vantage: authoritative.run.vantage,
        }
      : null;
    if (probeDetail) availability.evidence = probeDetail;
    availability.recent = recentStats(property.propertyId, recentRuns);

    const cp = observation?.criticalPath;
    const criticalPath = cp && observedAt
      ? {
          state: cp.state,
          evidenceState: cp.state === 'unknown' ? 'unavailable' : 'measured',
          level: cp.level,
          basis: cp.basis,
          observedAt,
          checks: cp.checks,
          reason: cp.reason,
          freshness: rowFreshness,
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
          freshness: rowFreshness,
        };
    // The registered contract is reported even before any probe evaluates it, so agents and copy never
    // confuse "no contract" with "contract not yet evaluated".
    criticalPath.contract = property.probe.criticalPath
      ? { level: property.probe.criticalPath.level, checkCount: property.probe.criticalPath.checks.length, basis: property.probe.criticalPath.basis, basisSource: property.probe.criticalPath.basisSource || null, status: property.probe.criticalPathStatus || property.probe.criticalPath.level }
      : { level: null, checkCount: 0, basis: null, basisSource: null, status: property.probe.criticalPathStatus || 'needs-owner-declaration' };
    criticalPath.vantages = reconciled
      ? entries.map(entry => ({ vantage: entry.run.vantage, state: entry.record?.criticalPath?.state || 'unknown' }))
      : [];
    const health = semantics.classifyHealth({ availability, criticalPath, freshness: availability.freshness });

    const expectation = evaluateExpectation(property.profile, availability);
    const operatingStatus = operatingStatusFor(health, expectation);

    // Instrumentation: what production actually serves, reconciled with the (carried-forward) Cloudflare RUM flag.
    const effectiveAvailability = availability.freshness?.state === 'expired' ? 'unknown' : availability.state;
    const detection = observation?.instrumentation || null;
    const instrumentation = classifyInstrumentation({
      availabilityState: effectiveAvailability,
      blocked: availability.blocked || availability.conflict === true,
      redirectOnly: property.probe.expectation === 'redirects' && Boolean(detection?.viaRedirect || property.probe.expectedFinalHost),
      detection: availability.freshness?.state === 'expired' ? null : detection,
      reception: detection?.evaluated ? receptionFor(rumReception, hostOf(property)) : null,
    });
    const rumSetting = {
      value: property.rum,
      evidenceState: inventoryMeta.facets.rum ? 'measured' : 'carried-forward',
      asOf: inventoryMeta.facets.rum || inventoryMeta.baselineAsOf,
      source: 'Cloudflare zone RUM setting',
    };
    const settingWithoutBeacon = property.rum === 'on' && instrumentation.state === 'absent' ? 'setting-on-but-no-beacon-served' : null;

    return {
      propertyId: property.propertyId,
      displayName: property.displayName,
      emphasisRank: property.emphasisRank,
      investorCritical: Boolean(property.investorCritical),
      profile: { ...property.profile, expectation, operatingStatus },
      zone: { status: property.zone.status, evidenceState: 'measured', source: 'Cloudflare zone inventory' },
      observability: {
        state: instrumentation.state,
        rum: property.rum,
        rumSetting,
        evidenceState: detection?.evaluated ? 'measured' : 'unavailable',
        source: 'Served homepage HTML (analytics tag detection), reconciled with the Cloudflare RUM setting',
        providers: instrumentation.providers,
        reason: instrumentation.reason,
        confidence: instrumentation.confidence,
        reception: instrumentation.reception || null,
        discrepancy: settingWithoutBeacon,
      },
      availability,
      criticalPath,
      deployment: property.deployment,
      lastMeaningfulActivity: property.lastMeaningfulActivity,
      probeExpectation: { expectation: property.probe.expectation, basis: property.probe.expectationBasis },
      diagnosticState: health,
      evidenceAsOf: observedAt || inventoryMeta.asOf,
    };
  });

  const count = predicate => rows.filter(predicate).length;
  const contractOf = row => row.criticalPath.contract;
  const servingExpected = baseProperties.filter(property => property.probe.expectation === 'serves-content').length;
  const summary = {
    activeZones: count(row => row.zone.status === 'active'),
    // The Cloudflare RUM flag as last read (carried forward). This is a SETTING, not proof of browser telemetry.
    rumObservedZones: count(row => row.observability.rum === 'on'),
    rumUnobservedZones: count(row => row.observability.rum !== 'on'),
    availabilityKnownZones: count(row => ['available', 'degraded', 'unavailable', 'no-service-published'].includes(row.availability.state) && row.availability.freshness.state !== 'expired' && row.availability.evidenceState === 'measured' && !row.availability.blocked),
    availableZones: count(row => row.availability.state === 'available' && row.availability.freshness.state !== 'expired'),
    degradedZones: count(row => row.availability.state === 'degraded' && row.availability.freshness.state !== 'expired'),
    unavailableZones: count(row => row.availability.state === 'unavailable' && row.availability.freshness.state !== 'expired'),
    noServiceZones: count(row => row.availability.state === 'no-service-published'),
    probeBlockedZones: count(row => row.availability.blocked),
    conflictingZones: count(row => row.availability.conflict === true),
    criticalPathKnownZones: count(row => ['pass', 'fail', 'drift'].includes(row.criticalPath.state) && row.criticalPath.freshness.state !== 'expired'),
    criticalPathContractZones: baseProperties.filter(property => property.probe.criticalPath).length,
    criticalPathAuthoritativeZones: count(row => contractOf(row).level === 'authoritative'),
    criticalPathBaselineZones: count(row => contractOf(row).level === 'baseline'),
    criticalPathNeedsDeclarationZones: count(row => contractOf(row).status === 'baseline-only' || contractOf(row).status === 'needs-owner-declaration'),
    servingExpectedZones: servingExpected,
    verifiedHealthyZones: count(row => row.diagnosticState === 'verified-healthy'),
    pagesMappedActiveZones: count(row => row.deployment.servingDomainState === 'observed'),
    instrumentation: summarizeInstrumentation(rows),
    vantages: {
      valid: runs.length,
      agree: count(row => row.availability.agreement === 'agree'),
      partial: count(row => row.availability.agreement === 'partial'),
      conflict: count(row => row.availability.agreement === 'conflict'),
      single: count(row => row.availability.agreement === 'single-vantage'),
      inconclusive: count(row => row.availability.agreement === 'inconclusive'),
    },
    lifecycle: Object.fromEntries(semantics.LIFECYCLE_STATES.map(state => [state, count(row => row.profile.lifecycle === state)])),
    ownerDeclared: {
      lifecycle: count(row => row.profile.provenance?.lifecycle && row.profile.lifecycle !== 'unknown'),
      purpose: count(row => Boolean(row.profile.purpose)),
      primaryOutcome: count(row => Boolean(row.profile.primaryOutcome)),
    },
    expectationUnmetZones: rows.filter(row => row.profile.expectation.met === false).map(row => row.propertyId),
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
      intentionallyInactiveIsOutage: false,
      cloudflareRumSettingIsTelemetry: false,
      tagPresenceIsReception: false,
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
            vantageCount: runs.length,
            vantages: runs.map((run, index) => ({ id: run.vantage, network: run.network || null, role: index === 0 ? 'primary' : 'secondary', runId: run.runId, observedAt: run.finishedAt || run.startedAt, validity: run.validity, freshness: runFreshness(run) })),
            canaries: probeRun.canaries,
            syntheticTraffic: probeRun.syntheticTraffic,
            freshness: probeFreshness,
            latestAttempt,
          }
        : { runId: null, observedAt: null, validity: 'none', vantage: null, vantageCount: 0, vantages: [], canaries: [], syntheticTraffic: null, freshness: probeFreshness, latestAttempt },
      inventory: { ...inventoryMeta, freshness: inventoryFreshness },
      rumReception: rumReception
        ? { status: rumReception.status, reason: rumReception.reason, windowHours: rumReception.windowHours, observedAt: rumReception.observedAt }
        : { status: 'unavailable', reason: 'No RUM reception evidence was collected.', windowHours: 24, observedAt: null },
    },
    summary,
    infrastructure: buildInfrastructure(registry, inventory),
    sourceNotes: [
      'Zone and Pages facts come from the Cloudflare account inventory; they are refreshed by the collector when the token permits and otherwise carried forward and labelled by age.',
      'The Cloudflare RUM flag is a carried-forward setting. Browser instrumentation is judged from the analytics tags production actually serves; only reception evidence proves telemetry arrives.',
      'Availability and critical-path state come only from scheduled production probes; a successful deploy is not treated as uptime.',
      'Probe traffic is synthetic monitor traffic (see evidence.probe.syntheticTraffic) and must be excluded from audience classification.',
      'Properties without an honest critical-path contract keep criticalPath: unknown and are counted as needing an owner declaration.',
      'Purpose, lifecycle and outcome come from owner declarations where they exist; each field carries its provenance and unknown stays unknown.',
    ],
    properties: rows,
  };
}

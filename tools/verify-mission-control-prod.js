#!/usr/bin/env node
/**
 * Production verifier for the Mission Control data plane (GD-030).
 *   node tools/verify-mission-control-prod.js --base=https://globaldeets.com
 *        [--min-generated-at=<ISO>] [--require-probe-evidence]
 *
 * Fails if the live contracts are missing, malformed, cover fewer than every registered property, break
 * the health contract, or (when requested) do not carry fresh production-probe evidence.
 */
const semantics = require('../observatory/mission-control/evidence-semantics.js');
const registry = require('./mission-control/config/estate-registry.json');

const REGISTERED_IDS = [...registry.properties].sort((a, b) => a.emphasisRank - b.emphasisRank).map(item => item.propertyId);

function argValue(name) {
  const arg = process.argv.find(value => value.startsWith(name));
  return arg ? arg.slice(name.length) : null;
}

const BASE = (argValue('--base=') || 'https://globaldeets.com').replace(/\/$/, '');
const MIN_GENERATED_AT = argValue('--min-generated-at=') || null;
const REQUIRE_PROBE = process.argv.includes('--require-probe-evidence');
const MIN_VANTAGES = Number(argValue('--min-vantages=') || 1);
const EXPECTED_PROPERTIES = REGISTERED_IDS.length;
const TIMEOUT_MS = 15_000;

async function json(path) {
  const response = await fetch(`${BASE}${path}?verify=${Date.now()}`, {
    headers: { 'User-Agent': 'GlobalDeets-MissionControlVerifier/1.0', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error(`${path} returned non-JSON content`);
  return response.json();
}

async function text(path) {
  const response = await fetch(`${BASE}${path}?verify=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.text();
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const base = '/observatory/mission-control';
  const [summary, history, estate, diagnostics, probes, audience, events, executive, coverage, semanticsSource, page, scripts] = await Promise.all([
    json(`${base}/mission-control-data.json`),
    json(`${base}/history.json`),
    json(`${base}/estate-health.json`),
    json(`${base}/diagnostics.json`),
    json(`${base}/probes.json`),
    json(`${base}/audience.json`),
    json(`${base}/business-events.json`),
    json(`${base}/executive.json`),
    json(`${base}/coverage-matrix.json`),
    text(`${base}/evidence-semantics.js`),
    text(`${base}/`),
    Promise.all(['mc-model.js', 'mc-charts.js', 'mc-executive.js', 'mc-operator.js', 'mission-control.js', 'mission-control.css'].map(name => text(`${base}/${name}`))),
  ]);
  void scripts;

  // GD-031: the exact validators the collector enforces are re-run against what production actually serves.
  const { validateDataPlane, expectedPropertyIds } = await import('./mission-control/lib/contracts.mjs');
  const planeErrors = validateDataPlane({ history, estate, diagnostics, summary, probes, audience, events, executive, coverage }, { expectPropertyCount: EXPECTED_PROPERTIES, expectPropertyIds: expectedPropertyIds(registry) });
  requireCondition(planeErrors.length === 0, `production data plane fails validation: ${planeErrors.slice(0, 5).join('; ')}`);

  requireCondition(summary.missionControlId === 'globaldeets-estate', 'summary identity changed');
  requireCondition(summary.investorClaimsPolicy?.edgeTrafficIsHumanAudience === false, 'edge traffic must not be human audience');
  requireCondition(summary.globaldeetsTraffic?.investorSafe === false, 'operational traffic must not be investor-safe');
  requireCondition(history.contractName === 'globaldeets-mission-control-history', 'history contract changed');
  // GD-033: the coverage matrix is the inventory of what is known per property; it must account for the whole estate and agree with it.
  requireCondition(coverage.rows.length === EXPECTED_PROPERTIES, 'coverage matrix must have exactly one row per registered property');
  requireCondition(coverage.generatedAt === estate.generatedAt, 'coverage matrix is not derived from the served estate evidence');
  requireCondition(coverage.rows.filter(row => row.facets.production.state === 'available').length <= estate.summary.availableZones, 'coverage matrix reports more available properties than the estate measured');
  requireCondition(coverage.rows.filter(row => row.facets.production.status === 'blocked').length === estate.summary.probeBlockedZones, 'coverage matrix blocked-probe count disagrees with the estate');
  requireCondition(history.policy?.missingSnapshotIsZero === false, 'missing snapshots must never be zero');
  requireCondition(history.snapshots.length >= 2, 'history lost its seeded snapshots');
  requireCondition(estate.contractName === 'globaldeets-estate-health', 'estate contract changed');
  requireCondition(estate.propertyCount === EXPECTED_PROPERTIES && estate.properties.length === EXPECTED_PROPERTIES, `estate must cover ${EXPECTED_PROPERTIES} properties`);
  requireCondition(estate.properties.map(item => item.propertyId).join('|') === REGISTERED_IDS.join('|'), 'estate must contain exactly the registered properties in emphasis order');
  requireCondition(estate.properties[0].propertyId === 'globaldeets.com', 'GlobalDeets must be first');
  requireCondition(estate.properties[1].propertyId === 'culturesherpa.org', 'Culture Sherpa must be second');
  requireCondition(estate.policy?.deploySuccessEqualsAvailability === false && estate.policy?.httpReachabilityEqualsHealth === false, 'health shortcuts must stay disabled');
  requireCondition(diagnostics.contractName === 'globaldeets-diagnostics-queue' && Array.isArray(diagnostics.items) && diagnostics.items.length > 0, 'diagnostics contract changed');
  requireCondition(probes.contractName === 'globaldeets-probes', 'probes contract changed');
  requireCondition(/MissionControlSemantics/.test(semanticsSource), 'evidence semantics module not served');
  requireCondition(/evidence-semantics\.js/.test(page), 'page does not load evidence semantics');

  for (const property of estate.properties) {
    const freshness = property.availability.observedAt
      ? semantics.evaluateFreshness(property.availability.observedAt, estate.freshnessPolicy.probe, estate.generatedAt)
      : { state: 'unknown' };
    const recomputed = semantics.classifyHealth({ availability: property.availability, criticalPath: property.criticalPath, freshness });
    requireCondition(recomputed === property.diagnosticState, `${property.propertyId} health ${property.diagnosticState} disagrees with the health contract (${recomputed})`);
    if (property.diagnosticState === 'verified-healthy') {
      requireCondition(property.criticalPath.level === 'authoritative' && property.criticalPath.state === 'pass', `${property.propertyId} verified without an authoritative pass`);
    }
  }

  // No fixture or invented number may reach production, and the executive summary must agree with its sources.
  requireCondition(!/"fixture"\s*:\s*true/.test(JSON.stringify({ audience, events, executive })), 'a fixture document reached production');
  requireCondition(audience.policy.edgeTrafficIsHumanAudience === false && audience.policy.missingIsZero === false, 'audience policy changed');
  if (!['measured', 'partial'].includes(audience.source.status)) {
    requireCondition(audience.properties.every(row => [7, 28, 90].every(days => row.requests[days].value === null)), 'audience numbers are published without a measured source');
  } else {
    requireCondition(audience.source.gold?.fixture === false, 'audience Gold provenance must be a non-fixture document');
  }
  requireCondition(events.properties.every(row => row.events.every(event => Object.values(event.readings).every(reading => reading.value === null || row.instrumentation.state === 'instrumented'))), 'business-event counts are published without instrumentation');
  requireCondition(executive.snapshot.verifiedHealthy === estate.summary.verifiedHealthyZones, 'executive verified-healthy count disagrees with the estate');
  requireCondition(executive.maturity.find(row => row.id === 'critical-path').numerator === estate.summary.criticalPathAuthoritativeZones, 'executive critical-path coverage disagrees with the estate');
  const composition = executive.charts.operationalComposition;
  if (composition.data) requireCondition(composition.data.total === EXPECTED_PROPERTIES, 'executive composition must cover the estate');
  for (const name of ['mc-model.js', 'mc-charts.js', 'mc-executive.js', 'mc-operator.js']) requireCondition(page.includes(name), `page does not load ${name}`);
  if (MIN_VANTAGES > 1) {
    requireCondition(estate.evidence.probe.vantageCount >= MIN_VANTAGES, `expected at least ${MIN_VANTAGES} probe vantages, saw ${estate.evidence.probe.vantageCount}`);
    requireCondition(estate.summary.conflictingZones === 0 || diagnostics.items.some(item => item.id.startsWith('availability:vantage-conflict')), 'vantage conflicts must be surfaced as findings');
  }

  if (MIN_GENERATED_AT) {
    requireCondition(Date.parse(estate.generatedAt) >= Date.parse(MIN_GENERATED_AT), `production estate-health generatedAt ${estate.generatedAt} is older than ${MIN_GENERATED_AT}`);
  }

  if (REQUIRE_PROBE) {
    requireCondition(estate.evidence.probe.validity === 'valid', 'no valid production probe run is published');
    requireCondition(estate.summary.availabilityKnownZones > 0, 'no property has probe-established availability');
    const probed = (probes.latest?.properties || []).map(item => item.propertyId);
    requireCondition(new Set(probed).size === probed.length && [...probed].sort().join('|') === [...REGISTERED_IDS].sort().join('|'), 'latest probe run must cover each registered property exactly once');
    const freshness = semantics.evaluateFreshness(estate.evidence.probe.observedAt, estate.freshnessPolicy.probe, Date.now());
    requireCondition(freshness.state !== 'expired', `probe evidence is expired (${freshness.ageHours}h old)`);
    requireCondition(history.snapshots.some(item => item.collector?.kind === 'scheduled'), 'no scheduled snapshot has been ingested');
  }

  console.log(
    'Mission Control data plane verified: ' +
      JSON.stringify({
        generatedAt: estate.generatedAt,
        probeRun: estate.evidence.probe.runId,
        probeValidity: estate.evidence.probe.validity,
        vantages: estate.evidence.probe.vantageCount,
        audience: audience.source.status,
        businessEvents: events.source.status,
        instrumentation: estate.summary.instrumentation,
        criticalPathAuthoritative: estate.summary.criticalPathAuthoritativeZones,
        availabilityKnown: estate.summary.availabilityKnownZones,
        verifiedHealthy: estate.summary.verifiedHealthyZones,
        outages: estate.summary.unavailableZones,
        snapshots: history.snapshots.length,
        diagnostics: diagnostics.items.length,
      })
  );
})().catch(error => {
  console.error(`Mission Control verification failed: ${error.message}`);
  process.exit(1);
});

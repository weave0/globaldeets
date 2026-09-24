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

function argValue(name) {
  const arg = process.argv.find(value => value.startsWith(name));
  return arg ? arg.slice(name.length) : null;
}

const BASE = (argValue('--base=') || 'https://globaldeets.com').replace(/\/$/, '');
const MIN_GENERATED_AT = argValue('--min-generated-at=') || null;
const REQUIRE_PROBE = process.argv.includes('--require-probe-evidence');
const EXPECTED_PROPERTIES = 25;
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
  const [summary, history, estate, diagnostics, probes, semanticsSource, page] = await Promise.all([
    json(`${base}/mission-control-data.json`),
    json(`${base}/history.json`),
    json(`${base}/estate-health.json`),
    json(`${base}/diagnostics.json`),
    json(`${base}/probes.json`),
    text(`${base}/evidence-semantics.js`),
    text(`${base}/`),
  ]);

  requireCondition(summary.missionControlId === 'globaldeets-estate', 'summary identity changed');
  requireCondition(summary.investorClaimsPolicy?.edgeTrafficIsHumanAudience === false, 'edge traffic must not be human audience');
  requireCondition(summary.globaldeetsTraffic?.investorSafe === false, 'operational traffic must not be investor-safe');
  requireCondition(history.contractName === 'globaldeets-mission-control-history', 'history contract changed');
  requireCondition(history.policy?.missingSnapshotIsZero === false, 'missing snapshots must never be zero');
  requireCondition(history.snapshots.length >= 2, 'history lost its seeded snapshots');
  requireCondition(estate.contractName === 'globaldeets-estate-health', 'estate contract changed');
  requireCondition(estate.propertyCount === EXPECTED_PROPERTIES && estate.properties.length === EXPECTED_PROPERTIES, `estate must cover ${EXPECTED_PROPERTIES} properties`);
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

  if (MIN_GENERATED_AT) {
    requireCondition(Date.parse(estate.generatedAt) >= Date.parse(MIN_GENERATED_AT), `production estate-health generatedAt ${estate.generatedAt} is older than ${MIN_GENERATED_AT}`);
  }

  if (REQUIRE_PROBE) {
    requireCondition(estate.evidence.probe.validity === 'valid', 'no valid production probe run is published');
    requireCondition(estate.summary.availabilityKnownZones > 0, 'no property has probe-established availability');
    requireCondition(probes.latest?.properties?.length === EXPECTED_PROPERTIES, 'latest probe run does not cover every property');
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

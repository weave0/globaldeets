/**
 * Cross-contract validators for the Mission Control data plane (GD-030).
 * Each returns a list of error strings; an empty list means valid. The collector refuses to publish
 * (and therefore preserves the last valid evidence) if any error is returned.
 */
import { createRequire } from 'node:module';
import { validateHistory } from './ledger.mjs';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

export function validateRegistry(registry) {
  const errors = [];
  if (registry?.contractName !== 'globaldeets-estate-registry') errors.push('registry: contractName');
  const properties = registry?.properties;
  if (!Array.isArray(properties) || !properties.length) return [...errors, 'registry: properties'];
  const ids = new Set();
  const ranks = new Set();
  for (const property of properties) {
    if (ids.has(property.propertyId)) errors.push('registry: duplicate ' + property.propertyId);
    ids.add(property.propertyId);
    if (ranks.has(property.emphasisRank)) errors.push('registry: duplicate emphasisRank ' + property.emphasisRank);
    ranks.add(property.emphasisRank);
    if (!property.probe?.origin?.startsWith('https://')) errors.push('registry: ' + property.propertyId + ' probe.origin must be https');
    if (!['serves-content', 'redirects', 'unspecified'].includes(property.probe?.expectation)) errors.push('registry: ' + property.propertyId + ' expectation');
    const spec = property.probe?.criticalPath;
    if (spec) {
      if (!['authoritative', 'baseline'].includes(spec.level)) errors.push('registry: ' + property.propertyId + ' criticalPath.level');
      if (!spec.basis) errors.push('registry: ' + property.propertyId + ' criticalPath.basis');
      if (!Array.isArray(spec.checks) || !spec.checks.length) errors.push('registry: ' + property.propertyId + ' criticalPath.checks');
    }
  }
  const sorted = [...properties].sort((a, b) => a.emphasisRank - b.emphasisRank);
  if (sorted[0].propertyId !== 'globaldeets.com') errors.push('registry: GlobalDeets must be emphasisRank first');
  if (sorted[1]?.propertyId !== 'culturesherpa.org') errors.push('registry: Culture Sherpa must be emphasisRank second');
  return errors;
}

export function validateEstate(estate, { expectPropertyCount } = {}) {
  const errors = [];
  if (estate?.contractName !== 'globaldeets-estate-health') return ['estate: contractName'];
  if (!Array.isArray(estate.properties)) return ['estate: properties'];
  if (estate.properties.length !== estate.propertyCount) errors.push('estate: propertyCount mismatch');
  if (expectPropertyCount != null && estate.propertyCount !== expectPropertyCount) errors.push('estate: expected ' + expectPropertyCount + ' properties');
  const ids = new Set(estate.properties.map(item => item.propertyId));
  if (ids.size !== estate.properties.length) errors.push('estate: duplicate propertyId');
  if (estate.properties[0]?.propertyId !== 'globaldeets.com') errors.push('estate: GlobalDeets must be first');
  if (estate.properties[1]?.propertyId !== 'culturesherpa.org') errors.push('estate: Culture Sherpa must be second');
  for (const [key, expected] of Object.entries({ unknownIsHealthy: false, missingIsZero: false, deploySuccessEqualsAvailability: false, httpReachabilityEqualsHealth: false, providerTopologyIsUnhealthy: false, expiredEvidenceIsCurrent: false })) {
    if (estate.policy?.[key] !== expected) errors.push('estate: policy.' + key);
  }
  const probeFreshness = estate.evidence?.probe?.freshness;
  for (const property of estate.properties) {
    const label = 'estate: ' + property.propertyId;
    const { availability, criticalPath } = property;
    if (!semantics.AVAILABILITY_STATES.includes(availability?.state)) errors.push(label + ' availability.state');
    if (!semantics.CRITICAL_PATH_STATES.includes(criticalPath?.state)) errors.push(label + ' criticalPath.state');
    if (!semantics.HEALTH_STATES.includes(property.diagnosticState)) errors.push(label + ' diagnosticState');
    if (availability?.state !== 'unknown' && !availability?.observedAt) errors.push(label + ' non-unknown availability without observedAt');
    if (availability?.state === 'unknown' && availability.evidenceState === 'measured' && !availability.blocked) errors.push(label + ' unknown availability cannot be measured');
    if (availability?.state === 'unavailable' && availability.confidence !== 'confirmed') errors.push(label + ' unavailable requires confirmed confidence');
    if (!availability?.reason) errors.push(label + ' availability.reason');
    if (['unavailable', 'degraded'].includes(availability?.state) && !availability.nextAction) errors.push(label + ' failure without nextAction');
    if (['unavailable', 'degraded'].includes(availability?.state) && !availability.failureClass) errors.push(label + ' failure without failureClass');
    if (criticalPath?.state === 'pass' && !criticalPath.level) errors.push(label + ' pass without contract level');
    if (criticalPath?.state === 'unknown' && !criticalPath.reason) errors.push(label + ' unknown criticalPath needs a reason');
    const recomputed = semantics.classifyHealth({ availability, criticalPath, freshness: availability.freshness });
    if (recomputed !== property.diagnosticState) errors.push(label + ' diagnosticState ' + property.diagnosticState + ' disagrees with health contract (' + recomputed + ')');
    if (property.diagnosticState === 'verified-healthy' && !(availability.state === 'available' && criticalPath.level === 'authoritative' && criticalPath.state === 'pass')) {
      errors.push(label + ' verified-healthy without authoritative pass');
    }
  }
  if (estate.summary?.activeZones !== estate.properties.filter(item => item.zone.status === 'active').length) errors.push('estate: summary.activeZones');
  if (probeFreshness && !['fresh', 'stale', 'expired', 'unknown'].includes(probeFreshness.state)) errors.push('estate: probe freshness state');
  return errors;
}

export function validateDiagnostics(diagnostics) {
  const errors = [];
  if (diagnostics?.contractName !== 'globaldeets-diagnostics-queue') return ['diagnostics: contractName'];
  if (!Array.isArray(diagnostics.items)) return ['diagnostics: items'];
  const ids = new Set();
  const required = diagnostics.agentContract?.requiredForAction || [];
  for (const entry of diagnostics.items) {
    if (ids.has(entry.id)) errors.push('diagnostics: duplicate id ' + entry.id);
    ids.add(entry.id);
    for (const key of required) if (!Object.hasOwn(entry, key)) errors.push('diagnostics: ' + entry.id + ' missing ' + key);
    if (!Array.isArray(entry.evidence) || !entry.evidence.length) errors.push('diagnostics: ' + entry.id + ' evidence');
    if (!entry.escalation?.escalateWhen || !entry.escalation?.targetLane) errors.push('diagnostics: ' + entry.id + ' escalation');
    if (!semantics.ESCALATION_CLASSES.includes(entry.escalation?.class)) errors.push('diagnostics: ' + entry.id + ' escalation.class');
    if (!diagnostics.agentContract.escalationLevels.includes(entry.escalation?.level)) errors.push('diagnostics: ' + entry.id + ' escalation.level');
    if (!['derived', 'manual'].includes(entry.source)) errors.push('diagnostics: ' + entry.id + ' source');
  }
  const priorities = diagnostics.items.map(entry => entry.priority);
  if (new Set(priorities).size !== priorities.length) errors.push('diagnostics: priorities must be unique');
  return errors;
}

export function validateSummary(summary) {
  const errors = [];
  if (summary?.missionControlId !== 'globaldeets-estate') errors.push('summary: identity');
  if (summary?.investorClaimsPolicy?.edgeTrafficIsHumanAudience !== false) errors.push('summary: edgeTrafficIsHumanAudience');
  if (summary?.investorClaimsPolicy?.missingMeasurementIsZero !== false) errors.push('summary: missingMeasurementIsZero');
  for (const key of ['history', 'estateHealth', 'diagnostics', 'probes']) if (!summary?.dataPlane?.[key]) errors.push('summary: dataPlane.' + key);
  if (!Array.isArray(summary?.investmentThesis)) errors.push('summary: investmentThesis');
  if (summary?.globaldeetsTraffic?.investorSafe !== false) errors.push('summary: globaldeetsTraffic.investorSafe must be false');
  return errors;
}

export function validateProbes(probes) {
  const errors = [];
  if (probes?.contractName !== 'globaldeets-probes') return ['probes: contractName'];
  if (probes.latest !== null && !Array.isArray(probes.latest?.properties)) errors.push('probes: latest.properties');
  if (!Array.isArray(probes.recentRuns)) errors.push('probes: recentRuns');
  for (const record of probes.latest?.properties || []) {
    if (!record.observation?.state) errors.push('probes: ' + record.propertyId + ' observation');
    if (['unavailable', 'degraded'].includes(record.observation?.state) && !record.observation.failureClass) errors.push('probes: ' + record.propertyId + ' failure needs class');
  }
  return errors;
}

export function validateDataPlane({ history, estate, diagnostics, summary, probes }, options = {}) {
  return [
    ...validateHistory(history),
    ...validateEstate(estate, options),
    ...validateDiagnostics(diagnostics),
    ...validateSummary(summary),
    ...(probes ? validateProbes(probes) : []),
  ];
}

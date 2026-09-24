/**
 * Cross-contract validators for the Mission Control data plane (GD-030, extended in GD-031).
 * Each returns a list of error strings; an empty list means valid. The collector refuses to publish
 * (and therefore preserves the last valid evidence) if any error is returned.
 */
import { createRequire } from 'node:module';
import { validateHistory } from './ledger.mjs';
import { validateAudience } from './audience.mjs';
import { validateBusinessEvents } from './events.mjs';
import { validateExecutive } from './executive.mjs';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

const CHECK_KINDS = ['page', 'json'];
const CRITICAL_PATH_STATUSES = ['authoritative', 'baseline-only', 'needs-owner-declaration', 'not-applicable'];
const OUTCOME_IDS = semantics.OUTCOME_VOCABULARY.map(item => item.id);

export function validateRegistry(registry) {
  const errors = [];
  if (registry?.contractName !== 'globaldeets-estate-registry') errors.push('registry: contractName');
  if (!/^2\./.test(String(registry?.schemaVersion))) errors.push('registry: schemaVersion must be 2.x');
  const properties = registry?.properties;
  if (!Array.isArray(properties) || !properties.length) return [...errors, 'registry: properties'];
  const ids = new Set();
  const ranks = new Set();
  const sources = new Set(Object.keys(registry.provenanceSources || {}));
  for (const property of properties) {
    const label = 'registry: ' + property.propertyId;
    if (ids.has(property.propertyId)) errors.push('registry: duplicate ' + property.propertyId);
    ids.add(property.propertyId);
    if (ranks.has(property.emphasisRank)) errors.push('registry: duplicate emphasisRank ' + property.emphasisRank);
    ranks.add(property.emphasisRank);
    if (!property.probe?.origin?.startsWith('https://')) errors.push(label + ' probe.origin must be https');
    if (!['serves-content', 'redirects', 'unspecified'].includes(property.probe?.expectation)) errors.push(label + ' expectation');
    const spec = property.probe?.criticalPath;
    if (spec) {
      if (!['authoritative', 'baseline'].includes(spec.level)) errors.push(label + ' criticalPath.level');
      if (!spec.basis) errors.push(label + ' criticalPath.basis');
      if (spec.level === 'authoritative' && !sources.has(spec.basisSource)) errors.push(label + ' authoritative criticalPath needs a basisSource from provenanceSources');
      if (!Array.isArray(spec.checks) || !spec.checks.length) errors.push(label + ' criticalPath.checks');
      for (const check of spec.checks || []) {
        if (!CHECK_KINDS.includes(check.kind)) errors.push(label + ' criticalPath check ' + check.id + ' kind');
        if (!check.path?.startsWith('/')) errors.push(label + ' criticalPath check ' + check.id + ' path');
      }
    }
    if (!CRITICAL_PATH_STATUSES.includes(property.probe?.criticalPathStatus)) errors.push(label + ' criticalPathStatus');
    if ((property.probe?.criticalPathStatus === 'authoritative') !== (spec?.level === 'authoritative')) errors.push(label + ' criticalPathStatus disagrees with its contract level');

    const profile = property.profile;
    if (!profile) {
      errors.push(label + ' profile');
      continue;
    }
    if (!profile.name) errors.push(label + ' profile.name');
    if (!semantics.LIFECYCLE_STATES.includes(profile.lifecycle)) errors.push(label + ' profile.lifecycle');
    if (!Object.hasOwn(semantics.PORTFOLIO_CATEGORIES, profile.category)) errors.push(label + ' profile.category');
    if (!['live', 'not-live', 'unknown'].includes(profile.expectedState)) errors.push(label + ' profile.expectedState');
    if (profile.lifecycle === 'alias' && !profile.aliasOf) errors.push(label + ' alias without aliasOf');
    if (profile.aliasOf && !properties.some(other => other.propertyId === profile.aliasOf)) errors.push(label + ' aliasOf ' + profile.aliasOf + ' is not registered');
    if (profile.primaryOutcome && !OUTCOME_IDS.includes(profile.primaryOutcome.type)) errors.push(label + ' primaryOutcome.type outside the common vocabulary');
    // Unknown stays unknown: every declared field must name where it came from.
    for (const key of ['purpose', 'audience', 'earningPath', 'primaryOutcome', 'strategicTier']) {
      if (profile[key] != null && !sources.has(profile.provenance?.[key])) errors.push(label + ' profile.' + key + ' is declared without provenance');
    }
    if (profile.lifecycle !== 'unknown' && !sources.has(profile.provenance?.lifecycle)) errors.push(label + ' profile.lifecycle is declared without provenance');
    if (profile.expectedState !== 'unknown' && !sources.has(profile.provenance?.expectedState)) errors.push(label + ' profile.expectedState is declared without provenance');
    if (!property.measurement?.audience || !property.measurement?.businessEvents) errors.push(label + ' measurement declarations');
  }
  const sorted = [...properties].sort((a, b) => a.emphasisRank - b.emphasisRank);
  if (sorted[0].propertyId !== 'globaldeets.com') errors.push('registry: GlobalDeets must be emphasisRank first');
  if (sorted[1]?.propertyId !== 'culturesherpa.org') errors.push('registry: Culture Sherpa must be emphasisRank second');
  return errors;
}

export function expectedPropertyIds(registry) {
  return [...registry.properties].sort((a, b) => a.emphasisRank - b.emphasisRank).map(item => item.propertyId);
}

export function validateEstate(estate, { expectPropertyCount, expectPropertyIds } = {}) {
  const errors = [];
  if (estate?.contractName !== 'globaldeets-estate-health') return ['estate: contractName'];
  if (!Array.isArray(estate.properties)) return ['estate: properties'];
  if (estate.properties.length !== estate.propertyCount) errors.push('estate: propertyCount mismatch');
  if (expectPropertyCount != null && estate.propertyCount !== expectPropertyCount) errors.push('estate: expected ' + expectPropertyCount + ' properties');
  const ids = new Set(estate.properties.map(item => item.propertyId));
  if (ids.size !== estate.properties.length) errors.push('estate: duplicate propertyId');
  if (expectPropertyIds && estate.properties.map(item => item.propertyId).join('|') !== expectPropertyIds.join('|')) errors.push('estate: properties are not exactly the registered properties in emphasis order');
  if (estate.properties[0]?.propertyId !== 'globaldeets.com') errors.push('estate: GlobalDeets must be first');
  if (estate.properties[1]?.propertyId !== 'culturesherpa.org') errors.push('estate: Culture Sherpa must be second');
  for (const [key, expected] of Object.entries({ unknownIsHealthy: false, missingIsZero: false, deploySuccessEqualsAvailability: false, httpReachabilityEqualsHealth: false, providerTopologyIsUnhealthy: false, expiredEvidenceIsCurrent: false, intentionallyInactiveIsOutage: false, cloudflareRumSettingIsTelemetry: false, tagPresenceIsReception: false })) {
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
    if (availability?.state === 'unknown' && availability.evidenceState === 'measured' && !availability.blocked && availability.conflict !== true) errors.push(label + ' unknown availability cannot be measured');
    if (availability?.conflict === true && (availability.vantages || []).filter(item => item.conclusive).length < 2) errors.push(label + ' a vantage conflict needs at least two conclusive vantages');
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

    // GD-031: profile, expectation and instrumentation truth.
    const profile = property.profile;
    if (!profile) errors.push(label + ' profile');
    else {
      if (!semantics.LIFECYCLE_STATES.includes(profile.lifecycle)) errors.push(label + ' profile.lifecycle');
      if (!semantics.OPERATING_STATUS[profile.operatingStatus?.key]) errors.push(label + ' operatingStatus');
      if (profile.expectation?.kind === 'expected-inactive' && ['failing', 'degraded'].includes(profile.operatingStatus?.key)) errors.push(label + ' an expected-inactive property cannot be shown as failing');
      if (profile.expectation?.met === true && property.diagnosticState === 'outage') errors.push(label + ' an outage cannot satisfy an expectation');
    }
    const observability = property.observability;
    if (!semantics.INSTRUMENTATION_STATES.includes(observability?.state)) errors.push(label + ' observability.state');
    if (observability?.state === 'active-verified' && observability.reception?.state !== 'received') errors.push(label + ' active-verified instrumentation without reception evidence');
    if (observability?.state === 'configured-unverified' && observability.reception?.state === 'received') errors.push(label + ' received reception must be active-verified');
    if (['configured-unverified', 'active-verified'].includes(observability?.state) && !(observability.providers || []).some(provider => !provider.placeholder)) errors.push(label + ' configured instrumentation without a real provider');
    if (observability?.rumSetting?.evidenceState === 'measured' && !estate.evidence?.inventory?.facets?.rum) errors.push(label + ' RUM setting labelled measured but the RUM facet was not read');
  }
  if (estate.summary?.activeZones !== estate.properties.filter(item => item.zone.status === 'active').length) errors.push('estate: summary.activeZones');
  const lifecycleTotal = Object.values(estate.summary?.lifecycle || {}).reduce((sum, value) => sum + value, 0);
  if (lifecycleTotal !== estate.propertyCount) errors.push('estate: lifecycle counts do not sum to the property count');
  if (probeFreshness && !['fresh', 'stale', 'expired', 'unknown'].includes(probeFreshness.state)) errors.push('estate: probe freshness state');
  return errors;
}

export function validateDiagnostics(diagnostics) {
  const errors = [];
  if (diagnostics?.contractName !== 'globaldeets-diagnostics-queue') return ['diagnostics: contractName'];
  if (!Array.isArray(diagnostics.items)) return ['diagnostics: items'];
  const ids = new Set();
  const required = diagnostics.agentContract?.requiredForAction || [];
  let previousScore = Infinity;
  let seenTerminal = false;
  for (const entry of diagnostics.items) {
    if (ids.has(entry.id)) errors.push('diagnostics: duplicate id ' + entry.id);
    ids.add(entry.id);
    for (const key of required) if (!Object.hasOwn(entry, key)) errors.push('diagnostics: ' + entry.id + ' missing ' + key);
    if (!Array.isArray(entry.evidence) || !entry.evidence.length) errors.push('diagnostics: ' + entry.id + ' evidence');
    if (!entry.escalation?.escalateWhen || !entry.escalation?.targetLane) errors.push('diagnostics: ' + entry.id + ' escalation');
    if (!semantics.ESCALATION_CLASSES.includes(entry.escalation?.class)) errors.push('diagnostics: ' + entry.id + ' escalation.class');
    if (!diagnostics.agentContract.escalationLevels.includes(entry.escalation?.level)) errors.push('diagnostics: ' + entry.id + ' escalation.level');
    if (!['derived', 'manual'].includes(entry.source)) errors.push('diagnostics: ' + entry.id + ' source');
    if (!semantics.FINDING_CATEGORIES.includes(entry.category)) errors.push('diagnostics: ' + entry.id + ' category');
    if (!['high', 'medium', 'low'].includes(entry.confidence)) errors.push('diagnostics: ' + entry.id + ' confidence');
    if (!semantics.ACTIONABILITY_STATES.includes(entry.actionability?.state)) errors.push('diagnostics: ' + entry.id + ' actionability.state');
    if (entry.actionability?.state === 'blocked-on-authority' && !entry.actionability.blockedBy) errors.push('diagnostics: ' + entry.id + ' blocked-on-authority must name the missing authority');
    if (!entry.freshness?.state) errors.push('diagnostics: ' + entry.id + ' freshness');
    if (!Array.isArray(entry.subjects)) errors.push('diagnostics: ' + entry.id + ' subjects');
    const breakdownSum = (entry.priorityBreakdown || []).reduce((sum, part) => sum + part.points, 0);
    if (!Number.isFinite(entry.priorityScore) || breakdownSum !== entry.priorityScore) errors.push('diagnostics: ' + entry.id + ' priorityScore does not equal the sum of its published breakdown');
    const terminal = ['closed', 'accepted-risk'].includes(entry.status);
    if (terminal) seenTerminal = true;
    else if (seenTerminal) errors.push('diagnostics: open item ' + entry.id + ' is ranked below a closed item');
    if (!terminal) {
      if (entry.priorityScore > previousScore) errors.push('diagnostics: ' + entry.id + ' is ranked out of score order');
      previousScore = entry.priorityScore;
    }
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
  for (const key of ['history', 'estateHealth', 'diagnostics', 'probes', 'audience', 'businessEvents', 'executive']) if (!summary?.dataPlane?.[key]) errors.push('summary: dataPlane.' + key);
  if (!Array.isArray(summary?.investmentThesis)) errors.push('summary: investmentThesis');
  if (summary?.globaldeetsTraffic?.investorSafe !== false) errors.push('summary: globaldeetsTraffic.investorSafe must be false');
  return errors;
}

export function validateProbes(probes, { expectPropertyIds } = {}) {
  const errors = [];
  if (probes?.contractName !== 'globaldeets-probes') return ['probes: contractName'];
  if (probes.latest !== null && !Array.isArray(probes.latest?.properties)) errors.push('probes: latest.properties');
  if (!Array.isArray(probes.recentRuns)) errors.push('probes: recentRuns');
  if (probes.latest && expectPropertyIds) {
    const seen = probes.latest.properties.map(item => item.propertyId);
    if (new Set(seen).size !== seen.length || [...seen].sort().join('|') !== [...expectPropertyIds].sort().join('|')) errors.push('probes: latest run must contain each registered property exactly once');
  }
  for (const record of probes.latest?.properties || []) {
    if (!record.observation?.state) errors.push('probes: ' + record.propertyId + ' observation');
    if (['unavailable', 'degraded'].includes(record.observation?.state) && !record.observation.failureClass) errors.push('probes: ' + record.propertyId + ' failure needs class');
  }
  return errors;
}

/**
 * Readability check for evidence published before GD-031 (estate schema 1.x). It is deliberately weaker than
 * validateDataPlane (the old files lack profiles, instrumentation and the GD-031 documents) but still fails
 * closed on corruption: history integrity, structure, unique ids and the health contract must all hold, so a
 * damaged evidence branch is never overwritten by the migration run.
 */
export function validateLegacyDataPlane({ history, estate, diagnostics, summary, probes }) {
  const errors = [...validateHistory(history)];
  if (summary?.missionControlId !== 'globaldeets-estate' || !Array.isArray(summary?.investmentThesis)) errors.push('legacy summary: contract');
  if (probes?.contractName !== 'globaldeets-probes' || !Array.isArray(probes?.recentRuns) || (probes.latest !== null && !Array.isArray(probes.latest?.properties))) errors.push('legacy probes: contract');
  if (estate?.contractName !== 'globaldeets-estate-health' || !Array.isArray(estate.properties)) return [...errors, 'legacy estate: contract'];
  if (estate.properties.length !== estate.propertyCount) errors.push('legacy estate: propertyCount mismatch');
  if (new Set(estate.properties.map(item => item.propertyId)).size !== estate.properties.length) errors.push('legacy estate: duplicate propertyId');
  for (const property of estate.properties) {
    if (!semantics.AVAILABILITY_STATES.includes(property.availability?.state)) errors.push('legacy estate: ' + property.propertyId + ' availability.state');
    if (semantics.classifyHealth({ availability: property.availability, criticalPath: property.criticalPath, freshness: property.availability?.freshness }) !== property.diagnosticState) errors.push('legacy estate: ' + property.propertyId + ' health disagrees with the health contract');
  }
  if (diagnostics?.contractName !== 'globaldeets-diagnostics-queue' || !Array.isArray(diagnostics.items)) return [...errors, 'legacy diagnostics: contract'];
  const seen = new Set();
  for (const entry of diagnostics.items) {
    if (seen.has(entry.id)) errors.push('legacy diagnostics: duplicate id ' + entry.id);
    seen.add(entry.id);
  }
  return errors;
}

/**
 * Validates the whole published data plane. The GD-031 documents (audience, events, executive) are validated
 * when present; the collector always supplies them, and the legacy five-file set stays valid on its own so
 * evidence published before GD-031 remains readable.
 */
export function validateDataPlane({ history, estate, diagnostics, summary, probes, audience, events, executive }, options = {}) {
  return [
    ...validateHistory(history),
    ...validateEstate(estate, options),
    ...validateDiagnostics(diagnostics),
    ...validateSummary(summary),
    ...(probes ? validateProbes(probes, options) : []),
    ...(audience ? validateAudience(audience, options) : []),
    ...(events ? validateBusinessEvents(events, options) : []),
    ...(executive ? validateExecutive(executive, { estate }) : []),
  ];
}

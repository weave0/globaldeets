import { buildCoverageInventory } from './news-coverage.js';
import { SOURCE_RESEARCH_CANDIDATES } from './news-source-admission.js';

export const LOCAL_REPORTING_OBSERVATORY_VERSION = '2026-09-08.1';

export function buildLocalReportingObservatory({
  coverage = buildCoverageInventory(),
  researchCandidates = SOURCE_RESEARCH_CANDIDATES,
} = {}) {
  const subnational = coverage?.subnationalReporting || emptySubnational();
  const localCandidates = researchCandidates
    .filter(candidate => candidate?.candidateId === 'laist-local')
    .map(candidate => ({
      candidateId: candidate.candidateId,
      name: candidate.name,
      disposition: candidate.disposition,
      endpointAuthority: candidate.endpointAuthority,
      allowedUseStatus: candidate.allowedUseStatus,
      itemLevelReviewRequired: candidate.itemLevelReviewRequired,
      blocker: candidate.itemLevelReviewRequired
        ? 'mixed-origin feed requires deterministic item-origin restriction handling'
        : null,
    }));

  return Object.freeze({
    version: LOCAL_REPORTING_OBSERVATORY_VERSION,
    rules: Object.freeze({
      routingRegionIsGeographicScope: false,
      publisherOriginIsEventLocality: false,
      sourceScopeMakesEveryItemLocal: false,
      localReportingIsPrimaryEvidence: false,
      localPublisherImpliesIndependentCorroboration: false,
      observatoryIsAdmissionAuthority: false,
      automaticSourceWeighting: false,
    }),
    sourceCount: subnational.sourceCount,
    sourceIds: Object.freeze([...(subnational.sourceIds || [])]),
    jurisdictionCount: subnational.jurisdictionCount,
    jurisdictionIds: Object.freeze([...(subnational.jurisdictionIds || [])]),
    operatorCount: subnational.operatorCount,
    operators: Object.freeze([...(subnational.operators || [])]),
    sources: Object.freeze((subnational.sources || []).map(source => Object.freeze({ ...source }))),
    researchCandidates: Object.freeze(localCandidates.map(candidate => Object.freeze(candidate))),
  });
}

export function validateLocalReportingObservatory(locality) {
  const errors = [];
  if (!locality || typeof locality !== 'object' || Array.isArray(locality)) {
    return { valid: false, errors: ['locality:not-object'] };
  }
  if (locality.version !== LOCAL_REPORTING_OBSERVATORY_VERSION) {
    errors.push('locality:version-mismatch');
  }
  for (const field of [
    'routingRegionIsGeographicScope',
    'publisherOriginIsEventLocality',
    'sourceScopeMakesEveryItemLocal',
    'localReportingIsPrimaryEvidence',
    'localPublisherImpliesIndependentCorroboration',
    'observatoryIsAdmissionAuthority',
    'automaticSourceWeighting',
  ]) {
    if (locality.rules?.[field] !== false) errors.push(`locality.rules.${field}:must-be-false`);
  }
  if (!Array.isArray(locality.sourceIds) || locality.sourceCount !== locality.sourceIds.length) {
    errors.push('locality:source-count-drift');
  }
  if (!Array.isArray(locality.jurisdictionIds) || locality.jurisdictionCount !== locality.jurisdictionIds.length) {
    errors.push('locality:jurisdiction-count-drift');
  }
  if (!Array.isArray(locality.operators) || locality.operatorCount !== locality.operators.length) {
    errors.push('locality:operator-count-drift');
  }
  if (!Array.isArray(locality.sources) || locality.sources.length !== locality.sourceCount) {
    errors.push('locality:sources-drift');
  }
  for (const source of locality.sources || []) {
    if (source.routingRegion === source.scopeType) {
      errors.push(`locality:${source.sourceId}:routing-scope-collapse`);
    }
    if (!source.scopeType || !Array.isArray(source.jurisdictionIds) || source.jurisdictionIds.length === 0) {
      errors.push(`locality:${source.sourceId}:missing-reviewed-scope`);
    }
  }
  for (const candidate of locality.researchCandidates || []) {
    if (locality.sourceIds.includes(candidate.candidateId) || candidate.disposition !== 'research') {
      errors.push(`locality:${candidate.candidateId}:research-self-promotion`);
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)].sort() };
}

function emptySubnational() {
  return {
    sourceCount: 0,
    sourceIds: [],
    jurisdictionCount: 0,
    jurisdictionIds: [],
    operatorCount: 0,
    operators: [],
    sources: [],
  };
}

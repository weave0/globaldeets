import { SOURCE_FINGERPRINT, SOURCE_HEALTH_KEY, SOURCES } from '../api/news.js';
import { buildCoverageInventory } from './news-coverage.js';
import {
  ADMISSION_FINGERPRINT,
  SOURCE_ADMISSIONS,
  SOURCE_RESEARCH_CANDIDATES,
} from './news-source-admission.js';
import {
  REVIEWED_INSTITUTIONAL_SOURCES,
  institutionalRegistrySummary,
} from './institutional-evidence-sources.js';
import { validateDossierIntegrity } from './dossier-integrity.js';
import { getSantaYnezDossier } from './santa-ynez-dossier.js';

export const COVERAGE_EVIDENCE_OBSERVATORY_ID = 'coverage-evidence';
export const COVERAGE_EVIDENCE_OBSERVATORY_VERSION = '2026-09-08.1';

const UNRESOLVED_CLAIM_STATES = new Set([
  'unreviewed',
  'single-source',
  'contradicted',
  'disputed',
]);
const PRIMARY_EVIDENCE_ROLES = new Set(['primary-evidence', 'primary-disclosure']);
const REPORTING_ROLES = new Set(['reporting']);
const TERMINAL_CLAIM_STATES = new Set(['superseded', 'withdrawn']);
const GAP_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);

export function buildCoverageEvidenceObservatory({
  coverage = buildCoverageInventory(),
  liveAdmissions = SOURCE_ADMISSIONS,
  researchCandidates = SOURCE_RESEARCH_CANDIDATES,
  institutionalSources = REVIEWED_INSTITUTIONAL_SOURCES,
  dossiers = [getSantaYnezDossier()],
  healthSnapshot = null,
} = {}) {
  requireArray(liveAdmissions, 'liveAdmissions');
  requireArray(researchCandidates, 'researchCandidates');
  requireArray(institutionalSources, 'institutionalSources');
  requireArray(dossiers, 'dossiers');
  if (!plainObject(coverage)) throw new TypeError('coverage must be an object');

  const dossierSummaries = dossiers.map(summarizeDossier).sort(byId('dossierId'));
  const institutionalSummary = summarizeInstitutionalSources(institutionalSources);
  const sourceRights = summarizeSourceRights(liveAdmissions, researchCandidates);
  const evidenceClasses = summarizeEvidenceClasses(dossiers);
  const dossierProvenance = summarizeDossierProvenance(dossiers);
  const operationalHealth = summarizeHealthSnapshot(healthSnapshot);
  const gaps = buildObservatoryGaps({
    coverage,
    sourceRights,
    institutionalSummary,
    dossierSummaries,
    operationalHealth,
  });

  const observatory = {
    observatoryId: COVERAGE_EVIDENCE_OBSERVATORY_ID,
    observatoryVersion: COVERAGE_EVIDENCE_OBSERVATORY_VERSION,
    sourceFingerprint: SOURCE_FINGERPRINT,
    admissionFingerprint: ADMISSION_FINGERPRINT,
    rules: {
      truthScore: false,
      editorialVerdict: false,
      compositeCoverageScore: false,
      publisherQualityScore: false,
      newsCoverageIsEvidenceCoverage: false,
      collectionEligibilityRequiresEndpointReview: true,
      reviewedDirectoryIsCollectionAuthority: false,
      automaticRemediation: false,
    },
    newsCoverage: {
      totalSources: coverage.totalSources,
      totalRegions: coverage.totalRegions,
      totalLanguages: coverage.totalLanguages,
      englishSourceShare: coverage.englishSourceShare,
      primarySourceInputs: coverage.primarySourceInputs,
      regions: cloneArray(coverage.regions),
      sourceOriginCountries: cloneArray(coverage.sourceOriginCountries),
      sourceClasses: cloneArray(coverage.sourceClasses),
      evidenceRoles: cloneArray(coverage.evidenceRoles),
      geographicScopes: cloneArray(coverage.geographicScopes),
      provenance: cloneObject(coverage.provenance),
      admission: cloneObject(coverage.admission),
      gapCount: Array.isArray(coverage.gaps) ? coverage.gaps.length : null,
    },
    sourceRights,
    institutionalEvidence: institutionalSummary,
    evidenceCoverage: {
      dossierCount: dossierSummaries.length,
      dossierIds: dossierSummaries.map(item => item.dossierId),
      evidenceClasses,
      provenance: dossierProvenance,
      dossiers: dossierSummaries,
    },
    operationalHealth,
    gaps,
  };

  return Object.freeze(observatory);
}

export function validateCoverageEvidenceObservatory(observatory) {
  const issues = {
    structureErrors: [],
    semanticErrors: [],
    countErrors: [],
    duplicateIds: [],
    invalidGaps: [],
  };

  if (!plainObject(observatory)) {
    issues.structureErrors.push('observatory:not-object');
    return finishValidation(issues);
  }

  if (observatory.observatoryId !== COVERAGE_EVIDENCE_OBSERVATORY_ID) {
    issues.semanticErrors.push('observatoryId:mismatch');
  }
  if (observatory.observatoryVersion !== COVERAGE_EVIDENCE_OBSERVATORY_VERSION) {
    issues.semanticErrors.push('observatoryVersion:mismatch');
  }
  if (observatory.sourceFingerprint !== SOURCE_FINGERPRINT) {
    issues.semanticErrors.push('sourceFingerprint:mismatch');
  }
  if (observatory.admissionFingerprint !== ADMISSION_FINGERPRINT) {
    issues.semanticErrors.push('admissionFingerprint:mismatch');
  }

  const rules = observatory.rules;
  if (!plainObject(rules)) issues.structureErrors.push('rules:not-object');
  else {
    for (const field of [
      'truthScore',
      'editorialVerdict',
      'compositeCoverageScore',
      'publisherQualityScore',
      'newsCoverageIsEvidenceCoverage',
      'reviewedDirectoryIsCollectionAuthority',
      'automaticRemediation',
    ]) {
      if (rules[field] !== false) issues.semanticErrors.push(`rules.${field}:must-be-false`);
    }
    if (rules.collectionEligibilityRequiresEndpointReview !== true) {
      issues.semanticErrors.push('rules.collectionEligibilityRequiresEndpointReview:must-be-true');
    }
  }

  const news = observatory.newsCoverage;
  if (!plainObject(news)) issues.structureErrors.push('newsCoverage:not-object');
  else {
    if (news.totalSources !== SOURCES.length) issues.countErrors.push('newsCoverage.totalSources');
    if (news.provenance?.valid !== true) issues.semanticErrors.push('newsCoverage.provenance:invalid');
    if (news.admission?.valid !== true) issues.semanticErrors.push('newsCoverage.admission:invalid');
    for (const field of [
      'regions',
      'sourceOriginCountries',
      'sourceClasses',
      'evidenceRoles',
      'geographicScopes',
    ]) {
      if (!Array.isArray(news[field])) issues.structureErrors.push(`newsCoverage.${field}:not-array`);
    }
  }

  const rights = observatory.sourceRights;
  if (!plainObject(rights)) issues.structureErrors.push('sourceRights:not-object');
  else {
    for (const field of [
      'reviewedLiveSourceIds',
      'legacyUnreviewedSourceIds',
      'remediationSourceIds',
      'unknownRightsSourceIds',
      'researchCandidates',
    ]) {
      if (!Array.isArray(rights[field])) issues.structureErrors.push(`sourceRights.${field}:not-array`);
    }
    if (rights.totalLiveSources !== SOURCES.length) issues.countErrors.push('sourceRights.totalLiveSources');
    if (Array.isArray(rights.reviewedLiveSourceIds) && rights.reviewedLiveSources !== rights.reviewedLiveSourceIds.length) {
      issues.countErrors.push('sourceRights.reviewedLiveSources');
    }
    if (
      Array.isArray(rights.legacyUnreviewedSourceIds) &&
      rights.legacyUnreviewedSources !== rights.legacyUnreviewedSourceIds.length
    ) {
      issues.countErrors.push('sourceRights.legacyUnreviewedSources');
    }
    if (
      Number.isInteger(rights.reviewedLiveSources) &&
      Number.isInteger(rights.legacyUnreviewedSources) &&
      rights.reviewedLiveSources + rights.legacyUnreviewedSources !== rights.totalLiveSources
    ) {
      issues.countErrors.push('sourceRights.review-state-partition');
    }
  }

  const institutional = observatory.institutionalEvidence;
  if (!plainObject(institutional)) issues.structureErrors.push('institutionalEvidence:not-object');
  else {
    if (!Array.isArray(institutional.sources)) issues.structureErrors.push('institutionalEvidence.sources:not-array');
    if (Array.isArray(institutional.sources) && institutional.reviewedSources !== institutional.sources.length) {
      issues.countErrors.push('institutionalEvidence.reviewedSources');
    }
    if (institutional.collectionEligibleSources > institutional.reviewedSources) {
      issues.countErrors.push('institutionalEvidence.collectionEligibleSources');
    }
    for (const source of array(institutional.sources)) {
      if (!plainObject(source) || !text(source.sourceId)) {
        issues.semanticErrors.push('institutionalEvidence.source:invalid');
        continue;
      }
      if (
        source.collectionEligible === true &&
        (source.collectionState !== 'endpoint-reviewed' || source.verifiedEndpointCount < 1)
      ) {
        issues.semanticErrors.push(`institutionalEvidence.${source.sourceId}:unsafe-collection`);
      }
    }
  }

  const evidence = observatory.evidenceCoverage;
  if (!plainObject(evidence)) issues.structureErrors.push('evidenceCoverage:not-object');
  else {
    for (const field of ['dossierIds', 'evidenceClasses', 'dossiers']) {
      if (!Array.isArray(evidence[field])) issues.structureErrors.push(`evidenceCoverage.${field}:not-array`);
    }
    if (Array.isArray(evidence.dossiers) && evidence.dossierCount !== evidence.dossiers.length) {
      issues.countErrors.push('evidenceCoverage.dossierCount');
    }
    if (Array.isArray(evidence.dossierIds)) {
      issues.duplicateIds.push(...duplicates(evidence.dossierIds).map(id => `dossier:${id}`));
    }
    for (const dossier of array(evidence.dossiers)) validateDossierSummary(dossier, issues);
  }

  const health = observatory.operationalHealth;
  if (!plainObject(health)) issues.structureErrors.push('operationalHealth:not-object');
  else if (!['available', 'unavailable'].includes(health.status)) {
    issues.semanticErrors.push('operationalHealth.status:invalid');
  }

  if (!Array.isArray(observatory.gaps)) issues.structureErrors.push('gaps:not-array');
  else {
    issues.duplicateIds.push(...duplicates(observatory.gaps.map(gap => gap?.id).filter(text)));
    for (const [index, gap] of observatory.gaps.entries()) {
      if (
        !plainObject(gap) ||
        !text(gap.id) ||
        !text(gap.domain) ||
        !text(gap.type) ||
        !GAP_SEVERITIES.has(gap.severity) ||
        !text(gap.detail) ||
        !text(gap.nextAction)
      ) {
        issues.invalidGaps.push(`gap-index:${index}`);
      }
    }
  }

  return finishValidation(issues);
}

export async function readCachedSourceHealth(env) {
  if (!env?.NEWS_CACHE) return null;
  try {
    const snapshot = await env.NEWS_CACHE.get(SOURCE_HEALTH_KEY, { type: 'json' });
    if (
      snapshot?.sourceFingerprint !== SOURCE_FINGERPRINT ||
      !Array.isArray(snapshot.sourceHealth) ||
      snapshot.sourceHealth.length !== SOURCES.length
    ) {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function summarizeDossier(dossier) {
  const integrity = validateDossierIntegrity(dossier);
  const sourceById = new Map(array(dossier?.sources).map(source => [source.id, source]));
  const sourceByUrl = new Map(array(dossier?.sources).map(source => [source.url, source]));
  const claims = array(dossier?.claims);
  const evidence = array(dossier?.evidence);
  const events = array(dossier?.events);
  const claimRelations = array(dossier?.claimRelations);
  const evidenceRelations = array(dossier?.evidenceRelations);
  const corrections = array(dossier?.corrections);
  const unknowns = array(dossier?.unknowns);

  const unresolvedClaims = claims
    .filter(claim => UNRESOLVED_CLAIM_STATES.has(claim.state))
    .map(claim => ({
      claimId: claim.id,
      state: claim.state,
      type: claim.type,
      originSourceId: claim.originSourceId,
      eventIds: cloneArray(claim.eventIds),
      proposition: claim.proposition,
    }))
    .sort(byId('claimId'));

  const terminalClaims = claims
    .filter(claim => TERMINAL_CLAIM_STATES.has(claim.state))
    .map(claim => ({ claimId: claim.id, state: claim.state }))
    .sort(byId('claimId'));

  const eventCoverage = events
    .map(event => {
      const eventEvidence = evidence.filter(item => array(item.eventIds).includes(event.id));
      const primaryEvidenceIds = eventEvidence
        .filter(item => PRIMARY_EVIDENCE_ROLES.has(sourceByUrl.get(item.canonicalRef)?.evidenceRole))
        .map(item => item.id)
        .sort();
      const eventClaims = claims.filter(claim => array(claim.eventIds).includes(event.id));
      const originSourceIds = unique(eventClaims.map(claim => claim.originSourceId).filter(text));
      const reportingSourceIds = originSourceIds.filter(sourceId =>
        REPORTING_ROLES.has(sourceById.get(sourceId)?.evidenceRole)
      );

      return {
        eventId: event.id,
        title: event.title,
        status: event.status,
        claimCount: eventClaims.length,
        distinctClaimOriginSources: originSourceIds.length,
        reportingSourceCount: reportingSourceIds.length,
        reportingSourceIds,
        evidenceCount: eventEvidence.length,
        primaryEvidenceCount: primaryEvidenceIds.length,
        primaryEvidenceIds,
        hasPrimaryEvidence: primaryEvidenceIds.length > 0,
      };
    })
    .sort(byId('eventId'));

  const contradictionClaimIds = unique(
    claimRelations
      .filter(relation => relation.relation === 'contradicts')
      .flatMap(relation => [relation.claimId, relation.relatedClaimId])
      .filter(text)
  );
  const supersessionRelationCount =
    claimRelations.filter(relation => relation.relation === 'supersedes').length +
    evidenceRelations.filter(relation => relation.relation === 'supersedes').length +
    evidence.reduce((count, item) => count + array(item.supersedesEvidenceIds).length, 0);

  return {
    dossierId: dossier?.dossierId || null,
    dossierVersion: dossier?.dossierVersion || null,
    title: dossier?.title || null,
    status: dossier?.status || null,
    reviewedAt: dossier?.reviewedAt || null,
    integrityValid: integrity.valid,
    sourceCount: array(dossier?.sources).length,
    eventCount: events.length,
    claimCount: claims.length,
    evidenceCount: evidence.length,
    unresolvedClaimCount: unresolvedClaims.length,
    unresolvedClaims,
    terminalClaimCount: terminalClaims.length,
    terminalClaims,
    contradictionClaimCount: contradictionClaimIds.length,
    contradictionClaimIds,
    unknownCount: unknowns.length,
    unknowns: [...unknowns],
    correctionCount: corrections.length,
    corrections: corrections.map(item => ({
      correctionId: item.id,
      status: item.status,
      observedAt: item.observedAt,
      originalArtifactRetained: item.originalArtifactRetained,
    })),
    supersessionRelationCount,
    eventCoverage,
  };
}

function summarizeInstitutionalSources(sources) {
  const base = institutionalRegistrySummary();
  const summaries = sources
    .map(source => ({
      sourceId: source.sourceId,
      sourceClass: source.sourceClass,
      evidenceRole: source.evidenceRole,
      jurisdiction: source.jurisdiction,
      collectionState: source.collectionState,
      collectionEligible: source.collectionEligible,
      machineReadableEndpointCount: array(source.machineReadableEndpoints).length,
      verifiedEndpointCount: array(source.machineReadableEndpoints).filter(
        endpoint => endpoint?.reviewStatus === 'verified'
      ).length,
      documentTypes: cloneArray(source.documentTypes),
    }))
    .sort(byId('sourceId'));

  return {
    reviewedSources: summaries.length,
    issuingPrimarySources: summaries.filter(source => source.evidenceRole === 'issuing-primary').length,
    collectionEligibleSources: summaries.filter(source => source.collectionEligible).length,
    directoryOnlySources: summaries.filter(source => source.collectionState === 'directory-only').length,
    endpointReviewedSources: summaries.filter(source => source.collectionState === 'endpoint-reviewed').length,
    knowledgeCatalogIsIngestionAuthority: base.knowledgeCatalogIsIngestionAuthority,
    endpointReviewRequired: base.endpointReviewRequired,
    sources: summaries,
  };
}

function summarizeSourceRights(admissions, candidates) {
  const reviewedLiveSourceIds = admissions
    .filter(entry => entry.reviewState === 'reviewed')
    .map(entry => entry.sourceId)
    .sort();
  const legacyUnreviewedSourceIds = admissions
    .filter(entry => entry.reviewState === 'legacy-unreviewed')
    .map(entry => entry.sourceId)
    .sort();
  const remediationSourceIds = admissions
    .filter(entry => ['permission-required', 'contract-required', 'prohibited'].includes(entry.allowedUseStatus))
    .map(entry => entry.sourceId)
    .sort();
  const unknownRightsSourceIds = admissions
    .filter(entry => entry.allowedUseStatus === 'unknown')
    .map(entry => entry.sourceId)
    .sort();

  return {
    totalLiveSources: admissions.length,
    reviewedLiveSources: reviewedLiveSourceIds.length,
    reviewedLiveSourceIds,
    legacyUnreviewedSources: legacyUnreviewedSourceIds.length,
    legacyUnreviewedSourceIds,
    remediationSourceIds,
    unknownRightsSourceIds,
    researchCandidates: candidates
      .map(candidate => ({
        candidateId: candidate.candidateId,
        name: candidate.name,
        disposition: candidate.disposition,
        endpointAuthority: candidate.endpointAuthority,
        allowedUseStatus: candidate.allowedUseStatus,
        collectionEligible: false,
        itemLevelReviewRequired: candidate.itemLevelReviewRequired === true,
      }))
      .sort(byId('candidateId')),
  };
}

function summarizeEvidenceClasses(dossiers) {
  const counts = new Map();
  for (const dossier of dossiers) {
    for (const evidence of array(dossier?.evidence)) {
      const type = text(evidence.documentType) ? evidence.documentType : 'unknown';
      counts.set(type, (counts.get(type) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([documentType, count]) => ({ documentType, count }));
}

function summarizeDossierProvenance(dossiers) {
  const sources = dossiers.flatMap(dossier => array(dossier?.sources));
  return {
    sourceClasses: groupedCount(sources, 'sourceClass'),
    evidenceRoles: groupedCount(sources, 'evidenceRole'),
    uniqueSourceCount: new Set(sources.map(source => source.id).filter(text)).size,
    scoringApplied: false,
  };
}

function summarizeHealthSnapshot(snapshot) {
  if (
    !plainObject(snapshot) ||
    snapshot.sourceFingerprint !== SOURCE_FINGERPRINT ||
    !Array.isArray(snapshot.sourceHealth) ||
    snapshot.sourceHealth.length !== SOURCES.length
  ) {
    return {
      status: 'unavailable',
      generatedAt: null,
      totalSources: SOURCES.length,
      healthySources: null,
      degradedSources: null,
      degradedSourceIds: [],
    };
  }

  const degradedSourceIds = snapshot.sourceHealth
    .filter(source => source?.lastError)
    .map(source => source.sourceId)
    .filter(text)
    .sort();
  return {
    status: 'available',
    generatedAt: snapshot.generatedAt || null,
    totalSources: snapshot.sourceHealth.length,
    healthySources: snapshot.sourceHealth.length - degradedSourceIds.length,
    degradedSources: degradedSourceIds.length,
    degradedSourceIds,
  };
}

function buildObservatoryGaps({
  coverage,
  sourceRights,
  institutionalSummary,
  dossierSummaries,
  operationalHealth,
}) {
  const gaps = array(coverage.gaps).map(gap => ({
    id: `news:${gap.id}`,
    domain: 'news-coverage',
    type: gap.type,
    severity: gap.severity,
    observed: gap.observed,
    target: gap.target,
    affectedIds: gap.region ? [`region:${gap.region}`] : [],
    detail: gap.detail,
    nextAction: nextActionForNewsGap(gap.type),
    requires: requirementsForNewsGap(gap.type),
  }));

  if (sourceRights.legacyUnreviewedSources > 0) {
    gaps.push({
      id: 'governance:source-rights-review-debt',
      domain: 'source-governance',
      type: 'source-rights-review-debt',
      severity: 'high',
      observed: sourceRights.legacyUnreviewedSources,
      target: 0,
      affectedIds: sourceRights.legacyUnreviewedSourceIds,
      detail: 'Live legacy sources remain explicitly unreviewed for usage rights.',
      nextAction: 'Complete evidence-backed source-by-source rights review without changing collection eligibility by assumption.',
      requires: ['manual-review'],
    });
  }

  if (institutionalSummary.reviewedSources > institutionalSummary.collectionEligibleSources) {
    gaps.push({
      id: 'evidence:institutional-collection-eligibility',
      domain: 'evidence-coverage',
      type: 'institutional-collection-eligibility',
      severity: 'high',
      observed: institutionalSummary.collectionEligibleSources,
      target: `review endpoint authority, permissions, and machine-readable access for selected candidates; ${institutionalSummary.reviewedSources} are classification-reviewed`,
      affectedIds: institutionalSummary.sources
        .filter(source => !source.collectionEligible)
        .map(source => source.sourceId),
      detail: 'Reviewed institutional directories are evidence candidates, not collection authority; no candidate may be ingested until its endpoint contract is separately reviewed.',
      nextAction: 'Select high-value institutional candidates and perform endpoint-specific collection and rights review.',
      requires: ['manual-review', 'code'],
    });
  }

  for (const dossier of dossierSummaries) {
    const noPrimary = dossier.eventCoverage.filter(event => !event.hasPrimaryEvidence);
    if (noPrimary.length > 0) {
      gaps.push({
        id: `evidence:dossier:${dossier.dossierId}:events-without-primary-evidence`,
        domain: 'evidence-coverage',
        type: 'event-primary-evidence-gap',
        severity: 'high',
        observed: noPrimary.length,
        target: 0,
        affectedIds: noPrimary.map(event => event.eventId),
        detail: 'One or more dossier events currently lack a linked record whose source role is primary evidence or primary disclosure.',
        nextAction: 'Research and link issuing-institution records without replacing attributed reporting or official positions.',
        requires: ['manual-review'],
      });
    }

    const zeroReporting = dossier.eventCoverage.filter(event => event.reportingSourceCount === 0);
    if (zeroReporting.length > 0) {
      gaps.push({
        id: `news:dossier:${dossier.dossierId}:events-without-reporting`,
        domain: 'news-coverage',
        type: 'event-reporting-gap',
        severity: 'medium',
        observed: zeroReporting.length,
        target: 0,
        affectedIds: zeroReporting.map(event => event.eventId),
        detail: 'Some dossier events have no claim-origin source classified as independent reporting in the current dossier snapshot.',
        nextAction: 'Research independent reporting relevant to the affected events; do not infer corroboration from institutional repetition.',
        requires: ['manual-review'],
      });
    }

    const singleReporting = dossier.eventCoverage.filter(event => event.reportingSourceCount === 1);
    if (singleReporting.length > 0) {
      gaps.push({
        id: `news:dossier:${dossier.dossierId}:single-reporting-source-events`,
        domain: 'news-coverage',
        type: 'single-reporting-source-event',
        severity: 'medium',
        observed: singleReporting.length,
        target: 'independent reporting redundancy where relevant and available',
        affectedIds: singleReporting.map(event => event.eventId),
        detail: 'One or more dossier events currently have exactly one claim-origin source classified as reporting.',
        nextAction: 'Research independent reporting redundancy while preserving distinct source roles and provenance.',
        requires: ['manual-review'],
      });
    }

    if (dossier.unresolvedClaimCount > 0) {
      gaps.push({
        id: `evidence:dossier:${dossier.dossierId}:unresolved-claims`,
        domain: 'evidence-coverage',
        type: 'unresolved-claims',
        severity: 'high',
        observed: dossier.unresolvedClaimCount,
        target: 'resolve only when additional evidence changes the explicit claim state',
        affectedIds: dossier.unresolvedClaims.map(claim => claim.claimId),
        detail: 'The dossier contains claims explicitly marked unreviewed, single-source, contradicted, or disputed.',
        nextAction: 'Seek independent evidence or primary records; preserve unresolved states when the evidence does not justify a transition.',
        requires: ['manual-review'],
      });
    }

    if (dossier.unknownCount > 0) {
      gaps.push({
        id: `evidence:dossier:${dossier.dossierId}:known-unknowns`,
        domain: 'evidence-coverage',
        type: 'known-unknowns',
        severity: 'medium',
        observed: dossier.unknownCount,
        target: 'reduce through attributable evidence while preserving genuinely unresolved unknowns',
        affectedIds: [dossier.dossierId],
        detail: 'The dossier explicitly preserves unresolved unknowns rather than filling them with inference.',
        nextAction: 'Research the named unknowns and append evidence only when provenance and identity contracts are satisfied.',
        requires: ['manual-review'],
      });
    }

    const missingCorrectionArtifacts = dossier.corrections.filter(
      correction => correction.originalArtifactRetained === false
    );
    if (missingCorrectionArtifacts.length > 0) {
      gaps.push({
        id: `evidence:dossier:${dossier.dossierId}:correction-artifact-retention`,
        domain: 'evidence-coverage',
        type: 'correction-artifact-retention',
        severity: 'medium',
        observed: missingCorrectionArtifacts.length,
        target: 0,
        affectedIds: missingCorrectionArtifacts.map(correction => correction.correctionId),
        detail: 'A documented correction is present but the original mistaken artifact is not retained in the dossier snapshot.',
        nextAction: 'Locate an authoritative or immutable copy of the corrected-away artifact if one is legitimately available.',
        requires: ['manual-review'],
      });
    }
  }

  if (operationalHealth.status === 'available' && operationalHealth.degradedSources > 0) {
    gaps.push({
      id: 'operations:degraded-news-sources',
      domain: 'operations',
      type: 'degraded-source-health',
      severity: 'high',
      observed: operationalHealth.degradedSources,
      target: 0,
      affectedIds: operationalHealth.degradedSourceIds,
      detail: 'The latest matching source-health snapshot contains one or more degraded live feeds.',
      nextAction: 'Investigate endpoint health separately from provenance and usage-rights decisions.',
      requires: ['code'],
    });
  }

  return gaps.sort((a, b) => a.id.localeCompare(b.id));
}

function validateDossierSummary(dossier, issues) {
  if (!plainObject(dossier) || !text(dossier.dossierId)) {
    issues.semanticErrors.push('evidenceCoverage.dossier:invalid');
    return;
  }
  if (dossier.integrityValid !== true) issues.semanticErrors.push(`dossier.${dossier.dossierId}:integrity-invalid`);
  for (const [countField, arrayField] of [
    ['unresolvedClaimCount', 'unresolvedClaims'],
    ['terminalClaimCount', 'terminalClaims'],
    ['correctionCount', 'corrections'],
  ]) {
    if (!Array.isArray(dossier[arrayField])) issues.structureErrors.push(`dossier.${dossier.dossierId}.${arrayField}:not-array`);
    else if (dossier[countField] !== dossier[arrayField].length) issues.countErrors.push(`dossier.${dossier.dossierId}.${countField}`);
  }
  if (!Array.isArray(dossier.eventCoverage)) issues.structureErrors.push(`dossier.${dossier.dossierId}.eventCoverage:not-array`);
  else {
    issues.duplicateIds.push(
      ...duplicates(dossier.eventCoverage.map(event => event?.eventId).filter(text)).map(
        id => `${dossier.dossierId}:event:${id}`
      )
    );
  }
}

function nextActionForNewsGap(type) {
  const actions = {
    'regional-redundancy': 'Research additional independently operated reporting inputs for the affected region, then run source admission before collection.',
    'source-language-diversity': 'Research reliable source-language inputs and preserve translation provenance.',
    'portfolio-language-concentration': 'Expand reviewed non-English source-language coverage without imposing a quota on conclusions.',
    'evidence-role': 'Review primary institutional evidence endpoints separately from the news-feed contract.',
    'geographic-scope': 'Research subnational and local reporting inputs where strategically relevant.',
    'provenance-integrity': 'Repair provenance registry integrity before relying on coverage telemetry.',
    'source-admission-integrity': 'Repair source-admission integrity before admitting or reclassifying sources.',
    'source-admission-review': 'Complete the remaining legacy usage-rights reviews.',
    'source-admission-remediation': 'Establish an authorized use path or restrictive fallback for affected sources.',
  };
  return actions[type] || 'Review the observed gap against the canonical source and evidence contracts.';
}

function requirementsForNewsGap(type) {
  if (['source-admission-review', 'source-admission-remediation'].includes(type)) return ['manual-review', 'licensing'];
  if (['provenance-integrity', 'source-admission-integrity'].includes(type)) return ['code', 'manual-review'];
  return ['manual-review'];
}

function groupedCount(records, field) {
  const counts = new Map();
  for (const record of records) {
    const value = text(record?.[field]) ? record[field] : 'unknown';
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({ value, count }));
}

function finishValidation(issues) {
  for (const field of Object.keys(issues)) issues[field] = unique(issues[field]);
  return {
    valid: Object.values(issues).every(values => values.length === 0),
    ...issues,
  };
}

function cloneArray(value) {
  return Array.isArray(value) ? value.map(item => (plainObject(item) ? { ...item } : item)) : [];
}

function cloneObject(value) {
  return plainObject(value) ? { ...value } : {};
}

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function unique(values) {
  return [...new Set(values)].sort();
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function byId(field) {
  return (a, b) => String(a?.[field] || '').localeCompare(String(b?.[field] || ''));
}

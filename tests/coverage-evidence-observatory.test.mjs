import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COVERAGE_EVIDENCE_OBSERVATORY_ID,
  COVERAGE_EVIDENCE_OBSERVATORY_VERSION,
  buildCoverageEvidenceObservatory,
  readCachedSourceHealth,
  validateCoverageEvidenceObservatory,
} from '../functions/lib/coverage-evidence-observatory.js';
import { SOURCES, SOURCE_FINGERPRINT } from '../functions/api/news.js';
import { onRequestGet, onRequestOptions } from '../functions/api/intelligence/observatory/coverage.js';

function canonical() {
  return buildCoverageEvidenceObservatory();
}

function mutable(value) {
  return structuredClone(value);
}

test('canonical coverage and evidence observatory validates and preserves semantic separation', () => {
  const observatory = canonical();
  const validation = validateCoverageEvidenceObservatory(observatory);

  assert.equal(observatory.observatoryId, COVERAGE_EVIDENCE_OBSERVATORY_ID);
  assert.equal(observatory.observatoryVersion, COVERAGE_EVIDENCE_OBSERVATORY_VERSION);
  assert.equal(observatory.newsCoverage.totalSources, 19);
  assert.equal(observatory.sourceRights.totalLiveSources, 19);
  assert.equal(observatory.sourceRights.reviewedLiveSources, 2);
  assert.equal(observatory.sourceRights.legacyUnreviewedSources, 17);
  assert.equal(observatory.institutionalEvidence.reviewedSources, 10);
  assert.equal(observatory.institutionalEvidence.endpointReviewedSources, 1);
  assert.equal(observatory.institutionalEvidence.collectionEligibleSources, 1);
  assert.equal(observatory.institutionalEvidence.directoryOnlySources, 9);
  assert.equal(observatory.evidenceCoverage.dossierCount, 1);
  assert.deepEqual(observatory.evidenceCoverage.dossierIds, ['santa-ynez-pipeline']);
  assert.equal(observatory.rules.truthScore, false);
  assert.equal(observatory.rules.editorialVerdict, false);
  assert.equal(observatory.rules.compositeCoverageScore, false);
  assert.equal(observatory.rules.publisherQualityScore, false);
  assert.equal(observatory.rules.newsCoverageIsEvidenceCoverage, false);
  assert.equal(observatory.rules.collectionEligibilityRequiresEndpointReview, true);
  assert.equal(observatory.rules.reviewedDirectoryIsCollectionAuthority, false);
  assert.equal(validation.valid, true, JSON.stringify(validation));
});

test('dossier observability derives unresolved claims, evidence classes, corrections, and explicit gaps', () => {
  const observatory = canonical();
  const dossier = observatory.evidenceCoverage.dossiers[0];
  const documentTypes = new Set(observatory.evidenceCoverage.evidenceClasses.map(item => item.documentType));
  const gapTypes = new Set(observatory.gaps.map(gap => gap.type));

  assert.equal(dossier.integrityValid, true);
  assert.ok(dossier.unresolvedClaimCount > 0);
  assert.ok(dossier.unresolvedClaims.some(claim => claim.state === 'single-source'));
  assert.ok(dossier.unresolvedClaims.some(claim => claim.state === 'disputed'));
  assert.equal(dossier.correctionCount, 1);
  assert.ok(dossier.unknownCount > 0);
  assert.ok(documentTypes.has('judgment'));
  assert.ok(documentTypes.has('regulator-release'));
  assert.ok(documentTypes.has('corporate-filing'));
  assert.ok(documentTypes.has('government-release'));
  assert.ok(gapTypes.has('source-rights-review-debt'));
  assert.ok(gapTypes.has('institutional-collection-eligibility'));
  assert.ok(gapTypes.has('unresolved-claims'));
  assert.ok(gapTypes.has('correction-artifact-retention'));
});

test('observatory validator fails closed on scoring, count drift, unsafe collection, and duplicate gaps', () => {
  const score = mutable(canonical());
  score.rules.truthScore = true;
  assert.equal(validateCoverageEvidenceObservatory(score).valid, false);

  const countDrift = mutable(canonical());
  countDrift.newsCoverage.totalSources = SOURCES.length + 1;
  assert.ok(validateCoverageEvidenceObservatory(countDrift).countErrors.includes('newsCoverage.totalSources'));

  const unsafeCollection = mutable(canonical());
  unsafeCollection.institutionalEvidence.sources[0].collectionEligible = true;
  unsafeCollection.institutionalEvidence.sources[0].collectionState = 'directory-only';
  unsafeCollection.institutionalEvidence.sources[0].verifiedEndpointCount = 0;
  const unsafeValidation = validateCoverageEvidenceObservatory(unsafeCollection);
  assert.equal(unsafeValidation.valid, false);
  assert.ok(unsafeValidation.semanticErrors.some(item => item.includes('unsafe-collection')));

  const duplicateGap = mutable(canonical());
  duplicateGap.gaps.push({ ...duplicateGap.gaps[0] });
  const duplicateValidation = validateCoverageEvidenceObservatory(duplicateGap);
  assert.equal(duplicateValidation.valid, false);
  assert.ok(duplicateValidation.duplicateIds.includes(duplicateGap.gaps[0].id));
});

test('cached health is observational only and rejects stale source identities', async () => {
  assert.equal(await readCachedSourceHealth({}), null);

  const stale = await readCachedSourceHealth({
    NEWS_CACHE: {
      async get() {
        return { sourceFingerprint: 'stale', sourceHealth: [] };
      },
    },
  });
  assert.equal(stale, null);

  const sourceHealth = SOURCES.map((source, index) => ({
    sourceId: `source-${index}`,
    name: source.name,
    lastError: index === 0 ? 'fixture failure' : null,
  }));
  const snapshot = {
    generatedAt: '2026-09-08T20:00:00.000Z',
    sourceFingerprint: SOURCE_FINGERPRINT,
    sourceHealth,
  };
  const accepted = await readCachedSourceHealth({
    NEWS_CACHE: {
      async get() {
        return snapshot;
      },
    },
  });
  assert.equal(accepted, snapshot);

  const observatory = buildCoverageEvidenceObservatory({ healthSnapshot: accepted });
  assert.equal(observatory.operationalHealth.status, 'available');
  assert.equal(observatory.operationalHealth.degradedSources, 1);
  assert.ok(observatory.gaps.some(gap => gap.type === 'degraded-source-health'));
});

test('observatory API returns only integrity-valid payloads and supports CORS preflight', async () => {
  const request = new Request('https://globaldeets.com/api/intelligence/observatory/coverage', {
    headers: { Origin: 'https://globaldeets.com' },
  });
  const response = await onRequestGet({ env: {}, request });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.integrity.valid, true);
  assert.equal(payload.observatoryId, COVERAGE_EVIDENCE_OBSERVATORY_ID);
  assert.equal(payload.rules.truthScore, false);
  assert.equal(payload.rules.newsCoverageIsEvidenceCoverage, false);
  assert.equal(payload.institutionalEvidence.collectionEligibleSources, 1);

  const preflight = await onRequestOptions({ request });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://globaldeets.com');
});

#!/usr/bin/env node

function getArgValue(name) {
  const arg = process.argv.find(value => value.startsWith(name));
  return arg ? arg.slice(name.length) : null;
}

const BASE = (getArgValue('--base=') || 'https://globaldeets.com').replace(/\/$/, '');
const TIMEOUT_MS = 12_000;

async function request(path) {
  return fetch(`${BASE}${path}`, {
    headers: {
      'User-Agent': 'GlobalDeets-IntelligenceVerifier/1.0',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function fetchJson(path) {
  const response = await request(path);
  if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`${path} returned unexpected content-type ${contentType}`);
  }
  return response.json();
}

async function fetchText(path) {
  const response = await request(path);
  if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    throw new Error(`${path} returned unexpected content-type ${contentType}`);
  }
  return response.text();
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const [coverage, sources, admission, schema, evidenceSchema, dossier, dossierPage] =
    await Promise.all([
      fetchJson('/api/news/coverage'),
      fetchJson('/api/news/sources'),
      fetchJson('/api/news/admission'),
      fetchJson('/api/intelligence/schema'),
      fetchJson('/api/intelligence/evidence-schema'),
      fetchJson('/api/intelligence/dossiers/santa-ynez-pipeline'),
      fetchText('/dossiers/santa-ynez-pipeline/'),
    ]);

  requireCondition(typeof coverage.sourceFingerprint === 'string', 'coverage fingerprint missing');
  requireCondition(typeof sources.sourceFingerprint === 'string', 'sources fingerprint missing');
  requireCondition(typeof admission.sourceFingerprint === 'string', 'admission source fingerprint missing');
  requireCondition(
    coverage.sourceFingerprint === sources.sourceFingerprint &&
      sources.sourceFingerprint === admission.sourceFingerprint,
    'coverage, provenance, and admission source fingerprints disagree'
  );
  requireCondition(coverage.provenance?.valid === true, 'coverage provenance validation failed');
  requireCondition(coverage.admission?.valid === true, 'coverage admission validation failed');
  requireCondition(sources.validation?.valid === true, 'source registry validation failed');
  requireCondition(admission.validation?.valid === true, 'source admission registry validation failed');
  requireCondition(Number.isInteger(coverage.totalSources), 'coverage totalSources missing');
  requireCondition(Number.isInteger(sources.totalSources), 'sources totalSources missing');
  requireCondition(Array.isArray(sources.sources), 'sources array missing');
  requireCondition(Array.isArray(admission.liveAdmissions), 'live admission array missing');
  requireCondition(Array.isArray(admission.researchCandidates), 'admission research candidate array missing');
  requireCondition(Array.isArray(coverage.gaps), 'coverage gaps array missing');
  requireCondition(
    coverage.totalSources === sources.totalSources &&
      sources.totalSources === sources.sources.length &&
      sources.totalSources === admission.liveAdmissions.length,
    'source counts disagree across intelligence APIs'
  );
  requireCondition(
    sources.sources.every(source => Array.isArray(source.evidenceUrls) && source.evidenceUrls.length > 0),
    'one or more source provenance records lack evidence URLs'
  );
  requireCondition(typeof admission.admissionFingerprint === 'string', 'admission fingerprint missing');
  requireCondition(admission.rules?.newSourcesRequireReviewedAdmission === true, 'new source admission gate changed');
  requireCondition(admission.rules?.legacyUnreviewedMayRemainTemporarily === true, 'legacy migration boundary changed');
  requireCondition(admission.rules?.endpointAuthorityIsUsagePermission === false, 'endpoint authority must remain separate from usage permission');
  requireCondition(admission.rules?.feedHealthIsUsagePermission === false, 'feed health must remain separate from usage permission');
  requireCondition(admission.rules?.itemRestrictionsOverrideSourcePermission === true, 'item restriction override contract changed');
  requireCondition(admission.rules?.admissionMetadataChangesNewsCacheIdentity === false, 'admission metadata must not alter news cache identity');
  requireCondition(
    admission.liveAdmissions.every(entry => ['legacy-unreviewed', 'reviewed'].includes(entry.reviewState)),
    'one or more live admissions lack explicit migration state'
  );

  requireCondition(typeof schema.modelVersion === 'string', 'intelligence model version missing');
  requireCondition(Array.isArray(schema.entityTypes) && schema.entityTypes.includes('place'), 'place entity type missing');
  requireCondition(Array.isArray(schema.eventStatuses) && schema.eventStatuses.includes('disputed'), 'event status contract missing');
  requireCondition(schema.identityRules?.automaticNameMerge === false, 'automatic name merge must remain disabled');
  requireCondition(schema.identityRules?.ambiguousAliasResolution === 'ambiguous', 'ambiguous alias contract changed');
  requireCondition(schema.identityRules?.aliasesRequireEvidence === true, 'alias evidence contract changed');
  requireCondition(schema.identityRules?.placeIdentityStandard === 'UN M49', 'place identity standard changed');
  requireCondition(schema.placeSeed?.complete === false, 'partial place seed must not claim completeness');
  requireCondition(Number.isInteger(schema.placeSeed?.count) && schema.placeSeed.count > 0, 'place seed count missing');
  requireCondition(schema.placeSeed?.runtimeFetchRequired === false, 'production must not depend on live M49 fetching');

  requireCondition(typeof evidenceSchema.modelVersion === 'string', 'claim/evidence model version missing');
  requireCondition(Array.isArray(evidenceSchema.claimTypes) && evidenceSchema.claimTypes.includes('allegation'), 'claim type contract missing');
  requireCondition(Array.isArray(evidenceSchema.claimStates) && evidenceSchema.claimStates.includes('contradicted'), 'claim state contract missing');
  requireCondition(Array.isArray(evidenceSchema.evidenceDocumentTypes) && evidenceSchema.evidenceDocumentTypes.includes('court-filing'), 'evidence document contract missing');
  requireCondition(evidenceSchema.rules?.truthScore === false, 'truth score must remain disabled');
  requireCondition(evidenceSchema.rules?.contradictoryClaimsMayCoexist === true, 'contradictory claim coexistence contract changed');
  requireCondition(evidenceSchema.rules?.independentCorroborationRequiresDistinctOriginSource === true, 'independent corroboration contract changed');
  requireCondition(evidenceSchema.rules?.supersessionDeletesHistory === false, 'supersession must preserve history');
  requireCondition(evidenceSchema.rules?.knowledgeCatalogIsIngestionAuthority === false, 'Knowledge catalog must not become ingestion authority');
  requireCondition(evidenceSchema.rules?.machineReadableEndpointRequiresSeparateReview === true, 'endpoint review boundary changed');
  requireCondition(evidenceSchema.rules?.bulkCollectionEnabled === false, 'bulk evidence collection must remain disabled in GD-015');
  requireCondition(Number.isInteger(evidenceSchema.institutionalSources?.reviewedSources) && evidenceSchema.institutionalSources.reviewedSources > 0, 'reviewed institutional source count missing');
  requireCondition(evidenceSchema.institutionalSources?.collectionEligibleSources === 0, 'GD-015 must not silently enable institutional collection');

  requireCondition(dossier.dossierId === 'santa-ynez-pipeline', 'Santa Ynez dossier identity changed');
  requireCondition(typeof dossier.dossierVersion === 'string', 'Santa Ynez dossier version missing');
  requireCondition(dossier.validation?.valid === true, 'Santa Ynez graph validation failed');
  requireCondition(dossier.integrity?.valid === true, 'Santa Ynez dossier integrity failed');
  requireCondition(dossier.rules?.truthScore === false, 'dossier truth score must remain disabled');
  requireCondition(dossier.rules?.editorialVerdict === false, 'dossier editorial verdict must remain disabled');
  requireCondition(Array.isArray(dossier.entities) && dossier.entities.length === 10, 'Santa Ynez entity count changed');
  requireCondition(Array.isArray(dossier.events) && dossier.events.length === 7, 'Santa Ynez event count changed');
  requireCondition(Array.isArray(dossier.claims) && dossier.claims.length === 11, 'Santa Ynez claim count changed');
  requireCondition(Array.isArray(dossier.evidence) && dossier.evidence.length === 8, 'Santa Ynez evidence count changed');
  requireCondition(Array.isArray(dossier.timeline) && dossier.timeline.length >= 7, 'Santa Ynez chronology missing');
  requireCondition(
    Array.isArray(dossier.claimRelations) && dossier.claimRelations.some(relation => relation.relation === 'contradicts'),
    'Santa Ynez contradiction relationship missing'
  );
  const correction = Array.isArray(dossier.corrections)
    ? dossier.corrections.find(item => item.id === 'correction:doj:2026-09-03')
    : null;
  requireCondition(correction?.status === 'corrected', 'DOJ correction record missing');
  requireCondition(correction?.originalArtifactRetained === false, 'DOJ correction provenance state changed');
  requireCondition(Array.isArray(dossier.unknowns) && dossier.unknowns.length > 0, 'Santa Ynez unresolved unknowns missing');
  requireCondition(
    dossierPage.includes('data-dossier-id="santa-ynez-pipeline"'),
    'Santa Ynez dossier page identity marker missing'
  );
  requireCondition(
    dossierPage.includes('id="dossier-app"') && dossierPage.includes('Evidence dossier'),
    'Santa Ynez dossier page shell missing'
  );

  console.log(
    `Intelligence APIs certified: ${sources.totalSources} sources, ${coverage.gaps.length} coverage gaps, ${schema.placeSeed.count} place identities, ${evidenceSchema.institutionalSources.reviewedSources} reviewed institutional candidates, admission ${admission.admissionFingerprint}, models ${schema.modelVersion}/${evidenceSchema.modelVersion}, dossier ${dossier.dossierVersion}`
  );
})().catch(error => {
  console.error(`Intelligence API verification failed: ${error.message}`);
  process.exit(1);
});

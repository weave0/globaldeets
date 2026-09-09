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
  const [coverage, sources, admission, schema, evidenceSchema, acquisition, dossier, dossierPage] =
    await Promise.all([
      fetchJson('/api/news/coverage'),
      fetchJson('/api/news/sources'),
      fetchJson('/api/news/admission'),
      fetchJson('/api/intelligence/schema'),
      fetchJson('/api/intelligence/evidence-schema'),
      fetchJson('/api/intelligence/acquisition/eurostat-density'),
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

  requireCondition(sources.totalSources === 21, 'GD-019 source count changed');
  const minnesota = admission.liveAdmissions.find(entry => entry.sourceId === 'minnesota-reformer');
  const calmatters = admission.liveAdmissions.find(entry => entry.sourceId === 'calmatters');
  for (const [label, entry] of [
    ['Minnesota Reformer', minnesota],
    ['CalMatters', calmatters],
  ]) {
    requireCondition(Boolean(entry), `${label} admission missing`);
    requireCondition(entry.legacy === false, `${label} was incorrectly marked legacy`);
    requireCondition(entry.reviewState === 'reviewed', `${label} admission review state changed`);
    requireCondition(entry.allowedUseStatus === 'verified-public-use', `${label} usage state changed`);
    requireCondition(entry.endpointAuthority === 'first-party', `${label} endpoint authority changed`);
    requireCondition(entry.healthVerificationStatus === 'verified', `${label} admission health review changed`);
    requireCondition(entry.itemLevelReviewRequired === false, `${label} unexpectedly requires item-level gating`);
  }
  const laist = admission.researchCandidates.find(entry => entry.candidateId === 'laist-local');
  requireCondition(laist?.disposition === 'research', 'LAist research-only disposition changed');
  requireCondition(laist?.itemLevelReviewRequired === true, 'LAist mixed-origin item blocker disappeared');
  requireCondition(!admission.liveAdmissions.some(entry => entry.sourceId === 'laist'), 'LAist silently entered live admission');

  requireCondition(coverage.subnationalReporting?.sourceCount === 2, 'GD-019 subnational source count changed');
  requireCondition(coverage.subnationalReporting?.jurisdictionCount === 2, 'GD-019 subnational jurisdiction count changed');
  requireCondition(
    JSON.stringify(coverage.subnationalReporting?.jurisdictionIds || []) === JSON.stringify(['US-CA', 'US-MN']),
    'GD-019 jurisdiction identities changed'
  );
  requireCondition(coverage.subnationalReporting?.operatorCount === 2, 'GD-019 subnational operator diversity changed');
  requireCondition(coverage.localityRules?.routingRegionIsGeographicScope === false, 'routing region became geographic scope');
  requireCondition(coverage.localityRules?.publisherOriginIsEventLocality === false, 'publisher origin became event locality');
  requireCondition(coverage.localityRules?.sourceScopeMakesEveryItemLocal === false, 'source scope became automatic item locality');
  requireCondition(coverage.localityRules?.subnationalReportingIsPrimaryEvidence === false, 'subnational reporting became primary evidence');
  requireCondition(coverage.localityRules?.localPublisherImpliesIndependentCorroboration === false, 'local publisher became automatic corroboration');
  requireCondition(
    !coverage.gaps.some(gap => gap.id === 'geographic-scope:subnational'),
    'zero-subnational gap remained after admitted pilot'
  );

  // Force the canonical news path to initialize the current source-fingerprinted feed/health snapshot,
  // then verify both newly admitted endpoints returned parsable stories rather than merely HTTP 200.
  await fetchJson('/api/news?region=americas&limit=100');
  const newsHealth = await fetchJson('/api/news/health');
  requireCondition(newsHealth.sourceFingerprint === coverage.sourceFingerprint, 'news health fingerprint disagrees with coverage');
  requireCondition(newsHealth.totalSources === 21, 'news health source count changed');
  for (const sourceId of ['minnesota-reformer', 'calmatters']) {
    const health = newsHealth.sourceHealth?.find(entry => entry.sourceId === sourceId);
    requireCondition(Boolean(health), `${sourceId} production health record missing`);
    requireCondition(health.lastError == null, `${sourceId} production feed is degraded: ${health.lastError}`);
    requireCondition(Number.isInteger(health.storyCount) && health.storyCount > 0, `${sourceId} returned no parsable stories`);
  }

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
  requireCondition(typeof evidenceSchema.acquisitionVersion === 'string', 'institutional acquisition model version missing');
  requireCondition(Array.isArray(evidenceSchema.claimTypes) && evidenceSchema.claimTypes.includes('allegation'), 'claim type contract missing');
  requireCondition(Array.isArray(evidenceSchema.claimStates) && evidenceSchema.claimStates.includes('contradicted'), 'claim state contract missing');
  requireCondition(Array.isArray(evidenceSchema.evidenceDocumentTypes) && evidenceSchema.evidenceDocumentTypes.includes('court-filing'), 'evidence document contract missing');
  requireCondition(evidenceSchema.rules?.truthScore === false, 'truth score must remain disabled');
  requireCondition(evidenceSchema.rules?.contradictoryClaimsMayCoexist === true, 'contradictory claim coexistence contract changed');
  requireCondition(evidenceSchema.rules?.independentCorroborationRequiresDistinctOriginSource === true, 'independent corroboration contract changed');
  requireCondition(evidenceSchema.rules?.supersessionDeletesHistory === false, 'supersession must preserve history');
  requireCondition(evidenceSchema.rules?.knowledgeCatalogIsIngestionAuthority === false, 'Knowledge catalog must not become ingestion authority');
  requireCondition(evidenceSchema.rules?.machineReadableEndpointRequiresSeparateReview === true, 'endpoint review boundary changed');
  requireCondition(evidenceSchema.rules?.collectionEligibilityRequiresReviewedEndpoint === true, 'collection eligibility gate changed');
  requireCondition(evidenceSchema.rules?.arbitraryEndpointCollectionAllowed === false, 'arbitrary endpoint collection must remain disabled');
  requireCondition(evidenceSchema.rules?.observatoryIsCollectionAuthority === false, 'observatory must not become collection authority');
  requireCondition(evidenceSchema.rules?.acquiredEvidenceAutomaticallyMutatesClaims === false, 'acquisition must not mutate claim state automatically');
  requireCondition(evidenceSchema.rules?.retrievalFailureUsesStaleArtifact === false, 'retrieval failure must not silently serve stale evidence');
  requireCondition(evidenceSchema.rules?.bulkCollectionEnabled === false, 'bulk evidence collection must remain disabled');
  requireCondition(evidenceSchema.institutionalSources?.reviewedSources === 10, 'reviewed institutional source count changed');
  requireCondition(evidenceSchema.institutionalSources?.endpointReviewedSources === 1, 'GD-018 endpoint-reviewed source count changed');
  requireCondition(evidenceSchema.institutionalSources?.collectionEligibleSources === 1, 'GD-018 governed collection source count changed');
  requireCondition(evidenceSchema.acquisition?.configuredAcquisitions === 1, 'GD-018 governed acquisition count changed');
  requireCondition(evidenceSchema.acquisition?.registryValid === true, 'GD-018 acquisition registry invalid');
  requireCondition(evidenceSchema.acquisition?.arbitraryEndpointCollectionAllowed === false, 'acquisition registry allows arbitrary endpoints');
  requireCondition(evidenceSchema.acquisition?.automaticClaimMutation === false, 'acquisition registry allows automatic claim mutation');
  requireCondition(evidenceSchema.acquisition?.staleArtifactFallbackOnFailure === false, 'acquisition registry allows stale fallback');

  requireCondition(acquisition.acquisition?.registryValid === true, 'live governed acquisition registry invalid');
  requireCondition(acquisition.acquisition?.configuredAcquisitions === 1, 'live governed acquisition count changed');
  requireCondition(acquisition.artifact?.acquisitionId === 'eurostat:population-density:eu27-latest', 'Eurostat acquisition identity changed');
  requireCondition(acquisition.artifact?.sourceId === 'knowledge:economy:eurostat', 'Eurostat source identity changed');
  requireCondition(acquisition.artifact?.endpointId === 'eurostat:statistics-api:demo-r-d3dens:eu27-latest', 'Eurostat endpoint identity changed');
  requireCondition(acquisition.artifact?.payload?.source === 'ESTAT', 'Eurostat publisher identity not verified');
  requireCondition(/^sha256:[0-9a-f]{64}$/.test(acquisition.artifact?.contentDigest || ''), 'Eurostat artifact content digest missing');
  requireCondition(Array.isArray(acquisition.artifact?.claimIds) && acquisition.artifact.claimIds.length === 0, 'acquired artifact silently linked claims');
  requireCondition(acquisition.artifact?.claimStateMutation === false, 'acquired artifact silently mutated claim state');
  requireCondition(acquisition.artifact?.truthDetermination === false, 'acquired artifact made a truth determination');

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
    `Intelligence APIs certified: ${sources.totalSources} news sources, ${coverage.subnationalReporting.sourceCount} subnational sources / ${coverage.subnationalReporting.jurisdictionCount} jurisdictions, ${coverage.gaps.length} coverage gaps, ${schema.placeSeed.count} place identities, ${evidenceSchema.institutionalSources.reviewedSources} institutional candidates / ${evidenceSchema.institutionalSources.collectionEligibleSources} governed collection source, acquisition ${acquisition.artifact.artifactId}, admission ${admission.admissionFingerprint}, models ${schema.modelVersion}/${evidenceSchema.modelVersion}, dossier ${dossier.dossierVersion}`
  );
})().catch(error => {
  console.error(`Intelligence API verification failed: ${error.message}`);
  process.exit(1);
});

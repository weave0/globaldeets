#!/usr/bin/env node

function getArgValue(name) {
  const arg = process.argv.find(value => value.startsWith(name));
  return arg ? arg.slice(name.length) : null;
}

const BASE = (getArgValue('--base=') || 'https://globaldeets.com').replace(/\/$/, '');
const TIMEOUT_MS = 12_000;

async function fetchJson(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      'User-Agent': 'GlobalDeets-IntelligenceVerifier/1.0',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`${path} returned unexpected content-type ${contentType}`);
  }
  return response.json();
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const [coverage, sources, schema, evidenceSchema] = await Promise.all([
    fetchJson('/api/news/coverage'),
    fetchJson('/api/news/sources'),
    fetchJson('/api/intelligence/schema'),
    fetchJson('/api/intelligence/evidence-schema'),
  ]);

  requireCondition(typeof coverage.sourceFingerprint === 'string', 'coverage fingerprint missing');
  requireCondition(typeof sources.sourceFingerprint === 'string', 'sources fingerprint missing');
  requireCondition(coverage.sourceFingerprint === sources.sourceFingerprint, 'coverage and source provenance fingerprints disagree');
  requireCondition(coverage.provenance?.valid === true, 'coverage provenance validation failed');
  requireCondition(sources.validation?.valid === true, 'source registry validation failed');
  requireCondition(Number.isInteger(coverage.totalSources), 'coverage totalSources missing');
  requireCondition(Number.isInteger(sources.totalSources), 'sources totalSources missing');
  requireCondition(Array.isArray(sources.sources), 'sources array missing');
  requireCondition(Array.isArray(coverage.gaps), 'coverage gaps array missing');
  requireCondition(coverage.totalSources === sources.totalSources && sources.totalSources === sources.sources.length, 'source counts disagree across intelligence APIs');
  requireCondition(sources.sources.every(source => Array.isArray(source.evidenceUrls) && source.evidenceUrls.length > 0), 'one or more source provenance records lack evidence URLs');

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

  console.log(`Intelligence APIs certified: ${sources.totalSources} sources, ${coverage.gaps.length} coverage gaps, ${schema.placeSeed.count} place identities, ${evidenceSchema.institutionalSources.reviewedSources} reviewed institutional candidates, models ${schema.modelVersion}/${evidenceSchema.modelVersion}`);
})().catch(error => {
  console.error(`Intelligence API verification failed: ${error.message}`);
  process.exit(1);
});

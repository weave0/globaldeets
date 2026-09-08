import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INSTITUTIONAL_ACQUISITIONS,
  acquireInstitutionalEvidence,
  acquisitionSummary,
  validateAcquiredArtifact,
  validateAcquisitionRegistry,
} from '../functions/lib/institutional-evidence-acquisition.js';
import {
  REVIEWED_INSTITUTIONAL_SOURCES,
  institutionalRegistrySummary,
  validateInstitutionalSourceRegistry,
} from '../functions/lib/institutional-evidence-sources.js';
import knowledgeCatalog from '../data/knowledge-sources.json' with { type: 'json' };
import { onRequestGet } from '../functions/api/intelligence/acquisition/eurostat-density.js';

const EUROSTAT_PAYLOAD = JSON.stringify({
  version: '2.0',
  class: 'dataset',
  label: 'Population density',
  source: 'ESTAT',
  updated: '2026-09-08T00:00:00+0200',
  id: ['freq', 'unit', 'geo', 'time'],
  size: [1, 1, 1, 1],
  value: { 0: 109.2 },
});

function response(body = EUROSTAT_PAYLOAD, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clone(value) {
  return structuredClone(value);
}

test('GD-018 promotes only reviewed endpoint authority while leaving most institutional candidates ineligible', () => {
  const validation = validateInstitutionalSourceRegistry(knowledgeCatalog);
  const summary = institutionalRegistrySummary();
  assert.equal(validation.valid, true);
  assert.equal(summary.reviewedSources, 10);
  assert.equal(summary.endpointReviewedSources, 1);
  assert.equal(summary.collectionEligibleSources, 1);
  assert.equal(summary.collectionEligibleEndpoints, 1);
  assert.equal(summary.knowledgeCatalogIsIngestionAuthority, false);
  assert.equal(summary.observatoryIsCollectionAuthority, false);
  assert.equal(REVIEWED_INSTITUTIONAL_SOURCES.filter(item => !item.collectionEligible).length, 9);
});

test('directory review cannot self-promote a candidate to collection authority', () => {
  const registry = clone(REVIEWED_INSTITUTIONAL_SOURCES);
  const un = registry.find(item => item.sourceId === 'knowledge:governance:united-nations');
  un.collectionEligible = true;
  const validation = validateInstitutionalSourceRegistry(knowledgeCatalog, undefined, registry);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.unsafeCollectionRefs, ['knowledge:governance:united-nations']);
});

test('duplicate endpoint identity fails the institutional source registry closed', () => {
  const registry = clone(REVIEWED_INSTITUTIONAL_SOURCES);
  const eurostat = registry.find(item => item.sourceId === 'knowledge:economy:eurostat');
  const cdc = registry.find(item => item.sourceId === 'knowledge:health:cdc-data');
  cdc.machineReadableEndpoints = [clone(eurostat.machineReadableEndpoints[0])];
  const validation = validateInstitutionalSourceRegistry(knowledgeCatalog, undefined, registry);
  assert.equal(validation.valid, false);
  assert.equal(validation.duplicateEndpointIds.length, 1);
  assert.equal(validation.duplicateEndpointUrls.length, 1);
});

test('acquisition registry refuses arbitrary, missing, or non-eligible endpoint authority', () => {
  assert.equal(validateAcquisitionRegistry().valid, true);

  const arbitrary = clone(INSTITUTIONAL_ACQUISITIONS);
  arbitrary[0].endpointId = 'arbitrary:url';
  const arbitraryValidation = validateAcquisitionRegistry(arbitrary);
  assert.equal(arbitraryValidation.valid, false);
  assert.deepEqual(arbitraryValidation.endpointMismatches, [arbitrary[0].acquisitionId]);

  const sources = clone(REVIEWED_INSTITUTIONAL_SOURCES);
  const eurostat = sources.find(item => item.sourceId === 'knowledge:economy:eurostat');
  eurostat.collectionEligible = false;
  const nonEligibleValidation = validateAcquisitionRegistry(INSTITUTIONAL_ACQUISITIONS, sources);
  assert.equal(nonEligibleValidation.valid, false);
  assert.deepEqual(nonEligibleValidation.unauthorizedAcquisitions, [INSTITUTIONAL_ACQUISITIONS[0].acquisitionId]);
});

test('governed acquisition never accepts a caller supplied URL and content identity changes with content', async () => {
  const seenUrls = [];
  const fetchImpl = async url => {
    seenUrls.push(url);
    return response();
  };
  const options = { fetchImpl, now: () => new Date('2026-09-08T22:30:00.000Z') };
  const first = await acquireInstitutionalEvidence('eurostat:population-density:eu27-latest', options);
  const second = await acquireInstitutionalEvidence('eurostat:population-density:eu27-latest', options);

  assert.equal(seenUrls.length, 2);
  assert.equal(new Set(seenUrls).size, 1);
  assert.match(seenUrls[0], /^https:\/\/ec\.europa\.eu\/eurostat\/api\/dissemination\/statistics\/1\.0\/data\//);
  assert.equal(first.contentDigest, second.contentDigest);
  assert.equal(first.artifactId, second.artifactId);
  assert.deepEqual(first.claimIds, []);
  assert.equal(first.claimStateMutation, false);
  assert.equal(first.truthDetermination, false);
  assert.equal(validateAcquiredArtifact(first).valid, true);

  const changed = await acquireInstitutionalEvidence('eurostat:population-density:eu27-latest', {
    fetchImpl: async () => response(EUROSTAT_PAYLOAD.replace('109.2', '110.0')),
    now: options.now,
  });
  assert.notEqual(changed.contentDigest, first.contentDigest);
  assert.notEqual(changed.artifactId, first.artifactId);

  await assert.rejects(
    () => acquireInstitutionalEvidence('https://example.com/arbitrary.json', options),
    /not authorized/
  );
});

test('artifact validation rejects source, endpoint, canonical-reference, claim, and truth mutation', async () => {
  const artifact = await acquireInstitutionalEvidence('eurostat:population-density:eu27-latest', {
    fetchImpl: async () => response(),
    now: () => new Date('2026-09-08T22:30:00.000Z'),
  });

  for (const mutation of [
    value => { value.sourceId = 'knowledge:health:cdc-data'; },
    value => { value.endpointId = 'arbitrary:endpoint'; },
    value => { value.canonicalRef = 'https://example.com/drift'; },
    value => { value.claimIds = ['claim:invented']; },
    value => { value.claimStateMutation = true; },
    value => { value.truthDetermination = true; },
  ]) {
    const copy = clone(artifact);
    mutation(copy);
    assert.equal(validateAcquiredArtifact(copy).valid, false);
  }
});

test('retrieval failure and publisher mismatch fail closed without stale artifact fallback', async () => {
  await assert.rejects(
    () => acquireInstitutionalEvidence('eurostat:population-density:eu27-latest', {
      fetchImpl: async () => response('upstream failure', 503),
    }),
    /HTTP 503/
  );
  await assert.rejects(
    () => acquireInstitutionalEvidence('eurostat:population-density:eu27-latest', {
      fetchImpl: async () => response(JSON.stringify({ source: 'NOT_ESTAT' })),
    }),
    /publisher identity mismatch/
  );
  assert.equal(acquisitionSummary().staleArtifactFallbackOnFailure, false);
});

test('production acquisition API exposes a content-addressed artifact and fails closed on upstream failure', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => response();
    const ok = await onRequestGet({ request: new Request('https://globaldeets.com/api/intelligence/acquisition/eurostat-density') });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(body.acquisition.arbitraryEndpointCollectionAllowed, false);
    assert.equal(body.acquisition.automaticClaimMutation, false);
    assert.equal(body.artifact.claimStateMutation, false);
    assert.match(body.artifact.contentDigest, /^sha256:[0-9a-f]{64}$/);

    globalThis.fetch = async () => response('failure', 500);
    const failed = await onRequestGet({ request: new Request('https://globaldeets.com/api/intelligence/acquisition/eurostat-density') });
    const failureBody = await failed.json();
    assert.equal(failed.status, 503);
    assert.equal(failureBody.staleArtifactFallbackUsed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

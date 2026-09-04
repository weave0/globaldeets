import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'globaldeets-evidence-'));
const functions = join(root, 'functions');
const files = [
  ['../functions/lib/intelligence-model.js', join(functions, 'lib', 'intelligence-model.js')],
  ['../functions/lib/claim-evidence-model.js', join(functions, 'lib', 'claim-evidence-model.js')],
  ['../functions/lib/institutional-evidence-sources.js', join(functions, 'lib', 'institutional-evidence-sources.js')],
  ['../functions/api/intelligence/evidence-schema.js', join(functions, 'api', 'intelligence', 'evidence-schema.js')],
];
for (const [, target] of files) mkdirSync(dirname(target), { recursive: true });
writeFileSync(join(functions, 'package.json'), '{"type":"module"}\n');
for (const [source, target] of files) copyFileSync(fileURLToPath(new URL(source, import.meta.url)), target);

const identity = await import(pathToFileURL(join(functions, 'lib', 'intelligence-model.js')).href);
const model = await import(pathToFileURL(join(functions, 'lib', 'claim-evidence-model.js')).href);
const institutions = await import(pathToFileURL(join(functions, 'lib', 'institutional-evidence-sources.js')).href);
const api = await import(pathToFileURL(join(functions, 'api', 'intelligence', 'evidence-schema.js')).href);
const knowledgeCatalog = JSON.parse(readFileSync(fileURLToPath(new URL('../data/knowledge-sources.json', import.meta.url)), 'utf8'));
const EVIDENCE_URL = 'https://example.com/source';

function claim(originSourceId, claimKey, proposition = 'A reviewed proposition', state = 'single-source') {
  return model.createClaim({
    originSourceId,
    claimKey,
    proposition,
    type: 'fact-assertion',
    state,
    originRef: `https://example.com/${originSourceId}/${claimKey}`,
    sourceWording: proposition,
  });
}

function basicGraph() {
  const place = identity.createM49PlaceEntity({
    displayName: 'United States of America',
    m49: '840',
    isoAlpha2: 'US',
    isoAlpha3: 'USA',
    evidenceRefs: [EVIDENCE_URL],
  });
  const person = identity.createEntity({ identityKey: 'person:test:1', displayName: 'Alex Kim', type: 'person' });
  const issuer = institutions.INSTITUTIONAL_ENTITIES.find(entity => entity.identityKey === 'institution:un');
  const event = identity.createEvent({
    eventKey: 'event:test:1',
    title: 'Test event',
    eventType: 'incident',
    status: 'developing',
    entityIds: [person.id],
    placeEntityIds: [place.id],
  });
  return { place, person, issuer, event };
}

test('claim identity is explicit and survives proposition edits without collapsing distinct sources', () => {
  const first = claim('source-a', 'claim-001', 'Initial wording');
  const revised = claim('source-a', 'claim-001', 'Corrected wording');
  const secondSource = claim('source-b', 'claim-001', 'Initial wording');
  assert.equal(first.id, revised.id);
  assert.notEqual(first.id, secondSource.id);
  assert.notEqual(first.proposition, revised.proposition);
});

test('disputed and contradictory claims coexist and no relation chooses a silent winner', () => {
  const yes = claim('source-a', 'claim-yes', 'The event occurred.', 'disputed');
  const no = claim('source-b', 'claim-no', 'The event did not occur.', 'contradicted');
  const relation = model.createClaimRelation({ claimId: yes.id, relatedClaimId: no.id, relation: 'contradicts' });
  const result = model.validateClaimEvidenceGraph({ claims: [yes, no], claimRelations: [relation] });
  assert.equal(result.valid, true);
  assert.equal(new Set([yes.id, no.id]).size, 2);
  assert.ok(model.CLAIM_STATES.includes('disputed'));
});

test('corroboration must come from a distinct origin source', () => {
  const first = claim('source-a', 'claim-1');
  const sameSource = claim('source-a', 'claim-2');
  const independent = claim('source-b', 'claim-3');
  const invalidRelation = model.createClaimRelation({ claimId: first.id, relatedClaimId: sameSource.id, relation: 'corroborates' });
  const validRelation = model.createClaimRelation({ claimId: first.id, relatedClaimId: independent.id, relation: 'corroborates' });

  const invalid = model.validateClaimEvidenceGraph({ claims: [first, sameSource], claimRelations: [invalidRelation] });
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.nonIndependentCorroborationRefs, [invalidRelation.id]);
  assert.equal(model.validateClaimEvidenceGraph({ claims: [first, independent], claimRelations: [validRelation] }).valid, true);
});

test('primary evidence requires issuer, canonical reference, provenance, and inspectable claim relation', () => {
  const { issuer } = basicGraph();
  const assertion = claim('source-a', 'claim-1');
  const document = model.createEvidence({
    evidenceKey: 'resolution:example:1',
    issuerEntityId: issuer.id,
    canonicalRef: 'https://www.un.org/example-resolution',
    documentType: 'multilateral-publication',
    claimIds: [assertion.id],
    provenanceRefs: ['https://www.un.org'],
  });
  const movedReference = model.createEvidence({
    evidenceKey: 'resolution:example:1',
    issuerEntityId: issuer.id,
    canonicalRef: 'https://www.un.org/example-resolution-new-location',
    documentType: 'multilateral-publication',
    claimIds: [assertion.id],
    provenanceRefs: ['https://www.un.org'],
  });
  const link = model.createEvidenceRelation({ claimId: assertion.id, evidenceId: document.id, relation: 'supports' });
  assert.equal(document.id, movedReference.id);
  assert.equal(model.validateClaimEvidenceGraph({ entities: [issuer], claims: [assertion], evidence: [document], evidenceRelations: [link] }).valid, true);
  assert.throws(
    () => model.createEvidence({ evidenceKey: 'bad', issuerEntityId: issuer.id, canonicalRef: 'https://example.com/bad', documentType: 'official-record' }),
    /provenanceRefs/
  );
});

test('claim/evidence graph rejects orphan entities, places, events, issuers, claims, superseded evidence, and evidence links', () => {
  const { place, person, issuer, event } = basicGraph();
  const good = model.createClaim({
    originSourceId: 'source-a',
    claimKey: 'good',
    proposition: 'Good',
    type: 'fact-assertion',
    state: 'single-source',
    originRef: 'https://example.com/good',
    eventIds: [event.id],
    entityIds: [person.id],
    placeEntityIds: [place.id],
  });
  const broken = model.createClaim({
    originSourceId: 'source-b',
    claimKey: 'broken',
    proposition: 'Broken',
    type: 'allegation',
    state: 'unreviewed',
    originRef: 'https://example.com/broken',
    eventIds: ['event:missing'],
    entityIds: ['entity:missing'],
    placeEntityIds: ['place:missing', person.id],
  });
  const badEvidence = model.createEvidence({
    evidenceKey: 'bad-evidence',
    issuerEntityId: 'entity:missing-issuer',
    canonicalRef: 'https://example.com/evidence',
    documentType: 'official-record',
    eventIds: ['event:missing'],
    entityIds: ['entity:missing'],
    placeEntityIds: ['place:missing', person.id],
    claimIds: ['claim:missing'],
    supersedesEvidenceIds: ['evidence:missing'],
    provenanceRefs: [EVIDENCE_URL],
  });
  const missingEvidenceLink = model.createEvidenceRelation({ claimId: good.id, evidenceId: 'evidence:missing', relation: 'supports' });
  const result = model.validateClaimEvidenceGraph({
    entities: [place, person, issuer],
    events: [event],
    claims: [good, broken],
    evidence: [badEvidence],
    evidenceRelations: [missingEvidenceLink],
  });
  assert.equal(result.valid, false);
  assert.equal(result.orphanClaimEventRefs.length, 1);
  assert.equal(result.orphanClaimEntityRefs.length, 1);
  assert.equal(result.orphanClaimPlaceRefs.length, 1);
  assert.equal(result.nonPlaceClaimRefs.length, 1);
  assert.equal(result.orphanEvidenceIssuerRefs.length, 1);
  assert.equal(result.orphanEvidenceClaimRefs.length, 1);
  assert.equal(result.orphanSupersededEvidenceRefs.length, 1);
  assert.equal(result.orphanEvidenceRelationEvidenceRefs.length, 1);
});

test('supersession preserves both historical claims and evidence records instead of deleting old state', () => {
  const { issuer } = basicGraph();
  const oldClaim = claim('source-a', 'revision-1', 'Initial estimate', 'superseded');
  const newClaim = claim('source-a', 'revision-2', 'Updated estimate', 'single-source');
  const claimRelation = model.createClaimRelation({ claimId: newClaim.id, relatedClaimId: oldClaim.id, relation: 'supersedes' });
  const oldEvidence = model.createEvidence({
    evidenceKey: 'release:1',
    issuerEntityId: issuer.id,
    canonicalRef: 'https://example.com/release-1',
    documentType: 'official-record',
    claimIds: [oldClaim.id],
    provenanceRefs: [EVIDENCE_URL],
  });
  const newEvidence = model.createEvidence({
    evidenceKey: 'release:2',
    issuerEntityId: issuer.id,
    canonicalRef: 'https://example.com/release-2',
    documentType: 'official-record',
    claimIds: [newClaim.id],
    supersedesEvidenceIds: [oldEvidence.id],
    provenanceRefs: [EVIDENCE_URL],
  });
  const result = model.validateClaimEvidenceGraph({
    entities: [issuer],
    claims: [oldClaim, newClaim],
    evidence: [oldEvidence, newEvidence],
    claimRelations: [claimRelation],
  });
  assert.equal(result.valid, true);
  assert.equal(result.duplicateClaimIds.length, 0);
  assert.equal(result.duplicateEvidenceIds.length, 0);
  assert.equal(oldClaim.state, 'superseded');
  assert.notEqual(oldClaim.id, newClaim.id);
  assert.notEqual(oldEvidence.id, newEvidence.id);
  assert.deepEqual(newEvidence.supersedesEvidenceIds, [oldEvidence.id]);
});

test('reviewed institutional overlay reuses exact Knowledge catalog entries but authorizes no collection endpoints', () => {
  const validation = institutions.validateInstitutionalSourceRegistry(knowledgeCatalog);
  assert.equal(validation.valid, true);
  assert.equal(institutions.REVIEWED_INSTITUTIONAL_SOURCES.length, 10);
  assert.equal(institutions.REVIEWED_INSTITUTIONAL_SOURCES.every(item => item.collectionEligible === false), true);
  assert.equal(institutions.REVIEWED_INSTITUTIONAL_SOURCES.every(item => item.machineReadableEndpoints.length === 0), true);
  assert.ok(institutions.REVIEWED_INSTITUTIONAL_SOURCES.some(item => item.evidenceRole === 'issuing-primary'));
  assert.equal(institutions.institutionalRegistrySummary().knowledgeCatalogIsIngestionAuthority, false);
});

test('/api/intelligence/evidence-schema exposes evidence-state rules without enabling bulk collection', async () => {
  const response = await api.onRequestGet({ request: new Request('https://globaldeets.com/api/intelligence/evidence-schema', { headers: { Origin: 'https://globaldeets.com' } }) });
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.modelVersion, model.CLAIM_EVIDENCE_MODEL_VERSION);
  assert.ok(json.claimStates.includes('disputed'));
  assert.equal(json.rules.truthScore, false);
  assert.equal(json.rules.contradictoryClaimsMayCoexist, true);
  assert.equal(json.rules.independentCorroborationRequiresDistinctOriginSource, true);
  assert.equal(json.rules.supersessionDeletesHistory, false);
  assert.equal(json.rules.knowledgeCatalogIsIngestionAuthority, false);
  assert.equal(json.rules.machineReadableEndpointRequiresSeparateReview, true);
  assert.equal(json.rules.bulkCollectionEnabled, false);
  assert.equal(json.institutionalSources.collectionEligibleSources, 0);
});

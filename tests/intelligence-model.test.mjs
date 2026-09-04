import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'globaldeets-intelligence-'));
const functions = join(root, 'functions');
const modelPath = join(functions, 'lib', 'intelligence-model.js');
const seedPath = join(functions, 'lib', 'm49-place-seed.js');
const apiPath = join(functions, 'api', 'intelligence', 'schema.js');
mkdirSync(dirname(modelPath), { recursive: true });
mkdirSync(dirname(apiPath), { recursive: true });
writeFileSync(join(functions, 'package.json'), '{"type":"module"}\n');
for (const [source, target] of [
  ['../functions/lib/intelligence-model.js', modelPath],
  ['../functions/lib/m49-place-seed.js', seedPath],
  ['../functions/api/intelligence/schema.js', apiPath],
]) copyFileSync(fileURLToPath(new URL(source, import.meta.url)), target);

const model = await import(pathToFileURL(modelPath).href);
const seed = await import(pathToFileURL(seedPath).href);
const api = await import(pathToFileURL(apiPath).href);
const EVIDENCE = 'https://example.com/evidence';

function alias(value) { return { value, evidenceRefs: [EVIDENCE] }; }
function entity(identityKey, displayName = 'Alex Kim') {
  return model.createEntity({ identityKey, displayName, type: 'person', aliases: [alias('A. Kim')] });
}

test('entity identity is explicit and not derived from display-name similarity', () => {
  const first = entity('person:source-a:123');
  const reordered = model.createEntity({ aliases: [alias('A. Kim')], type: 'person', displayName: 'Alex Kim', identityKey: 'person:source-a:123' });
  const second = entity('person:source-b:456');
  assert.equal(first.id, reordered.id);
  assert.notEqual(first.id, second.id);
  assert.equal(first.displayName, second.displayName);
});

test('aliases require evidence and ambiguous aliases never choose a silent winner', () => {
  assert.throws(() => model.createEntity({ identityKey: 'x', displayName: 'X', type: 'person', aliases: [{ value: 'Shared' }] }), /evidenceRefs/);
  const a = model.createEntity({ identityKey: 'a', displayName: 'Alpha', type: 'organization', aliases: [alias('Shared Name')] });
  const b = model.createEntity({ identityKey: 'b', displayName: 'Beta', type: 'organization', aliases: [alias('shared   name')] });
  assert.deepEqual(model.resolveEntityAlias(' SHARED NAME ', [a, b]), { status: 'ambiguous', normalized: 'shared name', entityIds: [a.id, b.id].sort() });
  assert.equal(model.resolveEntityAlias('missing', [a, b]).status, 'no-match');
});

test('M49 place identity is stable and rejects missing, zero, or malformed codes', () => {
  const us = model.createM49PlaceEntity({ displayName: 'United States of America', m49: '840', isoAlpha2: 'US', isoAlpha3: 'USA', evidenceRefs: [EVIDENCE] });
  assert.equal(us.id, 'place:m49:840');
  assert.deepEqual(us.standardIds, { m49: '840', isoAlpha2: 'US', isoAlpha3: 'USA' });
  assert.throws(() => model.createM49PlaceEntity({ displayName: 'Bad', isoAlpha2: 'XX', isoAlpha3: 'XXX' }), /m49/);
  assert.throws(() => model.createM49PlaceEntity({ displayName: 'Bad', m49: '000', isoAlpha2: 'XX', isoAlpha3: 'XXX' }), /000/);
  assert.throws(() => model.createM49PlaceEntity({ displayName: 'Bad', m49: '12x', isoAlpha2: 'XX', isoAlpha3: 'XXX' }), /m49/);
});

test('reviewed M49 seed is explicitly partial and has unique standard identifiers', () => {
  assert.equal(seed.M49_SEED_METADATA.complete, false);
  assert.equal(seed.M49_SEED_METADATA.runtimeFetchRequired, false);
  assert.equal(seed.M49_PLACE_SEED.length, 16);
  assert.equal(new Set(seed.M49_PLACE_SEED.map(place => place.standardIds.m49)).size, 16);
  assert.equal(new Set(seed.M49_PLACE_SEED.map(place => place.standardIds.isoAlpha2)).size, 16);
  assert.equal(seed.getSeedPlaceByIsoAlpha2('us').id, 'place:m49:840');
  assert.equal(seed.getSeedPlaceByM49('36').standardIds.isoAlpha2, 'AU');
});

test('event identity depends on explicit event key rather than mutable title', () => {
  const first = model.createEvent({ eventKey: 'incident:example:2026-09-03:001', title: 'Initial title', eventType: 'incident', status: 'developing', articleIds: ['article-b', 'article-a', 'article-a'], unknowns: ['cause', 'cause'] });
  const revised = model.createEvent({ eventKey: 'incident:example:2026-09-03:001', title: 'Revised title', eventType: 'incident', status: 'confirmed' });
  const distinct = model.createEvent({ eventKey: 'incident:example:2026-09-03:002', title: 'Initial title', eventType: 'incident', status: 'developing' });
  assert.equal(first.id, revised.id);
  assert.notEqual(first.id, distinct.id);
  assert.deepEqual(first.articleIds, ['article-a', 'article-b']);
  assert.deepEqual(first.unknowns, ['cause']);
});

test('graph permits many-to-many article relations but rejects orphan and wrong-type place references', () => {
  const place = seed.getSeedPlaceByIsoAlpha2('UA');
  const person = entity('person:test:1');
  const one = model.createEvent({ eventKey: 'event:one', title: 'One', eventType: 'incident', status: 'developing', entityIds: [person.id], placeEntityIds: [place.id], articleIds: ['article-shared', 'article-one'] });
  const two = model.createEvent({ eventKey: 'event:two', title: 'Two', eventType: 'incident', status: 'developing', articleIds: ['article-shared'] });
  assert.equal(model.validateIntelligenceGraph({ entities: [place, person], events: [one, two] }).valid, true);

  const broken = model.createEvent({ eventKey: 'event:broken', title: 'Broken', eventType: 'incident', status: 'disputed', entityIds: ['entity:missing'], placeEntityIds: ['place:missing', person.id] });
  const result = model.validateIntelligenceGraph({ entities: [place, person], events: [broken] });
  assert.equal(result.valid, false);
  assert.equal(result.orphanEntityRefs.length, 1);
  assert.equal(result.orphanPlaceRefs.length, 1);
  assert.equal(result.nonPlaceRefs.length, 1);
});

test('/api/intelligence/schema exposes identity rules without claiming a complete country set', async () => {
  const response = await api.onRequestGet({ request: new Request('https://globaldeets.com/api/intelligence/schema', { headers: { Origin: 'https://globaldeets.com' } }) });
  const json = await response.json();
  assert.equal(response.status, 200);
  assert.equal(json.modelVersion, model.INTELLIGENCE_MODEL_VERSION);
  assert.equal(json.identityRules.automaticNameMerge, false);
  assert.equal(json.identityRules.aliasesRequireEvidence, true);
  assert.equal(json.identityRules.placeIdentityStandard, 'UN M49');
  assert.equal(json.placeSeed.complete, false);
  assert.equal(json.placeSeed.count, 16);
});

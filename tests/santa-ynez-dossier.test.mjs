import assert from 'node:assert/strict';
import test from 'node:test';

import { respondWithDossier } from '../functions/api/intelligence/dossiers/santa-ynez-pipeline.js';
import { validateDossierIntegrity } from '../functions/lib/dossier-integrity.js';
import { getSantaYnezDossier } from '../functions/lib/santa-ynez-dossier.js';

const request = { headers: { get: () => null } };

function cloneDossier() {
  return structuredClone(getSantaYnezDossier());
}

test('Santa Ynez dossier baseline is deterministic and integrity-valid', () => {
  const dossier = getSantaYnezDossier();
  const integrity = validateDossierIntegrity(dossier);

  assert.equal(dossier.dossierId, 'santa-ynez-pipeline');
  assert.equal(dossier.entities.length, 10);
  assert.equal(dossier.events.length, 7);
  assert.equal(dossier.claims.length, 11);
  assert.equal(dossier.evidence.length, 8);
  assert.equal(dossier.validation.valid, true);
  assert.equal(integrity.valid, true);
  assert.equal(dossier.rules.truthScore, false);
  assert.equal(dossier.rules.editorialVerdict, false);
});

test('DOJ correction remains first-class and preserves unresolved provenance', () => {
  const dossier = getSantaYnezDossier();
  const correction = dossier.corrections.find(item => item.id === 'correction:doj:2026-09-03');

  assert.ok(correction);
  assert.equal(correction.status, 'corrected');
  assert.equal(correction.originalArtifactRetained, false);
  assert.match(correction.description, /mistakenly reprinted/i);
  assert.ok(
    dossier.unknowns.includes('The original mistaken September 3 DOJ release artifact is not retained in this dossier snapshot.')
  );
});

test('duplicate source URLs fail dossier integrity', () => {
  const dossier = cloneDossier();
  dossier.sources[1].url = dossier.sources[0].url;

  const integrity = validateDossierIntegrity(dossier);
  assert.equal(integrity.valid, false);
  assert.deepEqual(integrity.duplicateSourceUrls, [dossier.sources[0].url]);
});

test('dangling timeline references fail dossier integrity', () => {
  const dossier = cloneDossier();
  dossier.timeline[0].eventId = 'event:missing';

  const integrity = validateDossierIntegrity(dossier);
  assert.equal(integrity.valid, false);
  assert.ok(integrity.timelineOrphans.some(item => item.endsWith(':event:missing')));
});

test('malformed graph records fail closed instead of throwing', () => {
  const dossier = cloneDossier();
  dossier.claimRelations[0] = null;

  assert.doesNotThrow(() => validateDossierIntegrity(dossier));
  const integrity = validateDossierIntegrity(dossier);
  assert.equal(integrity.valid, false);
  assert.ok(integrity.invalidRecords.includes('claimRelations[0]:not-object'));
});

test('unsupported claim relation semantics fail dossier integrity', () => {
  const dossier = cloneDossier();
  dossier.claimRelations[0].relation = 'agrees-with';

  const integrity = validateDossierIntegrity(dossier);
  assert.equal(integrity.valid, false);
  assert.ok(integrity.invalidRelationTypes.includes(dossier.claimRelations[0].id));
});

test('correction must link its corrected URL to retained evidence', () => {
  const dossier = cloneDossier();
  dossier.corrections[0].correctedRef = 'https://example.invalid/correction';

  const integrity = validateDossierIntegrity(dossier);
  assert.equal(integrity.valid, false);
  assert.ok(
    integrity.invalidCorrections.includes('correction:doj:2026-09-03:correctedRef-not-linked-evidence')
  );
});

test('correction unknowns must also be declared at dossier level', () => {
  const dossier = cloneDossier();
  dossier.corrections[0].unknowns.push('untracked correction uncertainty');

  const integrity = validateDossierIntegrity(dossier);
  assert.equal(integrity.valid, false);
  assert.ok(integrity.invalidCorrections.includes('correction:doj:2026-09-03:unknown-not-declared'));
});

test('dossier API publishes only a graph that passes both validation layers', async () => {
  const response = respondWithDossier(getSantaYnezDossier(), request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.validation.valid, true);
  assert.equal(body.integrity.valid, true);
  assert.equal(body.rules.truthScore, false);
});

test('dossier API withholds a malformed graph with an integrity error', async () => {
  const dossier = cloneDossier();
  dossier.timeline[0].claimIds.push('claim:missing');

  const response = respondWithDossier(dossier, request);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, 'dossier-integrity-failed');
  assert.equal(body.integrity.valid, false);
  assert.ok(body.integrity.timelineOrphans.some(item => item.endsWith(':claim:missing')));
});

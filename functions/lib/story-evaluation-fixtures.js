// Evaluation fixtures for Story Intelligence states.
// These are not public stories, not indexed, and not real-world reporting.
// Names, places, and documents are fixture labels. example.com is the only host.

import { createClaim, createClaimRelation, createEvidence, createEvidenceRelation, validateClaimEvidenceGraph } from './claim-evidence-model.js';
import { createEntity, createEvent, validateIntelligenceGraph } from './intelligence-model.js';
import { projectStoryFromDossier } from './story-intelligence.js';

const REVIEWED = '2026-10-08';

const FIXTURES = Object.freeze([
  severalPublishers(),
  singleSource(),
  noEvidence(),
  conflicting(),
  missingLocation(),
  missingTime(),
  corrected(),
  unsafeUrl(),
  longHeadline(),
  translation(),
]);

export function evaluationStoryKeys() {
  return FIXTURES.map(item => item.storyKey);
}

export function projectEvaluationStory(storyKey) {
  const item = FIXTURES.find(entry => entry.storyKey === storyKey);
  if (!item) return null;
  return projectStoryFromDossier(item.definition, item.dossier);
}

function severalPublishers() {
  const where = place('fixture:several-place', 'Fixture place');
  const court = org('fixture:several-court', 'Fixture Court');
  const ledger = report('source:fixture:ledger', 'Fixture Ledger', 'https://example.com/fixture/ledger');
  const gazette = report('source:fixture:gazette', 'Fixture Gazette', 'https://example.com/fixture/gazette');
  const filing = primary('source:fixture:several-order', 'Fixture Court', 'https://example.com/fixture/order');
  const event = hearing('fixture-several-hearing', 'Fixture hearing with two publishers', where, '2026-05-04');
  const left = claim(ledger, 'ledger-account', 'Fixture Ledger states that the hearing was held.', 'fact-assertion', 'corroborated', event, '2026-05-04');
  const right = claim(gazette, 'gazette-account', 'Fixture Gazette states that the hearing was held.', 'fact-assertion', 'corroborated', event, '2026-05-04');
  const document = evidenceDoc(court, 'several-order', filing.url, event, [left]);
  return pack('evaluation-several-publishers', {
    title: 'Evaluation: two publishers and a filing',
    dek: 'Evaluation fixture. Not a published news story. Two fictional publishers and one fictional filing.',
    entities: [where, court],
    sources: [ledger, gazette, filing],
    events: [event],
    claims: [left, right],
    evidence: [document],
    claimRelations: [createClaimRelation({ claimId: left.id, relatedClaimId: right.id, relation: 'corroborates', reviewedAt: REVIEWED })],
    evidenceRelations: [createEvidenceRelation({ claimId: left.id, evidenceId: document.id, relation: 'supports', reviewedAt: REVIEWED })],
    timeline: [timeline('2026-05-04', event, [document], [left, right], 'Both publishers and the filing use the same recorded day')],
    geography: { placeEntityIds: [where.id] },
  });
}

function singleSource() {
  const where = place('fixture:single-place', 'Fixture place');
  const desk = org('fixture:single-desk', 'Fixture Desk');
  const ledger = report('source:fixture:single-ledger', 'Fixture Ledger', 'https://example.com/fixture/single');
  const event = hearing('fixture-single-hearing', 'Fixture hearing with one publisher', where, '2026-05-11');
  const stated = claim(ledger, 'single-account', 'Fixture Ledger states that one hearing occurred.', 'fact-assertion', 'single-source', event, '2026-05-11');
  const note = primary('source:fixture:single-note', 'Fixture Desk', 'https://example.com/fixture/single-note');
  const document = evidenceDoc(desk, 'single-note', note.url, event, [stated]);
  return pack('evaluation-single-source', {
    title: 'Evaluation: one publisher',
    dek: 'Evaluation fixture. Not a published news story. One fictional publisher is not corroboration.',
    entities: [where, desk],
    sources: [ledger, note],
    events: [event],
    claims: [stated],
    evidence: [document],
    evidenceRelations: [createEvidenceRelation({ claimId: stated.id, evidenceId: document.id, relation: 'supports', reviewedAt: REVIEWED })],
    timeline: [timeline('2026-05-11', event, [document], [stated], 'One publisher and one note on the same recorded day')],
    geography: { placeEntityIds: [where.id] },
  });
}

function noEvidence() {
  const where = place('fixture:no-evidence-place', 'Fixture place');
  const ledger = report('source:fixture:no-evidence', 'Fixture Ledger', 'https://example.com/fixture/no-evidence');
  const event = hearing('fixture-no-evidence', 'Fixture hearing without a filing', where, '2026-05-12');
  const stated = claim(ledger, 'no-evidence-account', 'Fixture Ledger states that a hearing was announced.', 'allegation', 'single-source', event, '2026-05-12');
  return pack('evaluation-no-evidence', {
    title: 'Evaluation: no primary document',
    dek: 'Evaluation fixture. Not a published news story. No primary document is attached.',
    entities: [where],
    sources: [ledger],
    events: [event],
    claims: [stated],
    timeline: [timeline('2026-05-12', event, [], [stated], 'Publisher date only')],
    geography: { placeEntityIds: [where.id] },
  });
}

function conflicting() {
  const where = place('fixture:conflict-place', 'Fixture place');
  const ledger = report('source:fixture:conflict-ledger', 'Fixture Ledger', 'https://example.com/fixture/conflict-ledger');
  const gazette = report('source:fixture:conflict-gazette', 'Fixture Gazette', 'https://example.com/fixture/conflict-gazette');
  const event = hearing('fixture-conflict', 'Fixture amount disagreement', where, '2026-05-18');
  const left = claim(ledger, 'amount-12', 'Fixture Ledger alleges the amount was 12.', 'allegation', 'contradicted', event, '2026-05-18');
  const right = claim(gazette, 'amount-40', 'Fixture Gazette denies that amount and states 40.', 'denial', 'contradicted', event, '2026-05-18');
  return pack('evaluation-conflict', {
    title: 'Evaluation: conflicting accounts',
    dek: 'Evaluation fixture. Not a published news story. The record does not choose a winner.',
    entities: [where],
    sources: [ledger, gazette],
    events: [event],
    claims: [left, right],
    claimRelations: [createClaimRelation({ claimId: left.id, relatedClaimId: right.id, relation: 'contradicts', reviewedAt: REVIEWED })],
    timeline: [timeline('2026-05-18', event, [], [left, right], 'Two accounts recorded on the same day')],
    geography: { placeEntityIds: [where.id] },
  });
}

function missingLocation() {
  const ledger = report('source:fixture:no-place', 'Fixture Ledger', 'https://example.com/fixture/no-place');
  const event = hearing('fixture-no-place', 'Fixture hearing with no recorded place', null, '2026-05-20');
  const stated = claim(ledger, 'no-place-account', 'Fixture Ledger states that a hearing occurred.', 'fact-assertion', 'single-source', event, '2026-05-20');
  return pack('evaluation-no-place', {
    title: 'Evaluation: location not recorded',
    dek: 'Evaluation fixture. Not a published news story. No event place is in the record.',
    sources: [ledger],
    events: [event],
    claims: [stated],
    timeline: [timeline('2026-05-20', event, [], [stated], 'No place is attached to this update')],
    publisherHeadquarters: { name: 'Oslo', latitude: 59.91, longitude: 10.75 },
    feedRegion: 'europe',
    language: 'fr',
  });
}

function missingTime() {
  const where = place('fixture:no-time-place', 'Fixture place');
  const ledger = report('source:fixture:no-time', 'Fixture Ledger', 'https://example.com/fixture/no-time');
  const event = createEvent({
    eventKey: 'fixture-no-time',
    title: 'Fixture hearing with no recorded day',
    eventType: 'proceeding',
    status: 'developing',
    placeEntityIds: [where.id],
    reviewedAt: REVIEWED,
  });
  const stated = claim(ledger, 'no-time-account', 'Fixture Ledger states that a hearing was discussed.', 'fact-assertion', 'single-source', event, null);
  return pack('evaluation-no-time', {
    title: 'Evaluation: time not recorded',
    dek: 'Evaluation fixture. Not a published news story. No calendar day is invented.',
    entities: [where],
    sources: [ledger],
    events: [event],
    claims: [stated],
    timeline: [
      timeline('2026-08', event, [], [stated], 'Month recorded, day not recorded'),
      {
        id: 'timeline:undated:fixture-no-time',
        date: null,
        label: 'Update with no date',
        eventId: event.id,
        evidenceIds: [],
        claimIds: [stated.id],
      },
    ],
    geography: { placeEntityIds: [where.id] },
  });
}

function corrected() {
  const where = place('fixture:correction-place', 'Fixture place');
  const desk = org('fixture:correction-desk', 'Fixture Desk');
  const ledger = report('source:fixture:correction', 'Fixture Ledger', 'https://example.com/fixture/correction');
  const event = hearing('fixture-correction', 'Fixture correction', where, '2026-06-02');
  const earlier = claim(ledger, 'earlier-line', 'An earlier fixture line said the hearing was closed.', 'fact-assertion', 'superseded', event, '2026-06-01');
  const current = claim(ledger, 'current-line', 'The fixture desk now states the hearing remains open.', 'fact-assertion', 'single-source', event, '2026-06-02');
  return pack('evaluation-corrected', {
    title: 'Evaluation: a corrected line',
    dek: 'Evaluation fixture. Not a published news story. The earlier line stays visible.',
    entities: [where, desk],
    sources: [ledger],
    events: [event],
    claims: [earlier, current],
    timeline: [timeline('2026-06-02', event, [], [current], 'Corrected line')],
    corrections: [
      {
        id: 'correction:fixture:2026-06-02',
        status: 'corrected',
        observedAt: '2026-06-02',
        issuerEntityId: desk.id,
        correctedRef: 'https://example.com/fixture/correction',
        description: 'The fixture desk corrected an earlier line. The earlier line stays visible here.',
        originalArtifactRetained: false,
        unknowns: ['The earlier fixture line has no separate archived copy in this record.'],
        eventIds: [event.id],
        evidenceIds: [],
        claimIds: [earlier.id],
      },
    ],
    geography: { placeEntityIds: [where.id] },
  });
}

function unsafeUrl() {
  const where = place('fixture:unsafe-place', 'Fixture place');
  const desk = org('fixture:unsafe-desk', 'Fixture Desk');
  const broken = report('source:fixture:unsafe', 'Fixture Ledger', 'javascript:alert(1)');
  const safe = report('source:fixture:safe', 'Fixture Gazette', 'https://example.com/fixture/safe-report');
  const event = hearing('fixture-unsafe-url', 'Fixture record with a rejected link', where, '2026-06-03');
  const stated = claim(safe, 'safe-account', 'Fixture Gazette states that the unsafe link was not kept.', 'fact-assertion', 'single-source', event, '2026-06-03');
  const document = createEvidence({
    evidenceKey: 'unsafe-blob',
    issuerEntityId: desk.id,
    canonicalRef: 'data:text/html,<script>alert(1)</script>',
    documentType: 'other-primary',
    provenanceRefs: ['https://example.com/fixture/safe-provenance'],
    eventIds: [event.id],
    publishedAt: '2026-06-03',
    reviewedAt: REVIEWED,
  });
  return pack('evaluation-unsafe-url', {
    title: 'Evaluation: unsafe link dropped',
    dek: 'Evaluation fixture. Not a published news story. A non-http link is not clickable.',
    entities: [where, desk],
    sources: [broken, safe],
    events: [event],
    claims: [stated],
    evidence: [document],
    timeline: [timeline('2026-06-03', event, [document], [stated], 'Safe link only')],
    geography: { placeEntityIds: [where.id] },
  });
}

function longHeadline() {
  const token = `Wrapcheck${'X'.repeat(48)}`;
  const where = place('fixture:long-place', 'Fixture place');
  const name = `Fixture Gazette ${'Y'.repeat(36)}`;
  const ledger = report('source:fixture:long', name, 'https://example.com/fixture/long-headline');
  const event = hearing('fixture-long-headline', `Fixture hearing ${token}`, where, '2026-06-04');
  const stated = claim(ledger, 'long-account', 'Fixture Gazette states that the headline is long and the type stays readable.', 'fact-assertion', 'single-source', event, '2026-06-04');
  return pack('evaluation-long-headline', {
    title: `Evaluation: ${token} must wrap on a narrow screen without shrinking the type`,
    dek: 'Evaluation fixture. Not a published news story. The long title is a layout fixture.',
    entities: [where],
    sources: [ledger],
    events: [event],
    claims: [stated],
    timeline: [timeline('2026-06-04', event, [], [stated], 'Long title layout check')],
    geography: { placeEntityIds: [where.id] },
  });
}

function translation() {
  const where = place('fixture:translation-place', 'Fixture place');
  const japanese = report('source:fixture:ja', 'Fixture Broadcaster', 'https://example.com/fixture/ja', {
    originalLang: 'ja',
    translated: true,
    originalHeadline: '評価用の見出しです',
  });
  const arabic = report('source:fixture:ar', 'Fixture Regional Desk', 'https://example.com/fixture/ar', {
    originalLang: 'ar',
    translated: false,
    originalHeadline: 'عنوان للتقييم فقط',
  });
  const event = hearing('fixture-translation', 'Fixture reports in two languages', where, '2026-06-05');
  const left = claim(japanese, 'ja-account', 'A machine-translated fixture line says a hearing was listed.', 'fact-assertion', 'single-source', event, '2026-06-05');
  const right = claim(arabic, 'ar-account', 'The original-language fixture line was not translated.', 'fact-assertion', 'single-source', event, '2026-06-05');
  return pack('evaluation-translation', {
    title: 'Evaluation: original language and translation',
    dek: 'Evaluation fixture. Not a published news story. Translation state is taken from the fixture record.',
    entities: [where],
    sources: [japanese, arabic],
    events: [event],
    claims: [left, right],
    timeline: [timeline('2026-06-05', event, [], [left, right], 'Two language labels')],
    geography: { placeEntityIds: [where.id] },
  });
}

function pack(storyKey, fields) {
  const entities = fields.entities || [];
  const events = fields.events || [];
  const claims = fields.claims || [];
  const evidence = fields.evidence || [];
  const claimRelations = fields.claimRelations || [];
  const evidenceRelations = fields.evidenceRelations || [];
  const intelligence = validateIntelligenceGraph({ entities, events });
  const claimEvidence = validateClaimEvidenceGraph({
    entities,
    events,
    claims,
    evidence,
    claimRelations,
    evidenceRelations,
  });
  return {
    storyKey,
    definition: { storyKey, dossierId: storyKey, fixture: true },
    dossier: {
      dossierId: storyKey,
      dossierVersion: 'evaluation',
      title: fields.title,
      dek: fields.dek,
      status: 'developing',
      reviewedAt: REVIEWED,
      geography: fields.geography || { placeEntityIds: [] },
      sources: fields.sources || [],
      entities,
      events,
      claims,
      evidence,
      claimRelations,
      evidenceRelations,
      timeline: fields.timeline || [],
      corrections: fields.corrections || [],
      unknowns: fields.unknowns || [],
      publisherHeadquarters: fields.publisherHeadquarters,
      feedRegion: fields.feedRegion,
      language: fields.language,
      validation: {
        valid: intelligence.valid === true && claimEvidence.valid === true,
        ...(intelligence.valid ? {} : { intelligence }),
        ...(claimEvidence.valid ? {} : { claimEvidence }),
      },
    },
  };
}

function place(identityKey, name) {
  return createEntity({ identityKey, type: 'place', displayName: name, reviewedAt: REVIEWED });
}

function org(identityKey, name) {
  return createEntity({ identityKey, type: 'organization', displayName: name, reviewedAt: REVIEWED });
}

function report(id, name, url, extra = {}) {
  return { id, name, sourceClass: 'independent-reporting', evidenceRole: 'reporting', url, ...extra };
}

function primary(id, name, url) {
  return { id, name, sourceClass: 'court-record', evidenceRole: 'primary-evidence', url };
}

function hearing(eventKey, title, where, startedAt) {
  return createEvent({
    eventKey,
    title,
    eventType: 'proceeding',
    status: 'developing',
    startedAt,
    observedAt: startedAt,
    placeEntityIds: where ? [where.id] : [],
    reviewedAt: REVIEWED,
  });
}

function claim(source, claimKey, proposition, type, state, event, assertedAt) {
  return createClaim({
    claimKey,
    proposition,
    originSourceId: source.id,
    originRef: source.url,
    type,
    state,
    eventIds: [event.id],
    assertedAt,
    reviewedAt: REVIEWED,
  });
}

function evidenceDoc(issuer, evidenceKey, url, event, claims) {
  return createEvidence({
    evidenceKey,
    issuerEntityId: issuer.id,
    canonicalRef: url,
    documentType: 'court-filing',
    provenanceRefs: [url],
    eventIds: [event.id],
    claimIds: claims.map(item => item.id),
    publishedAt: event.startedAt,
    reviewedAt: REVIEWED,
  });
}

function timeline(date, event, evidence, claims, label) {
  return {
    id: `timeline:${date}:${event.id}`,
    date,
    label,
    eventId: event.id,
    evidenceIds: evidence.map(item => item.id),
    claimIds: claims.map(item => item.id),
  };
}

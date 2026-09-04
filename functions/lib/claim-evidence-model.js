// Deterministic claim/evidence primitives. Evidence state is explicit; this module never computes a truth score.
export const CLAIM_EVIDENCE_MODEL_VERSION = '2026-09-03.1';

export const CLAIM_TYPES = Object.freeze([
  'fact-assertion',
  'estimate',
  'forecast',
  'allegation',
  'denial',
  'official-position',
]);

export const CLAIM_STATES = Object.freeze([
  'unreviewed',
  'single-source',
  'corroborated',
  'contradicted',
  'superseded',
  'withdrawn',
]);

export const EVIDENCE_DOCUMENT_TYPES = Object.freeze([
  'court-filing',
  'judgment',
  'government-release',
  'regulator-release',
  'election-record',
  'sanctions-notice',
  'central-bank-release',
  'statistical-release',
  'multilateral-publication',
  'corporate-filing',
  'dataset',
  'official-record',
  'other-primary',
]);

export const CLAIM_RELATION_TYPES = Object.freeze(['corroborates', 'contradicts', 'supersedes']);
export const EVIDENCE_RELATION_TYPES = Object.freeze(['supports', 'contradicts', 'supersedes']);

const CLAIM_TYPE_SET = new Set(CLAIM_TYPES);
const CLAIM_STATE_SET = new Set(CLAIM_STATES);
const EVIDENCE_DOCUMENT_TYPE_SET = new Set(EVIDENCE_DOCUMENT_TYPES);
const CLAIM_RELATION_TYPE_SET = new Set(CLAIM_RELATION_TYPES);
const EVIDENCE_RELATION_TYPE_SET = new Set(EVIDENCE_RELATION_TYPES);

export function createClaim(definition) {
  object(definition, 'claim definition');
  text(definition.claimKey, 'claim.claimKey');
  text(definition.proposition, 'claim.proposition');
  text(definition.originSourceId, 'claim.originSourceId');
  text(definition.originRef, 'claim.originRef');
  oneOf(definition.type, CLAIM_TYPE_SET, 'claim.type');
  oneOf(definition.state, CLAIM_STATE_SET, 'claim.state');

  return Object.freeze({
    id: makeStableClaimId(definition.originSourceId, definition.claimKey),
    claimKey: definition.claimKey,
    proposition: definition.proposition,
    type: definition.type,
    state: definition.state,
    originSourceId: definition.originSourceId,
    originRef: definition.originRef,
    sourceWording: optionalText(definition.sourceWording, 'claim.sourceWording'),
    eventIds: stringList(definition.eventIds ?? []),
    entityIds: stringList(definition.entityIds ?? []),
    placeEntityIds: stringList(definition.placeEntityIds ?? []),
    assertedAt: optionalText(definition.assertedAt, 'claim.assertedAt'),
    createdAt: optionalText(definition.createdAt, 'claim.createdAt'),
    reviewedAt: optionalText(definition.reviewedAt, 'claim.reviewedAt'),
  });
}

export function createEvidence(definition) {
  object(definition, 'evidence definition');
  text(definition.evidenceKey, 'evidence.evidenceKey');
  text(definition.issuerEntityId, 'evidence.issuerEntityId');
  text(definition.canonicalRef, 'evidence.canonicalRef');
  oneOf(definition.documentType, EVIDENCE_DOCUMENT_TYPE_SET, 'evidence.documentType');
  const provenanceRefs = stringList(definition.provenanceRefs ?? []);
  if (!provenanceRefs.length) throw new TypeError('evidence.provenanceRefs must not be empty');

  return Object.freeze({
    id: makeStableEvidenceId(definition.issuerEntityId, definition.evidenceKey),
    evidenceKey: definition.evidenceKey,
    issuerEntityId: definition.issuerEntityId,
    canonicalRef: definition.canonicalRef,
    immutableRef: optionalText(definition.immutableRef, 'evidence.immutableRef'),
    documentType: definition.documentType,
    publishedAt: optionalText(definition.publishedAt, 'evidence.publishedAt'),
    effectiveAt: optionalText(definition.effectiveAt, 'evidence.effectiveAt'),
    eventIds: stringList(definition.eventIds ?? []),
    entityIds: stringList(definition.entityIds ?? []),
    placeEntityIds: stringList(definition.placeEntityIds ?? []),
    claimIds: stringList(definition.claimIds ?? []),
    provenanceRefs,
    retrievedAt: optionalText(definition.retrievedAt, 'evidence.retrievedAt'),
    reviewedAt: optionalText(definition.reviewedAt, 'evidence.reviewedAt'),
  });
}

export function createClaimRelation(definition) {
  object(definition, 'claim relation definition');
  text(definition.claimId, 'claimRelation.claimId');
  text(definition.relatedClaimId, 'claimRelation.relatedClaimId');
  if (definition.claimId === definition.relatedClaimId) {
    throw new TypeError('claim relation cannot reference the same claim twice');
  }
  oneOf(definition.relation, CLAIM_RELATION_TYPE_SET, 'claimRelation.relation');
  return Object.freeze({
    id: `claim-relation:${encode(definition.relation)}:${encode(definition.claimId)}:${encode(definition.relatedClaimId)}`,
    claimId: definition.claimId,
    relatedClaimId: definition.relatedClaimId,
    relation: definition.relation,
    evidenceIds: stringList(definition.evidenceIds ?? []),
    reviewedAt: optionalText(definition.reviewedAt, 'claimRelation.reviewedAt'),
  });
}

export function createEvidenceRelation(definition) {
  object(definition, 'evidence relation definition');
  text(definition.claimId, 'evidenceRelation.claimId');
  text(definition.evidenceId, 'evidenceRelation.evidenceId');
  oneOf(definition.relation, EVIDENCE_RELATION_TYPE_SET, 'evidenceRelation.relation');
  return Object.freeze({
    id: `evidence-relation:${encode(definition.relation)}:${encode(definition.claimId)}:${encode(definition.evidenceId)}`,
    claimId: definition.claimId,
    evidenceId: definition.evidenceId,
    relation: definition.relation,
    reviewedAt: optionalText(definition.reviewedAt, 'evidenceRelation.reviewedAt'),
  });
}

export function makeStableClaimId(originSourceId, claimKey) {
  text(originSourceId, 'claim.originSourceId');
  text(claimKey, 'claim.claimKey');
  return `claim:${encode(originSourceId)}:${encode(claimKey)}`;
}

export function makeStableEvidenceId(issuerEntityId, evidenceKey) {
  text(issuerEntityId, 'evidence.issuerEntityId');
  text(evidenceKey, 'evidence.evidenceKey');
  return `evidence:${encode(issuerEntityId)}:${encode(evidenceKey)}`;
}

export function validateClaimEvidenceGraph({
  entities = [],
  events = [],
  claims = [],
  evidence = [],
  claimRelations = [],
  evidenceRelations = [],
} = {}) {
  const entityById = new Map(entities.map(entity => [entity.id, entity]));
  const eventById = new Map(events.map(event => [event.id, event]));
  const claimById = new Map(claims.map(claim => [claim.id, claim]));
  const evidenceById = new Map(evidence.map(item => [item.id, item]));

  const result = {
    duplicateClaimIds: duplicates(claims.map(claim => claim.id)),
    duplicateEvidenceIds: duplicates(evidence.map(item => item.id)),
    invalidClaimIds: unique(claims.filter(claim => !validClaim(claim)).map(claim => claim.id || '(missing-id)')),
    invalidEvidenceIds: unique(evidence.filter(item => !validEvidence(item)).map(item => item.id || '(missing-id)')),
    orphanClaimEventRefs: [],
    orphanClaimEntityRefs: [],
    orphanClaimPlaceRefs: [],
    nonPlaceClaimRefs: [],
    orphanEvidenceIssuerRefs: [],
    orphanEvidenceEventRefs: [],
    orphanEvidenceEntityRefs: [],
    orphanEvidencePlaceRefs: [],
    nonPlaceEvidenceRefs: [],
    orphanEvidenceClaimRefs: [],
    orphanClaimRelationRefs: [],
    orphanClaimRelationEvidenceRefs: [],
    nonIndependentCorroborationRefs: [],
    orphanEvidenceRelationClaimRefs: [],
    orphanEvidenceRelationEvidenceRefs: [],
  };

  for (const claim of claims) {
    for (const id of claim.eventIds || []) if (!eventById.has(id)) result.orphanClaimEventRefs.push(`${claim.id}:${id}`);
    for (const id of claim.entityIds || []) if (!entityById.has(id)) result.orphanClaimEntityRefs.push(`${claim.id}:${id}`);
    for (const id of claim.placeEntityIds || []) {
      const entity = entityById.get(id);
      if (!entity) result.orphanClaimPlaceRefs.push(`${claim.id}:${id}`);
      else if (entity.type !== 'place') result.nonPlaceClaimRefs.push(`${claim.id}:${id}`);
    }
  }

  for (const item of evidence) {
    if (!entityById.has(item.issuerEntityId)) result.orphanEvidenceIssuerRefs.push(`${item.id}:${item.issuerEntityId}`);
    for (const id of item.eventIds || []) if (!eventById.has(id)) result.orphanEvidenceEventRefs.push(`${item.id}:${id}`);
    for (const id of item.entityIds || []) if (!entityById.has(id)) result.orphanEvidenceEntityRefs.push(`${item.id}:${id}`);
    for (const id of item.placeEntityIds || []) {
      const entity = entityById.get(id);
      if (!entity) result.orphanEvidencePlaceRefs.push(`${item.id}:${id}`);
      else if (entity.type !== 'place') result.nonPlaceEvidenceRefs.push(`${item.id}:${id}`);
    }
    for (const id of item.claimIds || []) if (!claimById.has(id)) result.orphanEvidenceClaimRefs.push(`${item.id}:${id}`);
  }

  for (const relation of claimRelations) {
    const claim = claimById.get(relation.claimId);
    const related = claimById.get(relation.relatedClaimId);
    if (!claim) result.orphanClaimRelationRefs.push(`${relation.id}:${relation.claimId}`);
    if (!related) result.orphanClaimRelationRefs.push(`${relation.id}:${relation.relatedClaimId}`);
    for (const id of relation.evidenceIds || []) {
      if (!evidenceById.has(id)) result.orphanClaimRelationEvidenceRefs.push(`${relation.id}:${id}`);
    }
    if (relation.relation === 'corroborates' && claim && related && claim.originSourceId === related.originSourceId) {
      result.nonIndependentCorroborationRefs.push(relation.id);
    }
  }

  for (const relation of evidenceRelations) {
    if (!claimById.has(relation.claimId)) result.orphanEvidenceRelationClaimRefs.push(`${relation.id}:${relation.claimId}`);
    if (!evidenceById.has(relation.evidenceId)) result.orphanEvidenceRelationEvidenceRefs.push(`${relation.id}:${relation.evidenceId}`);
  }

  for (const key of Object.keys(result)) result[key] = unique(result[key]);
  return { valid: Object.values(result).every(values => values.length === 0), ...result };
}

function validClaim(claim) {
  return Boolean(
    claim &&
      typeof claim.id === 'string' &&
      typeof claim.claimKey === 'string' &&
      typeof claim.proposition === 'string' &&
      typeof claim.originSourceId === 'string' &&
      typeof claim.originRef === 'string' &&
      CLAIM_TYPE_SET.has(claim.type) &&
      CLAIM_STATE_SET.has(claim.state) &&
      claim.id === makeStableClaimId(claim.originSourceId, claim.claimKey)
  );
}

function validEvidence(item) {
  return Boolean(
    item &&
      typeof item.id === 'string' &&
      typeof item.evidenceKey === 'string' &&
      typeof item.issuerEntityId === 'string' &&
      typeof item.canonicalRef === 'string' &&
      EVIDENCE_DOCUMENT_TYPE_SET.has(item.documentType) &&
      Array.isArray(item.provenanceRefs) &&
      item.provenanceRefs.length > 0 &&
      item.id === makeStableEvidenceId(item.issuerEntityId, item.evidenceKey)
  );
}

function encode(value) {
  return encodeURIComponent(value);
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
function unique(values) {
  return [...new Set(values)].sort();
}
function stringList(values) {
  if (!Array.isArray(values)) throw new TypeError('expected an array');
  return unique(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()));
}
function optionalText(value, field) {
  if (value == null) return null;
  text(value, field);
  return value.trim();
}
function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
}
function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
}
function oneOf(value, allowed, field) {
  if (!allowed.has(value)) throw new TypeError(`${field} is not supported`);
}

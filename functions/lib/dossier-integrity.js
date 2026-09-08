import { validateClaimEvidenceGraph } from './claim-evidence-model.js';
import { validateIntelligenceGraph } from './intelligence-model.js';

const REQUIRED_ARRAY_FIELDS = Object.freeze([
  'sources',
  'entities',
  'events',
  'claims',
  'evidence',
  'claimRelations',
  'evidenceRelations',
  'timeline',
  'corrections',
  'unknowns',
]);
const CLAIM_RELATIONS = new Set(['corroborates', 'contradicts', 'supersedes']);
const EVIDENCE_RELATIONS = new Set(['supports', 'contradicts', 'supersedes']);
const CORRECTION_STATUSES = new Set(['corrected', 'superseded', 'withdrawn']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDossierIntegrity(dossier) {
  const issues = {
    structureErrors: [],
    invalidRecords: [],
    duplicateIds: [],
    duplicateSourceUrls: [],
    uncitedClaims: [],
    invalidRelationTypes: [],
    timelineOrphans: [],
    correctionOrphans: [],
    invalidCorrections: [],
    invalidUnknowns: [],
    engineErrors: [],
  };

  if (!plainObject(dossier)) {
    issues.structureErrors.push('dossier:not-object');
    return finish(issues, null, null);
  }

  requireText(dossier.dossierId, 'dossierId', issues);
  requireText(dossier.dossierVersion, 'dossierVersion', issues);
  requireText(dossier.title, 'title', issues);
  if (!plainObject(dossier.rules)) issues.structureErrors.push('rules:not-object');
  else {
    if (dossier.rules.truthScore !== false) issues.structureErrors.push('rules.truthScore:must-be-false');
    if (dossier.rules.editorialVerdict !== false) {
      issues.structureErrors.push('rules.editorialVerdict:must-be-false');
    }
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(dossier[field])) issues.structureErrors.push(`${field}:not-array`);
  }

  const sources = array(dossier.sources);
  const entities = array(dossier.entities);
  const events = array(dossier.events);
  const claims = array(dossier.claims);
  const evidence = array(dossier.evidence);
  const claimRelations = array(dossier.claimRelations);
  const evidenceRelations = array(dossier.evidenceRelations);
  const timeline = array(dossier.timeline);
  const corrections = array(dossier.corrections);
  const unknowns = array(dossier.unknowns);

  const objectCollections = {
    sources,
    entities,
    events,
    claims,
    evidence,
    claimRelations,
    evidenceRelations,
    timeline,
    corrections,
  };
  for (const [name, records] of Object.entries(objectCollections)) {
    records.forEach((record, index) => {
      if (!plainObject(record)) issues.invalidRecords.push(`${name}[${index}]:not-object`);
    });
  }

  for (const [name, records] of Object.entries(objectCollections)) {
    addDuplicateIds(name, records, issues);
  }

  const sourceById = mapById(sources);
  const sourceUrls = [];
  for (const [index, source] of sources.entries()) {
    if (!plainObject(source)) continue;
    if (
      !text(source.id) ||
      !text(source.name) ||
      !text(source.sourceClass) ||
      !text(source.evidenceRole) ||
      !text(source.url)
    ) {
      issues.invalidRecords.push(`sources[${index}]:missing-core-field`);
      continue;
    }
    sourceUrls.push(source.url);
  }
  for (const url of duplicates(sourceUrls)) issues.duplicateSourceUrls.push(url);

  const entityById = mapById(entities);
  const eventById = mapById(events);
  const claimById = mapById(claims);
  const evidenceById = mapById(evidence);

  for (const [index, claim] of claims.entries()) {
    if (!plainObject(claim)) continue;
    const source = sourceById.get(claim.originSourceId);
    if (!source || source.url !== claim.originRef) {
      issues.uncitedClaims.push(text(claim.id) ? claim.id : `claims[${index}]`);
    }
  }

  for (const [index, relation] of claimRelations.entries()) {
    if (!plainObject(relation)) continue;
    if (!CLAIM_RELATIONS.has(relation.relation)) {
      issues.invalidRelationTypes.push(text(relation.id) ? relation.id : `claimRelations[${index}]`);
    }
  }
  for (const [index, relation] of evidenceRelations.entries()) {
    if (!plainObject(relation)) continue;
    if (!EVIDENCE_RELATIONS.has(relation.relation)) {
      issues.invalidRelationTypes.push(text(relation.id) ? relation.id : `evidenceRelations[${index}]`);
    }
  }

  for (const [index, item] of timeline.entries()) {
    if (!plainObject(item)) continue;
    const itemId = text(item.id) ? item.id : `timeline[${index}]`;
    if (!text(item.id) || !text(item.label) || !text(item.eventId)) {
      issues.invalidRecords.push(`${itemId}:missing-core-field`);
    }
    if (!ISO_DATE.test(item.date || '')) issues.invalidRecords.push(`${itemId}:invalid-date`);
    if (!eventById.has(item.eventId)) {
      issues.timelineOrphans.push(`${itemId}:${item.eventId || '(missing-event)'}`);
    }
    if (!Array.isArray(item.evidenceIds)) issues.invalidRecords.push(`${itemId}:evidenceIds:not-array`);
    else {
      for (const id of item.evidenceIds) {
        if (!evidenceById.has(id)) issues.timelineOrphans.push(`${itemId}:${id}`);
      }
    }
    if (!Array.isArray(item.claimIds)) issues.invalidRecords.push(`${itemId}:claimIds:not-array`);
    else {
      for (const id of item.claimIds) {
        if (!claimById.has(id)) issues.timelineOrphans.push(`${itemId}:${id}`);
      }
    }
  }

  const topLevelUnknowns = new Set();
  for (const [index, unknown] of unknowns.entries()) {
    if (!text(unknown)) issues.invalidUnknowns.push(`unknowns[${index}]:not-text`);
    else if (topLevelUnknowns.has(unknown)) issues.invalidUnknowns.push(`unknowns[${index}]:duplicate`);
    else topLevelUnknowns.add(unknown);
  }

  for (const [index, correction] of corrections.entries()) {
    if (!plainObject(correction)) continue;
    const itemId = text(correction.id) ? correction.id : `corrections[${index}]`;
    if (
      !text(correction.id) ||
      !text(correction.issuerEntityId) ||
      !text(correction.description) ||
      !text(correction.correctedRef)
    ) {
      issues.invalidCorrections.push(`${itemId}:missing-core-field`);
    }
    if (!CORRECTION_STATUSES.has(correction.status)) {
      issues.invalidCorrections.push(`${itemId}:invalid-status`);
    }
    if (!ISO_DATE.test(correction.observedAt || '')) {
      issues.invalidCorrections.push(`${itemId}:invalid-observedAt`);
    }
    if (typeof correction.originalArtifactRetained !== 'boolean') {
      issues.invalidCorrections.push(`${itemId}:originalArtifactRetained:not-boolean`);
    }
    if (!entityById.has(correction.issuerEntityId)) {
      issues.correctionOrphans.push(`${itemId}:${correction.issuerEntityId || '(missing-issuer)'}`);
    }
    checkReferences(itemId, correction.eventIds, eventById, 'eventIds', issues);
    checkReferences(itemId, correction.evidenceIds, evidenceById, 'evidenceIds', issues);
    checkReferences(itemId, correction.claimIds, claimById, 'claimIds', issues);
    if (!Array.isArray(correction.unknowns)) issues.invalidCorrections.push(`${itemId}:unknowns:not-array`);
    else {
      const localUnknowns = new Set();
      for (const unknown of correction.unknowns) {
        if (!text(unknown)) issues.invalidCorrections.push(`${itemId}:unknown-not-text`);
        else if (localUnknowns.has(unknown)) issues.invalidCorrections.push(`${itemId}:duplicate-unknown`);
        else localUnknowns.add(unknown);
      }
    }
    if (Array.isArray(correction.evidenceIds) && text(correction.correctedRef)) {
      const linkedRefs = correction.evidenceIds
        .map(id => evidenceById.get(id)?.canonicalRef)
        .filter(Boolean);
      if (!linkedRefs.includes(correction.correctedRef)) {
        issues.invalidCorrections.push(`${itemId}:correctedRef-not-linked-evidence`);
      }
    }
  }

  let intelligence = null;
  let claimEvidence = null;
  const safeForEngines = Object.values(objectCollections).every(records => records.every(plainObject));
  if (safeForEngines && Array.isArray(dossier.entities) && Array.isArray(dossier.events)) {
    try {
      intelligence = validateIntelligenceGraph({ entities, events });
    } catch (error) {
      issues.engineErrors.push(`intelligence:${errorMessage(error)}`);
    }
  }
  if (
    safeForEngines &&
    Array.isArray(dossier.claims) &&
    Array.isArray(dossier.evidence) &&
    Array.isArray(dossier.claimRelations) &&
    Array.isArray(dossier.evidenceRelations)
  ) {
    try {
      claimEvidence = validateClaimEvidenceGraph({
        entities,
        events,
        claims,
        evidence,
        claimRelations,
        evidenceRelations,
      });
    } catch (error) {
      issues.engineErrors.push(`claim-evidence:${errorMessage(error)}`);
    }
  }

  return finish(issues, intelligence, claimEvidence);
}

function checkReferences(itemId, ids, registry, field, issues) {
  if (!Array.isArray(ids)) {
    issues.invalidCorrections.push(`${itemId}:${field}:not-array`);
    return;
  }
  for (const id of ids) {
    if (!registry.has(id)) issues.correctionOrphans.push(`${itemId}:${id}`);
  }
}

function finish(issues, intelligence, claimEvidence) {
  for (const key of Object.keys(issues)) issues[key] = unique(issues[key]);
  const issueFree = Object.values(issues).every(values => values.length === 0);
  const enginesValid = intelligence?.valid === true && claimEvidence?.valid === true;
  return {
    valid: issueFree && enginesValid,
    ...issues,
    intelligence,
    claimEvidence,
  };
}

function addDuplicateIds(name, records, issues) {
  const ids = records.filter(plainObject).map(record => record.id).filter(text);
  for (const id of duplicates(ids)) issues.duplicateIds.push(`${name}:${id}`);
}

function mapById(records) {
  return new Map(
    records
      .filter(plainObject)
      .filter(record => text(record.id))
      .map(record => [record.id, record])
  );
}

function requireText(value, field, issues) {
  if (!text(value)) issues.structureErrors.push(`${field}:missing`);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

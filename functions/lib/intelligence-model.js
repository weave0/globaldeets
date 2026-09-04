// Deterministic intelligence primitives for GlobalDeets.
// Identity is explicit. Similar names, headlines, or aliases never create an automatic merge.

export const INTELLIGENCE_MODEL_VERSION = '2026-09-03.1';

export const ENTITY_TYPES = Object.freeze([
  'person',
  'organization',
  'government-public-body',
  'company',
  'place',
  'multilateral-body',
]);

export const EVENT_STATUSES = Object.freeze([
  'developing',
  'confirmed',
  'closed',
  'disputed',
]);

const ENTITY_TYPE_SET = new Set(ENTITY_TYPES);
const EVENT_STATUS_SET = new Set(EVENT_STATUSES);

export function createEntity(definition) {
  requireObject(definition, 'entity definition');
  requireNonEmptyString(definition.identityKey, 'entity.identityKey');
  requireNonEmptyString(definition.displayName, 'entity.displayName');
  requireOneOf(definition.type, ENTITY_TYPE_SET, 'entity.type');

  const aliases = normalizeAliasRecords(definition.aliases || []);
  const evidenceRefs = normalizeStringList(definition.evidenceRefs || []);
  const attributes = clonePlainValue(definition.attributes ?? {});

  return Object.freeze({
    id: makeStableEntityId(definition.type, definition.identityKey),
    identityKey: definition.identityKey,
    type: definition.type,
    displayName: definition.displayName,
    aliases,
    evidenceRefs,
    countryEntityId: definition.countryEntityId || null,
    standardIds: normalizeStandardIds(definition.standardIds || null),
    attributes,
    createdAt: definition.createdAt || null,
    reviewedAt: definition.reviewedAt || null,
  });
}

export function createM49PlaceEntity(definition) {
  requireObject(definition, 'M49 place definition');
  const m49 = normalizeM49(definition.m49);
  const isoAlpha2 = normalizeIso(definition.isoAlpha2, 2, 'place.isoAlpha2');
  const isoAlpha3 = normalizeIso(definition.isoAlpha3, 3, 'place.isoAlpha3');

  return createEntity({
    ...definition,
    identityKey: `m49:${m49}`,
    type: 'place',
    standardIds: {
      ...(definition.standardIds || {}),
      m49,
      isoAlpha2,
      isoAlpha3,
    },
  });
}

export function createEvent(definition) {
  requireObject(definition, 'event definition');
  requireNonEmptyString(definition.eventKey, 'event.eventKey');
  requireNonEmptyString(definition.title, 'event.title');
  requireNonEmptyString(definition.eventType, 'event.eventType');
  requireOneOf(definition.status, EVENT_STATUS_SET, 'event.status');

  return Object.freeze({
    id: makeStableEventId(definition.eventKey),
    eventKey: definition.eventKey,
    title: definition.title,
    eventType: definition.eventType,
    status: definition.status,
    observedAt: definition.observedAt || null,
    startedAt: definition.startedAt || null,
    endedAt: definition.endedAt || null,
    entityIds: normalizeStringList(definition.entityIds || []),
    placeEntityIds: normalizeStringList(definition.placeEntityIds || []),
    articleIds: normalizeStringList(definition.articleIds || []),
    unknowns: normalizeStringList(definition.unknowns || []),
    evidenceRefs: normalizeStringList(definition.evidenceRefs || []),
    createdAt: definition.createdAt || null,
    reviewedAt: definition.reviewedAt || null,
  });
}

export function makeStableEntityId(type, identityKey) {
  requireOneOf(type, ENTITY_TYPE_SET, 'entity.type');
  requireNonEmptyString(identityKey, 'entity.identityKey');
  if (type === 'place' && /^m49:\d{3}$/.test(identityKey)) {
    return `place:${identityKey}`;
  }
  return `entity:${type}:${fnv1a(`${type}\u001f${identityKey}`)}`;
}

export function makeStableEventId(eventKey) {
  requireNonEmptyString(eventKey, 'event.eventKey');
  return `event:${fnv1a(eventKey)}`;
}

export function normalizeAlias(value) {
  requireNonEmptyString(value, 'alias');
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('und');
}

export function buildAliasIndex(entities) {
  const index = new Map();
  for (const entity of entities || []) {
    addAlias(index, entity.displayName, entity.id);
    for (const alias of entity.aliases || []) addAlias(index, alias.value, entity.id);
  }
  return index;
}

export function resolveEntityAlias(value, entities) {
  const normalized = normalizeAlias(value);
  const index = buildAliasIndex(entities);
  const matches = [...(index.get(normalized) || [])].sort();

  if (matches.length === 0) return { status: 'no-match', normalized, entityIds: [] };
  if (matches.length === 1) {
    return { status: 'matched', normalized, entityId: matches[0], entityIds: matches };
  }
  return { status: 'ambiguous', normalized, entityIds: matches };
}

export function validateIntelligenceGraph({ entities = [], events = [] } = {}) {
  const entityIds = entities.map(entity => entity.id);
  const eventIds = events.map(event => event.id);
  const duplicateEntityIds = duplicates(entityIds);
  const duplicateEventIds = duplicates(eventIds);
  const entityById = new Map(entities.map(entity => [entity.id, entity]));
  const orphanEntityRefs = [];
  const orphanPlaceRefs = [];
  const nonPlaceRefs = [];

  for (const event of events) {
    for (const entityId of event.entityIds || []) {
      if (!entityById.has(entityId)) orphanEntityRefs.push(`${event.id}:${entityId}`);
    }
    for (const placeId of event.placeEntityIds || []) {
      const entity = entityById.get(placeId);
      if (!entity) orphanPlaceRefs.push(`${event.id}:${placeId}`);
      else if (entity.type !== 'place') nonPlaceRefs.push(`${event.id}:${placeId}`);
    }
  }

  const invalidEntityIds = entities
    .filter(entity => !isStructurallyValidEntity(entity))
    .map(entity => entity.id || '(missing-id)');
  const invalidEventIds = events
    .filter(event => !isStructurallyValidEvent(event))
    .map(event => event.id || '(missing-id)');

  const result = {
    duplicateEntityIds,
    duplicateEventIds,
    orphanEntityRefs: [...new Set(orphanEntityRefs)].sort(),
    orphanPlaceRefs: [...new Set(orphanPlaceRefs)].sort(),
    nonPlaceRefs: [...new Set(nonPlaceRefs)].sort(),
    invalidEntityIds: [...new Set(invalidEntityIds)].sort(),
    invalidEventIds: [...new Set(invalidEventIds)].sort(),
  };

  return {
    valid: Object.values(result).every(values => values.length === 0),
    ...result,
  };
}

function normalizeAliasRecords(aliases) {
  if (!Array.isArray(aliases)) throw new TypeError('entity.aliases must be an array');
  return aliases.map(alias => {
    if (typeof alias === 'string') {
      return Object.freeze({ value: alias, normalized: normalizeAlias(alias), evidenceRefs: [] });
    }
    requireObject(alias, 'entity alias');
    requireNonEmptyString(alias.value, 'entity alias.value');
    return Object.freeze({
      value: alias.value,
      normalized: normalizeAlias(alias.value),
      evidenceRefs: normalizeStringList(alias.evidenceRefs || []),
      sourceNative: alias.sourceNative === true,
    });
  });
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) throw new TypeError('expected an array');
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].sort();
}

function normalizeStandardIds(value) {
  if (value == null) return null;
  requireObject(value, 'entity.standardIds');
  const normalized = { ...value };
  if (normalized.m49 != null) normalized.m49 = normalizeM49(normalized.m49);
  if (normalized.isoAlpha2 != null) normalized.isoAlpha2 = normalizeIso(normalized.isoAlpha2, 2, 'standardIds.isoAlpha2');
  if (normalized.isoAlpha3 != null) normalized.isoAlpha3 = normalizeIso(normalized.isoAlpha3, 3, 'standardIds.isoAlpha3');
  return Object.freeze(normalized);
}

function normalizeM49(value) {
  const m49 = String(value || '').padStart(3, '0');
  if (!/^\d{3}$/.test(m49)) throw new TypeError('place.m49 must be a three-digit code');
  return m49;
}

function normalizeIso(value, length, field) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!new RegExp(`^[A-Z]{${length}}$`).test(normalized)) {
    throw new TypeError(`${field} must be ${length} ASCII letters`);
  }
  return normalized;
}

function addAlias(index, value, entityId) {
  const normalized = normalizeAlias(value);
  if (!index.has(normalized)) index.set(normalized, new Set());
  index.get(normalized).add(entityId);
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

function isStructurallyValidEntity(entity) {
  return Boolean(
    entity &&
      typeof entity.id === 'string' &&
      ENTITY_TYPE_SET.has(entity.type) &&
      typeof entity.identityKey === 'string' &&
      typeof entity.displayName === 'string' &&
      entity.id === makeStableEntityId(entity.type, entity.identityKey)
  );
}

function isStructurallyValidEvent(event) {
  return Boolean(
    event &&
      typeof event.id === 'string' &&
      typeof event.eventKey === 'string' &&
      typeof event.title === 'string' &&
      typeof event.eventType === 'string' &&
      EVENT_STATUS_SET.has(event.status) &&
      event.id === makeStableEventId(event.eventKey)
  );
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function requireOneOf(value, allowed, field) {
  if (!allowed.has(value)) throw new TypeError(`${field} is not supported`);
}

function clonePlainValue(value) {
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

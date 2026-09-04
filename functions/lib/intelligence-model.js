// Deterministic intelligence primitives. Identity is explicit; fuzzy similarity never merges records.
export const INTELLIGENCE_MODEL_VERSION = '2026-09-03.1';
export const ENTITY_TYPES = Object.freeze([
  'person', 'organization', 'government-public-body', 'company', 'place', 'multilateral-body',
]);
export const EVENT_STATUSES = Object.freeze(['developing', 'confirmed', 'closed', 'disputed']);
const ENTITY_TYPE_SET = new Set(ENTITY_TYPES);
const EVENT_STATUS_SET = new Set(EVENT_STATUSES);

export function createEntity(definition) {
  object(definition, 'entity definition');
  text(definition.identityKey, 'entity.identityKey');
  text(definition.displayName, 'entity.displayName');
  oneOf(definition.type, ENTITY_TYPE_SET, 'entity.type');
  const normalizedStandardIds = standardIds(definition.standardIds || null);
  if (definition.type === 'place' && definition.identityKey.startsWith('m49:')) {
    const keyM49 = m49Code(definition.identityKey.slice(4));
    if (definition.identityKey !== `m49:${keyM49}` || normalizedStandardIds?.m49 !== keyM49) {
      throw new TypeError('M49 place identity requires canonical identityKey and matching standardIds.m49');
    }
  }
  return Object.freeze({
    id: makeStableEntityId(definition.type, definition.identityKey),
    identityKey: definition.identityKey,
    type: definition.type,
    displayName: definition.displayName,
    aliases: aliasRecords(definition.aliases || []),
    evidenceRefs: stringList(definition.evidenceRefs || []),
    countryEntityId: definition.countryEntityId || null,
    standardIds: normalizedStandardIds,
    attributes: clone(definition.attributes ?? {}),
    createdAt: definition.createdAt || null,
    reviewedAt: definition.reviewedAt || null,
  });
}

export function createM49PlaceEntity(definition) {
  object(definition, 'M49 place definition');
  const m49 = m49Code(definition.m49);
  const isoAlpha2 = isoCode(definition.isoAlpha2, 2, 'place.isoAlpha2');
  const isoAlpha3 = isoCode(definition.isoAlpha3, 3, 'place.isoAlpha3');
  return createEntity({
    ...definition,
    identityKey: `m49:${m49}`,
    type: 'place',
    standardIds: { ...(definition.standardIds || {}), m49, isoAlpha2, isoAlpha3 },
  });
}

export function createEvent(definition) {
  object(definition, 'event definition');
  text(definition.eventKey, 'event.eventKey');
  text(definition.title, 'event.title');
  text(definition.eventType, 'event.eventType');
  oneOf(definition.status, EVENT_STATUS_SET, 'event.status');
  return Object.freeze({
    id: makeStableEventId(definition.eventKey),
    eventKey: definition.eventKey,
    title: definition.title,
    eventType: definition.eventType,
    status: definition.status,
    observedAt: definition.observedAt || null,
    startedAt: definition.startedAt || null,
    endedAt: definition.endedAt || null,
    entityIds: stringList(definition.entityIds || []),
    placeEntityIds: stringList(definition.placeEntityIds || []),
    articleIds: stringList(definition.articleIds || []),
    unknowns: stringList(definition.unknowns || []),
    evidenceRefs: stringList(definition.evidenceRefs || []),
    createdAt: definition.createdAt || null,
    reviewedAt: definition.reviewedAt || null,
  });
}

export function makeStableEntityId(type, identityKey) {
  oneOf(type, ENTITY_TYPE_SET, 'entity.type');
  text(identityKey, 'entity.identityKey');
  if (type === 'place' && identityKey.startsWith('m49:')) {
    const code = m49Code(identityKey.slice(4));
    if (identityKey !== `m49:${code}`) throw new TypeError('M49 place identityKey must use a canonical three-digit code');
    return `place:m49:${code}`;
  }
  return `entity:${type}:${fnv1a(`${type}\u001f${identityKey}`)}`;
}

export function makeStableEventId(eventKey) {
  text(eventKey, 'event.eventKey');
  return `event:${fnv1a(eventKey)}`;
}

export function normalizeAlias(value) {
  text(value, 'alias');
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
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
  const matches = [...(buildAliasIndex(entities).get(normalized) || [])].sort();
  if (!matches.length) return { status: 'no-match', normalized, entityIds: [] };
  if (matches.length === 1) return { status: 'matched', normalized, entityId: matches[0], entityIds: matches };
  return { status: 'ambiguous', normalized, entityIds: matches };
}

export function validateIntelligenceGraph({ entities = [], events = [] } = {}) {
  const entityById = new Map(entities.map(entity => [entity.id, entity]));
  const orphanEntityRefs = [];
  const orphanPlaceRefs = [];
  const nonPlaceRefs = [];
  for (const event of events) {
    for (const id of event.entityIds || []) if (!entityById.has(id)) orphanEntityRefs.push(`${event.id}:${id}`);
    for (const id of event.placeEntityIds || []) {
      const entity = entityById.get(id);
      if (!entity) orphanPlaceRefs.push(`${event.id}:${id}`);
      else if (entity.type !== 'place') nonPlaceRefs.push(`${event.id}:${id}`);
    }
  }
  const result = {
    duplicateEntityIds: duplicates(entities.map(entity => entity.id)),
    duplicateEventIds: duplicates(events.map(event => event.id)),
    orphanEntityRefs: unique(orphanEntityRefs),
    orphanPlaceRefs: unique(orphanPlaceRefs),
    nonPlaceRefs: unique(nonPlaceRefs),
    invalidEntityIds: unique(entities.filter(entity => !validEntity(entity)).map(entity => entity.id || '(missing-id)')),
    invalidEventIds: unique(events.filter(event => !validEvent(event)).map(event => event.id || '(missing-id)')),
  };
  return { valid: Object.values(result).every(values => values.length === 0), ...result };
}

function aliasRecords(aliases) {
  if (!Array.isArray(aliases)) throw new TypeError('entity.aliases must be an array');
  return aliases.map(alias => {
    object(alias, 'entity alias');
    text(alias.value, 'entity alias.value');
    const evidenceRefs = stringList(alias.evidenceRefs || []);
    if (!evidenceRefs.length) throw new TypeError('entity alias.evidenceRefs must not be empty');
    return Object.freeze({ value: alias.value, normalized: normalizeAlias(alias.value), evidenceRefs, sourceNative: alias.sourceNative === true });
  });
}

function stringList(values) {
  if (!Array.isArray(values)) throw new TypeError('expected an array');
  return unique(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()));
}

function standardIds(value) {
  if (value == null) return null;
  object(value, 'entity.standardIds');
  const out = { ...value };
  if (out.m49 != null) out.m49 = m49Code(out.m49);
  if (out.isoAlpha2 != null) out.isoAlpha2 = isoCode(out.isoAlpha2, 2, 'standardIds.isoAlpha2');
  if (out.isoAlpha3 != null) out.isoAlpha3 = isoCode(out.isoAlpha3, 3, 'standardIds.isoAlpha3');
  return Object.freeze(out);
}

function m49Code(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,3}$/.test(raw)) throw new TypeError('place.m49 must be a one-to-three digit code');
  const normalized = raw.padStart(3, '0');
  if (normalized === '000') throw new TypeError('place.m49 000 is not a valid country/area identity code');
  return normalized;
}

function isoCode(value, length, field) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!new RegExp(`^[A-Z]{${length}}$`).test(normalized)) throw new TypeError(`${field} must be ${length} ASCII letters`);
  return normalized;
}

function validEntity(entity) {
  return Boolean(entity && typeof entity.id === 'string' && ENTITY_TYPE_SET.has(entity.type) &&
    typeof entity.identityKey === 'string' && typeof entity.displayName === 'string' &&
    Array.isArray(entity.aliases) && entity.aliases.every(alias => Array.isArray(alias.evidenceRefs) && alias.evidenceRefs.length) &&
    entity.id === makeStableEntityId(entity.type, entity.identityKey));
}

function validEvent(event) {
  return Boolean(event && typeof event.id === 'string' && typeof event.eventKey === 'string' &&
    typeof event.title === 'string' && typeof event.eventType === 'string' && EVENT_STATUS_SET.has(event.status) &&
    event.id === makeStableEventId(event.eventKey));
}

function addAlias(index, value, entityId) {
  const normalized = normalizeAlias(value);
  if (!index.has(normalized)) index.set(normalized, new Set());
  index.get(normalized).add(entityId);
}
function duplicates(values) { const seen = new Set(); const repeated = new Set(); for (const value of values) { if (seen.has(value)) repeated.add(value); seen.add(value); } return [...repeated].sort(); }
function unique(values) { return [...new Set(values)].sort(); }
function fnv1a(value) { let hash = 0x811c9dc5; for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash.toString(16).padStart(8, '0'); }
function object(value, field) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${field} must be an object`); }
function text(value, field) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string`); }
function oneOf(value, allowed, field) { if (!allowed.has(value)) throw new TypeError(`${field} is not supported`); }
function clone(value) { if (value == null || typeof value !== 'object') return value; return JSON.parse(JSON.stringify(value)); }

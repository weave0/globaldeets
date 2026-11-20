// GD-051: Independently reviewed organizational relationships for monitored publishers.
// This is intentionally separate from the operator labels in SOURCE_PROVENANCE.
// An edge describes only its stated relationship, not coordinated reporting, bias,
// editorial control, the origin of a particular story, or unknown ultimate ownership.
import { SOURCE_PROVENANCE } from './news-source-provenance.js';

export const OWNERSHIP_EVIDENCE_REVIEW_DATE = '2026-11-19';
export const OWNERSHIP_EVIDENCE_SCHEMA_VERSION = 1;
export const RELATION_TYPES = Object.freeze([
  'published-by', 'owned-by', 'operated-by', 'part-of-group', 'part-of-network',
]);

// An entity ID is a persistent internal key, not proof of a registered legal name.
export const OWNERSHIP_ENTITIES = Object.freeze([
  { id: 'guardian-news-media', name: 'Guardian News & Media', country: 'GB' },
  { id: 'guardian-media-group', name: 'Guardian Media Group', country: 'GB' },
  { id: 'scott-trust-limited', name: 'The Scott Trust Limited', country: 'GB' },
  { id: 'france-medias-monde', name: 'France Médias Monde', country: 'FR' },
  { id: 'mediacorp', name: 'Mediacorp', country: 'SG' },
  { id: 'states-newsroom', name: 'States Newsroom', country: 'US' },
]);

// Direction always reads "subject RELATION target". Links are first-party
// organizational disclosures; their scope is limited to the quoted relationship.
// Research candidates, unverified equities, funding links and individual people
// are not eligible for this reviewed dataset.
export const OWNERSHIP_EDGES = Object.freeze([
  {
    id: 'guardian-published-by-gnm',
    fromSourceId: 'guardian',
    relation: 'published-by',
    toEntityId: 'guardian-news-media',
    summary: 'Guardian News & Media publishes the Guardian website and newspaper.',
    reviewedAt: '2026-11-19',
    evidence: [{ title: 'The Guardian: About us', url: 'https://www.theguardian.com/about' }],
  },
  {
    id: 'gnm-owned-by-gmg',
    fromEntityId: 'guardian-news-media',
    relation: 'owned-by',
    toEntityId: 'guardian-media-group',
    summary: 'Guardian Media Group identifies Guardian News & Media as an owned core business.',
    reviewedAt: '2026-11-19',
    evidence: [{ title: 'The Guardian: Organization', url: 'https://www.theguardian.com/about/organisation' }],
  },
  {
    id: 'gmg-owned-by-scott-trust',
    fromEntityId: 'guardian-media-group',
    relation: 'owned-by',
    toEntityId: 'scott-trust-limited',
    summary: 'The Scott Trust is identified as the sole shareholder of Guardian Media Group.',
    reviewedAt: '2026-11-19',
    evidence: [{ title: 'Guardian Media Group: Annual financial reports', url: 'https://www.theguardian.com/gmg/2015/jul/27/guardian-media-group-annual-financial-reports' }],
  },
  {
    id: 'france24-part-of-fmm',
    fromSourceId: 'france-24',
    relation: 'part-of-group',
    toEntityId: 'france-medias-monde',
    summary: 'France 24 is one of the media services in the France Médias Monde group; this entry does not assert a shareholding percentage.',
    reviewedAt: '2026-11-19',
    evidence: [{ title: 'France Médias Monde: Le groupe', url: 'https://www.francemediasmonde.com/le-groupe/' }],
  },
  {
    id: 'cna-operated-by-mediacorp',
    fromSourceId: 'cna',
    relation: 'operated-by',
    toEntityId: 'mediacorp',
    summary: 'CNA describes itself as established by Mediacorp, which lists CNA among its operating platforms.',
    reviewedAt: '2026-11-19',
    evidence: [{ title: 'CNA: About CNA and Mediacorp', url: 'https://www.channelnewsasia.com/about-us' }],
  },
  {
    id: 'minnesota-reformer-states-newsroom',
    fromSourceId: 'minnesota-reformer',
    relation: 'part-of-network',
    toEntityId: 'states-newsroom',
    summary: 'States Newsroom identifies Minnesota Reformer as part of its state-focused nonprofit newsroom network; network membership is not proof of equity ownership.',
    reviewedAt: '2026-11-19',
    evidence: [{ title: 'States Newsroom: Minnesota Reformer fifth anniversary', url: 'https://statesnewsroom.com/press-releases/minnesota-reformer-marks-5-years-covering-state-legislature-politics-policy/' }],
  },
]);

function safeEvidenceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      Boolean(url.hostname) && url.hostname !== 'localhost';
  } catch { return false; }
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateOwnershipEvidence(
  sources = SOURCE_PROVENANCE,
  entities = OWNERSHIP_ENTITIES,
  edges = OWNERSHIP_EDGES
) {
  const errors = [];
  if (!Array.isArray(sources) || !Array.isArray(entities) || !Array.isArray(edges)) {
    return { valid: false, errors: ['registry-arrays-required'] };
  }
  const sourceIds = new Set(sources.map(source => source?.sourceId));
  const entityIds = new Set();
  for (const entity of entities) {
    if (!entity || typeof entity.id !== 'string' ||
        !/^[a-z0-9-]+$/.test(entity.id) || entityIds.has(entity.id) ||
        typeof entity.name !== 'string' || !entity.name.trim() ||
        !/^[A-Z]{2}$/.test(entity.country || '')) {
      errors.push('invalid-or-duplicate-entity');
    } else entityIds.add(entity.id);
  }
  const edgeIds = new Set();
  const adjacency = new Map();
  for (const edge of edges) {
    if (!edge || typeof edge.id !== 'string' ||
        !/^[a-z0-9-]+$/.test(edge.id) || edgeIds.has(edge.id)) {
      errors.push('invalid-or-duplicate-edge');
      continue;
    }
    edgeIds.add(edge.id);
    const fromSource = typeof edge.fromSourceId === 'string';
    const fromEntity = typeof edge.fromEntityId === 'string';
    if (fromSource === fromEntity ||
        (fromSource && !sourceIds.has(edge.fromSourceId)) ||
        (fromEntity && !entityIds.has(edge.fromEntityId)) ||
        !entityIds.has(edge.toEntityId) ||
        (fromEntity && edge.fromEntityId === edge.toEntityId) ||
        !RELATION_TYPES.includes(edge.relation) ||
        typeof edge.summary !== 'string' || !edge.summary.trim() ||
        !validDate(edge.reviewedAt) ||
        !Array.isArray(edge.evidence) || edge.evidence.length === 0 ||
        !edge.evidence.every(ref => ref &&
          typeof ref.title === 'string' && ref.title.trim() &&
          typeof ref.url === 'string' && safeEvidenceUrl(ref.url))) {
      errors.push('invalid-edge:' + edge.id);
    }
    if (fromEntity && entityIds.has(edge.fromEntityId) && entityIds.has(edge.toEntityId)) {
      if (!adjacency.has(edge.fromEntityId)) adjacency.set(edge.fromEntityId, []);
      adjacency.get(edge.fromEntityId).push(edge.toEntityId);
    }
  }
  // Entity-to-entity ownership and membership paths must not contain a cycle.
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) || []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const id of entityIds) {
    if (visit(id)) { errors.push('cyclic-entity-relationships'); break; }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)].sort() };
}

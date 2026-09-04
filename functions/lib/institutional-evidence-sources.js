// Reviewed evidence-role overlay for selected entries in the existing Knowledge catalog.
// A directory/source identity is not an ingestion endpoint; collection remains disabled until separately reviewed.
import { createEntity } from './intelligence-model.js';

export const INSTITUTIONAL_REVIEW_DATE = '2026-09-03';
export const INSTITUTIONAL_EVIDENCE_ROLES = Object.freeze([
  'issuing-primary',
  'official-repository',
  'research-repository',
  'watchdog',
  'secondary-reference',
]);
export const COLLECTION_STATES = Object.freeze(['directory-only', 'endpoint-reviewed']);

const ROLE_SET = new Set(INSTITUTIONAL_EVIDENCE_ROLES);
const COLLECTION_STATE_SET = new Set(COLLECTION_STATES);

export const INSTITUTIONAL_ENTITIES = Object.freeze([
  institution('United Nations', 'multilateral-body', 'institution:un', 'https://www.un.org'),
  institution('World Bank', 'multilateral-body', 'institution:world-bank', 'https://data.worldbank.org'),
  institution('European Union Open Data', 'government-public-body', 'institution:eu-open-data', 'https://data.europa.eu'),
  institution('U.S. General Services Administration', 'government-public-body', 'institution:us-gsa-data-gov', 'https://data.gov'),
  institution('National Aeronautics and Space Administration', 'government-public-body', 'institution:nasa', 'https://data.nasa.gov'),
  institution('World Health Organization', 'multilateral-body', 'institution:who', 'https://www.who.int/data/gho'),
  institution('United States Environmental Protection Agency', 'government-public-body', 'institution:us-epa', 'https://www.epa.gov/environmental-topics'),
  institution('International Monetary Fund', 'multilateral-body', 'institution:imf', 'https://www.imf.org/en/Data'),
  institution('Eurostat', 'government-public-body', 'institution:eurostat', 'https://ec.europa.eu/eurostat'),
  institution('Centers for Disease Control and Prevention', 'government-public-body', 'institution:us-cdc', 'https://www.cdc.gov/datastatistics/index.html'),
]);

export const REVIEWED_INSTITUTIONAL_SOURCES = Object.freeze([
  source({
    sourceId: 'knowledge:governance:united-nations',
    knowledgeCategoryId: 'governance',
    knowledgeName: 'United Nations',
    knowledgeUrl: 'https://www.un.org',
    organizationEntityId: entityId('institution:un', 'multilateral-body'),
    sourceClass: 'multilateral-institution',
    evidenceRole: 'issuing-primary',
    jurisdiction: 'global',
    documentTypes: ['government-release', 'multilateral-publication', 'official-record'],
  }),
  source({
    sourceId: 'knowledge:governance:world-bank-open-data',
    knowledgeCategoryId: 'governance',
    knowledgeName: 'World Bank Open Data',
    knowledgeUrl: 'https://data.worldbank.org',
    organizationEntityId: entityId('institution:world-bank', 'multilateral-body'),
    sourceClass: 'multilateral-data-portal',
    evidenceRole: 'official-repository',
    jurisdiction: 'global',
    documentTypes: ['dataset', 'statistical-release'],
  }),
  source({
    sourceId: 'knowledge:governance:eu-open-data',
    knowledgeCategoryId: 'governance',
    knowledgeName: 'EU Open Data Portal',
    knowledgeUrl: 'https://data.europa.eu',
    organizationEntityId: entityId('institution:eu-open-data', 'government-public-body'),
    sourceClass: 'public-data-portal',
    evidenceRole: 'official-repository',
    jurisdiction: 'European Union',
    documentTypes: ['dataset', 'official-record'],
  }),
  source({
    sourceId: 'knowledge:governance:data-gov',
    knowledgeCategoryId: 'governance',
    knowledgeName: 'U.S. Data.gov',
    knowledgeUrl: 'https://data.gov',
    organizationEntityId: entityId('institution:us-gsa-data-gov', 'government-public-body'),
    sourceClass: 'government-data-portal',
    evidenceRole: 'official-repository',
    jurisdiction: 'US',
    documentTypes: ['dataset', 'official-record'],
  }),
  source({
    sourceId: 'knowledge:science:nasa-open-data',
    knowledgeCategoryId: 'science',
    knowledgeName: 'NASA Open Data',
    knowledgeUrl: 'https://data.nasa.gov',
    organizationEntityId: entityId('institution:nasa', 'government-public-body'),
    sourceClass: 'government-data-portal',
    evidenceRole: 'official-repository',
    jurisdiction: 'US',
    documentTypes: ['dataset', 'official-record'],
  }),
  source({
    sourceId: 'knowledge:science:who-gho',
    knowledgeCategoryId: 'science',
    knowledgeName: 'WHO Global Health Observatory',
    knowledgeUrl: 'https://www.who.int/data/gho',
    organizationEntityId: entityId('institution:who', 'multilateral-body'),
    sourceClass: 'multilateral-health-authority',
    evidenceRole: 'issuing-primary',
    jurisdiction: 'global',
    documentTypes: ['dataset', 'statistical-release', 'multilateral-publication'],
  }),
  source({
    sourceId: 'knowledge:environment:epa-data',
    knowledgeCategoryId: 'environment',
    knowledgeName: 'EPA Environmental Data',
    knowledgeUrl: 'https://www.epa.gov/environmental-topics',
    organizationEntityId: entityId('institution:us-epa', 'government-public-body'),
    sourceClass: 'government-regulator',
    evidenceRole: 'issuing-primary',
    jurisdiction: 'US',
    documentTypes: ['dataset', 'regulator-release', 'official-record'],
  }),
  source({
    sourceId: 'knowledge:economy:imf-data',
    knowledgeCategoryId: 'economy',
    knowledgeName: 'IMF Data',
    knowledgeUrl: 'https://www.imf.org/en/Data',
    organizationEntityId: entityId('institution:imf', 'multilateral-body'),
    sourceClass: 'multilateral-financial-institution',
    evidenceRole: 'issuing-primary',
    jurisdiction: 'global',
    documentTypes: ['dataset', 'statistical-release', 'multilateral-publication'],
  }),
  source({
    sourceId: 'knowledge:economy:eurostat',
    knowledgeCategoryId: 'economy',
    knowledgeName: 'Eurostat',
    knowledgeUrl: 'https://ec.europa.eu/eurostat',
    organizationEntityId: entityId('institution:eurostat', 'government-public-body'),
    sourceClass: 'statistical-office',
    evidenceRole: 'issuing-primary',
    jurisdiction: 'European Union',
    documentTypes: ['dataset', 'statistical-release'],
  }),
  source({
    sourceId: 'knowledge:health:cdc-data',
    knowledgeCategoryId: 'health',
    knowledgeName: 'CDC Data & Statistics',
    knowledgeUrl: 'https://www.cdc.gov/datastatistics/index.html',
    organizationEntityId: entityId('institution:us-cdc', 'government-public-body'),
    sourceClass: 'government-health-authority',
    evidenceRole: 'issuing-primary',
    jurisdiction: 'US',
    documentTypes: ['dataset', 'government-release', 'official-record'],
  }),
]);

export function validateInstitutionalSourceRegistry(
  knowledgeCatalog,
  entities = INSTITUTIONAL_ENTITIES,
  registry = REVIEWED_INSTITUTIONAL_SOURCES
) {
  const catalogRefs = new Set(flattenKnowledgeCatalog(knowledgeCatalog).map(item => knowledgeKey(item.categoryId, item.name, item.url)));
  const entityIds = new Set(entities.map(entity => entity.id));
  const sourceIds = registry.map(item => item.sourceId);
  const knowledgeRefs = registry.map(item => knowledgeKey(item.knowledgeCategoryId, item.knowledgeName, item.knowledgeUrl));

  const duplicateSourceIds = duplicates(sourceIds);
  const duplicateKnowledgeRefs = duplicates(knowledgeRefs);
  const missingKnowledgeRefs = registry
    .filter(item => !catalogRefs.has(knowledgeKey(item.knowledgeCategoryId, item.knowledgeName, item.knowledgeUrl)))
    .map(item => item.sourceId);
  const orphanOrganizationRefs = registry
    .filter(item => !entityIds.has(item.organizationEntityId))
    .map(item => item.sourceId);
  const invalidEntries = registry.filter(item => !validSource(item)).map(item => item.sourceId);
  const unsafeCollectionRefs = registry
    .filter(item => item.collectionEligible && !item.machineReadableEndpoints.some(endpoint => endpoint.reviewStatus === 'verified'))
    .map(item => item.sourceId);

  return {
    valid:
      duplicateSourceIds.length === 0 &&
      duplicateKnowledgeRefs.length === 0 &&
      missingKnowledgeRefs.length === 0 &&
      orphanOrganizationRefs.length === 0 &&
      invalidEntries.length === 0 &&
      unsafeCollectionRefs.length === 0,
    duplicateSourceIds,
    duplicateKnowledgeRefs,
    missingKnowledgeRefs: unique(missingKnowledgeRefs),
    orphanOrganizationRefs: unique(orphanOrganizationRefs),
    invalidEntries: unique(invalidEntries),
    unsafeCollectionRefs: unique(unsafeCollectionRefs),
  };
}

export function institutionalRegistrySummary() {
  return {
    reviewedSources: REVIEWED_INSTITUTIONAL_SOURCES.length,
    issuingPrimarySources: REVIEWED_INSTITUTIONAL_SOURCES.filter(item => item.evidenceRole === 'issuing-primary').length,
    collectionEligibleSources: REVIEWED_INSTITUTIONAL_SOURCES.filter(item => item.collectionEligible).length,
    knowledgeCatalogIsIngestionAuthority: false,
    endpointReviewRequired: true,
  };
}

function institution(displayName, type, identityKey, evidenceUrl) {
  return createEntity({
    displayName,
    type,
    identityKey,
    evidenceRefs: [evidenceUrl],
    reviewedAt: INSTITUTIONAL_REVIEW_DATE,
  });
}

function source(definition) {
  if (!ROLE_SET.has(definition.evidenceRole)) throw new TypeError('institutional evidence role is not supported');
  return Object.freeze({
    ...definition,
    canonicalBaseUrl: definition.knowledgeUrl,
    machineReadableEndpoints: Object.freeze([]),
    collectionState: 'directory-only',
    collectionEligible: false,
    authenticationRequirement: 'unknown',
    licensingRequirement: 'unknown',
    evidenceUrls: Object.freeze([definition.knowledgeUrl]),
    reviewStatus: 'reviewed-classification',
    reviewedAt: INSTITUTIONAL_REVIEW_DATE,
  });
}

function validSource(item) {
  return Boolean(
    item &&
      typeof item.sourceId === 'string' &&
      typeof item.knowledgeCategoryId === 'string' &&
      typeof item.knowledgeName === 'string' &&
      typeof item.knowledgeUrl === 'string' &&
      typeof item.organizationEntityId === 'string' &&
      ROLE_SET.has(item.evidenceRole) &&
      COLLECTION_STATE_SET.has(item.collectionState) &&
      Array.isArray(item.documentTypes) &&
      item.documentTypes.length > 0 &&
      Array.isArray(item.evidenceUrls) &&
      item.evidenceUrls.length > 0 &&
      Array.isArray(item.machineReadableEndpoints) &&
      item.reviewStatus === 'reviewed-classification' &&
      item.collectionEligible === false
  );
}

function flattenKnowledgeCatalog(catalog) {
  if (!Array.isArray(catalog)) throw new TypeError('knowledge catalog must be an array');
  return catalog.flatMap(category =>
    (category.sources || []).map(item => ({ categoryId: category.id, name: item.name, url: item.url }))
  );
}
function knowledgeKey(categoryId, name, url) {
  return `${categoryId}\u001f${name}\u001f${url}`;
}
function entityId(identityKey, type) {
  const match = INSTITUTIONAL_ENTITIES.find(entity => entity.type === type && entity.identityKey === identityKey);
  if (!match) throw new TypeError(`missing institutional entity ${identityKey}`);
  return match.id;
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

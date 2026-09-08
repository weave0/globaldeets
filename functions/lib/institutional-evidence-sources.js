// Reviewed evidence-role overlay for selected entries in the existing Knowledge catalog.
// Directory/source identity is not ingestion authority. Endpoint authority, access/use review,
// and explicit collection enablement remain separate gates.
import { createEntity } from './intelligence-model.js';

export const INSTITUTIONAL_REVIEW_DATE = '2026-09-03';
export const ACQUISITION_REVIEW_DATE = '2026-09-08';
export const INSTITUTIONAL_EVIDENCE_ROLES = Object.freeze([
  'issuing-primary',
  'official-repository',
  'research-repository',
  'watchdog',
  'secondary-reference',
]);
export const COLLECTION_STATES = Object.freeze(['directory-only', 'endpoint-reviewed']);
export const ENDPOINT_AUTHORITY_STATES = Object.freeze([
  'first-party',
  'authorized-third-party',
  'unverified-third-party',
]);
export const ACCESS_USE_STATES = Object.freeze([
  'verified-public-use',
  'permission-required',
  'contract-required',
  'unknown',
  'prohibited',
]);

const ROLE_SET = new Set(INSTITUTIONAL_EVIDENCE_ROLES);
const COLLECTION_STATE_SET = new Set(COLLECTION_STATES);
const ENDPOINT_AUTHORITY_SET = new Set(ENDPOINT_AUTHORITY_STATES);
const ACCESS_USE_SET = new Set(ACCESS_USE_STATES);

export const INSTITUTIONAL_ENTITIES = Object.freeze([
  institution('United Nations', 'multilateral-body', 'institution:un', 'https://www.un.org'),
  institution('World Bank', 'multilateral-body', 'institution:world-bank', 'https://data.worldbank.org'),
  institution('Publications Office of the European Union', 'government-public-body', 'institution:eu-publications-office', 'https://data.europa.eu/en/legal-notice'),
  institution('U.S. General Services Administration', 'government-public-body', 'institution:us-gsa-data-gov', 'https://data.gov/about/'),
  institution('National Aeronautics and Space Administration', 'government-public-body', 'institution:nasa', 'https://data.nasa.gov'),
  institution('World Health Organization', 'multilateral-body', 'institution:who', 'https://www.who.int/data/gho/info/about-the-observatory'),
  institution('United States Environmental Protection Agency', 'government-public-body', 'institution:us-epa', 'https://www.epa.gov/environmental-topics'),
  institution('International Monetary Fund', 'multilateral-body', 'institution:imf', 'https://www.imf.org/en/Data'),
  institution('Eurostat', 'government-public-body', 'institution:eurostat', 'https://ec.europa.eu/eurostat/about-us'),
  institution('Centers for Disease Control and Prevention', 'government-public-body', 'institution:us-cdc', 'https://www.cdc.gov/datastatistics/index.html'),
]);

const EUROSTAT_DENSITY_ENDPOINT = endpoint({
  endpointId: 'eurostat:statistics-api:demo-r-d3dens:eu27-latest',
  url: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/DEMO_R_D3DENS?lang=EN&geo=EU27_2020&lastTimePeriod=1',
  endpointType: 'json-api',
  endpointAuthority: 'first-party',
  authorityEvidenceUrls: [
    'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/api',
  ],
  authenticationRequirement: 'none',
  accessUseStatus: 'verified-public-use',
  usageEvidenceUrls: ['https://ec.europa.eu/eurostat/help/copyright-notice'],
  intendedUses: ['internal-evidence-retrieval', 'dataset-snapshot', 'source-attributed-display'],
  documentTypes: ['dataset', 'statistical-release'],
  reviewStatus: 'verified',
  reviewedAt: ACQUISITION_REVIEW_DATE,
  collectionEligible: true,
});

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
    organizationEntityId: entityId('institution:eu-publications-office', 'government-public-body'),
    sourceClass: 'public-data-portal',
    evidenceRole: 'official-repository',
    jurisdiction: 'European Union',
    documentTypes: ['dataset', 'official-record'],
    evidenceUrls: ['https://data.europa.eu/en/legal-notice'],
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
    evidenceUrls: ['https://data.gov/about/'],
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
    evidenceUrls: ['https://www.who.int/data/gho/info/about-the-observatory'],
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
    evidenceUrls: ['https://ec.europa.eu/eurostat/about-us'],
    machineReadableEndpoints: [EUROSTAT_DENSITY_ENDPOINT],
    collectionState: 'endpoint-reviewed',
    collectionEligible: true,
    authenticationRequirement: 'none',
    licensingRequirement: 'attribution-and-stated-exceptions',
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

export function findReviewedInstitutionalSource(categoryId, name, url) {
  const key = knowledgeKey(categoryId, name, url);
  return REVIEWED_INSTITUTIONAL_SOURCES.find(item =>
    knowledgeKey(item.knowledgeCategoryId, item.knowledgeName, item.knowledgeUrl) === key
  ) || null;
}

export function findCollectionEndpoint(endpointId) {
  for (const sourceRecord of REVIEWED_INSTITUTIONAL_SOURCES) {
    const found = sourceRecord.machineReadableEndpoints.find(item => item.endpointId === endpointId);
    if (found) return { source: sourceRecord, endpoint: found };
  }
  return null;
}

export function validateInstitutionalSourceRegistry(
  knowledgeCatalog,
  entities = INSTITUTIONAL_ENTITIES,
  registry = REVIEWED_INSTITUTIONAL_SOURCES
) {
  const catalogRefs = new Set(flattenKnowledgeCatalog(knowledgeCatalog).map(item => knowledgeKey(item.categoryId, item.name, item.url)));
  const entityIds = new Set(entities.map(entity => entity.id));
  const sourceIds = registry.map(item => item.sourceId);
  const knowledgeRefs = registry.map(item => knowledgeKey(item.knowledgeCategoryId, item.knowledgeName, item.knowledgeUrl));
  const endpoints = registry.flatMap(item => item.machineReadableEndpoints.map(endpointRecord => ({ sourceId: item.sourceId, endpoint: endpointRecord })));
  const endpointIds = endpoints.map(item => item.endpoint.endpointId);
  const endpointUrls = endpoints.map(item => item.endpoint.url);

  const duplicateSourceIds = duplicates(sourceIds);
  const duplicateKnowledgeRefs = duplicates(knowledgeRefs);
  const duplicateEndpointIds = duplicates(endpointIds);
  const duplicateEndpointUrls = duplicates(endpointUrls);
  const missingKnowledgeRefs = registry
    .filter(item => !catalogRefs.has(knowledgeKey(item.knowledgeCategoryId, item.knowledgeName, item.knowledgeUrl)))
    .map(item => item.sourceId);
  const orphanOrganizationRefs = registry
    .filter(item => !entityIds.has(item.organizationEntityId))
    .map(item => item.sourceId);
  const invalidEntries = registry.filter(item => !validSource(item)).map(item => item.sourceId);
  const invalidEndpoints = endpoints
    .filter(item => !validEndpoint(item.endpoint))
    .map(item => `${item.sourceId}:${item.endpoint.endpointId || 'missing-endpoint-id'}`);
  const unsafeCollectionRefs = registry
    .filter(item => item.collectionEligible && (
      item.collectionState !== 'endpoint-reviewed' ||
      !item.machineReadableEndpoints.some(endpointRecord => endpointRecord.collectionEligible && endpointRecord.reviewStatus === 'verified' && endpointRecord.accessUseStatus === 'verified-public-use')
    ))
    .map(item => item.sourceId);

  return {
    valid:
      duplicateSourceIds.length === 0 &&
      duplicateKnowledgeRefs.length === 0 &&
      duplicateEndpointIds.length === 0 &&
      duplicateEndpointUrls.length === 0 &&
      missingKnowledgeRefs.length === 0 &&
      orphanOrganizationRefs.length === 0 &&
      invalidEntries.length === 0 &&
      invalidEndpoints.length === 0 &&
      unsafeCollectionRefs.length === 0,
    duplicateSourceIds,
    duplicateKnowledgeRefs,
    duplicateEndpointIds,
    duplicateEndpointUrls,
    missingKnowledgeRefs: unique(missingKnowledgeRefs),
    orphanOrganizationRefs: unique(orphanOrganizationRefs),
    invalidEntries: unique(invalidEntries),
    invalidEndpoints: unique(invalidEndpoints),
    unsafeCollectionRefs: unique(unsafeCollectionRefs),
  };
}

export function institutionalRegistrySummary() {
  const endpoints = REVIEWED_INSTITUTIONAL_SOURCES.flatMap(item => item.machineReadableEndpoints);
  return {
    reviewedSources: REVIEWED_INSTITUTIONAL_SOURCES.length,
    issuingPrimarySources: REVIEWED_INSTITUTIONAL_SOURCES.filter(item => item.evidenceRole === 'issuing-primary').length,
    endpointReviewedSources: REVIEWED_INSTITUTIONAL_SOURCES.filter(item => item.collectionState === 'endpoint-reviewed').length,
    verifiedEndpoints: endpoints.filter(item => item.reviewStatus === 'verified').length,
    collectionEligibleEndpoints: endpoints.filter(item => item.collectionEligible).length,
    collectionEligibleSources: REVIEWED_INSTITUTIONAL_SOURCES.filter(item => item.collectionEligible).length,
    knowledgeCatalogIsIngestionAuthority: false,
    endpointReviewRequired: true,
    observatoryIsCollectionAuthority: false,
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

function endpoint(definition) {
  return Object.freeze({
    ...definition,
    authorityEvidenceUrls: Object.freeze([...(definition.authorityEvidenceUrls || [])]),
    usageEvidenceUrls: Object.freeze([...(definition.usageEvidenceUrls || [])]),
    intendedUses: Object.freeze([...(definition.intendedUses || [])]),
    documentTypes: Object.freeze([...(definition.documentTypes || [])]),
  });
}

function source(definition) {
  if (!ROLE_SET.has(definition.evidenceRole)) throw new TypeError('institutional evidence role is not supported');
  return Object.freeze({
    ...definition,
    canonicalBaseUrl: definition.knowledgeUrl,
    machineReadableEndpoints: Object.freeze([...(definition.machineReadableEndpoints || [])]),
    collectionState: definition.collectionState || 'directory-only',
    collectionEligible: definition.collectionEligible === true,
    authenticationRequirement: definition.authenticationRequirement || 'unknown',
    licensingRequirement: definition.licensingRequirement || 'unknown',
    evidenceUrls: Object.freeze([...(definition.evidenceUrls ?? [definition.knowledgeUrl])]),
    reviewStatus: 'reviewed-classification',
    reviewedAt: INSTITUTIONAL_REVIEW_DATE,
  });
}

function validSource(item) {
  const collectionContractValid = !item.collectionEligible || (
    item.collectionState === 'endpoint-reviewed' &&
    item.machineReadableEndpoints.some(endpointRecord => endpointRecord.collectionEligible && endpointRecord.reviewStatus === 'verified' && endpointRecord.accessUseStatus === 'verified-public-use')
  );
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
      item.machineReadableEndpoints.every(validEndpoint) &&
      item.reviewStatus === 'reviewed-classification' &&
      collectionContractValid
  );
}

function validEndpoint(item) {
  if (!item || typeof item !== 'object') return false;
  const eligibleContract = !item.collectionEligible || (
    item.reviewStatus === 'verified' &&
    ['first-party', 'authorized-third-party'].includes(item.endpointAuthority) &&
    item.accessUseStatus === 'verified-public-use' &&
    item.authenticationRequirement !== 'unknown' &&
    item.authorityEvidenceUrls.length > 0 &&
    item.usageEvidenceUrls.length > 0
  );
  return Boolean(
    typeof item.endpointId === 'string' && item.endpointId.length > 0 &&
    typeof item.url === 'string' && /^https:\/\//.test(item.url) &&
    typeof item.endpointType === 'string' && item.endpointType.length > 0 &&
    ENDPOINT_AUTHORITY_SET.has(item.endpointAuthority) &&
    ACCESS_USE_SET.has(item.accessUseStatus) &&
    typeof item.authenticationRequirement === 'string' && item.authenticationRequirement.length > 0 &&
    Array.isArray(item.authorityEvidenceUrls) && item.authorityEvidenceUrls.length > 0 &&
    Array.isArray(item.usageEvidenceUrls) && item.usageEvidenceUrls.length > 0 &&
    Array.isArray(item.intendedUses) && item.intendedUses.length > 0 &&
    Array.isArray(item.documentTypes) && item.documentTypes.length > 0 &&
    typeof item.reviewStatus === 'string' &&
    typeof item.reviewedAt === 'string' &&
    eligibleContract
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

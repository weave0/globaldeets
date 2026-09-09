// Reviewed provenance metadata for the canonical production news sources.
// Unknown facts stay explicit. This registry must never be used as a political-bias or truth score.

import { SOURCES, slugifySourceName } from '../api/news.js';

export const PROVENANCE_REVIEW_DATE = '2026-09-03';
export const SUBNATIONAL_SCOPE_TYPES = Object.freeze([
  'local',
  'metro',
  'state-province',
  'regional-subnational',
]);
export const SCOPE_BASES = Object.freeze([
  'publisher-declared-reviewed',
  'independently-reviewed',
  'unknown',
]);

const SUBNATIONAL_SCOPE_TYPE_SET = new Set(SUBNATIONAL_SCOPE_TYPES);
const SCOPE_BASIS_SET = new Set(SCOPE_BASES);

export const SOURCE_PROVENANCE = Object.freeze([
  record({
    sourceId: 'bbc-world',
    name: 'BBC World',
    organizationName: 'British Broadcasting Corporation',
    sourceClass: 'public-service-broadcaster',
    evidenceRole: 'reporting',
    geographicScope: 'global',
    primaryCountry: 'GB',
    locality: 'global',
    ownershipOperator: 'British Broadcasting Corporation',
    evidenceUrls: ['https://www.bbc.com/aboutthebbc'],
  }),
  record({
    sourceId: 'ap',
    name: 'AP',
    organizationName: 'The Associated Press',
    sourceClass: 'news-agency',
    evidenceRole: 'wire-service',
    geographicScope: 'global',
    primaryCountry: 'US',
    locality: 'global',
    ownershipOperator: 'The Associated Press',
    evidenceUrls: ['https://www.ap.org/about/'],
  }),
  record({
    sourceId: 'guardian',
    name: 'Guardian',
    organizationName: 'Guardian News & Media',
    sourceClass: 'newsroom',
    evidenceRole: 'reporting',
    geographicScope: 'global',
    primaryCountry: 'GB',
    locality: 'global',
    ownershipOperator: 'The Scott Trust Limited',
    evidenceUrls: ['https://www.theguardian.com/about'],
  }),
  record({
    sourceId: 'al-jazeera',
    name: 'Al Jazeera',
    organizationName: 'Al Jazeera Media Network',
    sourceClass: 'international-news-network',
    evidenceRole: 'reporting',
    geographicScope: 'global',
    primaryCountry: 'QA',
    locality: 'global',
    ownershipOperator: 'Al Jazeera Media Network',
    evidenceUrls: ['https://www.aljazeera.com/about-us'],
  }),
  record({
    sourceId: 'anadolu-agency',
    name: 'Anadolu Agency',
    organizationName: 'Anadolu Agency',
    sourceClass: 'news-agency',
    evidenceRole: 'wire-service',
    geographicScope: 'global',
    primaryCountry: 'TR',
    locality: 'global',
    ownershipOperator: 'Anadolu Agency',
    evidenceUrls: ['https://www.aa.com.tr/en/newsacademy/p/about-us'],
  }),
  record({
    sourceId: 'dw',
    name: 'DW',
    organizationName: 'Deutsche Welle',
    sourceClass: 'public-service-broadcaster',
    evidenceRole: 'reporting',
    geographicScope: 'global',
    primaryCountry: 'DE',
    locality: 'global',
    ownershipOperator: 'Deutsche Welle',
    evidenceUrls: ['https://www.dw.com/en/about-dw/s-30688'],
  }),
  record({
    sourceId: 'france-24',
    name: 'France 24',
    organizationName: 'France 24',
    sourceClass: 'public-international-broadcaster',
    evidenceRole: 'reporting',
    geographicScope: 'global',
    primaryCountry: 'FR',
    locality: 'global',
    ownershipOperator: 'France Medias Monde',
    evidenceUrls: ['https://www.francemediasmonde.com/en/our-media/france-24/'],
  }),
  record({
    sourceId: 'kyiv-independent',
    name: 'Kyiv Independent',
    organizationName: 'The Kyiv Independent',
    sourceClass: 'digital-newsroom',
    evidenceRole: 'reporting',
    geographicScope: 'national',
    primaryCountry: 'UA',
    locality: 'local',
    ownershipOperator: 'The Kyiv Independent',
    evidenceUrls: ['https://kyivindependent.com/about/'],
  }),
  record({
    sourceId: 'ukrinform',
    name: 'Ukrinform',
    organizationName: 'Ukrainian National News Agency Ukrinform',
    sourceClass: 'national-news-agency',
    evidenceRole: 'wire-service',
    geographicScope: 'national',
    primaryCountry: 'UA',
    locality: 'local',
    ownershipOperator: 'Ukrainian National News Agency Ukrinform',
    evidenceUrls: ['https://www.ukrinform.net/info/about_agency.html'],
  }),
  record({
    sourceId: 'nhk',
    name: 'NHK',
    organizationName: 'NHK (Japan Broadcasting Corporation)',
    sourceClass: 'public-service-broadcaster',
    evidenceRole: 'reporting',
    geographicScope: 'national',
    primaryCountry: 'JP',
    locality: 'local',
    ownershipOperator: 'NHK (Japan Broadcasting Corporation)',
    evidenceUrls: ['https://www.nhk.or.jp/corporateinfo/'],
  }),
  record({
    sourceId: 'yonhap',
    name: 'Yonhap',
    organizationName: 'Yonhap News Agency',
    sourceClass: 'national-news-agency',
    evidenceRole: 'wire-service',
    geographicScope: 'national',
    primaryCountry: 'KR',
    locality: 'local',
    ownershipOperator: 'Yonhap News Agency',
    evidenceUrls: ['https://en.yna.co.kr/aboutus/index'],
  }),
  record({
    sourceId: 'the-hindu',
    name: 'The Hindu',
    organizationName: 'The Hindu',
    sourceClass: 'newspaper-newsroom',
    evidenceRole: 'reporting',
    geographicScope: 'national',
    primaryCountry: 'IN',
    locality: 'local',
    ownershipOperator: 'THG Publishing Private Limited',
    evidenceUrls: ['https://learningcorner.epaper.thehindu.com/privacy'],
  }),
  record({
    sourceId: 'cna',
    name: 'CNA',
    organizationName: 'CNA',
    sourceClass: 'regional-news-network',
    evidenceRole: 'reporting',
    geographicScope: 'regional',
    primaryCountry: 'SG',
    locality: 'regional',
    ownershipOperator: 'Mediacorp',
    evidenceUrls: ['https://www.channelnewsasia.com/about-us'],
  }),
  record({
    sourceId: 'dawn',
    name: 'Dawn',
    organizationName: 'Dawn',
    sourceClass: 'newspaper-newsroom',
    evidenceRole: 'reporting',
    geographicScope: 'national',
    primaryCountry: 'PK',
    locality: 'local',
    ownershipOperator: 'Pakistan Herald Publications Private Limited',
    evidenceUrls: ['https://www.dawn.com/news/1753517'],
  }),
  record({
    sourceId: 'npr',
    name: 'NPR',
    organizationName: 'NPR',
    sourceClass: 'nonprofit-public-media',
    evidenceRole: 'reporting',
    geographicScope: 'national',
    primaryCountry: 'US',
    locality: 'local',
    ownershipOperator: 'NPR',
    evidenceUrls: ['https://www.npr.org/about/'],
  }),
  record({
    sourceId: 'mercopress',
    name: 'Mercopress',
    organizationName: 'MercoPress',
    sourceClass: 'news-agency',
    evidenceRole: 'reporting',
    geographicScope: 'regional',
    primaryCountry: 'UY',
    locality: 'regional',
    ownershipOperator: 'MercoPress',
    evidenceUrls: ['https://en.mercopress.com/about-mercopress'],
  }),
  record({
    sourceId: 'minnesota-reformer',
    name: 'Minnesota Reformer',
    organizationName: 'Minnesota Reformer',
    sourceClass: 'nonprofit-state-newsroom',
    evidenceRole: 'reporting',
    geographicScope: 'subnational',
    primaryCountry: 'US',
    locality: 'state-province',
    ownershipOperator: 'States Newsroom',
    evidenceUrls: [
      'https://minnesotareformer.com/about/',
      'https://statesnewsroom.com/rss-feeds/',
    ],
    scopeType: 'state-province',
    jurisdictionIds: ['US-MN'],
    jurisdictionScheme: 'ISO 3166-2',
    scopeBasis: 'publisher-declared-reviewed',
    scopeEvidenceUrls: ['https://minnesotareformer.com/about/'],
    reviewedAt: '2026-09-08',
  }),
  record({
    sourceId: 'calmatters',
    name: 'CalMatters',
    organizationName: 'CalMatters',
    sourceClass: 'nonprofit-state-newsroom',
    evidenceRole: 'reporting',
    geographicScope: 'subnational',
    primaryCountry: 'US',
    locality: 'state-province',
    ownershipOperator: 'CalMatters',
    evidenceUrls: [
      'https://calmatters.org/about/',
      'https://calmatters.org/about/republish/',
    ],
    scopeType: 'state-province',
    jurisdictionIds: ['US-CA'],
    jurisdictionScheme: 'ISO 3166-2',
    scopeBasis: 'publisher-declared-reviewed',
    scopeEvidenceUrls: ['https://calmatters.org/about/'],
    reviewedAt: '2026-09-08',
  }),
  record({
    sourceId: 'abc-australia',
    name: 'ABC Australia',
    organizationName: 'Australian Broadcasting Corporation',
    sourceClass: 'public-service-broadcaster',
    evidenceRole: 'reporting',
    geographicScope: 'national',
    primaryCountry: 'AU',
    locality: 'local',
    ownershipOperator: 'Australian Broadcasting Corporation',
    evidenceUrls: ['https://www.abc.net.au/about/who-we-are'],
  }),
  record({
    sourceId: 'premium-times',
    name: 'Premium Times',
    organizationName: 'Premium Times',
    sourceClass: 'digital-newsroom',
    evidenceRole: 'reporting',
    geographicScope: 'national',
    primaryCountry: 'NG',
    locality: 'local',
    ownershipOperator: 'Premium Times Services Limited',
    evidenceUrls: ['https://www.premiumtimesng.com/about?tztc=1'],
  }),
  record({
    sourceId: 'the-east-african',
    name: 'The East African',
    organizationName: 'The EastAfrican',
    sourceClass: 'regional-newsroom',
    evidenceRole: 'reporting',
    geographicScope: 'regional',
    primaryCountry: 'KE',
    locality: 'regional',
    ownershipOperator: 'Nation Media Group',
    evidenceUrls: [
      'https://www.nationmedia.com/brands/the-east-african/',
      'https://www.nationmedia.com/who-we-are/',
    ],
  }),
]);

export function validateSourceProvenance(sources = SOURCES, provenance = SOURCE_PROVENANCE) {
  const sourceById = new Map(sources.map(source => [slugifySourceName(source.name), source]));
  const sourceIds = [...sourceById.keys()];
  const provenanceIds = provenance.map(entry => entry.sourceId);
  const duplicateIds = provenanceIds.filter((id, index) => provenanceIds.indexOf(id) !== index);
  const missingSourceIds = sourceIds.filter(id => !provenanceIds.includes(id));
  const orphanSourceIds = provenanceIds.filter(id => !sourceById.has(id));
  const invalidEntries = provenance
    .filter(entry => !isValidEntry(entry, sourceById.get(entry.sourceId)))
    .map(entry => entry.sourceId);

  return {
    valid:
      duplicateIds.length === 0 &&
      missingSourceIds.length === 0 &&
      orphanSourceIds.length === 0 &&
      invalidEntries.length === 0,
    duplicateIds: [...new Set(duplicateIds)].sort(),
    missingSourceIds: [...new Set(missingSourceIds)].sort(),
    orphanSourceIds: [...new Set(orphanSourceIds)].sort(),
    invalidEntries: [...new Set(invalidEntries)].sort(),
  };
}

export function getProvenanceBySourceId(sourceId) {
  return SOURCE_PROVENANCE.find(entry => entry.sourceId === sourceId) || null;
}

function record(definition) {
  const source = SOURCES.find(candidate => slugifySourceName(candidate.name) === definition.sourceId);
  return Object.freeze({
    ...definition,
    sourceLanguages: source ? [source.lang] : [],
    reviewedAt: definition.reviewedAt || PROVENANCE_REVIEW_DATE,
    jurisdictionIds: Object.freeze([...(definition.jurisdictionIds || [])]),
    scopeEvidenceUrls: Object.freeze([...(definition.scopeEvidenceUrls || [])]),
  });
}

function isValidEntry(entry, source) {
  const baseValid = Boolean(
    entry &&
      source &&
      entry.sourceId === slugifySourceName(source.name) &&
      entry.name === source.name &&
      entry.organizationName &&
      entry.sourceClass &&
      entry.evidenceRole &&
      entry.geographicScope &&
      entry.locality &&
      Array.isArray(entry.sourceLanguages) &&
      entry.sourceLanguages.length === 1 &&
      entry.sourceLanguages[0] === source.lang &&
      Array.isArray(entry.evidenceUrls) &&
      entry.evidenceUrls.length > 0 &&
      entry.evidenceUrls.every(url => /^https:\/\//.test(url)) &&
      entry.reviewedAt
  );
  if (!baseValid) return false;
  if (entry.geographicScope !== 'subnational') return true;
  return Boolean(
    SUBNATIONAL_SCOPE_TYPE_SET.has(entry.scopeType) &&
      entry.locality === entry.scopeType &&
      entry.jurisdictionScheme === 'ISO 3166-2' &&
      Array.isArray(entry.jurisdictionIds) &&
      entry.jurisdictionIds.length > 0 &&
      entry.jurisdictionIds.every(id => /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(id)) &&
      SCOPE_BASIS_SET.has(entry.scopeBasis) &&
      entry.scopeBasis !== 'unknown' &&
      Array.isArray(entry.scopeEvidenceUrls) &&
      entry.scopeEvidenceUrls.length > 0 &&
      entry.scopeEvidenceUrls.every(url => /^https:\/\//.test(url))
  );
}

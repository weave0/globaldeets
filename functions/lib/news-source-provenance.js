// Reviewed provenance metadata for the canonical production news sources.
// Unknown facts stay explicit. This registry must never be used as a political-bias or truth score.

import { SOURCES, slugifySourceName } from '../api/news.js';

export const PROVENANCE_REVIEW_DATE = '2026-09-03';

export const SOURCE_PROVENANCE = Object.freeze([
  record('bbc-world', 'BBC World', 'public-service-broadcaster', 'reporting', 'global', 'GB', 'global', 'British Broadcasting Corporation', ['https://www.bbc.com/aboutthebbc']),
  record('ap', 'AP', 'news-agency', 'wire-service', 'global', 'US', 'global', 'The Associated Press', ['https://www.ap.org/about/']),
  record('guardian', 'Guardian', 'newsroom', 'reporting', 'global', 'GB', 'global', 'Guardian News & Media; ultimate owner The Scott Trust Limited', ['https://www.theguardian.com/about']),
  record('al-jazeera', 'Al Jazeera', 'international-news-network', 'reporting', 'global', 'QA', 'global', 'Al Jazeera Media Network', ['https://www.aljazeera.com/about-us']),
  record('anadolu-agency', 'Anadolu Agency', 'news-agency', 'wire-service', 'global', 'TR', 'global', 'Anadolu Agency', ['https://www.aa.com.tr/en/newsacademy/p/about-us']),
  record('dw', 'DW', 'public-service-broadcaster', 'reporting', 'global', 'DE', 'global', 'Deutsche Welle', ['https://www.dw.com/en/about-dw/s-30688']),
  record('france-24', 'France 24', 'public-international-broadcaster', 'reporting', 'global', 'FR', 'global', 'France Médias Monde', ['https://www.francemediasmonde.com/en/our-media/france-24/']),
  record('kyiv-independent', 'Kyiv Independent', 'digital-newsroom', 'reporting', 'national', 'UA', 'local', 'The Kyiv Independent', ['https://kyivindependent.com/about/']),
  record('ukrinform', 'Ukrinform', 'national-news-agency', 'wire-service', 'national', 'UA', 'local', 'Ukrainian National News Agency Ukrinform', ['https://www.ukrinform.net/info/about_agency.html']),
  record('nhk', 'NHK', 'public-service-broadcaster', 'reporting', 'national', 'JP', 'local', 'NHK (Japan Broadcasting Corporation)', ['https://www.nhk.or.jp/corporateinfo/']),
  record('yonhap', 'Yonhap', 'national-news-agency', 'wire-service', 'national', 'KR', 'local', 'Yonhap News Agency', ['https://en.yna.co.kr/aboutus/index']),
  record('the-hindu', 'The Hindu', 'newspaper-newsroom', 'reporting', 'national', 'IN', 'local', 'THG Publishing Private Limited / The Hindu Group', ['https://learningcorner.epaper.thehindu.com/privacy']),
  record('cna', 'CNA', 'regional-news-network', 'reporting', 'regional', 'SG', 'regional', 'Mediacorp', ['https://www.channelnewsasia.com/about-us']),
  record('dawn', 'Dawn', 'newspaper-newsroom', 'reporting', 'national', 'PK', 'local', null, ['https://www.dawn.com/nayapakistan/about/']),
  record('npr', 'NPR', 'nonprofit-public-media', 'reporting', 'national', 'US', 'local', 'NPR', ['https://www.npr.org/about/']),
  record('mercopress', 'Mercopress', 'news-agency', 'reporting', 'regional', 'UY', 'regional', 'MercoPress', ['https://en.mercopress.com/about-mercopress']),
  record('abc-australia', 'ABC Australia', 'public-service-broadcaster', 'reporting', 'national', 'AU', 'local', 'Australian Broadcasting Corporation', ['https://www.abc.net.au/about/who-we-are']),
  record('premium-times', 'Premium Times', 'digital-newsroom', 'reporting', 'national', 'NG', 'local', 'Premium Times Services Limited', ['https://www.premiumtimesng.com/about?tztc=1']),
  record('the-east-african', 'The East African', 'regional-newsroom', 'reporting', 'regional', 'KE', 'regional', 'Nation Media Group', ['https://www.nationmedia.com/brands/the-east-african/', 'https://www.nationmedia.com/who-we-are/']),
]);

export function validateSourceProvenance(sources = SOURCES, provenance = SOURCE_PROVENANCE) {
  const sourceIds = sources.map(source => slugifySourceName(source.name));
  const provenanceIds = provenance.map(entry => entry.sourceId);
  const duplicateIds = provenanceIds.filter((id, index) => provenanceIds.indexOf(id) !== index);
  const missingSourceIds = sourceIds.filter(id => !provenanceIds.includes(id));
  const orphanSourceIds = provenanceIds.filter(id => !sourceIds.includes(id));
  const invalidEntries = provenance.filter(entry => !isValidEntry(entry)).map(entry => entry.sourceId);

  return {
    valid:
      duplicateIds.length === 0 &&
      missingSourceIds.length === 0 &&
      orphanSourceIds.length === 0 &&
      invalidEntries.length === 0,
    duplicateIds: [...new Set(duplicateIds)].sort(),
    missingSourceIds: missingSourceIds.sort(),
    orphanSourceIds: orphanSourceIds.sort(),
    invalidEntries: invalidEntries.sort(),
  };
}

export function getProvenanceBySourceId(sourceId) {
  return SOURCE_PROVENANCE.find(entry => entry.sourceId === sourceId) || null;
}

function record(sourceId, name, sourceClass, evidenceRole, geographicScope, primaryCountry, locality, ownershipOperator, evidenceUrls) {
  const source = SOURCES.find(candidate => slugifySourceName(candidate.name) === sourceId);
  return Object.freeze({
    sourceId,
    name,
    organizationName: ownershipOperator || name,
    sourceClass,
    evidenceRole,
    geographicScope,
    primaryCountry,
    locality,
    sourceLanguages: source ? [source.lang] : [],
    ownershipOperator,
    evidenceUrls,
    reviewedAt: PROVENANCE_REVIEW_DATE,
  });
}

function isValidEntry(entry) {
  return Boolean(
    entry &&
      entry.sourceId &&
      entry.name &&
      entry.organizationName &&
      entry.sourceClass &&
      entry.evidenceRole &&
      entry.geographicScope &&
      entry.locality &&
      Array.isArray(entry.sourceLanguages) &&
      entry.sourceLanguages.length > 0 &&
      Array.isArray(entry.evidenceUrls) &&
      entry.evidenceUrls.length > 0 &&
      entry.evidenceUrls.every(url => /^https:\/\//.test(url)) &&
      entry.reviewedAt
  );
}

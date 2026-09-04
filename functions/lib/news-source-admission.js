// Source-admission governance for the live news contract.
// This is an engineering review ledger, not a legal conclusion. Feed health, publisher provenance,
// endpoint authority, and usage rights remain separate dimensions.
import { SOURCES, slugifySourceName } from '../api/news.js';

export const ADMISSION_REVIEW_DATE = '2026-09-03';
export const ALLOWED_USE_STATUSES = Object.freeze([
  'verified-public-use',
  'permission-required',
  'contract-required',
  'unknown',
  'prohibited',
]);
export const ENDPOINT_AUTHORITY_STATUSES = Object.freeze([
  'first-party',
  'authorized-third-party',
  'unverified-third-party',
]);
export const REVIEW_STATES = Object.freeze(['legacy-unreviewed', 'reviewed']);
export const CURRENT_USE_TYPES = Object.freeze([
  'headline-link',
  'metadata',
  'excerpt',
  'translated-headline-summary',
]);

const USE_STATUS_SET = new Set(ALLOWED_USE_STATUSES);
const AUTHORITY_SET = new Set(ENDPOINT_AUTHORITY_STATUSES);
const REVIEW_STATE_SET = new Set(REVIEW_STATES);
const CURRENT_USE_SET = new Set(CURRENT_USE_TYPES);

// Frozen at the moment the admission gate was introduced. These IDs may remain live while their
// usage review migrates from legacy-unreviewed to reviewed. Any source outside this set is new and
// must be fully production-admissible before CI will accept it in SOURCES.
export const LEGACY_SOURCE_IDS = Object.freeze([
  'abc-australia',
  'al-jazeera',
  'anadolu-agency',
  'ap',
  'bbc-world',
  'cna',
  'dawn',
  'dw',
  'france-24',
  'guardian',
  'kyiv-independent',
  'mercopress',
  'nhk',
  'npr',
  'premium-times',
  'the-east-african',
  'the-hindu',
  'ukrinform',
  'yonhap',
].sort());

export const SOURCE_ADMISSIONS = Object.freeze([
  legacy('BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml'),
  reviewedLegacy('AP', 'https://rsshub.app/apnews/topics/world-news', {
    endpointAuthority: 'unverified-third-party',
    endpointEvidenceUrls: ['https://api.ap.org/media/v/docs/Getting_Started_API.htm'],
    usagePolicyUrls: ['https://api.ap.org/media/v/docs/Getting_Started_API.htm'],
    allowedUseStatus: 'contract-required',
    syndicatedContentBehavior: 'wire-service-content',
    reviewerNotes:
      'Current RSSHub endpoint is not first-party AP access. AP documents licensed Media API ingestion tied to account entitlements and contract terms; keep this legacy source visible/research-status until an authorized path is established.',
  }),
  reviewedLegacy('Guardian', 'https://www.theguardian.com/world/rss', {
    endpointEvidenceUrls: ['https://www.theguardian.com/help/feeds'],
    usagePolicyUrls: [
      'https://www.theguardian.com/help/feeds',
      'https://www.theguardian.com/help/terms-of-service',
      'https://www.theguardian.com/info/content-licensing-syndication',
    ],
    allowedUseStatus: 'permission-required',
    reviewerNotes:
      'First-party RSS is technically valid, but published feed/terms signals do not support marking the current public GlobalDeets use as verified-public-use without further permission/licensing review.',
  }),
  legacy('Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml'),
  legacy('Anadolu Agency', 'https://aa.com.tr/en/rss/default?cat=world'),
  legacy('DW', 'https://rss.dw.com/xml/rss-en-world'),
  legacy('France 24', 'https://www.france24.com/en/rss'),
  legacy('Kyiv Independent', 'https://kyivindependent.com/news-archive/rss/'),
  legacy('Ukrinform', 'https://www.ukrinform.net/rss/block-lastnews'),
  legacy('NHK', 'https://www3.nhk.or.jp/rss/news/cat0.xml', { translated: true }),
  legacy('Yonhap', 'https://en.yna.co.kr/RSS/news.xml'),
  legacy('The Hindu', 'https://www.thehindu.com/news/international/feeder/default.rss'),
  legacy('CNA', 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311'),
  legacy('Dawn', 'https://www.dawn.com/feeds/home/'),
  legacy('NPR', 'https://feeds.npr.org/1004/rss.xml'),
  legacy('Mercopress', 'https://en.mercopress.com/rss/'),
  legacy('ABC Australia', 'https://www.abc.net.au/news/feed/51120/rss.xml'),
  legacy('Premium Times', 'https://www.premiumtimesng.com/feed/'),
  legacy('The East African', 'https://www.theeastafrican.co.ke/rss.xml'),
]);

export const SOURCE_RESEARCH_CANDIDATES = Object.freeze([
  candidate({
    candidateId: 'rnz-pacific',
    name: 'RNZ Pacific',
    endpointUrl: 'https://www.rnz.co.nz/rss',
    endpointType: 'rss-directory',
    endpointAuthority: 'first-party',
    endpointEvidenceUrls: ['https://www.rnz.co.nz/rss', 'https://www.rnz.co.nz/international/about'],
    usagePolicyUrls: ['https://www.rnz.co.nz/rss'],
    allowedUseStatus: 'permission-required',
    disposition: 'research',
    reviewerNotes:
      'RNZ publishes first-party RSS, but the published RSS conditions require a permission review for GlobalDeets public reuse. No production source is created by this candidate record.',
  }),
  candidate({
    candidateId: 'agencia-brasil',
    name: 'Agencia Brasil',
    endpointUrl: 'https://agenciabrasil.ebc.com.br/feed/',
    endpointType: 'rss',
    endpointAuthority: 'first-party',
    endpointEvidenceUrls: [
      'https://agenciabrasil.ebc.com.br/feed/',
      'https://agenciabrasil.ebc.com.br/sobre',
    ],
    usagePolicyUrls: ['https://agenciabrasil.ebc.com.br/sobre'],
    allowedUseStatus: 'verified-public-use',
    disposition: 'research',
    syndicatedContentBehavior: 'mixed-rights-partner-content',
    itemLevelReviewRequired: true,
    reviewerNotes:
      'Agencia Brasil publishes a journalistic reproduction policy, but partner-agency material can carry separate restrictions. Production admission requires a verified item-origin/restriction signal strategy first.',
  }),
]);

export const ADMISSION_FINGERPRINT = getAdmissionFingerprint();

export function createSourceAdmission(definition) {
  const entry = admission({ ...definition, legacy: definition?.legacy === true });
  if (!validAdmission(entry)) throw new TypeError('source admission definition is invalid');
  return entry;
}

export function getAdmissionFingerprint(admissions = SOURCE_ADMISSIONS, candidates = SOURCE_RESEARCH_CANDIDATES) {
  const canonical = [...admissions, ...candidates]
    .map(entry => JSON.stringify(entry))
    .sort()
    .join('\u001e');
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function validateSourceAdmissions(sources = SOURCES, admissions = SOURCE_ADMISSIONS) {
  const sourceById = new Map(sources.map(source => [slugifySourceName(source.name), source]));
  const admissionById = new Map(admissions.map(entry => [entry.sourceId, entry]));
  const sourceIds = [...sourceById.keys()];
  const admissionIds = admissions.map(entry => entry.sourceId);

  const missingSourceIds = sourceIds.filter(id => !admissionById.has(id));
  const orphanSourceIds = admissionIds.filter(id => !sourceById.has(id));
  const duplicateIds = duplicates(admissionIds);
  const invalidEntries = admissions.filter(entry => !validAdmission(entry)).map(entry => entry?.sourceId || '(missing-id)');
  const endpointDriftSourceIds = admissions
    .filter(entry => sourceById.has(entry.sourceId) && sourceById.get(entry.sourceId).url !== entry.endpointUrl)
    .map(entry => entry.sourceId);
  const nameDriftSourceIds = admissions
    .filter(entry => sourceById.has(entry.sourceId) && sourceById.get(entry.sourceId).name !== entry.name)
    .map(entry => entry.sourceId);
  const unadmittedNewSourceIds = sourceIds.filter(id => {
    if (LEGACY_SOURCE_IDS.includes(id)) return false;
    return !isProductionAdmissible(admissionById.get(id));
  });
  const legacyStateErrors = sourceIds.filter(id => {
    if (!LEGACY_SOURCE_IDS.includes(id)) return false;
    const entry = admissionById.get(id);
    return !entry || !REVIEW_STATE_SET.has(entry.reviewState) || entry.legacy !== true;
  });
  const newSourceMarkedLegacyIds = sourceIds.filter(id => {
    if (LEGACY_SOURCE_IDS.includes(id)) return false;
    return admissionById.get(id)?.legacy === true;
  });

  const result = {
    missingSourceIds: unique(missingSourceIds),
    orphanSourceIds: unique(orphanSourceIds),
    duplicateIds,
    invalidEntries: unique(invalidEntries),
    endpointDriftSourceIds: unique(endpointDriftSourceIds),
    nameDriftSourceIds: unique(nameDriftSourceIds),
    unadmittedNewSourceIds: unique(unadmittedNewSourceIds),
    legacyStateErrors: unique(legacyStateErrors),
    newSourceMarkedLegacyIds: unique(newSourceMarkedLegacyIds),
  };

  return { valid: Object.values(result).every(values => values.length === 0), ...result };
}

export function isProductionAdmissible(entry) {
  return Boolean(
    entry &&
      entry.legacy === false &&
      entry.reviewState === 'reviewed' &&
      entry.allowedUseStatus === 'verified-public-use' &&
      ['first-party', 'authorized-third-party'].includes(entry.endpointAuthority) &&
      entry.healthVerificationStatus === 'verified' &&
      entry.itemLevelReviewRequired !== true &&
      entry.currentUse.every(use => entry.permittedUse.includes(use))
  );
}

export function evaluateItemUse(entry, itemAllowedUseStatus = null) {
  if (!entry) return { allowedUseStatus: 'unknown', displayMode: 'headline-link' };
  const statuses = [entry.allowedUseStatus];
  if (itemAllowedUseStatus != null) {
    if (!USE_STATUS_SET.has(itemAllowedUseStatus)) throw new TypeError('item allowed-use status is not supported');
    statuses.push(itemAllowedUseStatus);
  }
  const allowedUseStatus = statuses.sort((a, b) => useRestrictionRank(b) - useRestrictionRank(a))[0];
  return {
    allowedUseStatus,
    displayMode:
      allowedUseStatus === 'verified-public-use'
        ? 'current-use'
        : allowedUseStatus === 'prohibited'
          ? 'exclude'
          : 'headline-link',
  };
}

export function admissionSummary(admissions = SOURCE_ADMISSIONS) {
  const validation = validateSourceAdmissions(SOURCES, admissions);
  return {
    valid: validation.valid,
    totalLiveSources: admissions.length,
    reviewedSources: admissions.filter(entry => entry.reviewState === 'reviewed').length,
    legacyUnreviewedSources: admissions.filter(entry => entry.reviewState === 'legacy-unreviewed').length,
    remediationSourceIds: admissions
      .filter(entry => ['permission-required', 'contract-required', 'prohibited'].includes(entry.allowedUseStatus))
      .map(entry => entry.sourceId)
      .sort(),
    unknownRightsSourceIds: admissions
      .filter(entry => entry.allowedUseStatus === 'unknown')
      .map(entry => entry.sourceId)
      .sort(),
  };
}

function legacy(name, endpointUrl, options = {}) {
  return admission({
    sourceId: slugifySourceName(name),
    name,
    endpointUrl,
    endpointType: 'rss',
    endpointAuthority: 'first-party',
    endpointEvidenceUrls: [endpointUrl],
    authenticationRequirement: 'none-observed',
    usagePolicyUrls: [],
    allowedUseStatus: 'unknown',
    currentUse: currentUse(Boolean(options.translated)),
    permittedUse: [],
    excerptMaxChars: 280,
    syndicatedContentBehavior: 'unknown',
    itemLevelReviewRequired: true,
    itemLevelStrategy: 'restrict-on-explicit-item-signal',
    reviewState: 'legacy-unreviewed',
    reviewedAt: null,
    reviewerNotes: 'Legacy source predates the admission contract; usage rights remain explicitly unreviewed.',
    healthVerificationStatus: 'telemetry-managed',
    legacy: true,
    ...options,
  });
}

function reviewedLegacy(name, endpointUrl, options) {
  return admission({
    sourceId: slugifySourceName(name),
    name,
    endpointUrl,
    endpointType: 'rss',
    endpointAuthority: 'first-party',
    endpointEvidenceUrls: [endpointUrl],
    authenticationRequirement: 'none-observed',
    usagePolicyUrls: [],
    allowedUseStatus: 'unknown',
    currentUse: currentUse(false),
    permittedUse: [],
    excerptMaxChars: 280,
    syndicatedContentBehavior: 'unknown',
    itemLevelReviewRequired: true,
    itemLevelStrategy: 'restrict-on-explicit-item-signal',
    reviewState: 'reviewed',
    reviewedAt: ADMISSION_REVIEW_DATE,
    reviewerNotes: '',
    healthVerificationStatus: 'telemetry-managed',
    legacy: true,
    ...options,
  });
}

function admission(definition) {
  return Object.freeze({
    ...definition,
    endpointEvidenceUrls: Object.freeze([...(definition.endpointEvidenceUrls || [])]),
    usagePolicyUrls: Object.freeze([...(definition.usagePolicyUrls || [])]),
    currentUse: Object.freeze([...(definition.currentUse || [])]),
    permittedUse: Object.freeze([...(definition.permittedUse || [])]),
  });
}

function candidate(definition) {
  return Object.freeze({
    ...definition,
    endpointEvidenceUrls: Object.freeze([...(definition.endpointEvidenceUrls || [])]),
    usagePolicyUrls: Object.freeze([...(definition.usagePolicyUrls || [])]),
    currentUse: Object.freeze(currentUse(false)),
    permittedUse: Object.freeze([]),
    authenticationRequirement: definition.authenticationRequirement || 'unknown',
    healthVerificationStatus: 'research-only',
    reviewedAt: ADMISSION_REVIEW_DATE,
    itemLevelReviewRequired: definition.itemLevelReviewRequired === true,
    syndicatedContentBehavior: definition.syndicatedContentBehavior || 'unknown',
  });
}

function validAdmission(entry) {
  return Boolean(
    entry &&
      typeof entry.sourceId === 'string' &&
      typeof entry.name === 'string' &&
      typeof entry.endpointUrl === 'string' &&
      typeof entry.endpointType === 'string' &&
      AUTHORITY_SET.has(entry.endpointAuthority) &&
      Array.isArray(entry.endpointEvidenceUrls) &&
      entry.endpointEvidenceUrls.length > 0 &&
      typeof entry.authenticationRequirement === 'string' &&
      Array.isArray(entry.usagePolicyUrls) &&
      USE_STATUS_SET.has(entry.allowedUseStatus) &&
      Array.isArray(entry.currentUse) &&
      entry.currentUse.every(use => CURRENT_USE_SET.has(use)) &&
      Array.isArray(entry.permittedUse) &&
      entry.permittedUse.every(use => CURRENT_USE_SET.has(use)) &&
      Number.isInteger(entry.excerptMaxChars) &&
      entry.excerptMaxChars >= 0 &&
      typeof entry.syndicatedContentBehavior === 'string' &&
      typeof entry.itemLevelReviewRequired === 'boolean' &&
      typeof entry.itemLevelStrategy === 'string' &&
      REVIEW_STATE_SET.has(entry.reviewState) &&
      typeof entry.reviewerNotes === 'string' &&
      typeof entry.healthVerificationStatus === 'string' &&
      typeof entry.legacy === 'boolean'
  );
}

function currentUse(translated) {
  return translated
    ? ['headline-link', 'metadata', 'excerpt', 'translated-headline-summary']
    : ['headline-link', 'metadata', 'excerpt'];
}

function useRestrictionRank(status) {
  return {
    'verified-public-use': 0,
    unknown: 1,
    'permission-required': 2,
    'contract-required': 3,
    prohibited: 4,
  }[status];
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

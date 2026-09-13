// Source-admission governance for the live news contract.
// This is an engineering review ledger, not a legal conclusion. Feed health, publisher provenance,
// endpoint authority, and usage rights remain separate dimensions.
import { SOURCES, slugifySourceName } from '../api/news.js';

export const ADMISSION_REVIEW_DATE = '2026-09-03';
export const GD019_REVIEW_DATE = '2026-09-08';
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

export const LEGACY_SOURCE_IDS = Object.freeze([
  'abc-australia', 'al-jazeera', 'anadolu-agency', 'ap', 'bbc-world', 'cna', 'dawn', 'dw',
  'france-24', 'guardian', 'kyiv-independent', 'mercopress', 'nhk', 'npr', 'premium-times',
  'the-east-african', 'the-hindu', 'ukrinform', 'yonhap',
].sort());

export const SOURCE_ADMISSIONS = Object.freeze([
  reviewedLegacy('BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', {
    usagePolicyUrls: [
      'https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_19September2022english.pdf',
      'https://information-syndication.api.bbc.com/',
    ],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13',
    reviewerNotes: 'BBC business RSS use requires permission and may involve a fee. Keep GlobalDeets headline-link only unless an authorized syndication path is established.',
  }),
  reviewedLegacy('AP', 'https://rsshub.app/apnews/topics/world-news', {
    endpointAuthority: 'unverified-third-party',
    endpointEvidenceUrls: ['https://api.ap.org/media/v/docs/Getting_Started_API.htm'],
    usagePolicyUrls: ['https://api.ap.org/media/v/docs/Getting_Started_API.htm'],
    allowedUseStatus: 'contract-required', syndicatedContentBehavior: 'wire-service-content',
    reviewerNotes: 'Current RSSHub endpoint is not first-party AP access. AP documents licensed Media API ingestion tied to account entitlements and contract terms.',
  }),
  reviewedLegacy('Guardian', 'https://www.theguardian.com/world/rss', {
    endpointEvidenceUrls: ['https://www.theguardian.com/help/feeds'],
    usagePolicyUrls: ['https://www.theguardian.com/help/feeds','https://www.theguardian.com/help/terms-of-service','https://www.theguardian.com/info/content-licensing-syndication'],
    allowedUseStatus: 'permission-required',
    reviewerNotes: 'First-party RSS is valid, but published terms do not support marking current public GlobalDeets reuse as verified-public-use without further permission/licensing review.',
  }),
  reviewedLegacy('Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', {
    usagePolicyUrls: ['https://www.aljazeera.com/terms-and-conditions'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13',
    reviewerNotes: 'Al Jazeera limits service content to personal, non-commercial use and requires express prior written permission for broader copying, storage, distribution or commercial exploitation. Keep GlobalDeets headline-link only.',
  }),
  reviewedLegacy('Anadolu Agency', 'https://aa.com.tr/en/rss/default?cat=world', {
    usagePolicyUrls: ['https://www.aa.com.tr/tr/p/yasal-uyari'],
    allowedUseStatus: 'contract-required', reviewedAt: '2026-09-13', syndicatedContentBehavior: 'subscription-newswire',
    reviewerNotes: 'Anadolu Agency states non-subscribers may not use AA content and that website use requires an AA subscription agreement. Keep GlobalDeets headline-link only pending an authorized contract.',
  }),
  reviewedLegacy('DW', 'https://rss.dw.com/xml/rss-en-world', {
    usagePolicyUrls: ['https://www.dw.com/en/news-from-germany/a-65919184','https://b2b.dw.com/page/dw-terms-conditions','https://www.dw.com/downloads/35915853/contentbox_english.pdf'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13',
    reviewerNotes: 'DW directs professional content integration through contact/customized-feed and distribution terms. Keep headline-link only pending authorization.',
  }),
  reviewedLegacy('France 24', 'https://www.france24.com/en/rss', {
    endpointEvidenceUrls: ['https://www.france24.com/en/rss','https://www.francemm.com/en/legal-notice'],
    usagePolicyUrls: ['https://www.francemm.com/en/legal-notice','https://www.francemm.com/en/contact?brand=f24&topic=vente_contenu'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13',
    reviewerNotes: 'France Medias Monde prohibits content reproduction, transfer, collection, storage and reuse without authorization and provides a France 24 content-use/purchase channel. Keep GlobalDeets headline-link only pending authorization.',
  }),
  reviewedLegacy('Kyiv Independent', 'https://kyivindependent.com/news-archive/rss/', {
    usagePolicyUrls: ['https://kyivindependent.com/contacts/','https://kyivindependent.com/help-center/about-us/how-do-you-finance-your-work/','https://kyivindependent.com/assets/files/Syndication_and_Content_Licensing_from_The_Kyiv_Independent.pdf'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13', syndicatedContentBehavior: 'publisher-syndication-licensed',
    reviewerNotes: 'The Kyiv Independent identifies syndication as a commercial revenue lane and provides a dedicated content-licensing contact. Public RSS does not independently authorize republication; keep headline-link only pending permission.',
  }),
  reviewedLegacy('Ukrinform', 'https://www.ukrinform.net/rss/block-lastnews', {
    usagePolicyUrls: ['https://www.ukrinform.net/info/subscribe_conditions.html'],
    allowedUseStatus: 'contract-required', reviewedAt: '2026-09-13', syndicatedContentBehavior: 'subscription-newswire',
    reviewerNotes: 'Ukrinform documents paid/subscription newswire products. Public RSS availability does not establish excerpt republication rights; keep headline-link only pending an authorized path.',
  }),
  reviewedLegacy('NHK', 'https://www3.nhk.or.jp/rss/news/cat0.xml', {
    endpointEvidenceUrls: ['https://www3.nhk.or.jp/rss/news/cat0.xml'],
    usagePolicyUrls: ['https://school-api-portal.nhk.or.jp/terms'],
    allowedUseStatus: 'unknown', reviewedAt: '2026-09-13',
    currentUse: ['headline-link','metadata','excerpt','translated-headline-summary'],
    reviewerNotes: 'Review found service-specific NHK restrictions but no sufficiently direct current policy governing the NHK News RSS endpoint for the GlobalDeets reuse profile. Keep headline-link only and perform zero translation calls until an authorized path is established.',
  }),
  reviewedLegacy('Yonhap', 'https://en.yna.co.kr/RSS/news.xml', {
    usagePolicyUrls: ['https://en.yna.co.kr/view/AEN20260831005800315'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13', syndicatedContentBehavior: 'news-agency-content',
    reviewerNotes: 'Yonhap states use beyond personal and noncommercial use is prohibited without written consent. Keep GlobalDeets headline-link only pending authorization.',
  }),
  reviewedLegacy('The Hindu', 'https://www.thehindu.com/news/international/feeder/default.rss', {
    endpointEvidenceUrls: ['https://www.thehindu.com/news/international/feeder/default.rss'],
    usagePolicyUrls: ['https://step.thehindu.com/termsandconditions'],
    allowedUseStatus: 'unknown', reviewedAt: '2026-09-13',
    reviewerNotes: 'Review found restrictive terms on a The Hindu group service but no sufficiently direct policy governing reuse of the international newsroom RSS feed. Keep headline-link only pending an applicable first-party policy or written authorization.',
  }),
  reviewedLegacy('CNA', 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311', {
    endpointEvidenceUrls: ['https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311','https://www.channelnewsasia.com/rss'],
    usagePolicyUrls: ['https://www.channelnewsasia.com/rss/rssterms'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13',
    reviewerNotes: 'CNA describes its RSS service as free strictly for personal, non-commercial use and reserves other uses. Keep GlobalDeets headline-link only pending authorization.',
  }),
  reviewedLegacy('Dawn', 'https://www.dawn.com/feeds/home/', {
    usagePolicyUrls: ['https://www.dawn.com/news/1342352','https://www.dawn.com/news/1342354/reproduction-copyrights'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13',
    reviewerNotes: 'Dawn requires prior written permission for reproduction, republication and other non-personal/non-commercial use. Keep GlobalDeets headline-link only pending permission.',
  }),
  reviewedLegacy('NPR', 'https://feeds.npr.org/1004/rss.xml', {
    endpointEvidenceUrls: ['https://feeds.npr.org/1004/rss.xml'],
    usagePolicyUrls: ['https://stateimpact.npr.org/oklahoma/terms-of-use/'],
    allowedUseStatus: 'unknown', reviewedAt: '2026-09-13',
    reviewerNotes: 'Review found partner-project feed terms but no directly inspectable NPR-wide policy sufficiently specific to the current world-news feed and GlobalDeets use. Partner terms are not treated as NPR-wide reuse authority; keep headline-link only.',
  }),
  reviewedLegacy('Mercopress', 'https://en.mercopress.com/rss/', {
    endpointEvidenceUrls: ['https://en.mercopress.com/rss/','https://en.mercopress.com/feeds'],
    usagePolicyUrls: ['https://en.mercopress.com/feeds'],
    allowedUseStatus: 'verified-public-use', permittedUse: currentUse(false), itemLevelReviewRequired: false,
    itemLevelStrategy: 'preserve-source-and-original-link', reviewedAt: '2026-09-13',
    reviewerNotes: 'MercoPress explicitly welcomes webmasters including its news updates with the original article link preserved. GlobalDeets may use headline/link, metadata and a bounded RSS excerpt; not full-article republication.',
  }),
  reviewedNew('Minnesota Reformer', 'https://minnesotareformer.com/feed/localFeed', {
    endpointEvidenceUrls: ['https://minnesotareformer.com/feed/localFeed','https://statesnewsroom.com/rss-feeds/','https://minnesotareformer.com/about/'],
    usagePolicyUrls: ['https://statesnewsroom.com/rss-feeds/','https://minnesotareformer.com/about/'],
    allowedUseStatus: 'verified-public-use', permittedUse: currentUse(false),
    syndicatedContentBehavior: 'republisher-local-feed-excludes-network-national-content', itemLevelReviewRequired: false,
    itemLevelStrategy: 'dedicated-local-feed',
    reviewerNotes: 'States Newsroom documents /feed/localFeed for republishers; Minnesota Reformer states CC BY-NC-ND 4.0 with attribution/link conditions. GlobalDeets uses headline/link, metadata and a bounded excerpt.',
  }),
  reviewedNew('CalMatters', 'https://calmatters.org/feed/', {
    endpointEvidenceUrls: ['https://calmatters.org/feed/','https://calmatters.org/about/republish/'],
    usagePolicyUrls: ['https://calmatters.org/about/republish/','https://calmatters.org/about/policies-and-standards/'],
    allowedUseStatus: 'verified-public-use', permittedUse: currentUse(false),
    syndicatedContentBehavior: 'publisher-text-republishable-third-party-visuals-restricted', itemLevelReviewRequired: false,
    itemLevelStrategy: 'text-metadata-only-no-third-party-visual-use',
    reviewerNotes: 'CalMatters permits free article republication subject to conditions. GlobalDeets uses headline/link, metadata and a bounded excerpt and does not ingest article imagery.',
  }),
  reviewedLegacy('ABC Australia', 'https://www.abc.net.au/news/feed/51120/rss.xml', {
    endpointEvidenceUrls: ['https://www.abc.net.au/news/feed/51120/rss.xml','https://help.abc.net.au/hc/en-us/articles/6147104938383-Why-are-RSS-feeds-no-longer-being-updated'],
    usagePolicyUrls: ['https://help.abc.net.au/hc/en-us/articles/360001548096-ABC-Terms-of-Use'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13',
    reviewerNotes: 'ABC reserves content for personal, non-commercial use unless permission is obtained and separately states RSS feeds are no longer being updated. Keep headline-link only; track endpoint freshness separately.',
  }),
  reviewedLegacy('Premium Times', 'https://www.premiumtimesng.com/feed/', {
    usagePolicyUrls: ['https://www.premiumtimesng.com/terms-and-conditions'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13',
    reviewerNotes: 'Premium Times states site content is for personal, non-commercial use and prohibits reproduction, distribution or republication without prior written consent. Keep headline-link only pending permission.',
  }),
  reviewedLegacy('The East African', 'https://www.theeastafrican.co.ke/rss.xml', {
    usagePolicyUrls: ['https://www.theeastafrican.co.ke/tea/terms-conditions-of-use-4783192'],
    allowedUseStatus: 'permission-required', reviewedAt: '2026-09-13',
    reviewerNotes: 'Nation Media Group terms limit use to personal, non-commercial benefit and require prior written approval for other uses. Keep GlobalDeets headline-link only pending permission.',
  }),
]);

export const SOURCE_RESEARCH_CANDIDATES = Object.freeze([
  candidate({ candidateId:'rnz-pacific', name:'RNZ Pacific', endpointUrl:'https://www.rnz.co.nz/rss', endpointType:'rss-directory', endpointAuthority:'first-party', endpointEvidenceUrls:['https://www.rnz.co.nz/rss','https://www.rnz.co.nz/international/about'], usagePolicyUrls:['https://www.rnz.co.nz/rss'], allowedUseStatus:'permission-required', disposition:'research', reviewerNotes:'RNZ publishes first-party RSS, but published conditions require a permission review for GlobalDeets public reuse.' }),
  candidate({ candidateId:'agencia-brasil', name:'Agencia Brasil', endpointUrl:'https://agenciabrasil.ebc.com.br/feed/', endpointType:'rss', endpointAuthority:'first-party', endpointEvidenceUrls:['https://agenciabrasil.ebc.com.br/feed/','https://agenciabrasil.ebc.com.br/sobre'], usagePolicyUrls:['https://agenciabrasil.ebc.com.br/sobre'], allowedUseStatus:'verified-public-use', disposition:'research', syndicatedContentBehavior:'mixed-rights-partner-content', itemLevelReviewRequired:true, reviewerNotes:'Agencia Brasil publishes a reproduction policy, but partner-agency material can carry separate restrictions.' }),
  candidate({ candidateId:'laist-local', name:'LAist', endpointUrl:'https://laist.com/rss/latest-news', endpointType:'rss', endpointAuthority:'first-party', endpointEvidenceUrls:['https://laist.com/rss-feed','https://laist.com/rss/latest-news'], usagePolicyUrls:['https://laist.com/editorial-ethics-and-guidelines/republish'], allowedUseStatus:'verified-public-use', disposition:'research', syndicatedContentBehavior:'mixed-origin-partner-content', itemLevelReviewRequired:true, reviewerNotes:'LAist permits republication of original editorial content, but its feed includes partner material excluded from that permission.' }),
]);

export const ADMISSION_FINGERPRINT = getAdmissionFingerprint();

export function createSourceAdmission(definition) {
  const entry = admission({ ...definition, legacy: definition?.legacy === true });
  if (!validAdmission(entry)) throw new TypeError('source admission definition is invalid');
  return entry;
}

export function getAdmissionFingerprint(admissions = SOURCE_ADMISSIONS, candidates = SOURCE_RESEARCH_CANDIDATES) {
  const canonical = [...admissions, ...candidates].map(entry => JSON.stringify(entry)).sort().join('\u001e');
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) { hash ^= canonical.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}

export function validateSourceAdmissions(sources = SOURCES, admissions = SOURCE_ADMISSIONS) {
  const canonicalSourceIds = sources.map(source => safeSourceId(source));
  const canonicalEndpointUrls = sources.map(source => source?.url).filter(Boolean);
  const validSources = sources.filter(source => typeof source?.name === 'string' && typeof source?.url === 'string');
  const sourceById = new Map(validSources.map(source => [slugifySourceName(source.name), source]));
  const admissionById = new Map(admissions.filter(entry => typeof entry?.sourceId === 'string').map(entry => [entry.sourceId, entry]));
  const sourceIds = [...sourceById.keys()];
  const admissionIds = admissions.map(entry => entry?.sourceId).filter(id => typeof id === 'string');
  const duplicateCanonicalSourceIds = duplicates(canonicalSourceIds.filter(Boolean));
  const duplicateCanonicalEndpointUrls = duplicates(canonicalEndpointUrls);
  const invalidCanonicalSources = sources.map((source,index)=>({source,index})).filter(({source})=>!safeSourceId(source)||typeof source?.url!=='string').map(({index})=>`source-index:${index}`);
  const missingSourceIds = sourceIds.filter(id => !admissionById.has(id));
  const orphanSourceIds = admissionIds.filter(id => !sourceById.has(id));
  const duplicateIds = duplicates(admissionIds);
  const invalidEntries = admissions.filter(entry => !validAdmission(entry)).map(entry => entry?.sourceId || '(missing-id)');
  const endpointDriftSourceIds = admissions.filter(entry => typeof entry?.sourceId === 'string' && sourceById.has(entry.sourceId) && sourceById.get(entry.sourceId).url !== entry.endpointUrl).map(entry => entry.sourceId);
  const nameDriftSourceIds = admissions.filter(entry => typeof entry?.sourceId === 'string' && sourceById.has(entry.sourceId) && sourceById.get(entry.sourceId).name !== entry.name).map(entry => entry.sourceId);
  const unadmittedNewSourceIds = sourceIds.filter(id => !LEGACY_SOURCE_IDS.includes(id) && !isProductionAdmissible(admissionById.get(id)));
  const legacyStateErrors = sourceIds.filter(id => LEGACY_SOURCE_IDS.includes(id) && (!admissionById.get(id) || !REVIEW_STATE_SET.has(admissionById.get(id).reviewState) || admissionById.get(id).legacy !== true));
  const newSourceMarkedLegacyIds = sourceIds.filter(id => !LEGACY_SOURCE_IDS.includes(id) && admissionById.get(id)?.legacy === true);
  const result = { duplicateCanonicalSourceIds, duplicateCanonicalEndpointUrls, invalidCanonicalSources, missingSourceIds:unique(missingSourceIds), orphanSourceIds:unique(orphanSourceIds), duplicateIds, invalidEntries:unique(invalidEntries), endpointDriftSourceIds:unique(endpointDriftSourceIds), nameDriftSourceIds:unique(nameDriftSourceIds), unadmittedNewSourceIds:unique(unadmittedNewSourceIds), legacyStateErrors:unique(legacyStateErrors), newSourceMarkedLegacyIds:unique(newSourceMarkedLegacyIds) };
  return { valid:Object.values(result).every(values => values.length === 0), ...result };
}

export function isProductionAdmissible(entry) {
  if (!validAdmission(entry)) return false;
  return Boolean(entry.legacy === false && entry.reviewState === 'reviewed' && entry.allowedUseStatus === 'verified-public-use' && ['first-party','authorized-third-party'].includes(entry.endpointAuthority) && entry.endpointEvidenceUrls.length > 0 && entry.usagePolicyUrls.length > 0 && entry.healthVerificationStatus === 'verified' && entry.itemLevelReviewRequired === false && entry.currentUse.every(use => entry.permittedUse.includes(use)));
}

export function evaluateItemUse(entry, itemAllowedUseStatus = null) {
  if (!entry || !USE_STATUS_SET.has(entry.allowedUseStatus)) return { allowedUseStatus:'unknown', displayMode:'headline-link' };
  const statuses = [entry.allowedUseStatus];
  if (itemAllowedUseStatus != null) { if (!USE_STATUS_SET.has(itemAllowedUseStatus)) throw new TypeError('item allowed-use status is not supported'); statuses.push(itemAllowedUseStatus); }
  const allowedUseStatus = statuses.sort((a,b)=>useRestrictionRank(b)-useRestrictionRank(a))[0];
  return { allowedUseStatus, displayMode: allowedUseStatus === 'verified-public-use' ? 'current-use' : allowedUseStatus === 'prohibited' ? 'exclude' : 'headline-link' };
}

export function admissionSummary(admissions = SOURCE_ADMISSIONS) {
  const validation = validateSourceAdmissions(SOURCES, admissions);
  return {
    valid:validation.valid,
    totalLiveSources:admissions.length,
    reviewedSources:admissions.filter(entry => entry?.reviewState === 'reviewed').length,
    legacyUnreviewedSources:admissions.filter(entry => entry?.reviewState === 'legacy-unreviewed').length,
    remediationSourceIds:admissions.filter(entry => ['permission-required','contract-required','prohibited'].includes(entry?.allowedUseStatus)).map(entry => entry.sourceId).sort(),
    unknownRightsSourceIds:admissions.filter(entry => entry?.allowedUseStatus === 'unknown').map(entry => entry.sourceId).sort(),
  };
}

function legacy(name, endpointUrl, options = {}) { return admission({ sourceId:slugifySourceName(name), name, endpointUrl, endpointType:'rss', endpointAuthority:'first-party', endpointEvidenceUrls:[endpointUrl], authenticationRequirement:'none-observed', usagePolicyUrls:[], allowedUseStatus:'unknown', currentUse:currentUse(Boolean(options.translated)), permittedUse:[], excerptMaxChars:280, syndicatedContentBehavior:'unknown', itemLevelReviewRequired:true, itemLevelStrategy:'restrict-on-explicit-item-signal', reviewState:'legacy-unreviewed', reviewedAt:null, reviewerNotes:'Legacy source predates the admission contract; usage rights remain explicitly unreviewed.', healthVerificationStatus:'telemetry-managed', legacy:true, ...options }); }
function reviewedLegacy(name, endpointUrl, options) { return admission({ sourceId:slugifySourceName(name), name, endpointUrl, endpointType:'rss', endpointAuthority:'first-party', endpointEvidenceUrls:[endpointUrl], authenticationRequirement:'none-observed', usagePolicyUrls:[], allowedUseStatus:'unknown', currentUse:currentUse(false), permittedUse:[], excerptMaxChars:280, syndicatedContentBehavior:'unknown', itemLevelReviewRequired:true, itemLevelStrategy:'restrict-on-explicit-item-signal', reviewState:'reviewed', reviewedAt:ADMISSION_REVIEW_DATE, reviewerNotes:'Reviewed legacy source.', healthVerificationStatus:'telemetry-managed', legacy:true, ...options }); }
function reviewedNew(name, endpointUrl, options) { return admission({ sourceId:slugifySourceName(name), name, endpointUrl, endpointType:'rss', endpointAuthority:'first-party', endpointEvidenceUrls:[endpointUrl], authenticationRequirement:'none-observed', usagePolicyUrls:[], allowedUseStatus:'unknown', currentUse:currentUse(false), permittedUse:[], excerptMaxChars:280, syndicatedContentBehavior:'unknown', itemLevelReviewRequired:true, itemLevelStrategy:'restrict-on-explicit-item-signal', reviewState:'reviewed', reviewedAt:GD019_REVIEW_DATE, reviewerNotes:'Reviewed new source.', healthVerificationStatus:'verified', legacy:false, ...options }); }
function admission(definition = {}) { return Object.freeze({ ...definition, endpointEvidenceUrls:Object.freeze([...(definition.endpointEvidenceUrls||[])]), usagePolicyUrls:Object.freeze([...(definition.usagePolicyUrls||[])]), currentUse:Object.freeze([...(definition.currentUse||[])]), permittedUse:Object.freeze([...(definition.permittedUse||[])]) }); }
function candidate(definition) { return Object.freeze({ ...definition, endpointEvidenceUrls:Object.freeze([...(definition.endpointEvidenceUrls||[])]), usagePolicyUrls:Object.freeze([...(definition.usagePolicyUrls||[])]), currentUse:Object.freeze(currentUse(false)), permittedUse:Object.freeze([]), authenticationRequirement:definition.authenticationRequirement||'unknown', healthVerificationStatus:'research-only', reviewedAt:GD019_REVIEW_DATE, itemLevelReviewRequired:definition.itemLevelReviewRequired===true, syndicatedContentBehavior:definition.syndicatedContentBehavior||'unknown' }); }
function validAdmission(entry) { if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false; if (typeof entry.name !== 'string' || !entry.name.trim()) return false; if (typeof entry.sourceId !== 'string' || entry.sourceId !== slugifySourceName(entry.name)) return false; if (typeof entry.endpointUrl !== 'string' || !isHttps(entry.endpointUrl)) return false; if (typeof entry.endpointType !== 'string' || !entry.endpointType.trim()) return false; if (!AUTHORITY_SET.has(entry.endpointAuthority)) return false; if (!nonEmptyHttpsList(entry.endpointEvidenceUrls)) return false; if (typeof entry.authenticationRequirement !== 'string') return false; if (!httpsList(entry.usagePolicyUrls)) return false; if (!USE_STATUS_SET.has(entry.allowedUseStatus)) return false; if (!useList(entry.currentUse)||!useList(entry.permittedUse)) return false; if (!Number.isInteger(entry.excerptMaxChars)||entry.excerptMaxChars<0) return false; if (typeof entry.syndicatedContentBehavior !== 'string') return false; if (typeof entry.itemLevelReviewRequired !== 'boolean') return false; if (typeof entry.itemLevelStrategy !== 'string'||!entry.itemLevelStrategy.trim()) return false; if (!REVIEW_STATE_SET.has(entry.reviewState)) return false; if (!reviewDateValid(entry.reviewState,entry.reviewedAt)) return false; if (typeof entry.reviewerNotes !== 'string'||!entry.reviewerNotes.trim()) return false; if (typeof entry.healthVerificationStatus !== 'string') return false; return typeof entry.legacy === 'boolean'; }
function safeSourceId(source) { return typeof source?.name === 'string' && source.name.trim() ? slugifySourceName(source.name) : null; }
function reviewDateValid(reviewState, reviewedAt) { if (reviewState === 'legacy-unreviewed') return reviewedAt == null || validDateText(reviewedAt); return validDateText(reviewedAt); }
function validDateText(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()); }
function isHttps(value) { return /^https:\/\//.test(value); }
function httpsList(values) { return Array.isArray(values) && values.every(value => typeof value === 'string' && isHttps(value)); }
function nonEmptyHttpsList(values) { return httpsList(values) && values.length > 0; }
function useList(values) { return Array.isArray(values) && values.every(use => CURRENT_USE_SET.has(use)); }
function currentUse(translated) { return translated ? ['headline-link','metadata','excerpt','translated-headline-summary'] : ['headline-link','metadata','excerpt']; }
function useRestrictionRank(status) { return { 'verified-public-use':0, unknown:1, 'permission-required':2, 'contract-required':3, prohibited:4 }[status]; }
function duplicates(values) { const seen=new Set(); const repeated=new Set(); for (const value of values) { if (seen.has(value)) repeated.add(value); seen.add(value); } return [...repeated].sort(); }
function unique(values) { return [...new Set(values)].sort(); }

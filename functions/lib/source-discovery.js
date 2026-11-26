// GD-056: public discovery links, NOT a source admission or ingestion path.
import { SOURCES, SOURCE_FINGERPRINT, slugifySourceName } from '../api/news.js';
import { SOURCE_PROVENANCE, validateSourceProvenance } from './news-source-provenance.js';
import { SOURCE_ADMISSIONS, SOURCE_RESEARCH_CANDIDATES, ADMISSION_FINGERPRINT, validateSourceAdmissions } from './news-source-admission.js';

export const DISCOVERY_VERSION = 'gd056-discovery-v1';
export const DISCOVERY_REVIEW_DATE = '2026-11-25';
const REGIONS = new Set(['global', 'africa', 'americas', 'asia', 'europe', 'middle-east', 'pacific']);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE = /^[a-z]{2,3}$/;
const RIGHTS = new Set(['verified-public-use', 'permission-required', 'contract-required', 'unknown', 'prohibited']);

// Page-level discovery metadata is intentionally separate from the canonical
// feed ledger. Neither a first-party page nor a language edition implies rights.
export const RESEARCH_DISCOVERY = Object.freeze([
  {
    "id": "rnz-pacific",
    "region": "pacific",
    "focus": "New Zealand / Pacific",
    "lang": "en",
    "url": "https://www.rnz.co.nz/international",
    "note": "Pacific news and regional reporting. Existing RNZ permission review remains unresolved.",
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "agencia-brasil",
    "region": "americas",
    "focus": "Brazil",
    "lang": "pt",
    "url": "https://agenciabrasil.ebc.com.br/",
    "note": "Portuguese-language news from Brazil; publisher policy permits attributed journalistic reproduction subject to conditions and partner exceptions.",
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "laist-local",
    "region": "americas",
    "focus": "Los Angeles area, United States",
    "lang": "en",
    "url": "https://laist.com/",
    "note": "Local reporting; existing ledger excludes certain partner content from republication permission.",
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "antara-indonesian",
    "region": "asia",
    "focus": "Indonesia",
    "lang": "id",
    "url": "https://www.antaranews.com/",
    "note": "Indonesian-language news; permission and item-origin checks remain required.",
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "vnexpress-vietnamese",
    "region": "asia",
    "focus": "Vietnam",
    "lang": "vi",
    "url": "https://vnexpress.net/",
    "note": "Vietnamese-language reporting; site and feed-use terms require additional review.",
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "lemonde-french",
    "region": "europe",
    "focus": "France / international",
    "lang": "fr",
    "url": "https://www.lemonde.fr/",
    "note": "French-language news; existing licensing review remains restrictive.",
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "global-voices-original",
    "region": "global",
    "focus": "International / local perspectives",
    "lang": "en",
    "url": "https://globalvoices.org/",
    "note": "One multilingual editorial family. Publisher-listed language editions are not independent newsrooms or verified live feeds; their activity has not been tested individually.",
    "reviewedAt": "2026-11-25",
    "editions": [
      {
        "lang": "es",
        "url": "https://es.globalvoices.org/"
      },
      {
        "lang": "pt",
        "url": "https://pt.globalvoices.org/"
      },
      {
        "lang": "fr",
        "url": "https://fr.globalvoices.org/"
      },
      {
        "lang": "ar",
        "url": "https://ar.globalvoices.org/"
      },
      {
        "lang": "bn",
        "url": "https://bn.globalvoices.org/"
      },
      {
        "lang": "sw",
        "url": "https://sw.globalvoices.org/"
      },
      {
        "lang": "yo",
        "url": "https://yo.globalvoices.org/"
      },
      {
        "lang": "ig",
        "url": "https://ig.globalvoices.org/"
      },
      {
        "lang": "ne",
        "url": "https://ne.globalvoices.org/"
      },
      {
        "lang": "uk",
        "url": "https://uk.globalvoices.org/"
      },
      {
        "lang": "hi",
        "url": "https://hi.globalvoices.org/"
      },
      {
        "lang": "id",
        "url": "https://id.globalvoices.org/"
      },
      {
        "lang": "am",
        "url": "https://am.globalvoices.org/"
      },
      {
        "lang": "zh",
        "url": "https://zhs.globalvoices.org/"
      },
      {
        "lang": "fa",
        "url": "https://fa.globalvoices.org/"
      },
      {
        "lang": "ur",
        "url": "https://ur.globalvoices.org/"
      }
    ]
  }
]);
export const DIRECT_DISCOVERY = Object.freeze([
  {
    "id": "seneweb",
    "name": "Seneweb",
    "region": "africa",
    "focus": "Senegal / Africa",
    "languages": [
      "fr"
    ],
    "url": "https://www.seneweb.com/",
    "note": "French-language news portal with Senegal and Africa sections. The origin of individual stories is not established.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://www.seneweb.com/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "radio-okapi",
    "name": "Radio Okapi",
    "region": "africa",
    "focus": "Democratic Republic of the Congo",
    "languages": [
      "fr"
    ],
    "url": "https://www.radiookapi.net/",
    "note": "French-language site with separately listed audio news in several Congolese languages. The audio languages are not counted as written website languages.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://www.radiookapi.net/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "fijivillage",
    "name": "Fijivillage",
    "region": "pacific",
    "focus": "Fiji",
    "languages": [
      "en"
    ],
    "url": "https://www.fijivillage.com/",
    "note": "Fiji-focused English-language news and local reporting.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://www.fijivillage.com/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "talamua",
    "name": "Talamua Online",
    "region": "pacific",
    "focus": "Samoa",
    "languages": [
      "en"
    ],
    "url": "https://talamua.com/",
    "note": "Samoa-focused English-language news portal, including local affairs.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://talamua.com/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "te-ao-maori",
    "name": "Te Ao Māori News",
    "region": "pacific",
    "focus": "Aotearoa New Zealand / Māori communities",
    "languages": [
      "en",
      "mi"
    ],
    "url": "https://www.teaonews.co.nz/",
    "note": "Māori-focused journalism; website offers English and Māori language controls. Individual article languages may differ.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://www.teaonews.co.nz/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "suspilne",
    "name": "Suspilne News",
    "region": "europe",
    "focus": "Ukraine",
    "languages": [
      "uk"
    ],
    "url": "https://suspilne.media/",
    "note": "Ukrainian-language national and regional news.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://suspilne.media/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "onlinekhabar",
    "name": "Onlinekhabar",
    "region": "asia",
    "focus": "Nepal",
    "languages": [
      "ne"
    ],
    "url": "https://www.onlinekhabar.com/",
    "note": "Nepali-language news portal with national and regional reporting.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://www.onlinekhabar.com/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "prothom-alo",
    "name": "Prothom Alo",
    "region": "asia",
    "focus": "Bangladesh",
    "languages": [
      "bn"
    ],
    "url": "https://www.prothomalo.com/",
    "note": "Bengali-language news site with Bangladesh and world coverage.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://www.prothomalo.com/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "prensa-comunitaria",
    "name": "Prensa Comunitaria",
    "region": "americas",
    "focus": "Guatemala / local communities",
    "languages": [
      "es"
    ],
    "url": "https://prensacomunitaria.org/",
    "note": "Spanish-language reporting organized around Guatemalan territories and communities.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://prensacomunitaria.org/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "animal-politico",
    "name": "Animal Político / Grupo Animal",
    "region": "americas",
    "focus": "Mexico",
    "languages": [
      "es"
    ],
    "url": "https://grupoanimal.mx/noticias",
    "note": "Spanish-language news and reporting; the former Animal Político home redirects to this multi-brand news page.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://grupoanimal.mx/noticias"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "rtve",
    "name": "RTVE Noticias",
    "region": "europe",
    "focus": "Spain / international",
    "languages": [
      "es"
    ],
    "url": "https://www.rtve.es/noticias/",
    "note": "Spanish-language reporting. A first-party RSS directory exists; GlobalDeets has not reviewed feed reuse rights.",
    "relatedSourceId": null,
    "evidenceUrls": [
      "https://www.rtve.es/noticias/",
      "https://www.rtve.es/rss/"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "al-jazeera-arabic",
    "name": "Al Jazeera Arabic",
    "region": "middle-east",
    "focus": "Arabic-language international news",
    "languages": [
      "ar"
    ],
    "url": "https://www.aljazeera.net/",
    "note": "Arabic-language edition of the already monitored Al Jazeera network. Not an additional independent publisher.",
    "relatedSourceId": "al-jazeera",
    "evidenceUrls": [
      "https://www.aljazeera.net/",
      "https://www.aljazeera.net/%D8%A7%D8%AA%D9%81%D8%A7%D9%82%D9%8A%D8%A9-%D8%A7%D9%84%D9%85%D9%88%D9%82%D8%B9"
    ],
    "reviewedAt": "2026-11-25"
  },
  {
    "id": "abc-chinese",
    "name": "ABC Chinese",
    "region": "pacific",
    "focus": "Australia / Chinese-language readers",
    "languages": [
      "zh"
    ],
    "url": "https://www.abc.net.au/news/chinese",
    "note": "Chinese-language news edition of ABC Australia, an already monitored organization. Not an additional independent publisher.",
    "relatedSourceId": "abc-australia",
    "evidenceUrls": [
      "https://www.abc.net.au/news/chinese"
    ],
    "reviewedAt": "2026-11-25"
  }
]);

function text(value, max = 700) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
export function safeDiscoveryUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      u.hostname.includes('.') && !u.hostname.endsWith('.local') &&
      !/^\d+(?:\.\d+){3}$/.test(u.hostname) && u.href === value;
  } catch { return false; }
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10) === value;
}
function unique(values) { return [...new Set(values)]; }
function validLanguages(values) {
  return Array.isArray(values) && values.length > 0 && values.length <= 60 &&
    unique(values).length === values.length && values.every(lang => LANGUAGE.test(lang));
}

export function validateDiscovery(research = RESEARCH_DISCOVERY, direct = DIRECT_DISCOVERY,
  candidates = SOURCE_RESEARCH_CANDIDATES, sources = SOURCE_PROVENANCE) {
  if (![research,direct,candidates,sources].every(Array.isArray)) return { valid:false };
  const ids = new Set(sources.map(entry => entry.sourceId));
  const candidatesById = new Map(candidates.map(entry => [entry.candidateId,entry]));
  if (ids.size !== sources.length || candidatesById.size !== candidates.length ||
      research.length !== candidates.length || direct.length > 1000) return { valid:false };
  const seen = new Set(ids), pages = new Set();
  for (const entry of [...research,...direct]) {
    if (!entry || !ID.test(entry.id || '') || seen.has(entry.id) ||
        !REGIONS.has(entry.region) || !text(entry.focus,160) || !text(entry.note) ||
        !safeDiscoveryUrl(entry.url) || pages.has(entry.url) || !validDate(entry.reviewedAt)) return {valid:false};
    seen.add(entry.id); pages.add(entry.url);
  }
  for (const entry of research) {
    const candidate = candidatesById.get(entry.id);
    if (!candidate || candidate.disposition !== 'research' ||
        candidate.healthVerificationStatus !== 'research-only' ||
        !Array.isArray(candidate.permittedUse) || candidate.permittedUse.length ||
        !LANGUAGE.test(entry.lang) || !RIGHTS.has(candidate.allowedUseStatus) ||
        !validDate(candidate.reviewedAt) || !Array.isArray(candidate.usagePolicyUrls) ||
        !candidate.usagePolicyUrls.every(safeDiscoveryUrl) ||
        !Array.isArray(candidate.endpointEvidenceUrls) || !candidate.endpointEvidenceUrls.length ||
        !candidate.endpointEvidenceUrls.every(safeDiscoveryUrl)) return {valid:false};
    if (entry.editions != null && (!Array.isArray(entry.editions) || entry.editions.length > 60 ||
        !validLanguages([entry.lang,...entry.editions.map(edition => edition?.lang)]) ||
        !entry.editions.every(edition => safeDiscoveryUrl(edition.url)))) return {valid:false};
  }
  for (const entry of direct) {
    if (candidatesById.has(entry.id) || !text(entry.name,120) ||
        !validLanguages(entry.languages) || !Array.isArray(entry.evidenceUrls) ||
        !entry.evidenceUrls.includes(entry.url) || !entry.evidenceUrls.every(safeDiscoveryUrl) ||
        (entry.relatedSourceId !== null && !ids.has(entry.relatedSourceId))) return {valid:false};
  }
  return {valid:true};
}

export function buildDiscovery() {
  if (!validateSourceProvenance().valid || !validateSourceAdmissions().valid || !validateDiscovery().valid) return null;
  const byId = new Map(SOURCE_PROVENANCE.map(entry => [entry.sourceId,entry]));
  const admissions = new Map(SOURCE_ADMISSIONS.map(entry => [entry.sourceId,entry]));
  const metadata = new Map(RESEARCH_DISCOVERY.map(entry => [entry.id,entry]));
  const monitored = SOURCES.map(source => {
    const id = slugifySourceName(source.name);
    const provenance = byId.get(id), admission = admissions.get(id);
    return { id, name:source.name, status:'monitored', region:source.region,
      languages:[source.lang], languageBasis:'configured-feed',
      country:provenance.primaryCountry || null,
      focus:provenance.geographicScope, relatedSourceId:null,
      rights:admission.allowedUseStatus, reviewedAt:provenance.reviewedAt,
      note:'Configured feed; current endpoint health and item-level rights are separate.',
      evidenceUrls:provenance.evidenceUrls };
  });
  const research = SOURCE_RESEARCH_CANDIDATES.map(candidate => {
    const m = metadata.get(candidate.candidateId);
    return { id:m.id, name:candidate.name, status:'research', region:m.region, focus:m.focus,
      languages:[m.lang,...(m.editions || []).map(edition => edition.lang)], languageBasis:'publisher-page-or-listed-edition',
      url:m.url, editions:m.editions || [], reviewedAt:m.reviewedAt, rightsReviewedAt:candidate.reviewedAt,
      rights:candidate.allowedUseStatus, itemLevelReviewRequired:candidate.itemLevelReviewRequired,
      health:'not-certified', relatedSourceId:null, note:m.note,
      evidenceUrls:unique([...candidate.endpointEvidenceUrls,...candidate.usagePolicyUrls]),
      policyUrls:candidate.usagePolicyUrls };
  });
  const direct = DIRECT_DISCOVERY.map(entry => ({...entry,status:'link-only',
    languageBasis:'publisher-page-or-listed-edition',rights:'not-reviewed',editions:[]}));
  const feedLanguages = unique(monitored.flatMap(entry => entry.languages)).sort();
  const entries = [...monitored,...research,...direct];
  return { version:DISCOVERY_VERSION, reviewedAt:DISCOVERY_REVIEW_DATE,
    sourceFingerprint:SOURCE_FINGERPRINT, admissionFingerprint:ADMISSION_FINGERPRINT,
    validation:{valid:true}, scope:'configured-feeds-and-reviewed-navigation-links',
    counts:{monitored:monitored.length,research:research.length,linkOnly:direct.length},
    feedLanguages, entries,
    rules:{automaticAdmission:false, eventLocationInference:false, externalArticleCollection:false,
      languageEditionImpliesIndependentPublisher:false, linkImpliesReusePermission:false} };
}

import {
  createEntity,
  createEvent,
  validateIntelligenceGraph,
} from './intelligence-model.js';
import { getSeedPlaceByIsoAlpha2 } from './m49-place-seed.js';
import {
  createClaim,
  createClaimRelation,
  createEvidence,
  createEvidenceRelation,
  validateClaimEvidenceGraph,
} from './claim-evidence-model.js';

export const SANTA_YNEZ_DOSSIER_VERSION = '2026-09-03.1';
export const SANTA_YNEZ_DOSSIER_ID = 'santa-ynez-pipeline';
export const SANTA_YNEZ_REVIEWED_AT = '2026-09-03';

const URLS = Object.freeze({
  doeMarch13:
    'https://www.energy.gov/articles/secretary-wright-directs-sable-offshore-restore-santa-ynez-unit-and-pipeline',
  caAgMarch23:
    'https://www.oag.ca.gov/news/press-releases/attorney-general-bonta-files-lawsuit-against-trump-administration-stop-executive',
  caAppealJune17: 'https://courts.ca.gov/opinion/published/2026-06-17/b347601',
  phmsaPermit:
    'https://www.phmsa.dot.gov/pipeline/special-permits-state-waivers/special-permits-issued',
  caAgJuly20:
    'https://oag.ca.gov/news/press-releases/attorney-general-bonta-continues-protect-california%E2%80%99s-environment-and-public-0',
  federalOrderAug19:
    'https://www.sec.gov/Archives/edgar/data/1831481/000183148126000108/a2026081986ordergranting.htm',
  sable8kAug19:
    'https://www.sec.gov/Archives/edgar/data/1831481/000183148126000108/socc-20260819.htm',
  dojAug21:
    'https://www.justice.gov/opa/pr/federal-court-protects-national-energy-security-and-rejects-dangerous-state-efforts-obstruct',
  laTimesAug20:
    'https://www.latimes.com/environment/story/2026-08-20/judge-allows-controversial-oil-company-continue-pumping',
  dojSept3:
    'https://www.justice.gov/opa/pr/federal-court-dismisses-another-attempt-stymie-sable-offshore-corporations-oil-and-gas',
  censusCalifornia: 'https://www.census.gov/quickfacts/fact/table/CA/PST045225',
  censusSantaBarbara:
    'https://www.census.gov/quickfacts/fact/table/santabarbaracountycalifornia,CA/PST045225',
  secSable: 'https://www.sec.gov/edgar/browse/?CIK=1831481&owner=exclude',
  cdca: 'https://www.cacd.uscourts.gov/',
  doj: 'https://www.justice.gov/',
  doe: 'https://www.energy.gov/',
  phmsa: 'https://www.phmsa.dot.gov/',
  caDoj: 'https://oag.ca.gov/',
  caCourts: 'https://courts.ca.gov/',
});

const unitedStates = getSeedPlaceByIsoAlpha2('US');
if (!unitedStates) throw new TypeError('Santa Ynez dossier requires the reviewed US M49 place');

const california = createEntity({
  identityKey: 'census-geoid:06',
  displayName: 'California',
  type: 'place',
  countryEntityId: unitedStates.id,
  standardIds: { censusGeoid: '06' },
  evidenceRefs: [URLS.censusCalifornia],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const santaBarbaraCounty = createEntity({
  identityKey: 'census-geoid:06083',
  displayName: 'Santa Barbara County',
  type: 'place',
  countryEntityId: unitedStates.id,
  standardIds: { censusGeoid: '06083' },
  evidenceRefs: [URLS.censusSantaBarbara],
  attributes: { parentPlaceEntityId: california.id },
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const sable = createEntity({
  identityKey: 'sec-cik:0001831481',
  displayName: 'Sable Offshore Corp.',
  type: 'company',
  standardIds: { secCik: '0001831481' },
  evidenceRefs: [URLS.secSable],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const cdca = createEntity({
  identityKey: 'uscourt:cdca',
  displayName: 'U.S. District Court for the Central District of California',
  type: 'government-public-body',
  evidenceRefs: [URLS.cdca],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const doe = createEntity({
  identityKey: 'us-federal-agency:DOE',
  displayName: 'U.S. Department of Energy',
  type: 'government-public-body',
  evidenceRefs: [URLS.doe],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const phmsa = createEntity({
  identityKey: 'us-federal-agency:PHMSA',
  displayName: 'Pipeline and Hazardous Materials Safety Administration',
  type: 'government-public-body',
  evidenceRefs: [URLS.phmsa],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const usDoj = createEntity({
  identityKey: 'us-federal-agency:DOJ',
  displayName: 'U.S. Department of Justice',
  type: 'government-public-body',
  evidenceRefs: [URLS.doj],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const caDoj = createEntity({
  identityKey: 'ca-state-agency:DOJ',
  displayName: 'California Department of Justice',
  type: 'government-public-body',
  countryEntityId: unitedStates.id,
  evidenceRefs: [URLS.caDoj],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const caAppealCourt = createEntity({
  identityKey: 'ca-court:2d-district-court-of-appeal',
  displayName: 'California Court of Appeal, Second Appellate District',
  type: 'government-public-body',
  countryEntityId: unitedStates.id,
  evidenceRefs: [URLS.caCourts],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

export const SANTA_YNEZ_ENTITIES = Object.freeze([
  unitedStates,
  california,
  santaBarbaraCounty,
  sable,
  cdca,
  doe,
  phmsa,
  usDoj,
  caDoj,
  caAppealCourt,
]);

const dpaOrderEvent = createEvent({
  eventKey: 'santa-ynez:2026-03-13:doe-dpa-restart-order',
  title: 'Energy Department directs Santa Ynez restart under the Defense Production Act',
  eventType: 'federal-order',
  status: 'confirmed',
  observedAt: '2026-03-13',
  startedAt: '2026-03-13',
  entityIds: [doe.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  evidenceRefs: [URLS.doeMarch13],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const stateAppealEvent = createEvent({
  eventKey: 'santa-ynez:2026-06-17:coastal-commission-appeal-opinion',
  title: 'California appellate court publishes Sable v. California Coastal Commission opinion',
  eventType: 'court-ruling',
  status: 'confirmed',
  observedAt: '2026-06-17',
  startedAt: '2026-06-17',
  entityIds: [sable.id, caAppealCourt.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  evidenceRefs: [URLS.caAppealJune17],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const phmsaPermitEvent = createEvent({
  eventKey: 'santa-ynez:2026-06-25:phmsa-special-permit',
  title: 'PHMSA issues Sable hazardous-liquid pipeline special permit',
  eventType: 'regulatory-action',
  status: 'confirmed',
  observedAt: '2026-06-25',
  startedAt: '2026-06-25',
  entityIds: [phmsa.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  evidenceRefs: [URLS.phmsaPermit],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const federalOrderEvent = createEvent({
  eventKey: 'santa-ynez:2026-08-19:cdca-related-pipeline-order',
  title: 'Federal court issues mixed order across related Santa Ynez pipeline cases',
  eventType: 'court-ruling',
  status: 'confirmed',
  observedAt: '2026-08-19',
  startedAt: '2026-08-19',
  entityIds: [cdca.id, sable.id, doe.id, phmsa.id, caDoj.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  evidenceRefs: [URLS.federalOrderAug19],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const appealNoticesEvent = createEvent({
  eventKey: 'santa-ynez:2026-08-20-21:appeal-notices',
  title: 'Notices of appeal follow portions of the August 19 federal order',
  eventType: 'appeal',
  status: 'developing',
  observedAt: '2026-08-21',
  startedAt: '2026-08-20',
  entityIds: [sable.id, caDoj.id],
  placeEntityIds: [california.id],
  evidenceRefs: [URLS.sable8kAug19],
  unknowns: ['final appellate disposition'],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const relatedDismissalEvent = createEvent({
  eventKey: 'santa-ynez:2026-08-31:cbd-boem-platform-harmony-dismissal',
  title: 'Federal court dismisses related Platform Harmony challenge',
  eventType: 'court-ruling',
  status: 'confirmed',
  observedAt: '2026-08-31',
  startedAt: '2026-08-31',
  entityIds: [usDoj.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  evidenceRefs: [URLS.dojSept3],
  unknowns: ['primary court order not yet included in this dossier snapshot'],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const dojCorrectionEvent = createEvent({
  eventKey: 'santa-ynez:2026-09-03:doj-release-correction',
  title: 'Justice Department corrects a mistaken Sable press-release reprint',
  eventType: 'correction',
  status: 'confirmed',
  observedAt: '2026-09-03',
  startedAt: '2026-09-03',
  entityIds: [usDoj.id, sable.id],
  placeEntityIds: [california.id],
  evidenceRefs: [URLS.dojSept3],
  unknowns: ['original mistaken release artifact is not retained in this dossier snapshot'],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

export const SANTA_YNEZ_EVENTS = Object.freeze([
  dpaOrderEvent,
  stateAppealEvent,
  phmsaPermitEvent,
  federalOrderEvent,
  appealNoticesEvent,
  relatedDismissalEvent,
  dojCorrectionEvent,
]);

export const SANTA_YNEZ_SOURCES = Object.freeze([
  source('source:doe:2026-03-13', 'U.S. Department of Energy', 'institutional-statement', 'official-position', URLS.doeMarch13),
  source('source:ca-doj:2026-03-23', 'California Department of Justice', 'institutional-statement', 'official-position', URLS.caAgMarch23),
  source('source:ca-court:2026-06-17', 'California Court of Appeal', 'court-record', 'primary-evidence', URLS.caAppealJune17),
  source('source:phmsa:2026-06-25', 'PHMSA', 'regulatory-record', 'primary-evidence', URLS.phmsaPermit),
  source('source:ca-doj:2026-07-20', 'California Department of Justice', 'institutional-statement', 'official-position', URLS.caAgJuly20),
  source('source:cdca:2026-08-19-order', 'U.S. District Court, Central District of California', 'court-record', 'primary-evidence', URLS.federalOrderAug19),
  source('source:sable-sec:2026-08-19', 'Sable Offshore Corp. SEC filing', 'corporate-filing', 'primary-disclosure', URLS.sable8kAug19),
  source('source:latimes:2026-08-20', 'Los Angeles Times', 'independent-reporting', 'reporting', URLS.laTimesAug20),
  source('source:doj:2026-08-21', 'U.S. Department of Justice', 'institutional-statement', 'official-position', URLS.dojAug21),
  source('source:doj:2026-09-03', 'U.S. Department of Justice', 'institutional-statement', 'correction', URLS.dojSept3),
]);

const dpaEvidence = createEvidence({
  evidenceKey: 'doe:2026-03-13:santa-ynez-dpa-direction',
  issuerEntityId: doe.id,
  canonicalRef: URLS.doeMarch13,
  documentType: 'government-release',
  publishedAt: '2026-03-13',
  eventIds: [dpaOrderEvent.id],
  entityIds: [doe.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  provenanceRefs: [URLS.doeMarch13],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const caChallengeEvidence = createEvidence({
  evidenceKey: 'ca-doj:2026-03-23:dpa-challenge',
  issuerEntityId: caDoj.id,
  canonicalRef: URLS.caAgMarch23,
  documentType: 'government-release',
  publishedAt: '2026-03-23',
  eventIds: [dpaOrderEvent.id],
  entityIds: [caDoj.id, doe.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  provenanceRefs: [URLS.caAgMarch23],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const stateAppealEvidence = createEvidence({
  evidenceKey: 'ca-court:2026-06-17:b347601',
  issuerEntityId: caAppealCourt.id,
  canonicalRef: URLS.caAppealJune17,
  documentType: 'judgment',
  publishedAt: '2026-06-17',
  eventIds: [stateAppealEvent.id],
  entityIds: [caAppealCourt.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  provenanceRefs: [URLS.caAppealJune17],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const phmsaPermitEvidence = createEvidence({
  evidenceKey: 'phmsa:2026-06-25:sable-special-permit',
  issuerEntityId: phmsa.id,
  canonicalRef: URLS.phmsaPermit,
  documentType: 'regulator-release',
  publishedAt: '2026-06-25',
  eventIds: [phmsaPermitEvent.id],
  entityIds: [phmsa.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  provenanceRefs: [URLS.phmsaPermit],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const federalOrderEvidence = createEvidence({
  evidenceKey: 'cdca:2026-08-19:document-86',
  issuerEntityId: cdca.id,
  canonicalRef: URLS.federalOrderAug19,
  documentType: 'judgment',
  publishedAt: '2026-08-19',
  eventIds: [federalOrderEvent.id],
  entityIds: [cdca.id, sable.id, doe.id, phmsa.id, caDoj.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  provenanceRefs: [URLS.federalOrderAug19, URLS.sable8kAug19],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const sable8kEvidence = createEvidence({
  evidenceKey: 'sec:sable:2026-08-19:8-k',
  issuerEntityId: sable.id,
  canonicalRef: URLS.sable8kAug19,
  documentType: 'corporate-filing',
  publishedAt: '2026-08-19',
  eventIds: [federalOrderEvent.id, appealNoticesEvent.id],
  entityIds: [sable.id, cdca.id, caDoj.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  provenanceRefs: [URLS.sable8kAug19],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const dojAug21Evidence = createEvidence({
  evidenceKey: 'doj:2026-08-21:santa-ynez-release',
  issuerEntityId: usDoj.id,
  canonicalRef: URLS.dojAug21,
  documentType: 'government-release',
  publishedAt: '2026-08-21',
  eventIds: [federalOrderEvent.id],
  entityIds: [usDoj.id, doe.id, phmsa.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  provenanceRefs: [URLS.dojAug21],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const dojCorrectionEvidence = createEvidence({
  evidenceKey: 'doj:2026-09-03:sable-release-correction',
  issuerEntityId: usDoj.id,
  canonicalRef: URLS.dojSept3,
  documentType: 'government-release',
  publishedAt: '2026-09-03',
  eventIds: [relatedDismissalEvent.id, dojCorrectionEvent.id],
  entityIds: [usDoj.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  provenanceRefs: [URLS.dojSept3],
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

export const SANTA_YNEZ_EVIDENCE = Object.freeze([
  dpaEvidence,
  caChallengeEvidence,
  stateAppealEvidence,
  phmsaPermitEvidence,
  federalOrderEvidence,
  sable8kEvidence,
  dojAug21Evidence,
  dojCorrectionEvidence,
]);

const doeSecurityClaim = createClaim({
  claimKey: 'dpa-order-energy-security-rationale',
  proposition:
    'The Energy Department said its March 13 direction to restore Santa Ynez operations was issued under Defense Production Act authority to address supply-disruption and national-security risks.',
  type: 'official-position',
  state: 'disputed',
  originSourceId: 'source:doe:2026-03-13',
  originRef: URLS.doeMarch13,
  sourceWording: 'DOE described the order as an energy- and national-security action.',
  eventIds: [dpaOrderEvent.id],
  entityIds: [doe.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  assertedAt: '2026-03-13',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const caLegalityClaim = createClaim({
  claimKey: 'california-challenges-dpa-authority',
  proposition:
    'California challenged the Energy Department order as an unlawful use of the Defense Production Act that could not displace state law and the federal consent decree.',
  type: 'official-position',
  state: 'disputed',
  originSourceId: 'source:ca-doj:2026-03-23',
  originRef: URLS.caAgMarch23,
  sourceWording: 'California described the federal order as executive overreach and sued to block it.',
  eventIds: [dpaOrderEvent.id, federalOrderEvent.id],
  entityIds: [caDoj.id, doe.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  assertedAt: '2026-03-23',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const violationClaim = createClaim({
  claimKey: 'aug19-consent-decree-violation-159-days',
  proposition:
    'The August 19 federal order found that Sable violated the consent decree for 159 days and imposed a $1.449 million penalty.',
  type: 'fact-assertion',
  state: 'corroborated',
  originSourceId: 'source:cdca:2026-08-19-order',
  originRef: URLS.federalOrderAug19,
  sourceWording: 'The court calculated 159 days of violation and a total $1.449 million penalty.',
  eventIds: [federalOrderEvent.id],
  entityIds: [cdca.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  assertedAt: '2026-08-19',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const noShutdownClaim = createClaim({
  claimKey: 'aug19-court-declines-shutdown-injunction',
  proposition:
    'The August 19 federal order declined to order Sable to shut down the onshore pipeline segments.',
  type: 'fact-assertion',
  state: 'corroborated',
  originSourceId: 'source:cdca:2026-08-19-order',
  originRef: URLS.federalOrderAug19,
  sourceWording: 'The court declined injunctive relief shutting the pipeline and instead imposed the consent-decree penalty.',
  eventIds: [federalOrderEvent.id],
  entityIds: [cdca.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  assertedAt: '2026-08-19',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const piDeniedClaim = createClaim({
  claimKey: 'aug19-california-preliminary-injunction-denied',
  proposition:
    'The August 19 federal order denied California’s motion for a preliminary injunction against the Defense Production Act order.',
  type: 'fact-assertion',
  state: 'corroborated',
  originSourceId: 'source:cdca:2026-08-19-order',
  originRef: URLS.federalOrderAug19,
  sourceWording: 'The court denied California’s preliminary-injunction motion in California v. Wright.',
  eventIds: [federalOrderEvent.id],
  entityIds: [cdca.id, caDoj.id, doe.id, sable.id],
  placeEntityIds: [california.id],
  assertedAt: '2026-08-19',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const oversightClaim = createClaim({
  claimKey: 'aug19-consent-decree-supervision-transferred-phmsa',
  proposition:
    'The August 19 order modified the consent decree to transfer supervising regulatory authority over the onshore pipeline to PHMSA during the national emergency.',
  type: 'fact-assertion',
  state: 'corroborated',
  originSourceId: 'source:cdca:2026-08-19-order',
  originRef: URLS.federalOrderAug19,
  sourceWording: 'The court modified the consent decree to place supervising regulatory authority with PHMSA.',
  eventIds: [federalOrderEvent.id],
  entityIds: [cdca.id, phmsa.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  assertedAt: '2026-08-19',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const laTimesMixedOutcomeClaim = createClaim({
  claimKey: 'latimes-aug20-mixed-outcome',
  proposition:
    'The Los Angeles Times reported that the ruling allowed continued pumping and shifted oversight while also fining Sable nearly $1.5 million for violating the consent decree.',
  type: 'fact-assertion',
  state: 'corroborated',
  originSourceId: 'source:latimes:2026-08-20',
  originRef: URLS.laTimesAug20,
  sourceWording: 'Independent reporting described both continued operations and the consent-decree penalty.',
  eventIds: [federalOrderEvent.id],
  entityIds: [sable.id, cdca.id, phmsa.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  assertedAt: '2026-08-20',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const dojVictoryClaim = createClaim({
  claimKey: 'doj-aug21-energy-security-victory-framing',
  proposition:
    'The Justice Department characterized the August 19 rulings as a significant federal energy-security victory and emphasized federal preemption of state barriers.',
  type: 'official-position',
  state: 'single-source',
  originSourceId: 'source:doj:2026-08-21',
  originRef: URLS.dojAug21,
  sourceWording: 'DOJ framed the ruling as protecting national energy security from state obstruction.',
  eventIds: [federalOrderEvent.id],
  entityIds: [usDoj.id, doe.id, phmsa.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  assertedAt: '2026-08-21',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const appealClaim = createClaim({
  claimKey: 'sable-8k-appeal-notices',
  proposition:
    'Sable’s August 19 SEC filing, updated with subsequent events, states that California filed a notice of appeal on August 20 and that a defendant in the Quintero matter filed a notice of appeal on August 21.',
  type: 'fact-assertion',
  state: 'single-source',
  originSourceId: 'source:sable-sec:2026-08-19',
  originRef: URLS.sable8kAug19,
  sourceWording: 'The corporate filing records notices of appeal after the federal order.',
  eventIds: [appealNoticesEvent.id],
  entityIds: [sable.id, caDoj.id],
  placeEntityIds: [california.id],
  assertedAt: '2026-08-21',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const dismissalClaim = createClaim({
  claimKey: 'doj-aug31-related-platform-harmony-dismissal',
  proposition:
    'The Justice Department reported that on August 31 the Central District of California dismissed with prejudice a related Center for Biological Diversity challenge concerning Platform Harmony.',
  type: 'fact-assertion',
  state: 'single-source',
  originSourceId: 'source:doj:2026-09-03',
  originRef: URLS.dojSept3,
  sourceWording: 'DOJ reported an August 31 dismissal with prejudice in the related Platform Harmony matter.',
  eventIds: [relatedDismissalEvent.id],
  entityIds: [usDoj.id, sable.id],
  placeEntityIds: [california.id, santaBarbaraCounty.id],
  assertedAt: '2026-09-03',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

const correctionClaim = createClaim({
  claimKey: 'doj-sept3-mistaken-release-reprint-corrected',
  proposition:
    'The Justice Department states that a press release posted earlier on September 3 mistakenly reprinted its August 21 Sable release and was replaced with the correct release about the August 31 decision.',
  type: 'fact-assertion',
  state: 'corroborated',
  originSourceId: 'source:doj:2026-09-03',
  originRef: URLS.dojSept3,
  sourceWording: 'DOJ explicitly labels the earlier September 3 release a mistaken reprint and supplies the corrected release.',
  eventIds: [dojCorrectionEvent.id, relatedDismissalEvent.id],
  entityIds: [usDoj.id, sable.id],
  placeEntityIds: [california.id],
  assertedAt: '2026-09-03',
  reviewedAt: SANTA_YNEZ_REVIEWED_AT,
});

export const SANTA_YNEZ_CLAIMS = Object.freeze([
  doeSecurityClaim,
  caLegalityClaim,
  violationClaim,
  noShutdownClaim,
  piDeniedClaim,
  oversightClaim,
  laTimesMixedOutcomeClaim,
  dojVictoryClaim,
  appealClaim,
  dismissalClaim,
  correctionClaim,
]);

export const SANTA_YNEZ_CLAIM_RELATIONS = Object.freeze([
  createClaimRelation({
    claimId: doeSecurityClaim.id,
    relatedClaimId: caLegalityClaim.id,
    relation: 'contradicts',
    evidenceIds: [dpaEvidence.id, caChallengeEvidence.id, federalOrderEvidence.id],
    reviewedAt: SANTA_YNEZ_REVIEWED_AT,
  }),
  createClaimRelation({
    claimId: violationClaim.id,
    relatedClaimId: laTimesMixedOutcomeClaim.id,
    relation: 'corroborates',
    evidenceIds: [federalOrderEvidence.id],
    reviewedAt: SANTA_YNEZ_REVIEWED_AT,
  }),
  createClaimRelation({
    claimId: noShutdownClaim.id,
    relatedClaimId: laTimesMixedOutcomeClaim.id,
    relation: 'corroborates',
    evidenceIds: [federalOrderEvidence.id],
    reviewedAt: SANTA_YNEZ_REVIEWED_AT,
  }),
]);

export const SANTA_YNEZ_EVIDENCE_RELATIONS = Object.freeze([
  link(doeSecurityClaim, dpaEvidence, 'supports'),
  link(caLegalityClaim, caChallengeEvidence, 'supports'),
  link(violationClaim, federalOrderEvidence, 'supports'),
  link(noShutdownClaim, federalOrderEvidence, 'supports'),
  link(piDeniedClaim, federalOrderEvidence, 'supports'),
  link(oversightClaim, federalOrderEvidence, 'supports'),
  link(dojVictoryClaim, dojAug21Evidence, 'supports'),
  link(appealClaim, sable8kEvidence, 'supports'),
  link(dismissalClaim, dojCorrectionEvidence, 'supports'),
  link(correctionClaim, dojCorrectionEvidence, 'supports'),
]);

export const SANTA_YNEZ_TIMELINE = Object.freeze([
  timeline('2026-03-13', dpaOrderEvent, [dpaEvidence.id], [doeSecurityClaim.id]),
  timeline('2026-03-23', dpaOrderEvent, [caChallengeEvidence.id], [caLegalityClaim.id], 'California files its federal challenge to the DPA order.'),
  timeline('2026-06-17', stateAppealEvent, [stateAppealEvidence.id], [], 'California appellate opinion supplies longer-running state-law chronology.'),
  timeline('2026-06-25', phmsaPermitEvent, [phmsaPermitEvidence.id], [], 'PHMSA records issuance of Sable’s hazardous-liquid special permit.'),
  timeline('2026-08-19', federalOrderEvent, [federalOrderEvidence.id, sable8kEvidence.id], [violationClaim.id, noShutdownClaim.id, piDeniedClaim.id, oversightClaim.id]),
  timeline('2026-08-20', federalOrderEvent, [federalOrderEvidence.id], [laTimesMixedOutcomeClaim.id], 'Independent reporting describes the ruling’s mixed practical outcome.'),
  timeline('2026-08-21', appealNoticesEvent, [sable8kEvidence.id, dojAug21Evidence.id], [appealClaim.id, dojVictoryClaim.id]),
  timeline('2026-08-31', relatedDismissalEvent, [dojCorrectionEvidence.id], [dismissalClaim.id], 'Related Platform Harmony litigation is kept as a distinct event.'),
  timeline('2026-09-03', dojCorrectionEvent, [dojCorrectionEvidence.id], [correctionClaim.id], 'DOJ explicitly corrects an earlier mistaken reprint rather than silently overwriting the record.'),
]);

export const SANTA_YNEZ_CORRECTIONS = Object.freeze([
  Object.freeze({
    id: 'correction:doj:2026-09-03',
    status: 'corrected',
    observedAt: '2026-09-03',
    issuerEntityId: usDoj.id,
    correctedRef: URLS.dojSept3,
    description:
      'DOJ states that an earlier September 3 release mistakenly reprinted the August 21 Sable release; the page now contains the corrected release about the August 31 decision.',
    originalArtifactRetained: false,
    unknowns: ['original mistaken release artifact is not retained in this dossier snapshot'],
    eventIds: [dojCorrectionEvent.id, relatedDismissalEvent.id],
    evidenceIds: [dojCorrectionEvidence.id],
    claimIds: [correctionClaim.id],
  }),
]);

export const SANTA_YNEZ_UNKNOWNS = Object.freeze([
  'The ultimate merits and appellate outcomes of the continuing federal/state jurisdiction disputes are not resolved by the August 19 preliminary-injunction ruling.',
  'The primary August 31 court order for the related Platform Harmony dismissal is not yet included; the current snapshot attributes that event to DOJ’s corrected September 3 release.',
  'The original mistaken September 3 DOJ release artifact is not retained in this dossier snapshot.',
]);

export function validateSantaYnezDossier() {
  const intelligence = validateIntelligenceGraph({
    entities: SANTA_YNEZ_ENTITIES,
    events: SANTA_YNEZ_EVENTS,
  });
  const claimEvidence = validateClaimEvidenceGraph({
    entities: SANTA_YNEZ_ENTITIES,
    events: SANTA_YNEZ_EVENTS,
    claims: SANTA_YNEZ_CLAIMS,
    evidence: SANTA_YNEZ_EVIDENCE,
    claimRelations: SANTA_YNEZ_CLAIM_RELATIONS,
    evidenceRelations: SANTA_YNEZ_EVIDENCE_RELATIONS,
  });
  const ids = {
    event: new Set(SANTA_YNEZ_EVENTS.map(item => item.id)),
    evidence: new Set(SANTA_YNEZ_EVIDENCE.map(item => item.id)),
    claim: new Set(SANTA_YNEZ_CLAIMS.map(item => item.id)),
  };
  const timelineOrphans = [];
  for (const item of SANTA_YNEZ_TIMELINE) {
    if (!ids.event.has(item.eventId)) timelineOrphans.push(`${item.id}:${item.eventId}`);
    for (const id of item.evidenceIds) if (!ids.evidence.has(id)) timelineOrphans.push(`${item.id}:${id}`);
    for (const id of item.claimIds) if (!ids.claim.has(id)) timelineOrphans.push(`${item.id}:${id}`);
  }
  const correctionOrphans = [];
  for (const item of SANTA_YNEZ_CORRECTIONS) {
    for (const id of item.eventIds) if (!ids.event.has(id)) correctionOrphans.push(`${item.id}:${id}`);
    for (const id of item.evidenceIds) if (!ids.evidence.has(id)) correctionOrphans.push(`${item.id}:${id}`);
    for (const id of item.claimIds) if (!ids.claim.has(id)) correctionOrphans.push(`${item.id}:${id}`);
  }
  const uncitedClaims = SANTA_YNEZ_CLAIMS
    .filter(claim => !SANTA_YNEZ_SOURCES.some(sourceRecord => sourceRecord.id === claim.originSourceId && sourceRecord.url === claim.originRef))
    .map(claim => claim.id);

  return {
    valid:
      intelligence.valid &&
      claimEvidence.valid &&
      timelineOrphans.length === 0 &&
      correctionOrphans.length === 0 &&
      uncitedClaims.length === 0,
    intelligence,
    claimEvidence,
    timelineOrphans: [...new Set(timelineOrphans)].sort(),
    correctionOrphans: [...new Set(correctionOrphans)].sort(),
    uncitedClaims: [...new Set(uncitedClaims)].sort(),
  };
}

export function getSantaYnezDossier() {
  const validation = validateSantaYnezDossier();
  return {
    dossierId: SANTA_YNEZ_DOSSIER_ID,
    dossierVersion: SANTA_YNEZ_DOSSIER_VERSION,
    title: 'Santa Ynez Pipeline — Evidence Dossier',
    dek:
      'A source-first record of the 2026 restart dispute, regulatory actions, mixed court rulings, appeals, and a documented DOJ correction.',
    status: 'developing',
    reviewedAt: SANTA_YNEZ_REVIEWED_AT,
    geography: {
      primaryPlaceEntityId: santaBarbaraCounty.id,
      placeEntityIds: [unitedStates.id, california.id, santaBarbaraCounty.id],
    },
    rules: {
      editorialVerdict: false,
      truthScore: false,
      contradictoryClaimsMayCoexist: true,
      primaryEvidenceDistinctFromStatements: true,
      updatesAppendOrSupersede: true,
      distinctProceedingsRemainDistinctEvents: true,
    },
    sources: SANTA_YNEZ_SOURCES,
    entities: SANTA_YNEZ_ENTITIES,
    events: SANTA_YNEZ_EVENTS,
    claims: SANTA_YNEZ_CLAIMS,
    evidence: SANTA_YNEZ_EVIDENCE,
    claimRelations: SANTA_YNEZ_CLAIM_RELATIONS,
    evidenceRelations: SANTA_YNEZ_EVIDENCE_RELATIONS,
    timeline: SANTA_YNEZ_TIMELINE,
    corrections: SANTA_YNEZ_CORRECTIONS,
    unknowns: SANTA_YNEZ_UNKNOWNS,
    validation,
  };
}

function source(id, name, sourceClass, evidenceRole, url) {
  return Object.freeze({ id, name, sourceClass, evidenceRole, url });
}

function link(claim, evidence, relation) {
  return createEvidenceRelation({
    claimId: claim.id,
    evidenceId: evidence.id,
    relation,
    reviewedAt: SANTA_YNEZ_REVIEWED_AT,
  });
}

function timeline(date, event, evidenceIds, claimIds, label = event.title) {
  return Object.freeze({
    id: `timeline:${date}:${event.id}`,
    date,
    label,
    eventId: event.id,
    evidenceIds: [...evidenceIds].sort(),
    claimIds: [...claimIds].sort(),
  });
}

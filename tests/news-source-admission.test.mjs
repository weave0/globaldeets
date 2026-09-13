import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'globaldeets-admission-'));
const functions = join(root, 'functions');
const newsPath = join(functions, 'api', 'news.js');
const admissionPath = join(functions, 'lib', 'news-source-admission.js');
mkdirSync(dirname(newsPath), { recursive: true });
mkdirSync(dirname(admissionPath), { recursive: true });
writeFileSync(join(functions, 'package.json'), '{"type":"module"}\n');
copyFileSync(fileURLToPath(new URL('../functions/api/news.js', import.meta.url)), newsPath);
copyFileSync(fileURLToPath(new URL('../functions/lib/news-source-admission.js', import.meta.url)), admissionPath);

const news = await import(pathToFileURL(newsPath).href);
const admission = await import(pathToFileURL(admissionPath).href);

function reviewedNewSource(overrides = {}) {
  return admission.createSourceAdmission({
    sourceId: 'example-news', name: 'Example News', endpointUrl: 'https://example.com/rss.xml', endpointType: 'rss',
    endpointAuthority: 'first-party', endpointEvidenceUrls: ['https://example.com/rss-info'], authenticationRequirement: 'none',
    usagePolicyUrls: ['https://example.com/terms'], allowedUseStatus: 'verified-public-use',
    currentUse: ['headline-link', 'metadata', 'excerpt'], permittedUse: ['headline-link', 'metadata', 'excerpt'], excerptMaxChars: 280,
    syndicatedContentBehavior: 'none-reviewed', itemLevelReviewRequired: false,
    itemLevelStrategy: 'preserve-origin-and-restrict-on-item-signal', reviewState: 'reviewed', reviewedAt: '2026-09-03',
    reviewerNotes: 'Test fixture.', healthVerificationStatus: 'verified', legacy: false, ...overrides,
  });
}

const EXAMPLE_SOURCE = Object.freeze({ name: 'Example News', url: 'https://example.com/rss.xml', region: 'global', lang: 'en' });

const RESTRICTED_REVIEWED = {
  'abc-australia': 'permission-required',
  'al-jazeera': 'permission-required',
  'anadolu-agency': 'contract-required',
  ap: 'contract-required',
  'bbc-world': 'permission-required',
  cna: 'permission-required',
  dawn: 'permission-required',
  dw: 'permission-required',
  'france-24': 'permission-required',
  guardian: 'permission-required',
  'kyiv-independent': 'permission-required',
  'premium-times': 'permission-required',
  'the-east-african': 'permission-required',
  ukrinform: 'contract-required',
  yonhap: 'permission-required',
};

test('all 21 live sources are reviewed while frozen legacy identity remains intact', () => {
  const validation = admission.validateSourceAdmissions();
  assert.equal(validation.valid, true);
  assert.equal(news.SOURCES.length, 21);
  assert.equal(admission.SOURCE_ADMISSIONS.length, 21);
  assert.equal(admission.LEGACY_SOURCE_IDS.length, 19);
  assert.equal(new Set(admission.SOURCE_ADMISSIONS.map(entry => entry.sourceId)).size, 21);
  const newEntries = admission.SOURCE_ADMISSIONS.filter(entry => entry.legacy === false);
  assert.deepEqual(newEntries.map(entry => entry.sourceId).sort(), ['calmatters', 'minnesota-reformer']);
  assert.equal(newEntries.every(entry => admission.isProductionAdmissible(entry)), true);
  assert.equal(admission.SOURCE_ADMISSIONS.filter(entry => entry.reviewState === 'legacy-unreviewed').length, 0);
  assert.equal(admission.SOURCE_ADMISSIONS.every(entry => entry.reviewState === 'reviewed'), true);
  const nhk = admission.SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'nhk');
  assert.ok(nhk.currentUse.includes('translated-headline-summary'));
});

test('reviewed restrictive and unknown legacy sources remain headline-link only', () => {
  for (const [sourceId, status] of Object.entries(RESTRICTED_REVIEWED)) {
    const entry = admission.SOURCE_ADMISSIONS.find(candidate => candidate.sourceId === sourceId);
    assert.equal(entry.reviewState, 'reviewed');
    assert.equal(entry.allowedUseStatus, status);
    assert.equal(admission.evaluateItemUse(entry).displayMode, 'headline-link');
    assert.deepEqual(entry.permittedUse, []);
  }

  for (const sourceId of ['nhk', 'npr', 'the-hindu']) {
    const entry = admission.SOURCE_ADMISSIONS.find(candidate => candidate.sourceId === sourceId);
    assert.equal(entry.reviewState, 'reviewed');
    assert.equal(entry.reviewedAt, '2026-09-13');
    assert.equal(entry.allowedUseStatus, 'unknown');
    assert.equal(admission.evaluateItemUse(entry).displayMode, 'headline-link');
    assert.deepEqual(entry.permittedUse, []);
  }
});

test('MercoPress remains the only promoted legacy source with bounded current-use permission', () => {
  const permittedLegacy = admission.SOURCE_ADMISSIONS.filter(
    entry => entry.legacy === true && entry.allowedUseStatus === 'verified-public-use'
  );
  assert.deepEqual(permittedLegacy.map(entry => entry.sourceId), ['mercopress']);
  const mercopress = permittedLegacy[0];
  assert.deepEqual(mercopress.permittedUse, ['headline-link', 'metadata', 'excerpt']);
  assert.equal(mercopress.itemLevelReviewRequired, false);
  assert.deepEqual(admission.evaluateItemUse(mercopress), { allowedUseStatus: 'verified-public-use', displayMode: 'current-use' });
});

test('admission summary distinguishes zero review debt from three unresolved rights states', () => {
  const summary = admission.admissionSummary();
  assert.equal(summary.valid, true);
  assert.equal(summary.totalLiveSources, 21);
  assert.equal(summary.reviewedSources, 21);
  assert.equal(summary.legacyUnreviewedSources, 0);
  assert.deepEqual(summary.remediationSourceIds, Object.keys(RESTRICTED_REVIEWED).sort());
  assert.deepEqual(summary.unknownRightsSourceIds, ['nhk', 'npr', 'the-hindu']);
});

test('a new canonical source without admission fails closed', () => {
  const sources = [...news.SOURCES, EXAMPLE_SOURCE];
  const result = admission.validateSourceAdmissions(sources, admission.SOURCE_ADMISSIONS);
  assert.equal(result.valid, false);
  assert.deepEqual(result.missingSourceIds, ['example-news']);
  assert.deepEqual(result.unadmittedNewSourceIds, ['example-news']);
});

test('a new source cannot masquerade as legacy to bypass admission', () => {
  const fakeLegacy = reviewedNewSource({ legacy: true });
  const sources = [...news.SOURCES, EXAMPLE_SOURCE];
  const result = admission.validateSourceAdmissions(sources, [...admission.SOURCE_ADMISSIONS, fakeLegacy]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.newSourceMarkedLegacyIds, ['example-news']);
});

test('new source admission requires reviewed public use, endpoint authority, health, and permitted current use', () => {
  const sources = [...news.SOURCES, EXAMPLE_SOURCE];
  const good = reviewedNewSource();
  assert.equal(admission.isProductionAdmissible(good), true);
  assert.equal(admission.validateSourceAdmissions(sources, [...admission.SOURCE_ADMISSIONS, good]).valid, true);
  for (const entry of [
    reviewedNewSource({ endpointAuthority: 'unverified-third-party' }),
    reviewedNewSource({ allowedUseStatus: 'permission-required' }),
    reviewedNewSource({ healthVerificationStatus: 'telemetry-managed' }),
    reviewedNewSource({ permittedUse: ['headline-link', 'metadata'] }),
  ]) assert.equal(admission.isProductionAdmissible(entry), false);
});

test('endpoint identity drift invalidates its admission review separately from feed health', () => {
  const changedSources = news.SOURCES.map(source => source.name === 'BBC World' ? { ...source, url: 'https://example.com/changed-feed.xml' } : source);
  const result = admission.validateSourceAdmissions(changedSources);
  assert.equal(result.valid, false);
  assert.deepEqual(result.endpointDriftSourceIds, ['bbc-world']);
});

test('item-level restriction overrides broader source-level permission', () => {
  const entry = reviewedNewSource();
  assert.deepEqual(admission.evaluateItemUse(entry), { allowedUseStatus: 'verified-public-use', displayMode: 'current-use' });
  assert.deepEqual(admission.evaluateItemUse(entry, 'permission-required'), { allowedUseStatus: 'permission-required', displayMode: 'headline-link' });
  assert.deepEqual(admission.evaluateItemUse(entry, 'prohibited'), { allowedUseStatus: 'prohibited', displayMode: 'exclude' });
});

test('research candidates remain queryable but cannot become production by implication', () => {
  const rnz = admission.SOURCE_RESEARCH_CANDIDATES.find(entry => entry.candidateId === 'rnz-pacific');
  const brasil = admission.SOURCE_RESEARCH_CANDIDATES.find(entry => entry.candidateId === 'agencia-brasil');
  const laist = admission.SOURCE_RESEARCH_CANDIDATES.find(entry => entry.candidateId === 'laist-local');
  assert.equal(rnz.disposition, 'research');
  assert.equal(brasil.itemLevelReviewRequired, true);
  assert.equal(laist.itemLevelReviewRequired, true);
  assert.equal(admission.SOURCE_ADMISSIONS.some(entry => entry.sourceId === 'laist'), false);
});

test('admission telemetry changes independently of canonical news feed cache fingerprint', () => {
  const sourceFingerprint = news.SOURCE_FINGERPRINT;
  const changed = admission.SOURCE_ADMISSIONS.map(entry => entry.sourceId === 'bbc-world' ? { ...entry, reviewerNotes: `${entry.reviewerNotes} Reviewed note.` } : entry);
  assert.equal(news.getSourceFingerprint(news.SOURCES), sourceFingerprint);
  assert.notEqual(admission.getAdmissionFingerprint(changed), admission.ADMISSION_FINGERPRINT);
});

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

test('21 live sources retain 19 frozen legacy IDs and two reviewed GD-019 additions', () => {
  const validation = admission.validateSourceAdmissions();
  assert.equal(validation.valid, true);
  assert.equal(news.SOURCES.length, 21);
  assert.equal(admission.SOURCE_ADMISSIONS.length, 21);
  assert.equal(admission.LEGACY_SOURCE_IDS.length, 19);
  assert.equal(new Set(admission.SOURCE_ADMISSIONS.map(entry => entry.sourceId)).size, 21);
  const newEntries = admission.SOURCE_ADMISSIONS.filter(entry => entry.legacy === false);
  assert.deepEqual(newEntries.map(entry => entry.sourceId).sort(), ['calmatters', 'minnesota-reformer']);
  assert.equal(newEntries.every(entry => admission.isProductionAdmissible(entry)), true);
  assert.equal(admission.SOURCE_ADMISSIONS.filter(entry => entry.reviewState === 'legacy-unreviewed').length, 8);
  const nhk = admission.SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'nhk');
  assert.ok(nhk.currentUse.includes('translated-headline-summary'));
});

test('reviewed legacy tranches remain restrictive except MercoPress bounded feed-card use', () => {
  const expected = {
    'bbc-world': 'permission-required', dw: 'permission-required', ukrinform: 'contract-required',
    'premium-times': 'permission-required', cna: 'permission-required', dawn: 'permission-required',
    'abc-australia': 'permission-required', 'the-east-african': 'permission-required', mercopress: 'verified-public-use',
  };
  for (const [sourceId, status] of Object.entries(expected)) {
    const entry = admission.SOURCE_ADMISSIONS.find(candidate => candidate.sourceId === sourceId);
    assert.equal(entry.reviewState, 'reviewed');
    assert.equal(entry.reviewedAt, '2026-09-13');
    assert.equal(entry.allowedUseStatus, status);
  }
  for (const sourceId of Object.keys(expected).filter(id => id !== 'mercopress')) {
    const entry = admission.SOURCE_ADMISSIONS.find(candidate => candidate.sourceId === sourceId);
    assert.equal(admission.evaluateItemUse(entry).displayMode, 'headline-link');
    assert.deepEqual(entry.permittedUse, []);
  }
  const mercopress = admission.SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'mercopress');
  assert.deepEqual(mercopress.permittedUse, ['headline-link', 'metadata', 'excerpt']);
  assert.equal(mercopress.itemLevelReviewRequired, false);
  assert.deepEqual(admission.evaluateItemUse(mercopress), { allowedUseStatus: 'verified-public-use', displayMode: 'current-use' });
});

test('admission summary reports both promoted tranches and unresolved rights debt', () => {
  const summary = admission.admissionSummary();
  assert.equal(summary.valid, true);
  assert.equal(summary.totalLiveSources, 21);
  assert.equal(summary.reviewedSources, 13);
  assert.equal(summary.legacyUnreviewedSources, 8);
  assert.deepEqual(summary.remediationSourceIds, [
    'abc-australia', 'ap', 'bbc-world', 'cna', 'dawn', 'dw', 'guardian', 'premium-times', 'the-east-african', 'ukrinform',
  ]);
  assert.ok(summary.unknownRightsSourceIds.includes('npr'));
  assert.equal(summary.unknownRightsSourceIds.includes('mercopress'), false);
});

test('known AP and Guardian constraints remain visible without silently removing either source', () => {
  const ap = admission.SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'ap');
  const guardian = admission.SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'guardian');
  assert.equal(ap.allowedUseStatus, 'contract-required');
  assert.equal(ap.endpointAuthority, 'unverified-third-party');
  assert.equal(guardian.allowedUseStatus, 'permission-required');
  assert.ok(news.SOURCES.some(source => source.name === 'AP'));
  assert.ok(news.SOURCES.some(source => source.name === 'Guardian'));
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

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
    sourceId: 'example-news',
    name: 'Example News',
    endpointUrl: 'https://example.com/rss.xml',
    endpointType: 'rss',
    endpointAuthority: 'first-party',
    endpointEvidenceUrls: ['https://example.com/rss-info'],
    authenticationRequirement: 'none',
    usagePolicyUrls: ['https://example.com/terms'],
    allowedUseStatus: 'verified-public-use',
    currentUse: ['headline-link', 'metadata', 'excerpt'],
    permittedUse: ['headline-link', 'metadata', 'excerpt'],
    excerptMaxChars: 280,
    syndicatedContentBehavior: 'none-reviewed',
    itemLevelReviewRequired: false,
    itemLevelStrategy: 'preserve-origin-and-restrict-on-item-signal',
    reviewState: 'reviewed',
    reviewedAt: '2026-09-03',
    reviewerNotes: 'Test fixture.',
    healthVerificationStatus: 'verified',
    legacy: false,
    ...overrides,
  });
}

const EXAMPLE_SOURCE = Object.freeze({
  name: 'Example News',
  url: 'https://example.com/rss.xml',
  region: 'global',
  lang: 'en',
});

test('all 19 live sources have exact admission records and explicit migration state', () => {
  const validation = admission.validateSourceAdmissions();
  assert.equal(validation.valid, true);
  assert.equal(news.SOURCES.length, 19);
  assert.equal(admission.SOURCE_ADMISSIONS.length, 19);
  assert.equal(admission.LEGACY_SOURCE_IDS.length, 19);
  assert.equal(new Set(admission.SOURCE_ADMISSIONS.map(entry => entry.sourceId)).size, 19);
  assert.equal(admission.SOURCE_ADMISSIONS.every(entry => entry.legacy === true), true);
  assert.equal(
    admission.SOURCE_ADMISSIONS.every(entry => ['legacy-unreviewed', 'reviewed'].includes(entry.reviewState)),
    true
  );
  const nhk = admission.SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'nhk');
  assert.ok(nhk.currentUse.includes('translated-headline-summary'));
  assert.equal(nhk.excerptMaxChars, 280);
});

test('known AP and Guardian constraints remain visible without silently removing either source', () => {
  const ap = admission.SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'ap');
  const guardian = admission.SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'guardian');
  assert.equal(ap.allowedUseStatus, 'contract-required');
  assert.equal(ap.endpointAuthority, 'unverified-third-party');
  assert.equal(guardian.allowedUseStatus, 'permission-required');
  assert.equal(guardian.endpointAuthority, 'first-party');
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
  assert.deepEqual(result.unadmittedNewSourceIds, ['example-news']);
});

test('new source admission requires reviewed public use, endpoint authority, health, and permitted current use', () => {
  const sources = [...news.SOURCES, EXAMPLE_SOURCE];
  const good = reviewedNewSource();
  assert.equal(admission.isProductionAdmissible(good), true);
  assert.equal(
    admission.validateSourceAdmissions(sources, [...admission.SOURCE_ADMISSIONS, good]).valid,
    true
  );

  const badAuthority = reviewedNewSource({ endpointAuthority: 'unverified-third-party' });
  const badRights = reviewedNewSource({ allowedUseStatus: 'permission-required' });
  const badHealth = reviewedNewSource({ healthVerificationStatus: 'telemetry-managed' });
  const badUse = reviewedNewSource({ permittedUse: ['headline-link', 'metadata'] });
  for (const entry of [badAuthority, badRights, badHealth, badUse]) {
    assert.equal(admission.isProductionAdmissible(entry), false);
    const result = admission.validateSourceAdmissions(sources, [...admission.SOURCE_ADMISSIONS, entry]);
    assert.deepEqual(result.unadmittedNewSourceIds, ['example-news']);
  }
});

test('endpoint identity drift invalidates its admission review separately from feed health', () => {
  const changedSources = news.SOURCES.map(source =>
    source.name === 'BBC World' ? { ...source, url: 'https://example.com/changed-feed.xml' } : source
  );
  const result = admission.validateSourceAdmissions(changedSources);
  assert.equal(result.valid, false);
  assert.deepEqual(result.endpointDriftSourceIds, ['bbc-world']);
});

test('item-level restriction overrides broader source-level permission', () => {
  const entry = reviewedNewSource();
  assert.deepEqual(admission.evaluateItemUse(entry), {
    allowedUseStatus: 'verified-public-use',
    displayMode: 'current-use',
  });
  assert.deepEqual(admission.evaluateItemUse(entry, 'permission-required'), {
    allowedUseStatus: 'permission-required',
    displayMode: 'headline-link',
  });
  assert.deepEqual(admission.evaluateItemUse(entry, 'prohibited'), {
    allowedUseStatus: 'prohibited',
    displayMode: 'exclude',
  });
  const sourceRestricted = reviewedNewSource({ allowedUseStatus: 'contract-required' });
  assert.equal(
    admission.evaluateItemUse(sourceRestricted, 'verified-public-use').allowedUseStatus,
    'contract-required'
  );
});

test('research candidates remain queryable but cannot become production by implication', () => {
  const rnz = admission.SOURCE_RESEARCH_CANDIDATES.find(entry => entry.candidateId === 'rnz-pacific');
  const brasil = admission.SOURCE_RESEARCH_CANDIDATES.find(entry => entry.candidateId === 'agencia-brasil');
  assert.equal(rnz.disposition, 'research');
  assert.equal(rnz.allowedUseStatus, 'permission-required');
  assert.equal(brasil.disposition, 'research');
  assert.equal(brasil.allowedUseStatus, 'verified-public-use');
  assert.equal(brasil.itemLevelReviewRequired, true);
  assert.equal(brasil.syndicatedContentBehavior, 'mixed-rights-partner-content');
  assert.equal(admission.SOURCE_RESEARCH_CANDIDATES.some(entry => entry.name === 'RNZ Pacific'), true);
  assert.equal(admission.SOURCE_RESEARCH_CANDIDATES.some(entry => entry.name === 'Agencia Brasil'), true);
});

test('admission telemetry changes independently of the canonical news feed cache fingerprint', () => {
  const sourceFingerprint = news.SOURCE_FINGERPRINT;
  const changed = admission.SOURCE_ADMISSIONS.map(entry =>
    entry.sourceId === 'bbc-world' ? { ...entry, reviewerNotes: `${entry.reviewerNotes} Reviewed note.` } : entry
  );
  assert.equal(news.getSourceFingerprint(news.SOURCES), sourceFingerprint);
  assert.notEqual(admission.getAdmissionFingerprint(changed), admission.ADMISSION_FINGERPRINT);
});

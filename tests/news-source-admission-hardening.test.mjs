import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'globaldeets-admission-hardening-'));
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

function reviewed(name = 'Example News', url = 'https://example.com/rss.xml', overrides = {}) {
  const currentUse = ['headline-link', 'metadata', 'excerpt'];
  return admission.createSourceAdmission({
    sourceId: news.slugifySourceName(name),
    name,
    endpointUrl: url,
    endpointType: 'rss',
    endpointAuthority: 'first-party',
    endpointEvidenceUrls: [`${url}#feed`],
    authenticationRequirement: 'none',
    usagePolicyUrls: [`${url}#terms`],
    allowedUseStatus: 'verified-public-use',
    currentUse,
    permittedUse: currentUse,
    excerptMaxChars: 280,
    syndicatedContentBehavior: 'none-reviewed',
    itemLevelReviewRequired: false,
    itemLevelStrategy: 'preserve-origin-and-restrict-on-item-signal',
    reviewState: 'reviewed',
    reviewedAt: '2026-09-03',
    reviewerNotes: 'Reviewed fixture.',
    healthVerificationStatus: 'verified',
    legacy: false,
    ...overrides,
  });
}

test('duplicate canonical source IDs and duplicate endpoint URLs fail admission integrity', () => {
  const duplicate = { ...news.SOURCES[0] };
  const result = admission.validateSourceAdmissions([...news.SOURCES, duplicate]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.duplicateCanonicalSourceIds, [news.slugifySourceName(duplicate.name)]);
  assert.deepEqual(result.duplicateCanonicalEndpointUrls, [duplicate.url]);
});

test('a second name cannot count the same endpoint twice even with an otherwise reviewed admission', () => {
  const duplicateEndpointSource = {
    name: 'Example News',
    url: news.SOURCES[0].url,
    region: 'global',
    lang: 'en',
  };
  const entry = reviewed('Example News', duplicateEndpointSource.url);
  const result = admission.validateSourceAdmissions(
    [...news.SOURCES, duplicateEndpointSource],
    [...admission.SOURCE_ADMISSIONS, entry]
  );
  assert.equal(result.valid, false);
  assert.deepEqual(result.duplicateCanonicalEndpointUrls, [duplicateEndpointSource.url]);
});

test('production admission cannot be self-certified without dated review and usage-policy evidence', () => {
  assert.throws(() => reviewed('No Date News', 'https://nodate.example/rss', { reviewedAt: null }), /invalid/);
  const noPolicy = reviewed('No Policy News', 'https://nopolicy.example/rss', { usagePolicyUrls: [] });
  assert.equal(admission.isProductionAdmissible(noPolicy), false);
  const good = reviewed();
  assert.equal(admission.isProductionAdmissible(good), true);
});

test('malformed source and admission objects fail validation without throwing', () => {
  const malformedAdmissions = [...admission.SOURCE_ADMISSIONS, { sourceId: 'broken' }, null];
  const malformedSources = [...news.SOURCES, { url: 'https://broken.example/rss' }, null];

  assert.doesNotThrow(() => admission.validateSourceAdmissions(news.SOURCES, malformedAdmissions));
  assert.doesNotThrow(() => admission.validateSourceAdmissions(malformedSources, admission.SOURCE_ADMISSIONS));

  const badAdmissionResult = admission.validateSourceAdmissions(news.SOURCES, malformedAdmissions);
  assert.equal(badAdmissionResult.valid, false);
  assert.ok(badAdmissionResult.invalidEntries.includes('broken'));
  assert.ok(badAdmissionResult.invalidEntries.includes('(missing-id)'));

  const badSourceResult = admission.validateSourceAdmissions(
    malformedSources,
    admission.SOURCE_ADMISSIONS
  );
  assert.equal(badSourceResult.valid, false);
  assert.deepEqual(badSourceResult.invalidCanonicalSources, ['source-index:19', 'source-index:20']);
  assert.equal(admission.isProductionAdmissible({ sourceId: 'broken' }), false);
});

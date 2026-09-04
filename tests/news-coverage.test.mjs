import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'globaldeets-coverage-'));
const fixtureFunctions = join(fixtureRoot, 'functions');
const fixtureNews = join(fixtureFunctions, 'api', 'news.js');
const fixtureCoverageApi = join(fixtureFunctions, 'api', 'news', 'coverage.js');
const fixtureCoverageLib = join(fixtureFunctions, 'lib', 'news-coverage.js');
const fixtureProvenanceLib = join(fixtureFunctions, 'lib', 'news-source-provenance.js');

mkdirSync(dirname(fixtureCoverageApi), { recursive: true });
mkdirSync(dirname(fixtureCoverageLib), { recursive: true });
writeFileSync(join(fixtureFunctions, 'package.json'), '{"type":"module"}\n');
copyFileSync(fileURLToPath(new URL('../functions/api/news.js', import.meta.url)), fixtureNews);
copyFileSync(
  fileURLToPath(new URL('../functions/api/news/coverage.js', import.meta.url)),
  fixtureCoverageApi
);
copyFileSync(
  fileURLToPath(new URL('../functions/lib/news-coverage.js', import.meta.url)),
  fixtureCoverageLib
);
copyFileSync(
  fileURLToPath(new URL('../functions/lib/news-source-provenance.js', import.meta.url)),
  fixtureProvenanceLib
);

const newsModule = await import(pathToFileURL(fixtureNews).href);
const provenanceModule = await import(pathToFileURL(fixtureProvenanceLib).href);
const coverageModule = await import(pathToFileURL(fixtureCoverageLib).href);
const coverageApiModule = await import(pathToFileURL(fixtureCoverageApi).href);

const { SOURCES, SOURCE_FINGERPRINT } = newsModule;
const { SOURCE_PROVENANCE, validateSourceProvenance } = provenanceModule;
const { buildCoverageInventory } = coverageModule;
const { onRequestGet: getCoverage } = coverageApiModule;

function request(path = '/api/news/coverage') {
  return new Request(`https://globaldeets.com${path}`, {
    headers: { Origin: 'https://globaldeets.com' },
  });
}

test('provenance registry maps exactly once to every canonical live source', () => {
  const validation = validateSourceProvenance(SOURCES, SOURCE_PROVENANCE);

  assert.equal(validation.valid, true);
  assert.equal(SOURCE_PROVENANCE.length, SOURCES.length);
  assert.equal(SOURCE_PROVENANCE.length, 19);
  assert.deepEqual(validation.duplicateIds, []);
  assert.deepEqual(validation.missingSourceIds, []);
  assert.deepEqual(validation.orphanSourceIds, []);
  assert.deepEqual(validation.invalidEntries, []);
  assert.ok(SOURCE_PROVENANCE.every(entry => entry.evidenceUrls.length > 0));
});

test('provenance validation rejects missing, orphaned, duplicate, and structurally invalid records', () => {
  const base = SOURCE_PROVENANCE.map(entry => ({ ...entry }));
  const missing = validateSourceProvenance(SOURCES, base.slice(1));
  assert.equal(missing.valid, false);
  assert.ok(missing.missingSourceIds.includes('bbc-world'));

  const orphan = validateSourceProvenance(SOURCES, [
    ...base,
    { ...base[0], sourceId: 'not-a-live-source' },
  ]);
  assert.equal(orphan.valid, false);
  assert.ok(orphan.orphanSourceIds.includes('not-a-live-source'));

  const duplicate = validateSourceProvenance(SOURCES, [...base, { ...base[0] }]);
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.duplicateIds.includes('bbc-world'));

  const invalid = validateSourceProvenance(SOURCES, [
    { ...base[0], evidenceUrls: [] },
    ...base.slice(1),
  ]);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.invalidEntries.includes('bbc-world'));
});

test('coverage inventory is deterministic and enriched from reviewed provenance', () => {
  const first = buildCoverageInventory(SOURCES, SOURCE_PROVENANCE);
  const second = buildCoverageInventory(
    SOURCES.map(source => ({ ...source })),
    SOURCE_PROVENANCE.map(entry => ({ ...entry }))
  );

  assert.deepEqual(first, second);
  assert.equal(first.totalSources, 19);
  assert.equal(first.totalRegions, 7);
  assert.equal(first.totalLanguages, 2);
  assert.equal(first.provenance.valid, true);
  assert.equal(first.provenance.reviewedSources, 19);
  assert.equal(first.nonEnglishSources.length, 1);
  assert.ok(first.nonEnglishSources.includes('nhk'));
  assert.ok(first.sourceClasses.some(group => group.sourceClass === 'news-agency'));
  assert.ok(first.geographicScopes.some(group => group.geographicScope === 'national'));
  assert.ok(first.sourceOriginCountries.some(group => group.country === 'UA'));
});

test('coverage inventory surfaces current evidence, locality, redundancy, and language blind spots', () => {
  const inventory = buildCoverageInventory(SOURCES, SOURCE_PROVENANCE);
  const gapIds = new Set(inventory.gaps.map(gap => gap.id));

  assert.equal(inventory.primarySourceInputs, 0);
  assert.ok(gapIds.has('evidence-role:primary-source-inputs'));
  assert.ok(gapIds.has('geographic-scope:subnational'));
  assert.ok(gapIds.has('regional-redundancy:pacific'));
  assert.ok(gapIds.has('portfolio-language-concentration:en'));
  assert.ok(gapIds.has('source-language-diversity:africa'));
  assert.ok(gapIds.has('source-language-diversity:americas'));
  assert.ok(gapIds.has('source-language-diversity:europe'));
  assert.ok(gapIds.has('source-language-diversity:middle-east'));
  assert.ok(gapIds.has('source-language-diversity:pacific'));
  assert.ok(inventory.provenance.unknownOwnershipOperatorSourceIds.includes('dawn'));
});

test('coverage gap logic responds to stronger regional, language, primary-source, and local diversity', () => {
  const sample = [
    { name: 'A', url: 'https://a.example/rss', region: 'alpha', lang: 'en' },
    { name: 'B', url: 'https://b.example/rss', region: 'alpha', lang: 'fr' },
    { name: 'C', url: 'https://c.example/rss', region: 'beta', lang: 'es' },
    { name: 'D', url: 'https://d.example/rss', region: 'beta', lang: 'pt' },
  ];
  const sampleProvenance = sample.map((source, index) => ({
    sourceId: source.name.toLowerCase(),
    name: source.name,
    sourceClass: index === 0 ? 'institution' : 'newsroom',
    evidenceRole: index === 0 ? 'primary-source' : 'reporting',
    geographicScope: index === 0 ? 'subnational' : 'national',
    primaryCountry: ['AA', 'BB', 'CC', 'DD'][index],
    locality: 'local',
    sourceLanguages: [source.lang],
    ownershipOperator: null,
    evidenceUrls: [`https://${source.name.toLowerCase()}.example/about`],
    reviewedAt: '2026-09-03',
  }));
  const inventory = buildCoverageInventory(sample, sampleProvenance);

  assert.equal(inventory.gaps.length, 0);
  assert.equal(inventory.totalRegions, 2);
  assert.equal(inventory.totalLanguages, 4);
  assert.equal(inventory.englishSourceShare, 0.25);
  assert.equal(inventory.primarySourceInputs, 1);
});

test('/api/news/coverage exposes source fingerprint, provenance integrity, and actionable inventory', async () => {
  const response = await getCoverage({ request: request() });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.equal(json.totalSources, SOURCES.length);
  assert.equal(json.totalRegions, 7);
  assert.equal(json.provenance.valid, true);
  assert.equal(json.provenance.reviewedSources, 19);
  assert.ok(Array.isArray(json.sourceClasses));
  assert.ok(Array.isArray(json.evidenceRoles));
  assert.ok(Array.isArray(json.sourceOriginCountries));
  assert.ok(json.gaps.some(gap => gap.id === 'evidence-role:primary-source-inputs'));
  assert.match(json.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

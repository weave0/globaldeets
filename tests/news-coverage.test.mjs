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

const newsModule = await import(pathToFileURL(fixtureNews).href);
const coverageModule = await import(pathToFileURL(fixtureCoverageLib).href);
const coverageApiModule = await import(pathToFileURL(fixtureCoverageApi).href);

const { SOURCES, SOURCE_FINGERPRINT } = newsModule;
const { buildCoverageInventory } = coverageModule;
const { onRequestGet: getCoverage } = coverageApiModule;

function request(path = '/api/news/coverage') {
  return new Request(`https://globaldeets.com${path}`, {
    headers: { Origin: 'https://globaldeets.com' },
  });
}

test('coverage inventory is deterministic and derived from the canonical source contract', () => {
  const first = buildCoverageInventory(SOURCES);
  const second = buildCoverageInventory(SOURCES.map(source => ({ ...source })));

  assert.deepEqual(first, second);
  assert.equal(first.totalSources, SOURCES.length);
  assert.equal(first.totalSources, 19);
  assert.equal(first.totalRegions, 7);
  assert.equal(first.totalLanguages, 2);
  assert.equal(first.nonEnglishSources.length, 1);
  assert.ok(first.nonEnglishSources.includes('nhk'));
});

test('coverage inventory surfaces current regional redundancy and source-language blind spots', () => {
  const inventory = buildCoverageInventory(SOURCES);
  const gapIds = new Set(inventory.gaps.map(gap => gap.id));

  assert.ok(gapIds.has('regional-redundancy:pacific'));
  assert.ok(gapIds.has('portfolio-language-concentration:en'));
  assert.ok(gapIds.has('source-language-diversity:africa'));
  assert.ok(gapIds.has('source-language-diversity:americas'));
  assert.ok(gapIds.has('source-language-diversity:europe'));
  assert.ok(gapIds.has('source-language-diversity:middle-east'));
  assert.ok(gapIds.has('source-language-diversity:pacific'));
});

test('coverage gap logic responds to stronger regional and language diversity', () => {
  const sample = [
    { name: 'A', url: 'https://a.example/rss', region: 'alpha', lang: 'en' },
    { name: 'B', url: 'https://b.example/rss', region: 'alpha', lang: 'fr' },
    { name: 'C', url: 'https://c.example/rss', region: 'beta', lang: 'es' },
    { name: 'D', url: 'https://d.example/rss', region: 'beta', lang: 'pt' },
  ];
  const inventory = buildCoverageInventory(sample);

  assert.equal(inventory.gaps.length, 0);
  assert.equal(inventory.totalRegions, 2);
  assert.equal(inventory.totalLanguages, 4);
  assert.equal(inventory.englishSourceShare, 0.25);
});

test('/api/news/coverage exposes the current source fingerprint and inventory', async () => {
  const response = await getCoverage({ request: request() });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.equal(json.totalSources, SOURCES.length);
  assert.equal(json.totalRegions, 7);
  assert.ok(Array.isArray(json.gaps));
  assert.ok(json.gaps.length > 0);
  assert.match(json.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

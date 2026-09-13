import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'globaldeets-regeneration-'));
const fixtureFunctions = join(fixtureRoot, 'functions');
const fixtureNews = join(fixtureFunctions, 'api', 'news.js');
const fixtureAdmission = join(fixtureFunctions, 'lib', 'news-source-admission.js');
mkdirSync(dirname(fixtureNews), { recursive: true });
mkdirSync(dirname(fixtureAdmission), { recursive: true });
writeFileSync(join(fixtureFunctions, 'package.json'), '{"type":"module"}\n');
copyFileSync(fileURLToPath(new URL('../functions/api/news.js', import.meta.url)), fixtureNews);
copyFileSync(
  fileURLToPath(new URL('../functions/lib/news-source-admission.js', import.meta.url)),
  fixtureAdmission
);

const newsModule = await import(pathToFileURL(fixtureNews).href);
const admissionModule = await import(pathToFileURL(fixtureAdmission).href);
const {
  MAX_SOURCE_FANOUT,
  MAX_TRANSLATION_AI_CALLS,
  MAX_TRANSLATION_ITEMS,
  SOURCES,
  fetchAllSources,
  getFeedCacheIdentity,
  getOrCreateRegeneration,
  onRequestGet: getNews,
  translateNonEnglish,
} = newsModule;
const { ADMISSION_FINGERPRINT } = admissionModule;
const CACHE_IDENTITY = getFeedCacheIdentity(ADMISSION_FINGERPRINT);

function request(path = '/api/news') {
  return new Request(`https://globaldeets.com${path}`, {
    headers: { Origin: 'https://globaldeets.com' },
  });
}

function rssResponse(url = 'https://example.com/feed') {
  return new Response(
    `<rss><channel><item><title>Story ${String(url)}</title><link>https://example.com/story/${encodeURIComponent(String(url))}</link><description>Summary</description><pubDate>Wed, 02 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>`,
    { status: 200, headers: { 'content-type': 'application/rss+xml' } }
  );
}

function makeKv(initial = new Map()) {
  const data = new Map(initial);
  const puts = [];
  return {
    data,
    puts,
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, value, options) {
      puts.push({ key, value: JSON.parse(value), options });
      data.set(key, JSON.parse(value));
    },
  };
}

function governedStory() {
  return {
    id: 'minnesota-reformer-1',
    headline: 'Governed cached headline',
    summary: 'Governed cached summary',
    source: 'Minnesota Reformer',
    sourceId: 'minnesota-reformer',
    sourceUrl: 'https://example.com/story',
    published: '2026-09-02T00:00:00.000Z',
    region: 'americas',
    lang: 'en',
    translated: false,
    originalLang: 'en',
    allowedUseStatus: 'verified-public-use',
    displayMode: 'current-use',
  };
}

test('source fan-out ceiling is frozen and cannot expand with a hostile source list', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  let fetchCalls = 0;
  globalThis.fetch = async url => {
    fetchCalls += 1;
    return rssResponse(url);
  };

  assert.equal(MAX_SOURCE_FANOUT, SOURCES.length);
  const hostileSources = [
    ...SOURCES,
    ...Array.from({ length: 7 }, (_, index) => ({
      name: `Hostile ${index}`,
      url: `https://example.com/hostile-${index}.xml`,
      region: 'global',
      lang: 'en',
    })),
  ];

  const result = await fetchAllSources(hostileSources);
  assert.equal(fetchCalls, MAX_SOURCE_FANOUT);
  assert.equal(result.sourceHealth.length, MAX_SOURCE_FANOUT);
});

test('translation work obeys both item and AI-call ceilings', async () => {
  let aiCalls = 0;
  const env = {
    AI: {
      async run(_model, input) {
        aiCalls += 1;
        return { translated_text: `translated:${input.text}` };
      },
    },
  };
  const admissionById = new Map([
    [
      'test-source',
      {
        permittedUse: ['translated-headline-summary'],
      },
    ],
  ]);
  const items = Array.from({ length: MAX_TRANSLATION_ITEMS + 6 }, (_, index) => ({
    id: `jp-${index}`,
    headline: `見出し${index}`,
    summary: `要約${index}`,
    source: 'Test Source',
    sourceId: 'test-source',
    sourceUrl: `https://example.com/jp-${index}`,
    published: '2026-09-02T00:00:00.000Z',
    region: 'asia',
    lang: 'ja',
    translated: false,
    originalLang: 'ja',
    allowedUseStatus: 'verified-public-use',
    displayMode: 'current-use',
  }));

  await translateNonEnglish(items, env, admissionById);

  assert.ok(aiCalls <= MAX_TRANSLATION_AI_CALLS);
  assert.ok(items.filter(item => item.translated).length <= MAX_TRANSLATION_ITEMS);
  assert.equal(items.filter(item => item.translated).length * 2, aiCalls);
  assert.ok(items.some(item => item.translated === false));
});

test('headline-link items consume zero translation calls', async () => {
  let aiCalls = 0;
  const env = {
    AI: {
      async run() {
        aiCalls += 1;
        return { translated_text: 'translated' };
      },
    },
  };
  const admissionById = new Map([
    ['restricted', { permittedUse: ['translated-headline-summary'] }],
  ]);
  const items = [
    {
      id: 'restricted-1',
      headline: '原文',
      summary: null,
      source: 'Restricted',
      sourceId: 'restricted',
      sourceUrl: 'https://example.com/restricted',
      published: '2026-09-02T00:00:00.000Z',
      region: 'asia',
      lang: 'ja',
      translated: false,
      originalLang: 'ja',
      allowedUseStatus: 'permission-required',
      displayMode: 'headline-link',
    },
  ];

  await translateNonEnglish(items, env, admissionById);
  assert.equal(aiCalls, 0);
  assert.equal(items[0].translated, false);
});

test('concurrent cache misses coalesce into one regeneration pass per cache identity', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  let fetchCalls = 0;
  globalThis.fetch = async url => {
    fetchCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return rssResponse(url);
  };

  const kv = makeKv();
  const env = { NEWS_CACHE: kv };
  const requests = Array.from({ length: 6 }, () =>
    getOrCreateRegeneration(env, CACHE_IDENTITY, admissionModule)
  );
  const results = await Promise.all(requests);

  assert.equal(fetchCalls, MAX_SOURCE_FANOUT);
  assert.equal(kv.puts.length, 2);
  assert.ok(results.every(result => Array.isArray(result.items)));
  assert.ok(results.every(result => result.items === results[0].items));
});

test('cache hits bypass regeneration and source acquisition entirely', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async () => {
    throw new Error('cache hit must not fetch upstream');
  };

  const kv = makeKv(new Map([[CACHE_IDENTITY.cacheKey, [governedStory()]]]));
  const response = await getNews({ env: { NEWS_CACHE: kv }, request: request('/api/news') });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.cached, true);
  assert.equal(json.items.length, 1);
  assert.equal(kv.puts.length, 0);
});

test('failed regeneration clears in-flight state so a later request can retry', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  let fetchCalls = 0;
  globalThis.fetch = async url => {
    fetchCalls += 1;
    return rssResponse(url);
  };
  const kv = makeKv();
  const invalidAdmission = {
    ADMISSION_FINGERPRINT,
    SOURCE_ADMISSIONS: [],
    ALLOWED_USE_STATUSES: [],
    evaluateItemUse: null,
  };

  await assert.rejects(
    getOrCreateRegeneration({ NEWS_CACHE: kv }, CACHE_IDENTITY, invalidAdmission),
    /source admission evaluator is unavailable/
  );
  const callsAfterFailure = fetchCalls;

  const retry = await getOrCreateRegeneration(
    { NEWS_CACHE: kv },
    CACHE_IDENTITY,
    admissionModule
  );

  assert.ok(Array.isArray(retry.items));
  assert.equal(fetchCalls - callsAfterFailure, MAX_SOURCE_FANOUT);
});

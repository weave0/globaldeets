import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

// Cloudflare Pages Functions are ESM even though the repository's Node tooling is CommonJS.
// Mirror only the Functions under test into an isolated ESM temp tree so contract testing does
// not require a package.json inside the production Functions artifact.
const fixtureRoot = mkdtempSync(join(tmpdir(), 'globaldeets-functions-'));
const fixtureFunctions = join(fixtureRoot, 'functions');
const fixtureNews = join(fixtureFunctions, 'api', 'news.js');
const fixtureHealth = join(fixtureFunctions, 'api', 'news', 'health.js');
mkdirSync(dirname(fixtureHealth), { recursive: true });
writeFileSync(join(fixtureFunctions, 'package.json'), '{"type":"module"}\n');
copyFileSync(fileURLToPath(new URL('../functions/api/news.js', import.meta.url)), fixtureNews);
copyFileSync(fileURLToPath(new URL('../functions/api/news/health.js', import.meta.url)), fixtureHealth);

const newsModule = await import(pathToFileURL(fixtureNews).href);
const healthModule = await import(pathToFileURL(fixtureHealth).href);
const {
  CACHE_KEY,
  SOURCES,
  SOURCE_FINGERPRINT,
  SOURCE_HEALTH_KEY,
  getSourceFingerprint,
  onRequestGet: getNews,
} = newsModule;
const { onRequestGet: getNewsHealth } = healthModule;

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

function request(path = '/api/news') {
  return new Request(`https://globaldeets.com${path}`, {
    headers: { Origin: 'https://globaldeets.com' },
  });
}

function rssResponse(url = 'https://example.com/feed') {
  return new Response(
    `<rss><channel><item><title>Story ${String(url)}</title><link>https://example.com/story</link><description>Summary</description><pubDate>Wed, 02 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>`,
    { status: 200, headers: { 'content-type': 'application/rss+xml' } }
  );
}

function captureErrors(t) {
  const original = console.error;
  const entries = [];
  console.error = value => entries.push(String(value));
  t.after(() => {
    console.error = original;
  });
  return entries;
}

const story = {
  id: 'cached-1',
  headline: 'Cached headline',
  summary: 'Cached summary',
  source: 'BBC World',
  sourceUrl: 'https://example.com/story',
  published: '2026-09-02T00:00:00.000Z',
  region: 'global',
  lang: 'en',
  translated: false,
  originalLang: 'en',
};

test('source fingerprint is deterministic and changes when a source definition changes', () => {
  assert.equal(getSourceFingerprint(SOURCES), SOURCE_FINGERPRINT);
  assert.equal(getSourceFingerprint(SOURCES), getSourceFingerprint(SOURCES.map(source => ({ ...source }))));

  const changed = SOURCES.map(source => ({ ...source }));
  changed[0].url = `${changed[0].url}?changed=1`;
  assert.notEqual(getSourceFingerprint(changed), SOURCE_FINGERPRINT);
  assert.match(CACHE_KEY, new RegExp(`${SOURCE_FINGERPRINT}$`));
  assert.match(SOURCE_HEALTH_KEY, new RegExp(`${SOURCE_FINGERPRINT}$`));
});

test('/api/news serves only the source-versioned cache and exposes its fingerprint', async () => {
  const kv = makeKv(new Map([[CACHE_KEY, [story]]]));
  const response = await getNews({ env: { NEWS_CACHE: kv }, request: request('/api/news?limit=5') });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.cached, true);
  assert.equal(json.total, 1);
  assert.deepEqual(json.items, [story]);
  assert.equal(json.sourceFingerprint, SOURCE_FINGERPRINT);
});

test('/api/news cache miss writes feed and health under the current source fingerprint', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async url => rssResponse(url);

  const kv = makeKv();
  const response = await getNews({ env: { NEWS_CACHE: kv }, request: request('/api/news?limit=5') });
  const json = await response.json();

  assert.equal(json.cached, false);
  assert.equal(json.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.ok(json.items.length > 0);
  assert.deepEqual(
    kv.puts.map(put => put.key).sort(),
    [CACHE_KEY, SOURCE_HEALTH_KEY].sort()
  );

  const healthWrite = kv.puts.find(put => put.key === SOURCE_HEALTH_KEY);
  assert.equal(healthWrite.value.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.equal(healthWrite.value.sourceHealth.length, SOURCES.length);
});

test('/api/news degrades to live fetch when KV read fails and emits structured telemetry', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async url => rssResponse(url);
  const errors = captureErrors(t);
  const kv = makeKv();
  kv.get = async () => {
    throw new Error('simulated KV read failure');
  };

  const response = await getNews({ env: { NEWS_CACHE: kv }, request: request('/api/news?limit=5') });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.cached, false);
  assert.ok(json.items.length > 0);
  assert.ok(errors.some(entry => entry.includes('"phase":"kv_read_feed"')));
  assert.ok(errors.some(entry => entry.includes(SOURCE_FINGERPRINT)));
});

test('/api/news remains available when KV writes fail and emits structured telemetry', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async url => rssResponse(url);
  const errors = captureErrors(t);
  const kv = makeKv();
  kv.put = async () => {
    throw new Error('simulated KV write failure');
  };

  const response = await getNews({ env: { NEWS_CACHE: kv }, request: request('/api/news?limit=5') });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.cached, false);
  assert.ok(json.items.length > 0);
  assert.ok(errors.some(entry => entry.includes('"phase":"kv_write_news"')));
});

test('/api/news/health reuses only a snapshot matching source fingerprint and source count', async () => {
  const snapshot = {
    generatedAt: '2026-09-02T00:00:00.000Z',
    sourceFingerprint: SOURCE_FINGERPRINT,
    sourceHealth: SOURCES.map(source => ({
      sourceId: source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: source.name,
      url: source.url,
      region: source.region,
      lang: source.lang,
      lastError: null,
    })),
  };
  const kv = makeKv(new Map([[SOURCE_HEALTH_KEY, snapshot]]));
  const response = await getNewsHealth({
    env: { NEWS_CACHE: kv },
    request: request('/api/news/health'),
  });
  const json = await response.json();

  assert.equal(json.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.equal(json.totalSources, SOURCES.length);
  assert.equal(json.healthySources, SOURCES.length);
  assert.equal(kv.puts.length, 0);
});

test('/api/news/health regenerates a fingerprint-mismatched snapshot', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async () => new Response('ok', { status: 200 });

  const stale = {
    generatedAt: '2026-09-01T00:30:00.000Z',
    sourceFingerprint: 'stale000',
    sourceHealth: SOURCES.map(source => ({ name: source.name, lastError: null })),
  };
  const kv = makeKv(new Map([[SOURCE_HEALTH_KEY, stale]]));
  const response = await getNewsHealth({
    env: { NEWS_CACHE: kv },
    request: request('/api/news/health'),
  });
  const json = await response.json();

  assert.equal(json.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.equal(json.totalSources, SOURCES.length);
  assert.equal(kv.puts.length, 1);
  assert.equal(kv.puts[0].key, SOURCE_HEALTH_KEY);
  assert.equal(kv.puts[0].value.sourceFingerprint, SOURCE_FINGERPRINT);
});

test('/api/news/health regenerates when KV read fails and emits structured telemetry', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async () => new Response('ok', { status: 200 });
  const errors = captureErrors(t);
  const kv = makeKv();
  kv.get = async () => {
    throw new Error('simulated health KV read failure');
  };

  const response = await getNewsHealth({
    env: { NEWS_CACHE: kv },
    request: request('/api/news/health'),
  });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.totalSources, SOURCES.length);
  assert.ok(errors.some(entry => entry.includes('"phase":"kv_read_health"')));
});

test('/api/news/health remains available when snapshot write fails', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async () => new Response('ok', { status: 200 });
  const errors = captureErrors(t);
  const kv = makeKv();
  kv.put = async () => {
    throw new Error('simulated health KV write failure');
  };

  const response = await getNewsHealth({
    env: { NEWS_CACHE: kv },
    request: request('/api/news/health'),
  });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.totalSources, SOURCES.length);
  assert.ok(errors.some(entry => entry.includes('"phase":"kv_write_health"')));
});

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
const fixtureAdmission = join(fixtureFunctions, 'lib', 'news-source-admission.js');
mkdirSync(dirname(fixtureHealth), { recursive: true });
mkdirSync(dirname(fixtureAdmission), { recursive: true });
writeFileSync(join(fixtureFunctions, 'package.json'), '{"type":"module"}\n');
copyFileSync(fileURLToPath(new URL('../functions/api/news.js', import.meta.url)), fixtureNews);
copyFileSync(fileURLToPath(new URL('../functions/api/news/health.js', import.meta.url)), fixtureHealth);
copyFileSync(
  fileURLToPath(new URL('../functions/lib/news-source-admission.js', import.meta.url)),
  fixtureAdmission
);

const newsModule = await import(pathToFileURL(fixtureNews).href);
const healthModule = await import(pathToFileURL(fixtureHealth).href);
const admissionModule = await import(pathToFileURL(fixtureAdmission).href);
const {
  CACHE_KEY_PREFIX,
  DISPLAY_POLICY_VERSION,
  SOURCES,
  SOURCE_FINGERPRINT,
  SOURCE_HEALTH_KEY,
  applyAdmissionPolicy,
  getFeedCacheIdentity,
  getSourceFingerprint,
  onRequestGet: getNews,
  translateNonEnglish,
} = newsModule;
const { onRequestGet: getNewsHealth } = healthModule;
const { ADMISSION_FINGERPRINT, ALLOWED_USE_STATUSES, evaluateItemUse } = admissionModule;
const CACHE_KEY = getFeedCacheIdentity(ADMISSION_FINGERPRINT).cacheKey;

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

function rawStory(source, overrides = {}) {
  return {
    id: `${source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-1`,
    headline: `${source} headline`,
    summary: `${source} publisher summary`,
    source,
    sourceUrl: 'https://example.com/story',
    published: '2026-09-02T00:00:00.000Z',
    region: 'global',
    lang: 'en',
    translated: false,
    originalLang: 'en',
    ...overrides,
  };
}

const story = {
  ...rawStory('Minnesota Reformer', { region: 'americas' }),
  sourceId: 'minnesota-reformer',
  allowedUseStatus: 'verified-public-use',
  displayMode: 'current-use',
};

test('source and admission fingerprints deterministically version the feed cache', () => {
  assert.equal(getSourceFingerprint(SOURCES), SOURCE_FINGERPRINT);
  assert.equal(getSourceFingerprint(SOURCES), getSourceFingerprint(SOURCES.map(source => ({ ...source }))));

  const changed = SOURCES.map(source => ({ ...source }));
  changed[0].url = `${changed[0].url}?changed=1`;
  assert.notEqual(getSourceFingerprint(changed), SOURCE_FINGERPRINT);

  const identity = getFeedCacheIdentity(ADMISSION_FINGERPRINT);
  const changedAdmission = getFeedCacheIdentity(`${ADMISSION_FINGERPRINT}-changed`);
  assert.match(identity.cacheKey, new RegExp(`^${CACHE_KEY_PREFIX}_`));
  assert.ok(identity.cacheKey.includes(SOURCE_FINGERPRINT));
  assert.ok(identity.cacheKey.includes(DISPLAY_POLICY_VERSION));
  assert.ok(identity.cacheKey.endsWith(ADMISSION_FINGERPRINT));
  assert.notEqual(changedAdmission.cacheKey, identity.cacheKey);
  assert.match(SOURCE_HEALTH_KEY, new RegExp(`${SOURCE_FINGERPRINT}$`));
});

test('/api/news serves only the governed cache and exposes policy identity', async () => {
  const kv = makeKv(new Map([[CACHE_KEY, [story]]]));
  const response = await getNews({ env: { NEWS_CACHE: kv }, request: request('/api/news?limit=5') });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.cached, true);
  assert.equal(json.total, 1);
  assert.deepEqual(json.items, [story]);
  assert.equal(json.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.equal(json.admissionFingerprint, ADMISSION_FINGERPRINT);
  assert.equal(json.displayPolicyVersion, DISPLAY_POLICY_VERSION);
});

test('/api/news ignores the predecessor source-only cache identity', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async url => rssResponse(url);

  const staleKey = `news_feed_v2_${SOURCE_FINGERPRINT}`;
  const staleStory = rawStory('Guardian', { summary: 'must not survive old cache identity' });
  const kv = makeKv(new Map([[staleKey, [staleStory]]]));
  const response = await getNews({ env: { NEWS_CACHE: kv }, request: request('/api/news?limit=5') });
  const json = await response.json();

  assert.equal(json.cached, false);
  assert.ok(kv.puts.some(put => put.key === CACHE_KEY));
  assert.ok(!json.items.some(item => item.summary === staleStory.summary));
});

test('/api/news cache miss writes governed feed and source health under separate identities', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });
  globalThis.fetch = async url => rssResponse(url);

  const kv = makeKv();
  const response = await getNews({ env: { NEWS_CACHE: kv }, request: request('/api/news?limit=100') });
  const json = await response.json();

  assert.equal(json.cached, false);
  assert.equal(json.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.equal(json.admissionFingerprint, ADMISSION_FINGERPRINT);
  assert.equal(json.displayPolicyVersion, DISPLAY_POLICY_VERSION);
  assert.ok(json.items.length > 0);
  assert.deepEqual(
    kv.puts.map(put => put.key).sort(),
    [CACHE_KEY, SOURCE_HEALTH_KEY].sort()
  );

  const feedWrite = kv.puts.find(put => put.key === CACHE_KEY);
  assert.ok(feedWrite.value.every(item => ['current-use', 'headline-link'].includes(item.displayMode)));
  assert.ok(
    feedWrite.value
      .filter(item => item.displayMode === 'headline-link')
      .every(item => item.summary === null)
  );

  const healthWrite = kv.puts.find(put => put.key === SOURCE_HEALTH_KEY);
  assert.equal(healthWrite.value.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.equal(healthWrite.value.sourceHealth.length, SOURCES.length);
});

test('verified-public-use sources retain only their reviewed bounded excerpt', async () => {
  const longSummary = 'x'.repeat(400);
  const { items } = await applyAdmissionPolicy([
    rawStory('Minnesota Reformer', { summary: longSummary, region: 'americas' }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].displayMode, 'current-use');
  assert.equal(items[0].allowedUseStatus, 'verified-public-use');
  assert.equal(items[0].summary.length, 280);
  assert.equal(items[0].sourceId, 'minnesota-reformer');
});

test('unknown legacy sources fail closed to headline-link with no publisher summary', async () => {
  const { items } = await applyAdmissionPolicy([rawStory('BBC World')]);
  assert.equal(items.length, 1);
  assert.equal(items[0].allowedUseStatus, 'unknown');
  assert.equal(items[0].displayMode, 'headline-link');
  assert.equal(items[0].summary, null);
});

test('permission-required Guardian items cannot expose publisher summaries', async () => {
  const { items } = await applyAdmissionPolicy([rawStory('Guardian')]);
  assert.equal(items.length, 1);
  assert.equal(items[0].allowedUseStatus, 'permission-required');
  assert.equal(items[0].displayMode, 'headline-link');
  assert.equal(items[0].summary, null);
});

test('contract-required AP items cannot expose RSSHub-derived summaries', async () => {
  const { items } = await applyAdmissionPolicy([rawStory('AP')]);
  assert.equal(items.length, 1);
  assert.equal(items[0].allowedUseStatus, 'contract-required');
  assert.equal(items[0].displayMode, 'headline-link');
  assert.equal(items[0].summary, null);
});

test('prohibited items are excluded from the consumer payload', async () => {
  const contract = {
    SOURCE_ADMISSIONS: [
      {
        sourceId: 'blocked-source',
        allowedUseStatus: 'prohibited',
        permittedUse: [],
        excerptMaxChars: 0,
      },
    ],
    ALLOWED_USE_STATUSES,
    evaluateItemUse,
  };
  const { items } = await applyAdmissionPolicy([rawStory('Blocked Source')], contract);
  assert.deepEqual(items, []);
});

test('stricter item-level restrictions override a verified source', async () => {
  const { items } = await applyAdmissionPolicy([
    rawStory('Minnesota Reformer', {
      region: 'americas',
      itemAllowedUseStatus: 'permission-required',
    }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].allowedUseStatus, 'permission-required');
  assert.equal(items[0].displayMode, 'headline-link');
  assert.equal(items[0].summary, null);
});

test('unsupported item-level restriction signals fail closed to exclusion', async () => {
  const { items } = await applyAdmissionPolicy([
    rawStory('Minnesota Reformer', {
      region: 'americas',
      itemAllowedUseStatus: 'not-a-supported-status',
    }),
  ]);
  assert.deepEqual(items, []);
});

test('restricted translated-source content is stripped before any AI translation call', async () => {
  const { items, admissionById } = await applyAdmissionPolicy([
    rawStory('NHK', {
      lang: 'ja',
      originalLang: 'ja',
      region: 'asia',
      headline: '原文見出し',
      summary: '原文要約',
    }),
  ]);
  let aiCalls = 0;
  const env = {
    AI: {
      async run() {
        aiCalls += 1;
        return { translated_text: 'translated' };
      },
    },
  };

  await translateNonEnglish(items, env, admissionById);

  assert.equal(items.length, 1);
  assert.equal(items[0].displayMode, 'headline-link');
  assert.equal(items[0].summary, null);
  assert.equal(items[0].translated, false);
  assert.equal(aiCalls, 0);
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

// functions/api/news.js
// Cloudflare Pages Function — GET /api/news
//
// Params:
//   ?region=global|middle-east|europe|asia|americas|pacific|africa
//   ?limit=30  (max 100)
//   ?offset=0
//
// Requires KV binding: NEWS_CACHE (add to wrangler.toml)
//   [[kv_namespaces]]
//   binding = "NEWS_CACHE"
//   id = "<your-kv-namespace-id>"

export const SOURCES = [
  // ── Global ───────────────────────────────────────────────────────────────
  {
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    region: 'global',
    lang: 'en',
  },
  { name: 'AP', url: 'https://rsshub.app/apnews/topics/world-news', region: 'global', lang: 'en' },
  { name: 'Guardian', url: 'https://www.theguardian.com/world/rss', region: 'global', lang: 'en' },
  // Reuters deprecated public RSS in 2023 — skipped

  // ── Middle East ───────────────────────────────────────────────────────────
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    region: 'middle-east',
    lang: 'en',
  },
  {
    name: 'Anadolu Agency',
    url: 'https://aa.com.tr/en/rss/default?cat=world',
    region: 'middle-east',
    lang: 'en',
  },

  // ── Europe ────────────────────────────────────────────────────────────────
  { name: 'DW', url: 'https://rss.dw.com/xml/rss-en-world', region: 'europe', lang: 'en' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', region: 'europe', lang: 'en' },
  // Ukrainian sources — English-language editions
  {
    name: 'Kyiv Independent',
    url: 'https://kyivindependent.com/news-archive/rss/',
    region: 'europe',
    lang: 'en',
  },
  {
    name: 'Ukrinform',
    url: 'https://www.ukrinform.net/rss/block-lastnews',
    region: 'europe',
    lang: 'en',
  },

  // ── Asia ──────────────────────────────────────────────────────────────────
  // NHK Japanese-language feed — translated to English via MT on cache-miss
  { name: 'NHK', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', region: 'asia', lang: 'ja' },
  { name: 'Yonhap', url: 'https://en.yna.co.kr/RSS/news.xml', region: 'asia', lang: 'en' },
  {
    name: 'The Hindu',
    url: 'https://www.thehindu.com/news/international/feeder/default.rss',
    region: 'asia',
    lang: 'en',
  },
  {
    name: 'CNA',
    url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311',
    region: 'asia',
    lang: 'en',
  },
  { name: 'Dawn', url: 'https://www.dawn.com/feeds/home/', region: 'asia', lang: 'en' },

  // ── Americas ─────────────────────────────────────────────────────────────
  { name: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml', region: 'americas', lang: 'en' },
  {
    name: 'Mercopress',
    url: 'https://en.mercopress.com/rss/',
    region: 'americas',
    lang: 'en',
  },

  // ── Pacific ───────────────────────────────────────────────────────────────
  {
    name: 'ABC Australia',
    url: 'https://www.abc.net.au/news/feed/51120/rss.xml',
    region: 'pacific',
    lang: 'en',
  },

  // ── Africa ───────────────────────────────────────────────────────────────
  {
    name: 'Premium Times',
    url: 'https://www.premiumtimesng.com/feed/',
    region: 'africa',
    lang: 'en',
  },
  {
    name: 'The East African',
    url: 'https://www.theeastafrican.co.ke/rss.xml',
    region: 'africa',
    lang: 'en',
  },
];

// Map ISO 639-1 codes → language names expected by @cf/meta/m2m100-1.2b
const LANG_NAMES = {
  ja: 'japanese',
  zh: 'chinese',
  ko: 'korean',
  ar: 'arabic',
  fr: 'french',
  de: 'german',
  es: 'spanish',
  pt: 'portuguese',
  ru: 'russian',
  hi: 'hindi',
};

export function getSourceFingerprint(sources = SOURCES) {
  const canonical = sources
    .map(({ name, url, region, lang }) => [name, url, region, lang].join('\u001f'))
    .join('\u001e');
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export const SOURCE_FINGERPRINT = getSourceFingerprint();
export const CACHE_KEY = `news_feed_v2_${SOURCE_FINGERPRINT}`;
export const SOURCE_HEALTH_KEY = `news_source_health_v2_${SOURCE_FINGERPRINT}`;
const CACHE_TTL_SECONDS = 900; // 15 minutes
export const SOURCE_HEALTH_TTL_SECONDS = 86_400; // retain latest observation for 24 hours
export const SOURCE_TIMEOUT_MS = 5000;
const VALID_REGIONS = new Set([
  'global',
  'middle-east',
  'europe',
  'asia',
  'americas',
  'pacific',
  'africa',
]);

const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

const BASE_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=900',
};

function logOperationalError(phase, error, details = {}) {
  console.error(
    JSON.stringify({
      event: 'globaldeets.news.error',
      phase,
      sourceFingerprint: SOURCE_FINGERPRINT,
      ...details,
      error: error?.message || String(error || 'unknown error'),
    })
  );
}

function getCorsHeaders(request) {
  const origin = request?.headers?.get('Origin');
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://globaldeets.com';

  return {
    ...BASE_HEADERS,
    'Access-Control-Allow-Origin': allowOrigin,
    Vary: 'Origin',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const headers = getCorsHeaders(request);

  const rawRegion = url.searchParams.get('region') || 'global';
  const region = VALID_REGIONS.has(rawRegion) ? rawRegion : 'global';
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 1),
    100
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  // Source definitions are part of the cache key, so changing any source deterministically
  // invalidates the old feed instead of waiting for TTL expiry.
  const cached = await readFeedCache(env);
  if (cached) {
    const filtered = filterByRegion(cached, region);
    const page = filtered.slice(offset, offset + limit);
    return new Response(
      JSON.stringify({
        items: page,
        cached: true,
        total: filtered.length,
        sourceFingerprint: SOURCE_FINGERPRINT,
      }),
      { headers }
    );
  }

  const { items, sourceHealth } = await fetchAllSources();
  await translateNonEnglish(items, env);
  await writeCaches(env, items, sourceHealth);

  const filtered = filterByRegion(items, region);
  const page = filtered.slice(offset, offset + limit);
  return new Response(
    JSON.stringify({
      items: page,
      cached: false,
      total: filtered.length,
      sourceFingerprint: SOURCE_FINGERPRINT,
    }),
    { headers }
  );
}

async function readFeedCache(env) {
  if (!env.NEWS_CACHE) return null;
  try {
    return await env.NEWS_CACHE.get(CACHE_KEY, { type: 'json' });
  } catch (error) {
    logOperationalError('kv_read_feed', error, { cacheKey: CACHE_KEY });
    return null;
  }
}

async function writeCaches(env, items, sourceHealth) {
  if (!env.NEWS_CACHE) return;
  try {
    await Promise.all([
      env.NEWS_CACHE.put(CACHE_KEY, JSON.stringify(items), {
        expirationTtl: CACHE_TTL_SECONDS,
      }),
      env.NEWS_CACHE.put(
        SOURCE_HEALTH_KEY,
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          sourceFingerprint: SOURCE_FINGERPRINT,
          sourceHealth,
        }),
        { expirationTtl: SOURCE_HEALTH_TTL_SECONDS }
      ),
    ]);
  } catch (error) {
    logOperationalError('kv_write_news', error, {
      feedCacheKey: CACHE_KEY,
      healthCacheKey: SOURCE_HEALTH_KEY,
    });
  }
}

async function translateNonEnglish(items, env) {
  if (!env?.AI) return;

  const toTranslate = items.filter(i => i.lang && i.lang !== 'en');
  if (!toTranslate.length) return;

  await Promise.all(
    toTranslate.map(async item => {
      const sourceLang = LANG_NAMES[item.lang] || item.lang;
      try {
        const [headlineRes, summaryRes] = await Promise.all([
          env.AI.run('@cf/meta/m2m100-1.2b', {
            text: item.headline,
            source_lang: sourceLang,
            target_lang: 'english',
          }),
          item.summary
            ? env.AI.run('@cf/meta/m2m100-1.2b', {
                text: item.summary,
                source_lang: sourceLang,
                target_lang: 'english',
              })
            : Promise.resolve(null),
        ]);

        item.headline = headlineRes?.translated_text || item.headline;
        item.summary = summaryRes?.translated_text || item.summary;
        item.translated = true;
        item.originalLang = item.lang;
      } catch (error) {
        item.translated = false;
        item.originalLang = item.lang;
        logOperationalError('translation', error, {
          source: item.source,
          sourceLang,
        });
      }
    })
  );
}

async function fetchAllSources() {
  const results = await Promise.all(SOURCES.map(source => fetchAndParseRSS(source)));

  const items = results.flatMap(result => result.items);
  const sourceHealth = results.map(result => result.health);

  const seen = new Set();
  const normalizedItems = items
    .sort((a, b) => new Date(b.published) - new Date(a.published))
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, 300);

  return { items: normalizedItems, sourceHealth };
}

async function fetchAndParseRSS(source) {
  const { name, url, region, lang } = source;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GlobalDeets/1.0 RSS Reader (+https://globaldeets.com)' },
    });

    if (!res.ok) {
      return {
        items: [],
        health: makeSourceHealth(source, {
          startedAt,
          status: res.status,
          error: `HTTP ${res.status}`,
          storyCount: 0,
          latencyMs: Date.now() - startedMs,
        }),
      };
    }

    const text = await res.text();
    const items = parseRSS(text, name, region, lang);
    const error = items.length === 0 ? 'No stories parsed from source response.' : null;

    return {
      items,
      health: makeSourceHealth(source, {
        startedAt,
        succeededAt: error ? null : new Date().toISOString(),
        status: res.status,
        error,
        storyCount: items.length,
        latencyMs: Date.now() - startedMs,
      }),
    };
  } catch (error) {
    const reason =
      error?.name === 'AbortError'
        ? `Timed out after ${SOURCE_TIMEOUT_MS}ms`
        : error?.message || 'Source fetch failed';

    return {
      items: [],
      health: makeSourceHealth(source, {
        startedAt,
        status: null,
        error: reason,
        storyCount: 0,
        latencyMs: Date.now() - startedMs,
      }),
    };
  } finally {
    clearTimeout(timer);
  }
}

function makeSourceHealth(source, observation) {
  return {
    sourceId: slugifySourceName(source.name),
    name: source.name,
    url: source.url,
    region: source.region,
    lang: source.lang,
    lastFetchStartedAt: observation.startedAt,
    lastFetchSucceededAt: observation.succeededAt || null,
    lastStatus: observation.status,
    lastError: observation.error || null,
    storyCount: observation.storyCount,
    averageLatencyMs: observation.latencyMs,
    consecutiveFailures: observation.error ? 1 : 0,
  };
}

export function slugifySourceName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseRSS(xml, sourceName, region, lang = 'en') {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const desc = extractTag(block, 'description');
    const pubDate = extractTag(block, 'pubDate');

    if (!title || !link) continue;
    if (!link.startsWith('https://') && !link.startsWith('http://')) continue;

    let published = new Date().toISOString();
    if (pubDate) {
      const parsed = new Date(pubDate);
      if (!isNaN(parsed.getTime())) {
        published = parsed.toISOString();
      }
    }

    items.push({
      id: `${sourceName}-${hashStr(title)}`,
      headline: cleanText(title),
      summary: cleanText(desc).slice(0, 280),
      source: sourceName,
      sourceUrl: link,
      published,
      region,
      lang,
      translated: false,
      originalLang: lang,
    });
  }

  return items.slice(0, 20);
}

function extractTag(xml, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`);
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();
  const plainMatch = xml.match(plainRe);
  return plainMatch ? plainMatch[1].trim() : '';
}

function cleanText(str) {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function filterByRegion(items, region) {
  if (region === 'global') return items;
  return items.filter(item => item.region === region || item.region === 'global');
}

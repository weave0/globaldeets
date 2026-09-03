// functions/api/news.js
// Cloudflare Pages Function — GET /api/news

export const SOURCES = [
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', region: 'global', lang: 'en' },
  { name: 'AP', url: 'https://rsshub.app/apnews/topics/world-news', region: 'global', lang: 'en' },
  { name: 'Guardian', url: 'https://www.theguardian.com/world/rss', region: 'global', lang: 'en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', region: 'middle-east', lang: 'en' },
  { name: 'Anadolu Agency', url: 'https://aa.com.tr/en/rss/default?cat=world', region: 'middle-east', lang: 'en' },
  { name: 'DW', url: 'https://rss.dw.com/xml/rss-en-world', region: 'europe', lang: 'en' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', region: 'europe', lang: 'en' },
  {
    name: 'Kyiv Independent',
    url: 'https://kyivindependent.com/news-archive/rss/',
    region: 'europe',
    lang: 'en',
  },
  { name: 'Ukrinform', url: 'https://www.ukrinform.net/rss/block-lastnews', region: 'europe', lang: 'en' },
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
  { name: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml', region: 'americas', lang: 'en' },
  { name: 'Mercopress', url: 'https://en.mercopress.com/rss/', region: 'americas', lang: 'en' },
  {
    name: 'ABC Australia',
    url: 'https://www.abc.net.au/news/feed/51120/rss.xml',
    region: 'pacific',
    lang: 'en',
  },
  { name: 'Premium Times', url: 'https://www.premiumtimesng.com/feed/', region: 'africa', lang: 'en' },
  { name: 'The East African', url: 'https://www.theeastafrican.co.ke/rss.xml', region: 'africa', lang: 'en' },
];

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
const CACHE_TTL_SECONDS = 900;
export const SOURCE_HEALTH_TTL_SECONDS = 86_400;
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

function getCorsHeaders(request) {
  const origin = request?.headers?.get('Origin');
  return {
    ...BASE_HEADERS,
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin)
      ? origin
      : 'https://globaldeets.com',
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

  const cached = await env.NEWS_CACHE?.get(CACHE_KEY, { type: 'json' });
  if (cached) {
    return makeFeedResponse(cached, region, offset, limit, true, headers);
  }

  const { items, sourceHealth } = await fetchAllSources();
  await translateNonEnglish(items, env);

  if (env.NEWS_CACHE) {
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
    ]).catch(() => {});
  }

  return makeFeedResponse(items, region, offset, limit, false, headers);
}

function makeFeedResponse(items, region, offset, limit, cached, headers) {
  const filtered = filterByRegion(items, region);
  return new Response(
    JSON.stringify({
      items: filtered.slice(offset, offset + limit),
      cached,
      total: filtered.length,
      sourceFingerprint: SOURCE_FINGERPRINT,
    }),
    { headers }
  );
}

async function translateNonEnglish(items, env) {
  if (!env?.AI) return;
  const toTranslate = items.filter(item => item.lang && item.lang !== 'en');

  await Promise.all(
    toTranslate.map(async item => {
      const sourceLang = LANG_NAMES[item.lang] || item.lang;
      try {
        const [headlineResult, summaryResult] = await Promise.all([
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
        item.headline = headlineResult?.translated_text || item.headline;
        item.summary = summaryResult?.translated_text || item.summary;
        item.translated = true;
        item.originalLang = item.lang;
      } catch {
        item.translated = false;
        item.originalLang = item.lang;
      }
    })
  );
}

async function fetchAllSources() {
  const results = await Promise.all(SOURCES.map(source => fetchAndParseRSS(source)));
  const sourceHealth = results.map(result => result.health);
  const seen = new Set();
  const items = results
    .flatMap(result => result.items)
    .sort((a, b) => new Date(b.published) - new Date(a.published))
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, 300);
  return { items, sourceHealth };
}

async function fetchAndParseRSS(source) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GlobalDeets/1.0 RSS Reader (+https://globaldeets.com)' },
    });

    if (!response.ok) {
      return resultFor(source, startedAt, startedMs, response.status, `HTTP ${response.status}`, []);
    }

    const items = parseRSS(await response.text(), source.name, source.region, source.lang);
    return resultFor(
      source,
      startedAt,
      startedMs,
      response.status,
      items.length ? null : 'No stories parsed from source response.',
      items
    );
  } catch (error) {
    const reason =
      error?.name === 'AbortError'
        ? `Timed out after ${SOURCE_TIMEOUT_MS}ms`
        : error?.message || 'Source fetch failed';
    return resultFor(source, startedAt, startedMs, null, reason, []);
  } finally {
    clearTimeout(timer);
  }
}

function resultFor(source, startedAt, startedMs, status, error, items) {
  return {
    items,
    health: {
      sourceId: slugifySourceName(source.name),
      name: source.name,
      url: source.url,
      region: source.region,
      lang: source.lang,
      lastFetchStartedAt: startedAt,
      lastFetchSucceededAt: error ? null : new Date().toISOString(),
      lastStatus: status,
      lastError: error,
      storyCount: items.length,
      averageLatencyMs: Date.now() - startedMs,
      consecutiveFailures: error ? 1 : 0,
    },
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
    const description = extractTag(block, 'description');
    const pubDate = extractTag(block, 'pubDate');
    if (!title || !link) continue;
    if (!link.startsWith('https://') && !link.startsWith('http://')) continue;

    let published = new Date().toISOString();
    if (pubDate) {
      const parsed = new Date(pubDate);
      if (!Number.isNaN(parsed.getTime())) published = parsed.toISOString();
    }

    items.push({
      id: `${sourceName}-${hashStr(title)}`,
      headline: cleanText(title),
      summary: cleanText(description).slice(0, 280),
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
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(xml);
  if (cdata) return cdata[1].trim();
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return plain ? plain[1].trim() : '';
}

function cleanText(value) {
  return value
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

function hashStr(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function filterByRegion(items, region) {
  if (region === 'global') return items;
  return items.filter(item => item.region === region || item.region === 'global');
}

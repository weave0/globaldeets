// functions/api/news.js
// Cloudflare Pages Function — GET /api/news
//
// Params:
//   ?region=global|middle-east|europe|asia|americas|pacific
//   ?limit=30  (max 100)
//   ?offset=0
//
// Requires KV binding: NEWS_CACHE (add to wrangler.toml)
//   [[kv_namespaces]]
//   binding = "NEWS_CACHE"
//   id = "<your-kv-namespace-id>"

const SOURCES = [
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
    url: 'https://kyivindependent.com/feed/',
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
  { name: 'CNA', url: 'https://www.channelnewsasia.com/rss/8395986', region: 'asia', lang: 'en' },
  { name: 'Dawn', url: 'https://www.dawn.com/feeds/home', region: 'asia', lang: 'en' },

  // ── Americas ─────────────────────────────────────────────────────────────
  { name: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml', region: 'americas', lang: 'en' },
  {
    name: 'Mercopress',
    url: 'https://en.mercopress.com/rss/latest-news',
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
    url: 'https://www.theeastafrican.co.ke/tea/feed',
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

const CACHE_KEY = 'news_feed_v1';
const CACHE_TTL_SECONDS = 900; // 15 minutes
const VALID_REGIONS = new Set([
  'global',
  'middle-east',
  'europe',
  'asia',
  'americas',
  'pacific',
  'africa',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://globaldeets.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=900',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);

  // Sanitize and validate query params
  const rawRegion = url.searchParams.get('region') || 'global';
  const region = VALID_REGIONS.has(rawRegion) ? rawRegion : 'global';
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 1),
    100
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  // Check KV cache first
  const cached = await env.NEWS_CACHE?.get(CACHE_KEY, { type: 'json' });
  if (cached) {
    const filtered = filterByRegion(cached, region);
    const page = filtered.slice(offset, offset + limit);
    return new Response(JSON.stringify({ items: page, cached: true, total: filtered.length }), {
      headers: CORS_HEADERS,
    });
  }

  // Cache miss — fetch all sources in parallel, then translate non-English
  const items = await fetchAllSources();
  await translateNonEnglish(items, env);

  // Write to KV (best-effort — don't fail the request if KV is unavailable)
  if (env.NEWS_CACHE) {
    await env.NEWS_CACHE.put(CACHE_KEY, JSON.stringify(items), {
      expirationTtl: CACHE_TTL_SECONDS,
    }).catch(() => {});
  }

  const filtered = filterByRegion(items, region);
  const page = filtered.slice(offset, offset + limit);
  return new Response(JSON.stringify({ items: page, cached: false, total: filtered.length }), {
    headers: CORS_HEADERS,
  });
}

// ---------------------------------------------------------------------------
// Machine translation — runs before KV write, only on cache-miss
// Requires Cloudflare Workers AI binding: env.AI
// Translates in parallel; leaves originals intact on any error
// ---------------------------------------------------------------------------
async function translateNonEnglish(items, env) {
  if (!env?.AI) return; // AI binding not configured — skip silently

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
      } catch {
        // Translation failed — serve original text, flag as untranslated
        item.translated = false;
        item.originalLang = item.lang;
      }
    })
  );
}

async function fetchAllSources() {
  const results = await Promise.allSettled(SOURCES.map(source => fetchAndParseRSS(source)));

  const items = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  // Sort newest-first, deduplicate by id, cap at 300 for KV storage
  const seen = new Set();
  return items
    .sort((a, b) => new Date(b.published) - new Date(a.published))
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, 300);
}

async function fetchAndParseRSS({ name, url, region, lang }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GlobalDeets/1.0 RSS Reader (+https://globaldeets.com)' },
    });
    if (!res.ok) return [];
    const text = await res.text();
    clearTimeout(timer);
    return parseRSS(text, name, region, lang);
  } catch {
    clearTimeout(timer);
    return [];
  }
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

    // Reject non-HTTP links (security: prevent javascript: / data: URIs)
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

  return items.slice(0, 20); // cap 20 items per source
}

function extractTag(xml, tag) {
  // Try CDATA first, then plain text
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

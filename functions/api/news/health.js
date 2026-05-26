// Cloudflare Pages Function - GET /api/news/health

const SOURCES_PATH = '/data/sources.json';
const SOURCE_HEALTH_KEY = 'news_source_health_v1';

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
  'Cache-Control': 'public, max-age=60',
};

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
  const headers = getCorsHeaders(request);
  const snapshot = await env.NEWS_CACHE?.get(SOURCE_HEALTH_KEY, { type: 'json' });

  if (snapshot?.sourceHealth) {
    return new Response(
      JSON.stringify({
        generatedAt: snapshot.generatedAt || null,
        cacheAgeSeconds: getCacheAgeSeconds(snapshot.generatedAt),
        sourceHealth: snapshot.sourceHealth,
      }),
      { headers }
    );
  }

  const sources = await loadSources(request, env);
  return new Response(
    JSON.stringify({
      generatedAt: null,
      cacheAgeSeconds: null,
      sourceHealth: sources.map(source => ({
        sourceId: source.id,
        name: source.name,
        region: source.region,
        countryCode: source.countryCode,
        sourceType: source.sourceType,
        lastFetchStartedAt: null,
        lastFetchSucceededAt: null,
        lastStatus: null,
        lastError: 'No source health snapshot has been generated yet.',
        storyCount: 0,
        averageLatencyMs: null,
        consecutiveFailures: 0,
      })),
    }),
    { headers }
  );
}

async function loadSources(request, env) {
  const sourceUrl = new URL(SOURCES_PATH, request.url);
  let response;

  if (env?.ASSETS?.fetch) {
    response = await env.ASSETS.fetch(sourceUrl);
  } else {
    response = await fetch(sourceUrl.href);
  }

  if (!response.ok) {
    throw new Error(`Unable to load source registry: HTTP ${response.status}`);
  }

  const registry = await response.json();
  const sources = Array.isArray(registry.sources) ? registry.sources : [];
  return sources.filter(source => source.active !== false);
}

function getCacheAgeSeconds(generatedAt) {
  if (!generatedAt) return null;
  const generatedTime = new Date(generatedAt).getTime();
  if (Number.isNaN(generatedTime)) return null;
  return Math.max(0, Math.round((Date.now() - generatedTime) / 1000));
}

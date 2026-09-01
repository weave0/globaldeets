// Cloudflare Pages Function - GET /api/news/health

import { SOURCES, SOURCE_HEALTH_KEY } from '../news.js';

const SOURCE_HEALTH_TTL_SECONDS = 86_400;
const SOURCE_TIMEOUT_MS = 5000;

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
  const snapshot = await readSnapshot(env);

  if (snapshot?.sourceHealth?.length) {
    return jsonResponse(snapshot.generatedAt, snapshot.sourceHealth, headers);
  }

  // Self-initialize health from the exact same canonical SOURCES list used by /api/news.
  // This avoids a false 500 on a fresh deployment or empty KV namespace.
  const sourceHealth = await Promise.all(SOURCES.map(probeSource));
  const generatedAt = new Date().toISOString();

  if (env.NEWS_CACHE) {
    await env.NEWS_CACHE.put(
      SOURCE_HEALTH_KEY,
      JSON.stringify({ generatedAt, sourceHealth }),
      { expirationTtl: SOURCE_HEALTH_TTL_SECONDS }
    ).catch(() => {});
  }

  return jsonResponse(generatedAt, sourceHealth, headers);
}

async function readSnapshot(env) {
  if (!env.NEWS_CACHE) return null;
  try {
    return await env.NEWS_CACHE.get(SOURCE_HEALTH_KEY, { type: 'json' });
  } catch {
    return null;
  }
}

function jsonResponse(generatedAt, sourceHealth, headers) {
  return new Response(
    JSON.stringify({
      generatedAt: generatedAt || null,
      cacheAgeSeconds: getCacheAgeSeconds(generatedAt),
      healthySources: sourceHealth.filter(source => !source.lastError).length,
      totalSources: sourceHealth.length,
      sourceHealth,
    }),
    { headers }
  );
}

async function probeSource(source) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GlobalDeets/1.0 Health Probe (+https://globaldeets.com)' },
    });

    return makeHealth(source, {
      startedAt,
      succeededAt: response.ok ? new Date().toISOString() : null,
      status: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
      latencyMs: Date.now() - startedMs,
    });
  } catch (error) {
    const reason =
      error?.name === 'AbortError'
        ? `Timed out after ${SOURCE_TIMEOUT_MS}ms`
        : error?.message || 'Source fetch failed';

    return makeHealth(source, {
      startedAt,
      succeededAt: null,
      status: null,
      error: reason,
      latencyMs: Date.now() - startedMs,
    });
  } finally {
    clearTimeout(timer);
  }
}

function makeHealth(source, observation) {
  return {
    sourceId: slugifySourceName(source.name),
    name: source.name,
    url: source.url,
    region: source.region,
    lang: source.lang,
    lastFetchStartedAt: observation.startedAt,
    lastFetchSucceededAt: observation.succeededAt,
    lastStatus: observation.status,
    lastError: observation.error,
    storyCount: null,
    averageLatencyMs: observation.latencyMs,
    consecutiveFailures: observation.error ? 1 : 0,
  };
}

function slugifySourceName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getCacheAgeSeconds(generatedAt) {
  if (!generatedAt) return null;
  const generatedTime = new Date(generatedAt).getTime();
  if (Number.isNaN(generatedTime)) return null;
  return Math.max(0, Math.round((Date.now() - generatedTime) / 1000));
}

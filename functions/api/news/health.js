// Cloudflare Pages Function - GET /api/news/health

import {
  SOURCES,
  SOURCE_FINGERPRINT,
  SOURCE_HEALTH_KEY,
  SOURCE_HEALTH_TTL_SECONDS,
  SOURCE_TIMEOUT_MS,
  slugifySourceName,
} from '../news.js';

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

function logOperationalError(phase, error, details = {}) {
  console.error(
    JSON.stringify({
      event: 'globaldeets.news.health.error',
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
  const headers = getCorsHeaders(request);
  const snapshot = await readSnapshot(env);

  if (
    snapshot?.sourceFingerprint === SOURCE_FINGERPRINT &&
    Array.isArray(snapshot.sourceHealth) &&
    snapshot.sourceHealth.length === SOURCES.length
  ) {
    return jsonResponse(snapshot.generatedAt, snapshot.sourceHealth, headers);
  }

  // Self-initialize from the same canonical source list as /api/news. Source changes alter
  // both the key and fingerprint, so stale observations cannot satisfy the deployed contract.
  const sourceHealth = await Promise.all(SOURCES.map(probeSource));
  const generatedAt = new Date().toISOString();

  await writeSnapshot(env, generatedAt, sourceHealth);

  return jsonResponse(generatedAt, sourceHealth, headers);
}

async function readSnapshot(env) {
  if (!env.NEWS_CACHE) return null;
  try {
    return await env.NEWS_CACHE.get(SOURCE_HEALTH_KEY, { type: 'json' });
  } catch (error) {
    logOperationalError('kv_read_health', error, { cacheKey: SOURCE_HEALTH_KEY });
    return null;
  }
}

async function writeSnapshot(env, generatedAt, sourceHealth) {
  if (!env.NEWS_CACHE) return;
  try {
    await env.NEWS_CACHE.put(
      SOURCE_HEALTH_KEY,
      JSON.stringify({ generatedAt, sourceFingerprint: SOURCE_FINGERPRINT, sourceHealth }),
      { expirationTtl: SOURCE_HEALTH_TTL_SECONDS }
    );
  } catch (error) {
    logOperationalError('kv_write_health', error, { cacheKey: SOURCE_HEALTH_KEY });
  }
}

function jsonResponse(generatedAt, sourceHealth, headers) {
  return new Response(
    JSON.stringify({
      generatedAt: generatedAt || null,
      sourceFingerprint: SOURCE_FINGERPRINT,
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

function getCacheAgeSeconds(generatedAt) {
  if (!generatedAt) return null;
  const generatedTime = new Date(generatedAt).getTime();
  if (Number.isNaN(generatedTime)) return null;
  return Math.max(0, Math.round((Date.now() - generatedTime) / 1000));
}

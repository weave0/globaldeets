// Cloudflare Pages Function - GET /api/deploy

const DEPLOY_META_PATH = '/deploy-meta.json';

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
  const fileMetadata = await loadDeployMetadata(request, env);
  const commit = env.CF_PAGES_COMMIT_SHA || fileMetadata.commit || 'unknown';

  const metadata = {
    app: fileMetadata.app || 'GlobalDeets',
    environment: env.NODE_ENV || fileMetadata.environment || 'production',
    branch: env.CF_PAGES_BRANCH || fileMetadata.branch || 'unknown',
    commit,
    shortCommit: commit === 'unknown' ? 'unknown' : commit.slice(0, 12),
    generatedAt: fileMetadata.generatedAt || null,
  };

  return new Response(JSON.stringify(metadata, null, 2), { headers });
}

async function loadDeployMetadata(request, env) {
  try {
    const metadataUrl = new URL(DEPLOY_META_PATH, request.url);
    const response = env.ASSETS?.fetch
      ? await env.ASSETS.fetch(metadataUrl)
      : await fetch(metadataUrl.href);

    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

// Cloudflare Pages Function - GET /api/news/coverage

import { buildCoverageInventory } from '../../lib/news-coverage.js';
import { SOURCE_FINGERPRINT } from '../news.js';

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
  'Cache-Control': 'public, max-age=300',
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

export async function onRequestGet({ request }) {
  const inventory = buildCoverageInventory();
  return new Response(
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      sourceFingerprint: SOURCE_FINGERPRINT,
      ...inventory,
    }),
    { headers: getCorsHeaders(request) }
  );
}

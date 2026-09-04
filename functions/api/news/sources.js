// Cloudflare Pages Function - GET /api/news/sources

import { SOURCE_FINGERPRINT } from '../news.js';
import {
  PROVENANCE_REVIEW_DATE,
  SOURCE_PROVENANCE,
  validateSourceProvenance,
} from '../../lib/news-source-provenance.js';

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
  'Cache-Control': 'public, max-age=3600',
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
  const validation = validateSourceProvenance();
  return new Response(
    JSON.stringify({
      sourceFingerprint: SOURCE_FINGERPRINT,
      reviewedAt: PROVENANCE_REVIEW_DATE,
      validation,
      totalSources: SOURCE_PROVENANCE.length,
      sources: SOURCE_PROVENANCE,
    }),
    { headers: getCorsHeaders(request) }
  );
}

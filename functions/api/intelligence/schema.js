// Cloudflare Pages Function - GET /api/intelligence/schema
import {
  ENTITY_TYPES,
  EVENT_STATUSES,
  INTELLIGENCE_MODEL_VERSION,
} from '../../lib/intelligence-model.js';
import { M49_PLACE_SEED, M49_SEED_METADATA } from '../../lib/m49-place-seed.js';

const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

function headers(request) {
  const origin = request?.headers?.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://globaldeets.com',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    Vary: 'Origin',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function onRequestGet({ request }) {
  return new Response(
    JSON.stringify({
      modelVersion: INTELLIGENCE_MODEL_VERSION,
      entityTypes: ENTITY_TYPES,
      eventStatuses: EVENT_STATUSES,
      identityRules: {
        explicitEntityIdentityKey: true,
        explicitEventKey: true,
        automaticNameMerge: false,
        ambiguousAliasResolution: 'ambiguous',
        aliasesRequireEvidence: true,
        placeIdentityStandard: 'UN M49',
      },
      placeSeed: {
        ...M49_SEED_METADATA,
        count: M49_PLACE_SEED.length,
      },
    }),
    { headers: headers(request) }
  );
}

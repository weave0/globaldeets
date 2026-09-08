import {
  acquireInstitutionalEvidence,
  acquisitionSummary,
} from '../../../lib/institutional-evidence-acquisition.js';

const ACQUISITION_ID = 'eurostat:population-density:eu27-latest';
const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

function headers(request, cacheControl = 'no-store') {
  const origin = request?.headers?.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://globaldeets.com',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': cacheControl,
    Vary: 'Origin',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function onRequestGet({ request }) {
  try {
    const artifact = await acquireInstitutionalEvidence(ACQUISITION_ID);
    return new Response(
      JSON.stringify({
        acquisition: acquisitionSummary(),
        artifact,
      }),
      { status: 200, headers: headers(request) }
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'globaldeets.intelligence.acquisition.error',
        acquisitionId: ACQUISITION_ID,
        error: error?.message || String(error || 'unknown error'),
      })
    );
    return new Response(
      JSON.stringify({
        error: 'institutional_acquisition_failed',
        acquisitionId: ACQUISITION_ID,
        staleArtifactFallbackUsed: false,
      }),
      { status: 503, headers: headers(request) }
    );
  }
}

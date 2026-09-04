import { getSantaYnezDossier } from '../../../lib/santa-ynez-dossier.js';

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
    'Cache-Control': 'public, max-age=300',
    Vary: 'Origin',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function onRequestGet({ request }) {
  const dossier = getSantaYnezDossier();
  if (!dossier.validation.valid) {
    return new Response(
      JSON.stringify({ error: 'dossier-integrity-failed', validation: dossier.validation }),
      { status: 500, headers: headers(request) }
    );
  }
  return new Response(JSON.stringify(dossier), { status: 200, headers: headers(request) });
}

import {
  buildCoverageEvidenceObservatory,
  readCachedSourceHealth,
  validateCoverageEvidenceObservatory,
} from '../../../lib/coverage-evidence-observatory.js';
import {
  buildLocalReportingObservatory,
  validateLocalReportingObservatory,
} from '../../../lib/local-reporting-observatory.js';

const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

function headers(request, cacheControl = 'public, max-age=300') {
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

export async function onRequestGet({ env, request }) {
  try {
    const healthSnapshot = await readCachedSourceHealth(env);
    const observatory = buildCoverageEvidenceObservatory({ healthSnapshot });
    const baseIntegrity = validateCoverageEvidenceObservatory(observatory);
    const localReporting = buildLocalReportingObservatory();
    const localIntegrity = validateLocalReportingObservatory(localReporting);
    const integrity = {
      ...baseIntegrity,
      localReporting: localIntegrity,
      valid: baseIntegrity.valid && localIntegrity.valid,
    };

    if (!integrity.valid) {
      return new Response(
        JSON.stringify({
          error: 'observatory_integrity_failed',
          observatoryId: observatory.observatoryId,
          observatoryVersion: observatory.observatoryVersion,
          integrity,
        }),
        { status: 503, headers: headers(request, 'no-store') }
      );
    }

    return new Response(
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        ...observatory,
        localReporting,
        integrity,
      }),
      { headers: headers(request) }
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'globaldeets.intelligence.observatory.error',
        error: error?.message || String(error || 'unknown error'),
      })
    );
    return new Response(
      JSON.stringify({
        error: 'observatory_generation_failed',
      }),
      { status: 503, headers: headers(request, 'no-store') }
    );
  }
}

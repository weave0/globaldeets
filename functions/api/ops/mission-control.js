// Cloudflare Pages Function — GET /api/ops/mission-control
//
// Probes GlobalDeets and its sibling ecosystem sites from the Cloudflare edge (this session's
// own sandbox cannot reach the public internet, which is exactly why this check must run in
// production rather than be simulated) and returns the fail-closed Mission Control payload.

import {
  ECOSYSTEM_SITES,
  buildMissionControl,
  validateMissionControl,
} from '../../lib/mission-control.js';

const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

const PROBE_TIMEOUT_MS = 6000;

function headers(request, cacheControl = 'public, max-age=120') {
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
    const siteProbes = await Promise.all(ECOSYSTEM_SITES.map(probeSite));
    const missionControl = buildMissionControl({ siteProbes });
    const integrity = validateMissionControl(missionControl);

    if (!integrity.valid) {
      return new Response(
        JSON.stringify({
          error: 'mission_control_integrity_failed',
          observatoryId: missionControl.observatoryId,
          observatoryVersion: missionControl.observatoryVersion,
          integrity,
        }),
        { status: 503, headers: headers(request, 'no-store') }
      );
    }

    return new Response(
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        ...missionControl,
        integrity,
      }),
      { headers: headers(request) }
    );
  } catch (error) {
    logOperationalError(error);
    return new Response(JSON.stringify({ error: 'mission_control_generation_failed' }), {
      status: 503,
      headers: headers(request, 'no-store'),
    });
  }
}

async function probeSite(site) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(site.url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    return {
      siteId: site.id,
      reachable: response.ok,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      siteId: site.id,
      reachable: false,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error:
        error?.name === 'AbortError'
          ? `Timed out after ${PROBE_TIMEOUT_MS}ms`
          : error?.message || 'Probe failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

function logOperationalError(error) {
  console.error(
    JSON.stringify({
      event: 'globaldeets.ops.mission-control.error',
      error: error?.message || String(error || 'unknown error'),
    })
  );
}

#!/usr/bin/env node
/**
 * Production boundary regression check (GD-037).
 *   node tools/verify-boundary-retired-prod.js --base=https://globaldeets.com
 *
 * GlobalDeets is a public product, not a directory of the GFD estate. This asserts the
 * internal estate-control-plane surfaces retired by GD-037 have not silently re-entered
 * the production deploy artifact: Mission Control, the shared estate-ecosystem nav bundle,
 * the retired Spheres directory, and the retired analytics redirect.
 */
function argValue(name) {
  const arg = process.argv.find(value => value.startsWith(name));
  return arg ? arg.slice(name.length) : null;
}

const BASE = (argValue('--base=') || 'https://globaldeets.com').replace(/\/$/, '');
const TIMEOUT_MS = 12_000;

const RETIRED_PATHS = [
  '/observatory/mission-control/',
  '/observatory/mission-control/estate-health.json',
  '/observatory/mission-control/executive.json',
  '/shared/ecosystem-nav.js',
  '/shared/ecosystem-nav.css',
  '/spheres.html',
  '/analytics.html',
];

async function statusOf(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': 'GlobalDeets-BoundaryVerifier/1.0', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response.status;
}

(async () => {
  const results = await Promise.all(RETIRED_PATHS.map(async path => ({ path, status: await statusOf(path) })));
  const leaked = results.filter(result => result.status === 200);

  if (leaked.length > 0) {
    throw new Error(
      `retired estate surfaces are publicly reachable again: ${leaked.map(item => `${item.path} (HTTP ${item.status})`).join(', ')}`
    );
  }

  console.log(`Public product boundary holds: ${results.length} retired estate paths all stay unreachable.`);
})().catch(error => {
  console.error(`Public product boundary verification failed: ${error.message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Production boundary regression check (GD-037).
 *   node tools/verify-boundary-retired-prod.js --base=https://globaldeets.com
 *
 * GlobalDeets is a public product, not a directory of the GFD estate. This asserts the
 * internal estate-control-plane surfaces retired by GD-037 have not silently re-entered
 * the production deploy artifact: Mission Control, the shared estate-ecosystem nav bundle,
 * the retired Spheres directory, and the retired analytics redirect.
 *
 * GD-038 extends the check from dead URLs to semantics: the retired GFD portfolio directory
 * (projects-data/render, platform modal, sibling product pages, maintainer templates) must stay
 * gone, and core public pages must not name sibling products or link to their domains.
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
  '/projects-data.js',
  '/projects-render.js',
  '/platform-modal.js',
  '/PROJECT_TEMPLATE.js',
  '/QUICK_REFERENCE.js',
  '/bb-content.html',
  '/bi-ecosystem.css',
];

const CORE_PAGES = [
  '/', '/news', '/categories', '/timeline', '/globe', '/worldmap', '/knowledge',
  '/about', '/contact', '/donate', '/offline', '/app.js', '/world-desk.js',
  '/news.js', '/globe-hero.js',
];

const FORBIDDEN_CONTENT = [
  /projects-data\.js/,
  /projects-render\.js/,
  /platform-modal\.js/,
  /Fantasy Penpal/i,
  /Culture Sherpa/i,
  /aiaimate/i,
  /Insurance Intelligence/i,
  /Healthcare (?:System )?Intelligence/i,
  /Mission Control/i,
  /fantasy-penpal\.globaldeets/i,
  /steveb\.globaldeets/i,
  /medical\.globaldeets/i,
  /impact across 6 world-changing platforms/i,
  /goodlippindesign/i,
  /gofundme\.com/i,
];

async function textOf(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': 'GlobalDeets-BoundaryVerifier/1.0', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.text();
}

async function statusOf(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': 'GlobalDeets-BoundaryVerifier/1.0', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response.status;
}

module.exports = { RETIRED_PATHS, CORE_PAGES };
if (require.main === module) (async () => {
  const results = await Promise.all(RETIRED_PATHS.map(async path => ({ path, status: await statusOf(path) })));
  const leaked = results.filter(result => result.status === 200);

  if (leaked.length > 0) {
    throw new Error(
      `retired estate surfaces are publicly reachable again: ${leaked.map(item => `${item.path} (HTTP ${item.status})`).join(', ')}`
    );
  }

  const pages = await Promise.all(CORE_PAGES.map(async path => ({ path, body: await textOf(path) })));
  const drift = pages.flatMap(({ path, body }) =>
    FORBIDDEN_CONTENT.filter(pattern => pattern.test(body)).map(pattern => `${path} matches ${pattern}`)
  );
  if (drift.length > 0) {
    throw new Error(`GFD portfolio content has re-entered public pages: ${drift.join(', ')}`);
  }

  console.log(
    `Public product boundary holds: ${results.length} retired estate paths stay unreachable and ${pages.length} core pages carry no portfolio content.`
  );
})().catch(error => {
  console.error(`Public product boundary verification failed: ${error.message}`);
  process.exit(1);
});

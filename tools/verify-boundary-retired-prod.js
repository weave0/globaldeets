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
const { createHash, randomUUID } = require('crypto');

function argValue(name) {
  const arg = process.argv.find(value => value.startsWith(name));
  return arg ? arg.slice(name.length) : null;
}

const BASE = (argValue('--base=') || 'https://globaldeets.com').replace(/\/$/, '');
const TIMEOUT_MS = 12_000;
const DEFAULT_IMMUTABLE_BASE = 'https://69a0a63f.globaldeets.pages.dev';
const DEFAULT_PAGES_BASE = 'https://globaldeets.pages.dev';
const DIAGNOSTIC_PATHS = ['/platform-modal.js', '/bi-ecosystem.css'];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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
  '/news.js', '/globe-hero.js', '/404.html',
  '/dossiers/santa-ynez-pipeline/', '/observatory/coverage/',
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

function selectedHeaders(headers) {
  const selected = {};
  for (const [name, value] of headers.entries()) {
    if (
      name === 'age' ||
      name === 'cache-control' ||
      name === 'content-length' ||
      name === 'content-type' ||
      name === 'etag' ||
      name === 'location' ||
      name === 'server' ||
      name === 'vary' ||
      name === 'via' ||
      name.startsWith('cf-') ||
      name.startsWith('x-')
    ) {
      selected[name] = value;
    }
  }
  return selected;
}

async function inspectResponse(initialUrl, fetchImpl = fetch) {
  const redirectChain = [];
  let currentUrl = new URL(initialUrl);

  for (let redirects = 0; redirects <= 10; redirects++) {
    const response = await fetchImpl(currentUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'GlobalDeets-BoundaryDiagnostic/1.0',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const responseHeaders = selectedHeaders(response.headers);
    const location = response.headers.get('location');

    if (REDIRECT_STATUSES.has(response.status) && location) {
      redirectChain.push({
        url: currentUrl.href,
        status: response.status,
        location: new URL(location, currentUrl).href,
        headers: responseHeaders,
      });
      await response.body?.cancel();
      if (redirects === 10) throw new Error(`Response exceeded 10 redirects: ${initialUrl}`);
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    const body = new Uint8Array(await response.arrayBuffer());
    return {
      requestedUrl: new URL(initialUrl).href,
      finalUrl: currentUrl.href,
      redirectChain,
      status: response.status,
      contentType: response.headers.get('content-type'),
      declaredContentLength: response.headers.get('content-length'),
      contentLengthBytes: body.byteLength,
      bodySha256: createHash('sha256').update(body).digest('hex'),
      cacheControl: response.headers.get('cache-control'),
      age: response.headers.get('age'),
      cfCacheStatus: response.headers.get('cf-cache-status'),
      cfRay: response.headers.get('cf-ray'),
      etag: response.headers.get('etag'),
      headers: responseHeaders,
    };
  }

  throw new Error(`Unable to inspect response: ${initialUrl}`);
}

async function runBoundaryDiagnostics({
  fetchImpl = fetch,
  baseUrls = [
    BASE,
    'https://www.globaldeets.com',
    process.env.GLOBALDEETS_BOUNDARY_IMMUTABLE_BASE || DEFAULT_IMMUTABLE_BASE,
    process.env.GLOBALDEETS_BOUNDARY_PAGES_BASE || DEFAULT_PAGES_BASE,
  ],
  probeId = randomUUID(),
} = {}) {
  const controlPath = `/__globaldeets_boundary_control_${probeId}.js`;
  const paths = [...DIAGNOSTIC_PATHS, controlPath];
  const targets = [...new Set(baseUrls)].flatMap(baseUrl =>
    paths.map(path => ({ baseUrl, path }))
  );
  const responses = await Promise.all(
    targets.map(async ({ baseUrl, path }, index) => {
      const url = new URL(path, baseUrl);
      url.searchParams.set('_boundary_probe', `${probeId}-${index}`);
      return inspectResponse(url, fetchImpl);
    })
  );

  return {
    diagnosticOnly: true,
    capturedAt: new Date().toISOString(),
    probeId,
    paths,
    responses,
  };
}

module.exports = { RETIRED_PATHS, CORE_PAGES, inspectResponse, runBoundaryDiagnostics };
if (require.main === module) (async () => {
  if (process.argv.includes('--diagnose')) {
    console.log(JSON.stringify(await runBoundaryDiagnostics(), null, 2));
    return;
  }

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
  // Owner identification is legitimate on About, but the publisher's unrelated portfolio
  // destination does not belong on the news-reading and source-browsing surfaces. The About
  // exception is intentionally narrow: exactly two checked operator-credit links, no directory.
  const OWNER_DOMAIN = /goodflippindesign\.com/gi;
  for (const { path, body } of pages) {
    const occurrences = [...body.matchAll(OWNER_DOMAIN)].length;
    if (path === '/about') {
      const aboutCredits = [...body.matchAll(/href="https:\/\/goodflippindesign\.com"/gi)].length;
      if (occurrences !== 2 || aboutCredits !== 2) {
        drift.push(`${path} operator attribution is not limited to its two reviewed About links`);
      }
    } else if (occurrences > 0) {
      drift.push(`${path} links to the unrelated owner-domain portfolio`);
    }
  }
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

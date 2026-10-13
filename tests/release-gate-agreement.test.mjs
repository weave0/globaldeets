import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The deploy workflow runs health-prod.js and then verify-boundary-retired-prod.js against the same
// deployment. They must never disagree about a route: a retired page cannot be "healthy" in one
// gate and "must stay unreachable" in the other.

const require = createRequire(import.meta.url);
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const { ROUTES } = require('../health-prod.js');
const { RETIRED_PATHS } = require('../tools/verify-boundary-retired-prod.js');
const { assertNoRetiredPaths } = require('../tools/stage-deploy.js');

const canonical = path => path.replace(/\.html$/, '').replace(/\/$/, '') || '/';

function publicFileFor(path) {
  const clean = path.split('?')[0];
  if (clean === '/') return 'index.html';
  const base = clean.replace(/^\//, '').replace(/\/$/, '');
  return [base, `${base}.html`, `${base}/index.html`].find(candidate =>
    existsSync(join(ROOT, candidate))
  );
}

test('no route retired by the boundary verifier is expected to be healthy (200)', () => {
  const retired = new Set(RETIRED_PATHS.map(canonical));
  const conflicts = ROUTES.filter(route => route.expect === 200 && retired.has(canonical(route.path)));
  assert.deepEqual(
    conflicts.map(route => route.path),
    [],
    'health-prod.js expects 200 for routes the boundary verifier requires to be unreachable'
  );
});

test('health-prod requires 404 for the retired public pages, including .html aliases', () => {
  const expected404 = new Set(ROUTES.filter(route => route.expect === 404).map(route => route.path));
  for (const path of ['/spheres', '/spheres.html', '/analytics.html', '/bb-content.html']) {
    assert.ok(expected404.has(path), `${path} must be checked as 404`);
    assert.ok(RETIRED_PATHS.map(canonical).includes(canonical(path)), `${path} is also boundary-retired`);
  }
});

test('every static page health-prod expects to be healthy exists in the repository', () => {
  const missing = ROUTES.filter(
    route => route.expect === 200 && route.type === 'text/html' && !publicFileFor(route.path)
  ).map(route => route.path);
  assert.deepEqual(missing, [], 'health-prod.js requires pages that are not shipped');
});

test('every route health-prod expects to be 404 is genuinely absent from the repository', () => {
  const present = ROUTES.filter(route => route.expect === 404 && publicFileFor(route.path)).map(
    route => route.path
  );
  assert.deepEqual(present, [], 'a route expected to 404 still has a shipped file');
});

test('Pages CSP permits the same-origin service worker without removing the existing policy', () => {
  const headers = readFileSync(join(ROOT, '_headers'), 'utf8');
  const publicPolicy = headers.split(/\r?\n/).find(line => line.trimStart().startsWith('Content-Security-Policy:')) || '';
  assert.match(publicPolicy, /worker-src 'self' blob:/);
  assert.match(publicPolicy, /frame-ancestors 'none'/);
});

test('every healthy public HTML page is included in the portfolio boundary scan', () => {
  const { CORE_PAGES } = require('../tools/verify-boundary-retired-prod.js');
  const inspected = new Set(CORE_PAGES.map(canonical));
  const missing = ROUTES.filter(route => route.expect === 200 && route.type === 'text/html')
    .map(route => canonical(route.path))
    .filter(path => !inspected.has(path));
  assert.deepEqual(missing, [], 'public pages escaped the semantic boundary scan');
});

test('public support page contains no stale portfolio fundraising checkout', () => {
  const support = readFileSync(join(ROOT, 'donate.html'), 'utf8');
  assert.match(support, /GlobalDeets/);
  assert.match(support, /Donations are not being accepted through this page/);
  assert.doesNotMatch(support, /GoFundMe|PayPal\.Me|Stripe\(|Good Flippin Design|world-changing platforms/i);
});

test('every root public HTML file is included in the boundary verification', () => {
  const { CORE_PAGES } = require('../tools/verify-boundary-retired-prod.js');
  const inspected = new Set(CORE_PAGES.map(canonical));
  const rootHtml = readdirSync(ROOT)
    .filter(file => file.endsWith('.html'))
    .map(file => canonical('/' + file))
    .filter(path => path !== '/index');
  const missing = rootHtml.filter(path => !inspected.has(path));
  assert.deepEqual(missing, [], 'a shipped root HTML page escaped boundary inspection');
});

test('the public dossier and coverage observatory are included in the boundary verification', () => {
  const { CORE_PAGES } = require('../tools/verify-boundary-retired-prod.js');
  assert.ok(CORE_PAGES.includes('/dossiers/santa-ynez-pipeline/'));
  assert.ok(CORE_PAGES.includes('/observatory/coverage/'));
});

test('the owner-domain URL appears only in the two reviewed About operator credits', () => {
  const domain = /goodflippindesign\.com/gi;
  for (const file of readdirSync(ROOT).filter(name => name.endsWith('.html') && name !== 'about.html')) {
    assert.doesNotMatch(readFileSync(join(ROOT, file), 'utf8'), domain, `${file} must not link to the unrelated owner site`);
  }
  const about = readFileSync(join(ROOT, 'about.html'), 'utf8');
  assert.equal([...about.matchAll(domain)].length, 2, 'exactly two operator credits are allowed on About');
  assert.equal(
    [...about.matchAll(/href="https:\/\/goodflippindesign\.com"/gi)].length,
    2,
    'owner-domain references must be intentional external attribution links'
  );
});

test('the knowledge page does not deny analytics while loading Google Analytics', () => {
  const page = readFileSync(join(ROOT, 'knowledge.html'), 'utf8');
  assert.match(page, /googletagmanager\.com\/gtag\/js/);
  assert.doesNotMatch(page, /No tracking\./i, 'public privacy copy must agree with active analytics scripts');
  assert.match(page, /This site uses analytics\./);
});

test('staging accepts an artifact with no retired public paths', () => {
  const artifact = mkdtempSync(join(tmpdir(), 'globaldeets-clean-stage-'));
  try {
    assert.doesNotThrow(() => assertNoRetiredPaths(artifact));
  } finally {
    rmSync(artifact, { recursive: true, force: true });
  }
});

test('staging rejects every retired public path if it re-enters the artifact', async t => {
  for (const retiredPath of RETIRED_PATHS) {
    await t.test(retiredPath, () => {
      const artifact = mkdtempSync(join(tmpdir(), 'globaldeets-retired-stage-'));
      try {
        const artifactPath = join(artifact, retiredPath.replace(/^\/+/, ''));
        if (retiredPath.endsWith('/')) {
          mkdirSync(artifactPath, { recursive: true });
        } else {
          mkdirSync(dirname(artifactPath), { recursive: true });
          writeFileSync(artifactPath, '');
        }

        assert.throws(
          () => assertNoRetiredPaths(artifact),
          error => error instanceof Error && error.message.includes(retiredPath)
        );
      } finally {
        rmSync(artifact, { recursive: true, force: true });
      }
    });
  }
});

test('Pages routes all retired URLs through the middleware without routing all static traffic', () => {
  const routes = JSON.parse(readFileSync(join(ROOT, '_routes.json'), 'utf8'));
  assert.ok(routes.include.includes('/api/*'), 'existing API routing must stay enabled');
  assert.ok(!routes.include.includes('/*'), 'ordinary static routes must remain free of Functions');
  const matchesRule = (rule, path) => rule.endsWith('*')
    ? path.startsWith(rule.slice(0, -1))
    : rule === path;

  // Wrangler rejects includes that overlap a wildcard, even when unit tests pass.
  // Check the actual dispatch patterns, not only whether their names are present.
  for (const path of RETIRED_PATHS) {
    const matching = routes.include.filter(rule => matchesRule(rule, path));
    assert.equal(matching.length, 1, `${path} must be handled by exactly one route rule`);
  }
  assert.ok(routes.include.includes('/observatory/mission-control/*'));
  for (let i = 0; i < routes.include.length; i++) {
    for (let j = i + 1; j < routes.include.length; j++) {
      const left = routes.include[i];
      const right = routes.include[j];
      assert.ok(
        !(matchesRule(left, right) || matchesRule(right, left)),
        `Cloudflare Pages disallows overlapping include rules: ${left} and ${right}`
      );
    }
  }
});

test('Pages middleware emits uncached 404 for every retired path on both hostnames', async () => {
  const source = readFileSync(join(ROOT, 'functions/_middleware.js'), 'utf8');
  const { onRequest } = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
  for (const host of ['globaldeets.com', 'www.globaldeets.com']) {
    for (const path of RETIRED_PATHS) {
      let forwarded = false;
      const response = await onRequest({
        request: new Request(`https://${host}${path}`),
        next: () => { forwarded = true; return new Response('unsafe', { status: 200 }); },
      });
      assert.equal(forwarded, false, `${host}${path} escaped middleware`);
      assert.equal(response.status, 404, `${host}${path} was not rejected`);
      assert.match(response.headers.get('cache-control') || '', /no-store/);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex');
      assert.match(response.headers.get('content-type') || '', /text\/html/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
  }
});

test('Pages middleware retains existing API behavior and security headers', async () => {
  const source = readFileSync(join(ROOT, 'functions/_middleware.js'), 'utf8');
  const { onRequest } = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
  let forwarded = 0;
  const response = await onRequest({
    request: new Request('https://globaldeets.com/api/news'),
    next: () => { forwarded++; return new Response('ok', { status: 200 }); },
  });
  assert.equal(forwarded, 1);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('production boundary rejects redirects, errors and missing retired-path protections', () => {
  const { auditRetiredResponse, isValidRetiredResponse } =
    require('../tools/verify-boundary-retired-prod.js');
  const protectedHeaders = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'x-robots-tag': 'noindex',
    'x-content-type-options': 'nosniff',
  };
  const good = auditRetiredResponse(new Response('not found', {
    status: 404, headers: protectedHeaders,
  }));
  assert.equal(isValidRetiredResponse(good), true);
  for (const status of [200, 301, 302, 403, 500, 503]) {
    const outcome = auditRetiredResponse(new Response('bad', { status, headers: protectedHeaders }));
    assert.equal(isValidRetiredResponse(outcome), false, `HTTP ${status} cannot certify retirement`);
  }
  for (const header of Object.keys(protectedHeaders)) {
    const headers = { ...protectedHeaders };
    delete headers[header];
    const outcome = auditRetiredResponse(new Response('not found', { status: 404, headers }));
    assert.equal(isValidRetiredResponse(outcome), false, `missing ${header} cannot certify retirement`);
  }
});

test('production reader requires selection audit derived from the governed response', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const script = readFileSync(join(ROOT, 'tools/verify-reader-prod.js'), 'utf8');
  for (const id of ['desk-audit-publishers', 'desk-audit-regions', 'desk-audit-total', 'desk-audit-share']) {
    assert.match(html, new RegExp('id="' + id + '"'));
    assert.ok(script.includes("value('" + id + "')"));
  }
  assert.match(script, /page\.waitForResponse\(/);
  assert.match(script, /data\.selection\?\.policyVersion/);
  assert.match(script, /shown\.share === maxShare/);
  assert.doesNotMatch(script, /Live Sources|homepage did not render 21 live sources/);
});

test('production reader checks the actually shipped service-worker cache', () => {
  const sw = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');
  const script = readFileSync(join(ROOT, 'tools/verify-reader-prod.js'), 'utf8');
  const cache = /const CACHE_NAME = '(globaldeets-cache-v\d+)'/.exec(sw)?.[1];
  assert.ok(cache && script.includes(cache));
  assert.doesNotMatch(script, /saved-reading\.js/, 'do not require unshipped v11 assets');
});

test('News hydration retains reviewed source-first subtitle and release-verifier agreement', () => {
  const html = readFileSync(join(ROOT, 'news.html'), 'utf8');
  const app = readFileSync(join(ROOT, 'news.js'), 'utf8');
  const check = readFileSync(join(ROOT, 'tools/verify-reader-prod.js'), 'utf8');
  for (const phrase of ['Live, source-linked headlines', 'original publisher', 'provenance', 'coverage limitations']) {
    assert.ok(html.includes(phrase));
    assert.ok(check.includes("subtitle.includes('" + phrase + "')"));
  }
  assert.doesNotMatch(app, /prepareTrustSurface\(\)/);
});

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The deploy workflow runs health-prod.js and then verify-boundary-retired-prod.js against the same
// deployment. They must never disagree about a route: a retired page cannot be "healthy" in one
// gate and "must stay unreachable" in the other.

const require = createRequire(import.meta.url);
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const { ROUTES } = require('../health-prod.js');
const { RETIRED_PATHS } = require('../tools/verify-boundary-retired-prod.js');

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

test('production reader gate audits displayed global selection rather than retired live-source statistics', () => {
  const home = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const verifier = readFileSync(join(ROOT, 'tools/verify-reader-prod.js'), 'utf8');
  for (const id of ['desk-audit-publishers', 'desk-audit-regions', 'desk-audit-total', 'desk-audit-share']) {
    assert.match(home, new RegExp('id="' + id + '"'), 'homepage is missing a measured selection counter');
    assert.ok(verifier.includes("value('" + id + "')"), 'production gate must inspect ' + id);
  }
  assert.match(verifier, /page\.waitForResponse\(/, 'release gate must inspect the actual homepage API response');
  assert.match(verifier, /data\.selection\?\.policyVersion/, 'release gate must check named selection policy');
  assert.match(verifier, /shown\.share === maxShare/, 'release gate must verify calculated concentration');
  assert.doesNotMatch(verifier, /hasText: 'Live Sources'|homepage did not render 21 live sources/i);
  assert.doesNotMatch(home, /<span class="dm-stat-label">Live Sources<\/span>/);
});

test('reader verification requires the service worker cache version actually built for this release', () => {
  const worker = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');
  const reader = readFileSync(join(ROOT, 'tools/verify-reader-prod.js'), 'utf8');
  const preview = readFileSync(join(ROOT, 'tools/verify-preview-pages.js'), 'utf8');
  const version = /const CACHE_NAME = '(globaldeets-cache-v\d+)'/.exec(worker)?.[1];
  assert.ok(version, 'service-worker cache name not found');
  assert.ok(reader.includes(version), 'production reader gate is checking the wrong service-worker cache');
  assert.ok(preview.includes(version), 'isolated Pages verifier is checking the wrong service-worker cache');
});

test('production News verifier checks the current reader disclosure, not a retired subtitle', () => {
  const page = readFileSync(join(ROOT, 'news.html'), 'utf8');
  const verifier = readFileSync(join(ROOT, 'tools/verify-reader-prod.js'), 'utf8');
  for (const phrase of ['Live, source-linked headlines', 'original publisher', 'provenance', 'coverage limitations']) {
    assert.ok(page.includes(phrase), 'News disclosure no longer contains: ' + phrase);
    assert.ok(verifier.includes("subtitle.includes('" + phrase + "')"),
      'production reader gate drifted from News disclosure: ' + phrase);
  }
  assert.doesNotMatch(verifier, /Live source-linked headlines across seven routing regions/);
});

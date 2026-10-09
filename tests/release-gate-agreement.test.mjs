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

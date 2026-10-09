#!/usr/bin/env node
// GD-038: prove Cloudflare Pages preview behavior with the headers that Pages actually serves.
// This is an isolated branch preview, not a main/production deployment.
const { chromium } = require('@playwright/test');

const baseArg = process.argv.find(arg => arg.startsWith('--base='));
const shaArg = process.argv.find(arg => arg.startsWith('--expected-commit='));
const BASE = (baseArg ? baseArg.slice('--base='.length) : '').replace(/\/$/, '');
const EXPECTED = shaArg ? shaArg.slice('--expected-commit='.length) : '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getReady(path) {
  let error = null;
  for (let n = 0; n < 8; n++) {
    try {
      const response = await fetch(BASE + path, { cache: 'no-store' });
      if (response.ok) return response;
      error = new Error(path + ' returned HTTP ' + response.status);
    } catch (e) {
      error = e;
    }
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  throw error || new Error(path + ' unavailable on preview');
}

async function checkPreview() {
  assert(/^https:\/\/[a-z0-9.-]+\.pages\.dev$/.test(BASE), 'expected a Cloudflare Pages preview URL');
  assert(/^[a-f0-9]{40}$/.test(EXPECTED), 'exact 40-character commit SHA is required');
  assert(!BASE.startsWith('https://globaldeets.pages.dev'), 'use a deployment-specific preview URL');

  const metadataResponse = await getReady('/deploy-meta.json');
  const metadata = await metadataResponse.json();
  assert(metadata.commit === EXPECTED, 'preview deploy metadata commit differs from approved PR head');

  for (const [path, type] of [
    ['/styles.css', 'text/css'],
    ['/world-desk.css', 'text/css'],
    ['/news.js', 'javascript'],
    ['/service-worker.js', 'javascript'],
  ]) {
    const response = await getReady(path);
    assert((response.headers.get('content-type') || '').includes(type),
      path + ' has wrong production MIME type');
  }

  const donate = await (await getReady('/donate')).text();
  assert(donate.includes('Donations are not being accepted through this page'),
    'preview support page does not show truthful payment status');
  assert(!/gofundme\.com|impact across 6 world-changing platforms/i.test(donate),
    'retired fundraising message is still in preview');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    const doc = await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
    assert(doc?.ok(), 'preview homepage did not load');
    const csp = doc.headers()['content-security-policy'] || '';
    assert(/worker-src\s+[^;]*'self'/.test(csp),
      'actual Cloudflare Pages CSP blocks same-origin service workers');
    const worker = await page.evaluate(async () => {
      return Promise.race([
        navigator.serviceWorker.ready.then(reg => reg.active?.scriptURL || null),
        new Promise(resolve => setTimeout(() => resolve(null), 15000)),
      ]);
    });
    assert(worker && new URL(worker).pathname === '/service-worker.js',
      'service worker failed to register from the Pages preview');

    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller),
      undefined, { timeout: 15000 });
    const state = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const cache = await caches.open('globaldeets-cache-v8');
      const assets = await Promise.all(
        ['/index.html', '/news.html', '/styles.css', '/news.js'].map(x => cache.match(x))
      );
      return { cacheNames, complete: assets.every(Boolean) };
    });
    assert(state.cacheNames.includes('globaldeets-cache-v8') && state.complete,
      'Pages preview did not install a complete v8 reader cache');

    // Route-level aborts can cancel browser navigation before its service worker sees it.
    // Instead, fail the worker's own same-origin network fetch so the real fallback path runs.
    const swTarget = context.serviceWorkers().find(item =>
      new URL(item.url()).pathname === '/service-worker.js'
    );
    assert(swTarget, 'installed service worker target is not inspectable');
    await swTarget.evaluate(() => {
      const onlineFetch = self.fetch.bind(self);
      self.__gdOfflineProbeCount = 0;
      self.fetch = (...args) => {
        const value = args[0];
        const target = new URL(typeof value === 'string' ? value : value.url, self.location.href);
        if (target.origin === self.location.origin) {
          self.__gdOfflineProbeCount += 1;
          return Promise.reject(new TypeError('simulated worker network loss'));
        }
        return onlineFetch(...args);
      };
    });
    await page.goto(BASE + '/news?region=europe',
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    const offlineRequests = await swTarget.evaluate(() => self.__gdOfflineProbeCount);
    assert(offlineRequests > 0, 'navigation did not exercise the worker network-failure fallback');
    assert((await page.title()).includes('World News Feed'),
      'offline preview did not serve News for the clean route');
    assert(new URL(page.url()).searchParams.get('region') === 'europe',
      'offline preview lost the region query');
    const styled = await page.evaluate(() =>
      [...document.styleSheets]
        .filter(sheet => sheet.href && /\/(styles|world-desk)\.css$/.test(sheet.href))
        .map(sheet => sheet.cssRules.length)
    );
    assert(styled.length === 2 && styled.every(n => n > 10),
      'Pages preview offline News lost stylesheet rules');
    console.log('Pages preview passed: exact commit, MIME, CSP, worker registration, v8 cache and styled offline region.');
    console.log('Preview URL: ' + BASE);
  } finally {
    await context.close();
    await browser.close();
  }
}

checkPreview().catch(error => {
  console.error('Pages preview certification failed: ' + (error.stack || error.message));
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The service worker's first install must cache a complete offline shell: every precached page and
// every same-origin asset those pages load, including stylesheets injected by script. Otherwise a
// reader who installs the worker and goes offline before another controlled visit gets an
// unstyled page or a menu without its keyboard behavior.

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');

const workerSource = read('service-worker.js');
const listMatch = /const CORE_ASSETS = \[([\s\S]*?)\];/.exec(workerSource);
assert.ok(listMatch, 'CORE_ASSETS list not found in service-worker.js');
const CORE_ASSETS = [...listMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const normalized = new Set(CORE_ASSETS.map(asset => asset.replace(/^\//, '')));

const SHELL_PAGES = CORE_ASSETS.filter(asset => asset.endsWith('.html'));

function sameOriginAssets(html) {
  const found = new Set();
  const pattern = /<(?:script[^>]*\ssrc|link[^>]*\shref|img[^>]*\ssrc)="([^"]+)"/g;
  for (const [, url] of html.matchAll(pattern)) {
    if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('#') || url.startsWith('data:')) continue;
    if (url.endsWith('/') || url.endsWith('.html')) continue;
    found.add(url.replace(/^\//, '').split('?')[0]);
  }
  return found;
}

function scriptInjectedStyles(scriptFile) {
  return [...read(scriptFile).matchAll(/\.href\s*=\s*'\/?([^']+\.css)'/g)].map(match => match[1]);
}

test('the precache covers every same-origin asset the shell pages load', () => {
  const missing = [];
  for (const page of SHELL_PAGES) {
    const html = read(page);
    const assets = sameOriginAssets(html);
    for (const asset of assets) {
      if (asset.endsWith('.js')) scriptInjectedStyles(asset).forEach(style => assets.add(style));
    }
    for (const asset of assets) if (!normalized.has(asset)) missing.push(`${page} -> ${asset}`);
  }
  assert.deepEqual(missing, [], 'add these to CORE_ASSETS in service-worker.js');
});

test('news.js injects news-reader-bridge.css and the precache includes it', () => {
  assert.ok(scriptInjectedStyles('news.js').includes('news-reader-bridge.css'));
  assert.ok(normalized.has('news-reader-bridge.css'));
  assert.ok(normalized.has('site-nav.js'));
});

test('every precached path is a shipped file (a missing one fails the worker install)', () => {
  const missing = CORE_ASSETS.filter(asset => asset !== '/' && !existsSync(join(ROOT, asset)));
  assert.deepEqual(missing, []);
});

#!/usr/bin/env node
// Technical preview contract for GD-040; never assert production deployment.
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const flag = name => process.argv.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1) || '';
const BASE = flag('--base').replace(/\/$/, '');
const SHA = flag('--expected-commit');
function assert(ok, message) { if (!ok) throw new Error(message); }
async function getJson(path, { retries = 1 } = {}) {
  let detail = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(BASE + path, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (response.ok) return response.json();
      detail = path + ' HTTP ' + response.status + ': ' + (await response.text()).slice(0, 140);
    } catch (error) {
      detail = path + ' request failed: ' + String(error);
    }
    console.warn('GD040_PREVIEW_ENDPOINT_NOT_READY attempt ' + attempt + '/' + retries + ' ' + detail);
    if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Preview API readiness exhausted; cannot certify hosted source diversity: ' + detail);
}
async function main() {
  assert(/^https:\/\/[a-z0-9.-]+\.pages\.dev$/.test(BASE) && !BASE.startsWith('https://globaldeets.pages.dev'),
    'must use an isolated Cloudflare Pages preview');
  assert(/^[a-f0-9]{40}$/.test(SHA), 'exact source SHA required');
  let metadata;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { metadata = await getJson('/deploy-meta.json'); break; }
    catch (error) {
      if (attempt === 7) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  assert(metadata.commit === SHA, 'preview deploy does not match exact head');
  const chrono = await getJson('/api/news?region=global&limit=100', { retries: 10 });
  const diverse = await getJson('/api/news?region=global&limit=100&mode=diverse', { retries: 10 });
  const asia = await getJson('/api/news?region=asia&limit=100&mode=diverse', { retries: 10 });
  assert(chrono.selection?.mode === 'chronological', 'default mode changed');
  assert(asia.selection?.mode === 'diverse' &&
    asia.selection.scope === 'only publishers assigned to asia',
    'region does not declare strict publisher routing');
  assert(asia.items.every(item => item.region === 'asia'),
    'global or unrelated publisher feed leaked into Asia region');
  assert(diverse.selection?.mode === 'diverse' &&
    diverse.selection.policyVersion === 'gd040-publisher-region-rotation-v1', 'diversity policy not deployed');
  assert(diverse.total === chrono.total, 'selection changed governed item count');
  assert(/not event location/i.test(diverse.selection.explanation), 'geography caveat missing');
  assert(Array.isArray(diverse.items) && Array.isArray(chrono.items), 'feed unavailable');
  const cutoff = Math.max(...chrono.items.map(i => Date.parse(i.published) || -Infinity)) - 36 * 3600000;
  const windowSources = new Set(chrono.items.filter(i => Date.parse(i.published) >= cutoff)
    .map(i => i.sourceId || i.source));
  const top = diverse.items.slice(0, 8);
  const observed = new Set(top.map(i => i.sourceId || i.source));
  if (windowSources.size >= 2 && top.length >= 2) {
    assert(observed.size >= 2, 'multiple current publishers available but one occupied all featured slots');
  }
  mkdirSync(resolve('design-previews'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert(await page.getByRole('heading', { name: 'Across publishers' }).isVisible(),
      'publisher-mix heading absent from hosted page');
    assert(await page.getByRole('link', { name: 'See newest first' }).count() > 0,
      'chronological feed alternative absent');
    await page.screenshot({ path: resolve('design-previews/gd040-home.png'), animations: 'disabled' });
  } finally { await browser.close(); }
  console.log(JSON.stringify({
    outcome: 'GD040_TECHNICAL_PREVIEW_PASSED', commit: SHA, preview: BASE,
    asiaFeedItems: asia.total,
    itemsAvailable: chrono.total, publishersInFirstEight: observed.size,
    publishersInObservedFreshWindow: windowSources.size,
    caveat: 'Counts reflect available feeds, not guaranteed global coverage',
  }));
}
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });

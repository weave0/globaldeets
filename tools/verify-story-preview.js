#!/usr/bin/env node
// GD-R2 prerelease: prove the maintained story on an exact-SHA Pages preview.
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const flag = key => process.argv.find(v => v.startsWith(key + '='))?.slice(key.length + 1) || '';
const BASE = flag('--base').replace(/\/$/, '');
const SHA = flag('--expected-commit');
const STORY = '/story/santa-ynez-pipeline/';
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
async function response(path, { retries = 1 } = {}) {
  let detail = 'no response';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(BASE + path, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (res.ok) return res;
      detail = path + ' HTTP ' + res.status + ': ' + (await res.text()).slice(0, 180);
    } catch (error) {
      detail = path + ' fetch failed: ' + String(error);
    }
    console.warn('GD_R2_PREVIEW_API_NOT_READY ' + attempt + '/' + retries + ' ' + detail);
    if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Cannot certify hosted maintained story after bounded retries: ' + detail);
}
async function main() {
  assert(/^https:\/\/[a-z0-9.-]+\.pages\.dev$/.test(BASE) && !BASE.startsWith('https://globaldeets.pages.dev'),
    'expected an isolated Pages preview');
  assert(/^[a-f0-9]{40}$/.test(SHA), 'exact SHA is required');
  let meta;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { meta = await (await response('/deploy-meta.json')).json(); break; }
    catch (error) {
      if (attempt === 7) throw error;
      await new Promise(done => setTimeout(done, 2000));
    }
  }
  assert(meta.commit === SHA, 'deployment source differs from exact PR head');
  const [index, api, shipped] = await Promise.all([
    response('/api/intelligence/stories', { retries: 10 }).then(r => r.json()),
    response('/api/intelligence/stories/santa-ynez-pipeline', { retries: 10 }).then(r => r.json()),
    response(STORY + 'story.json').then(r => r.json()),
  ]);
  assert(index.stories?.length === 1 && index.stories[0]?.storyId === 'story:santa-ynez-pipeline',
    'public index was broadened or has no maintained story');
  assert(api.storyId === 'story:santa-ynez-pipeline' &&
    shipped.storyId === api.storyId &&
    shipped.dossierVersion === api.dossierVersion, 'shipped record and maintained API disagree');
  assert(api.rules?.truthScore === false && api.rules?.editorialVerdict === false &&
    api.understanding?.proseSummary == null, 'story must not invent editorial verdict/summary');
  assert(api.reporting?.origins?.some(origin => origin.name === 'Los Angeles Times' && origin.url?.startsWith('https://')),
    'reporting-origin attribution or original link is missing');
  assert(Array.isArray(api.corrections) && api.corrections.length > 0 &&
    Array.isArray(api.places) && api.places.length > 0, 'maintained correction and place provenance missing');
  const worker = await response('/service-worker.js');
  assert((worker.headers.get('content-type') || '').includes('javascript'), 'worker MIME is not JavaScript');
  const swText = await worker.text();
  assert(swText.includes('globaldeets-cache-v9') && swText.includes('normalizeHtmlResponse') &&
    swText.includes('story/santa-ynez-pipeline/index.html'), 'reviewed v9 offline story shell is absent');
  const stylesheet = await response('/story/story.css');
  assert((stylesheet.headers.get('content-type') || '').includes('text/css'), 'story stylesheet MIME invalid');
  mkdirSync(resolve('design-previews'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const device of [
      { label: 'desktop', viewport: { width: 1440, height: 900 } },
      { label: 'mobile', viewport: { width: 390, height: 844 } },
    ]) {
      const ctx = await browser.newContext({ viewport: device.viewport, serviceWorkers: 'allow' });
      try {
        const page = await ctx.newPage();
        const first = await page.goto(BASE + STORY, { waitUntil: 'domcontentloaded', timeout: 30000 });
        assert(first?.ok(), 'story navigation failed');
        await page.waitForSelector('body[data-story-ready="true"]', { timeout: 15000 });
        assert(await page.getByRole('link', { name: /Read at Los Angeles Times/ }).count() > 0,
          'original publisher action is not visible');
        await page.screenshot({ path: resolve('design-previews/gd-r2-' + device.label + '.png'), animations: 'disabled' });
        await page.waitForFunction(() => navigator.serviceWorker?.controller, undefined, { timeout: 15000 });
        await ctx.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('body[data-story-ready="true"]', { timeout: 15000 });
        assert(await page.getByRole('link', { name: /Read at Los Angeles Times/ }).count() > 0,
          'offline record lost original publisher link');
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ result: 'GD_R2_PREVIEW_PASSED', exactCommit: SHA, preview: BASE,
    knownMaintainedStories: 1, correctionRecords: api.corrections.length,
    caveat: 'Does not certify production, new dossier membership or reader engagement' }));
}
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });

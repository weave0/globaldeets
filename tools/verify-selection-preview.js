#!/usr/bin/env node
// GD-042: verify truthful counts from the same governed homepage response, not preset labels.
// An isolated Pages preview check; never a production certification.
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const arg = flag => process.argv.find(value => value.startsWith(flag + '='))?.slice(flag.length + 1) || '';
const BASE = arg('--base').replace(/\/$/, '');
const SHA = arg('--expected-commit');
const assert = (ok, text) => { if (!ok) throw new Error(text); };

async function getJson(path, retries = 10) {
  let diagnostic = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(BASE + path, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (response.ok) return response.json();
      diagnostic = path + ': HTTP ' + response.status;
    } catch (error) { diagnostic = path + ': ' + String(error); }
    console.warn('GD042_ENDPOINT_NOT_READY ' + attempt + '/' + retries + ': ' + diagnostic);
    if (attempt < retries) await new Promise(done => setTimeout(done, 3000));
  }
  throw new Error('Hosted preview did not serve ' + diagnostic);
}

const originalLink = value => {
  try {
    if (typeof value !== 'string') return false;
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
};

async function validatePage(browser, name, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    let lastFeed = null;
    page.on('response', response => {
      try {
        const u = new URL(response.url());
        if (u.pathname === '/api/news' && u.searchParams.get('mode') === 'diverse') {
          lastFeed = response.json().catch(() => null);
        }
      } catch { /* unrelated traffic */ }
    });
    for (let i = 1; i <= 6; i++) {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      try {
        await page.waitForFunction(() => document.body.dataset.deskLatest === 'ready', null, { timeout: 12000 });
        break;
      } catch (error) {
        if (i === 6) throw new Error('No verified governed selection after bounded attempts', { cause: error });
      }
    }
    const data = lastFeed && await lastFeed;
    assert(data && Array.isArray(data.items), 'could not inspect rendered feed response');
    assert(data.selection?.mode === 'diverse' && data.selection?.policyVersion ===
      'gd040-publisher-region-rotation-v1', 'homepage did not use the audited selection policy');
    const linked = data.items.filter(item => item && originalLink(item.sourceUrl));
    const publishers = new Map();
    const regions = new Set();
    for (const item of linked) {
      const id = String(item.sourceId || item.source || '').trim();
      if (!id) continue;
      publishers.set(id, (publishers.get(id) || 0) + 1);
      if (['global','americas','europe','asia','middle-east','pacific','africa'].includes(item.region)) regions.add(item.region);
    }
    const values = await page.evaluate(() => {
      const text = id => document.getElementById(id)?.textContent?.trim();
      return {
        publishers: text('desk-audit-publishers'),
        regions: text('desk-audit-regions'),
        available: text('desk-audit-total'),
        maxShare: text('desk-audit-share'),
        note: text('desk-selection-note'),
        actualCards: document.querySelectorAll('#desk-latest .desk-story').length,
        hardCodedClaim: document.body.textContent.includes('21 Live Sources'),
        canvas: window.getComputedStyle(document.body).backgroundColor,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    const largest = publishers.size && linked.length
      ? String(Math.round(100 * Math.max(...publishers.values()) / linked.length)) + '%'
      : '—';
    assert(values.publishers === String(publishers.size), 'publisher count is not from the response');
    assert(values.regions === String(regions.size), 'feed region count is not from the response');
    assert(values.available === String(data.total), 'available feed count is not from the response');
    assert(values.maxShare === largest, 'top publisher share not derived from display');
    assert(values.actualCards === data.items.length, 'browser list and counted feed differ');
    assert(values.note.includes('rotation verified') && values.note.includes('not event locations or impartiality'),
      'publisher selection or geography transparency missing');
    assert(!values.hardCodedClaim && values.canvas === 'rgb(11, 17, 26)' && !values.overflow,
      'hard-coded live-source promise or dark editorial layout regression');
    const more = page.getByText('How were these publishers selected?');
    await more.click();
    assert(await page.getByText(/not an importance, accuracy, political-bias, or event-location score/).isVisible(),
      'selection-method caveat not keyboard-visible');
    mkdirSync(resolve('design-previews'), { recursive: true });
    await page.screenshot({ path: resolve('design-previews/gd042-' + name + '.png'), animations: 'disabled' });
    return { shown: values.actualCards, publishers: publishers.size, regions: regions.size, total: data.total, topShare: largest };
  } finally { await context.close(); }
}

async function main() {
  assert(/^https:\/\/[a-z0-9.-]+\.pages\.dev$/.test(BASE) && BASE !== 'https://globaldeets.pages.dev',
    'an isolated exact-commit Pages preview is required');
  assert(/^[0-9a-f]{40}$/.test(SHA), 'a full expected commit is required');
  const meta = await getJson('/deploy-meta.json');
  assert(meta.commit === SHA, 'deployed Pages artifact does not match exact reviewed head');
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await validatePage(browser, 'desktop', { width: 1440, height: 900 });
    const mobile = await validatePage(browser, 'mobile', { width: 390, height: 844 });
    console.log(JSON.stringify({ result:'GD042_PREVIEW_CERTIFIED', head: SHA, preview: BASE, desktop, mobile,
      caveat:'Published-feed publisher counts are not actual world-event coverage, truth or reader outcomes.' }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });

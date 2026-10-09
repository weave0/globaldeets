#!/usr/bin/env node
// GD-039 branch-only preview: verify deployed editorial hierarchy and capture reviewable screenshots.
// Does not certify the service-worker offline behavior (a separate PR #80 release gate).
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');

const arg = flag => process.argv.find(value => value.startsWith(flag + '='))?.slice(flag.length + 1) || '';
const BASE = arg('--base').replace(/\/$/, '');
const SHA = arg('--expected-commit');
const out = resolve(process.cwd(), 'design-previews');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function main() {
  assert(/^https:\/\/[a-z0-9.-]+\.pages\.dev$/.test(BASE), 'expected isolated Pages preview URL');
  assert(/^[a-f0-9]{40}$/.test(SHA), 'expected exact source SHA');
  assert(!BASE.startsWith('https://globaldeets.pages.dev'), 'do not certify production alias');
  const metaResponse = await fetch(BASE + '/deploy-meta.json', { cache: 'no-store' });
  assert(metaResponse.ok, 'no preview deployment metadata');
  const meta = await metaResponse.json();
  assert(meta.commit === SHA, 'preview metadata does not match source head');
  const style = await fetch(BASE + '/editorial-reader.css', { cache: 'no-store' });
  assert(style.ok && (style.headers.get('content-type') || '').includes('text/css'),
    'editorial stylesheet missing or served with wrong MIME');
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await desktop.newPage();
    let res = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert(res?.ok(), 'home failed to load');
    await page.waitForTimeout(1400);
    const placement = await page.evaluate(() => {
      const desk = document.querySelector('#world-desk');
      const globe = document.querySelector('.globe-hero-section');
      const evidence = document.querySelector('header .nav-evidence');
      return {
        deskBeforeGlobe: !!(desk.compareDocumentPosition(globe) & Node.DOCUMENT_POSITION_FOLLOWING),
        globeInMain: document.querySelector('main').contains(globe),
        paper: getComputedStyle(document.body).backgroundColor,
        evidenceVisible: evidence && getComputedStyle(evidence).display !== 'none',
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    assert(placement.deskBeforeGlobe && placement.globeInMain, 'globe appears ahead of reporting');
    assert(placement.paper === 'rgb(247, 245, 239)', 'editorial reading palette not applied');
    assert(placement.evidenceVisible && !placement.overflow, 'home navigation/layout not editorial');
    await page.screenshot({ path: resolve(out, 'desktop-home.png'), animations: 'disabled' });

    res = await page.goto(BASE + '/news?region=asia', { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert(res?.ok(), 'news Asia page failed to load');
    await page.waitForTimeout(1400);
    const title = await page.locator('h1.news-page-title').textContent();
    assert(title?.trim() === 'Latest reporting', 'news edition headline was not deployed');
    assert(await page.locator('header .nav-evidence').count(), 'prominent evidence nav missing');
    await page.screenshot({ path: resolve(out, 'desktop-news-asia.png'), animations: 'disabled' });
    await desktop.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block',
    });
    const phone = await mobile.newPage();
    res = await phone.goto(BASE + '/news?region=asia', { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert(res?.ok(), 'mobile news Asia page failed to load');
    await phone.waitForTimeout(1400);
    const mobileLayout = await phone.evaluate(() => {
      const more = document.querySelector('header details.nav-more summary').getBoundingClientRect();
      return {
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        menuFits: more.right <= document.documentElement.clientWidth + 1,
        menuTouch: more.width >= 44 && more.height >= 44,
      };
    });
    assert(!mobileLayout.horizontalOverflow && mobileLayout.menuFits && mobileLayout.menuTouch,
      'mobile masthead overflows or has sub-44px More target');
    await phone.screenshot({ path: resolve(out, 'mobile-news-asia.png'), animations: 'disabled' });
    await mobile.close();

    console.log('GD-039 Pages preview verified: exact SHA, editorial CSS MIME, source-first hierarchy, labeled navigation, 390px reflow.');
    console.log('Screenshots: design-previews/desktop-home.png, desktop-news-asia.png, mobile-news-asia.png');
    console.log('Preview URL: ' + BASE);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error('GD-039 preview validation failed: ' + (error.stack || error.message));
  process.exitCode = 1;
});

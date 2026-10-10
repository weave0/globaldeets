#!/usr/bin/env node
// GD-043: one explicit, on-device saved story. No production or retention-rate claim.
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const flag = name => process.argv.find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
const BASE = flag('--base').replace(/\/$/, '');
const SHA = flag('--expected-commit');
const KEY = 'globaldeets:saved-story:v1';
const assert = (ok, message) => { if (!ok) throw new Error(message); };

async function fetchReady(path, retries = 8) {
  let reason = '';
  for (let n = 1; n <= retries; n++) {
    try {
      const res = await fetch(BASE + path, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (res.ok) return res;
      reason = path + ' HTTP ' + res.status;
    } catch (error) {
      reason = path + ' request failed ' + String(error);
    }
    console.warn('GD043_PAGE_NOT_READY '+n+'/'+retries+' '+reason);
    if (n < retries) await new Promise(done=>setTimeout(done,3000));
  }
  throw new Error('Cannot verify saved-reading preview: '+reason);
}

async function main() {
  assert(/^https:\/\/[a-z0-9.-]+\.pages\.dev$/.test(BASE) &&
    BASE !== 'https://globaldeets.pages.dev', 'must use an isolated Pages preview');
  assert(/^[0-9a-f]{40}$/.test(SHA), 'full exact SHA required');
  const meta = await (await fetchReady('/deploy-meta.json')).json();
  assert(meta.commit === SHA, 'preview source commit mismatch');
  const [savedJs, worker] = await Promise.all([
    fetchReady('/saved-reading.js'),
    fetchReady('/service-worker.js'),
  ]);
  assert((savedJs.headers.get('content-type')||'').includes('javascript'),
    'saved story file not served as JavaScript');
  const sw = await worker.text();
  assert(sw.includes('globaldeets-cache-v11') && sw.includes("'saved-reading.js'") &&
    sw.includes("'story/santa-ynez-pipeline/story.json'"), 'v11 offline saving shell missing');

  const browser = await chromium.launch({ headless: true });
  try {
    mkdirSync(resolve('design-previews'), { recursive: true });
    const context = await browser.newContext({
      viewport: {width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'allow',
    });
    try {
      const page = await context.newPage();
      const first = await page.goto(BASE+'/story/santa-ynez-pipeline/',{waitUntil:'domcontentloaded',timeout:30000});
      assert(first?.ok(),'story route did not load');
      await page.waitForSelector('body[data-story-ready="true"]',{timeout:20000});
      const save = page.getByRole('button',{name:'Save story on this device'});
      await save.waitFor({state:'visible',timeout:12000});
      assert(await save.isEnabled(),'verified maintained story cannot be saved');
      const networkOnSave = [];
      page.on('request', request => {
        if (request.method() !== 'GET') networkOnSave.push(request.url());
      });
      await save.click();
      await page.getByRole('button',{name:'Remove saved story'}).waitFor({state:'visible'});
      const saved = await page.evaluate(k=>window.localStorage.getItem(k),KEY);
      const decoded = JSON.parse(saved);
      assert(decoded.id === 'santa-ynez-pipeline' &&
        /^\d{4}-\d{2}-\d{2}\.\d{1,4}$/.test(decoded.version) &&
        Object.keys(decoded).sort().join(',')==='id,version',
        'on-device save stored unexpected fields or invalid record version');
      assert(networkOnSave.length===0,'save action unexpectedly transmitted a request');
      await page.screenshot({path:resolve('design-previews/gd043-story-mobile.png'),animations:'disabled'});
      await page.waitForFunction(()=>navigator.serviceWorker?.controller,undefined,{timeout:15000});
      await context.route('**/*',route=>route.abort('internetdisconnected'));
      await page.reload({waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForSelector('body[data-story-ready="true"]',{timeout:15000});
      await page.getByRole('button',{name:'Remove saved story'}).waitFor({state:'visible'});
      const source = page.getByRole('link',{name:/Read at Los Angeles Times/}).first();
      assert(await source.isVisible(),'offline story lost original reporting action');
      await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded',timeout:30000});
      const home = page.locator('#saved-story-panel');
      await home.waitFor({state:'visible',timeout:12000});
      assert(await home.getByRole('link',{name:'Continue this record'}).getAttribute('href')===
        '/story/santa-ynez-pipeline/','home saved shortcut has unsafe/wrong href');
      const note = await page.locator('#saved-story-home-status').textContent();
      assert(note.includes('does not receive alerts'),'local shortcut promises unimplemented alerts');
      await page.screenshot({path:resolve('design-previews/gd043-saved-home-mobile.png'),animations:'disabled'});
      const remove = home.getByRole('button',{name:'Remove saved story'});
      await remove.click();
      await home.waitFor({state:'hidden'});
      assert(await page.evaluate(k=>window.localStorage.getItem(k),KEY)===null,
        'reader could not delete the local shortcut');
    } finally { await context.close(); }
    const desktop = await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
    try {
      const page=await desktop.newPage();
      await page.goto(BASE+'/story/santa-ynez-pipeline/',{waitUntil:'domcontentloaded'});
      await page.waitForSelector('body[data-story-ready="true"]',{timeout:15000});
      const save=page.getByRole('button',{name:'Save story on this device'});
      await save.click();
      await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'});
      await page.locator('#saved-story-panel').waitFor({state:'visible'});
      await page.screenshot({path:resolve('design-previews/gd043-saved-home-desktop.png'),animations:'disabled'});
    } finally { await desktop.close(); }
  } finally { await browser.close(); }
  console.log(JSON.stringify({result:'GD043_LOCAL_SAVED_STORY_PREVIEW_PASSED',exactHead:SHA,
    preview:BASE,scope:'one verified story id/version in explicitly opted-in browser storage',
    caveat:'No reminders, notifications, analytics cohort, cross-device synchronization or tracking added'}));
}
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});

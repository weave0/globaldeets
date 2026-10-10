#!/usr/bin/env node
// GD-041: exact-SHA integrated reader preview gate, not production certification.
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const flag = name => process.argv.find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
const BASE = flag('--base').replace(/\/$/, '');
const SHA = flag('--expected-commit');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
async function fetchResult(path, retries = 10) {
  let last = '';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await fetch(BASE + path, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (result.ok) return result;
      last = path + ': HTTP ' + result.status + ' ' + (await result.text()).slice(0, 150);
    } catch (error) { last = path + ': ' + String(error); }
    console.warn('GD041_PREVIEW_NOT_READY ' + attempt + '/' + retries + ' ' + last);
    if (attempt < retries) await new Promise(done => setTimeout(done, 3000));
  }
  throw new Error('Integrated preview failed hosted-readiness contract: ' + last);
}
const getJson = async path => (await fetchResult(path)).json();
async function populated(page, selector, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: 8000 });
      return;
    } catch (error) {
      if (i === attempts) throw new Error('No populated reporting for '+selector+' after '+attempts+' retries', { cause: error });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(done => setTimeout(done, 1500));
    }
  }
}
async function main() {
  assert(/^https:\/\/[a-z0-9.-]+\.pages\.dev$/.test(BASE)
    && BASE !== 'https://globaldeets.pages.dev', 'only isolated Pages previews are allowed');
  assert(/^[0-9a-f]{40}$/.test(SHA), 'exact SHA is required');
  const meta = await getJson('/deploy-meta.json');
  assert(meta.commit === SHA, 'preview source SHA differs from expected commit');
  const [style,worker,story] = await Promise.all([
    fetchResult('/editorial-reader.css'),
    fetchResult('/service-worker.js'),
    getJson('/api/intelligence/stories/santa-ynez-pipeline'),
  ]);
  assert((style.headers.get('content-type')||'').includes('text/css'), 'editorial CSS MIME unavailable');
  const sw = await worker.text();
  assert(sw.includes('globaldeets-cache-v10') &&
      sw.includes('story/santa-ynez-pipeline/story.json') &&
      sw.includes('editorial-reader.css') &&
      sw.includes('normalizeHtmlResponse'), 'unified public offline shell missing');
  assert(story.storyId === 'story:santa-ynez-pipeline' && story.rules?.truthScore === false &&
      story.rules?.editorialVerdict === false && story.understanding?.proseSummary == null,
      'unreviewed story identity, editorial verdict or summary is exposed');
  const [chrono,diverse,asia,shipped] = await Promise.all([
    getJson('/api/news?region=global&limit=100'),
    getJson('/api/news?region=global&limit=100&mode=diverse'),
    getJson('/api/news?region=asia&limit=100'),
    getJson('/story/santa-ynez-pipeline/story.json'),
  ]);
  assert(chrono.selection?.mode === 'chronological', 'News chronology default was lost');
  assert(diverse.selection?.mode === 'diverse' &&
    diverse.selection?.policyVersion === 'gd040-publisher-region-rotation-v1', 'publisher rotation absent');
  assert(chrono.total === diverse.total, 'selection must not alter the admitted item set');
  assert(asia.selection?.scope === 'only publishers assigned to asia' &&
    asia.items.every(item => item.region === 'asia'), 'region tab silently includes global publishers');
  assert(shipped.storyId === story.storyId &&
    shipped.dossierVersion === story.dossierVersion, 'ship and live story projections disagree');
  const cap = diverse.items.slice(0,8);
  const firstPublishers = new Set(cap.map(item=>item.sourceId||item.source));
  assert(firstPublishers.size >= 4 || diverse.total < 4, 'first eight headlines are supply-concentrated');
  mkdirSync(resolve('design-previews'), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newContext({
      viewport: {width:1440,height:900}, serviceWorkers:'block',
    });
    const page=await desktop.newPage();
    let res=await page.goto(BASE+'/', {waitUntil:'domcontentloaded',timeout:30000});
    assert(res?.ok(), 'integrated homepage returned an error');
    await populated(page, '#desk-latest .desk-story');
    const home=await page.evaluate(()=>{
      const desk=document.querySelector('#world-desk');
      const globe=document.querySelector('.globe-hero-section');
      return {
        canvas:window.getComputedStyle(document.body).backgroundColor,
        headerHeight:document.querySelector('body > header').getBoundingClientRect().height,
        firstSource:document.querySelector('#desk-latest .desk-story-source')?.textContent,
        diverseHeading:!!document.querySelector('#world-desk h3')?.textContent.includes('Across publishers'),
        globeAfter:!!(desk.compareDocumentPosition(globe)&Node.DOCUMENT_POSITION_FOLLOWING),
        overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
      };
    });
    assert(home.canvas==='rgb(11, 17, 26)' && home.headerHeight<120 && home.globeAfter
      && home.diverseHeading && home.firstSource && !home.overflow,
      'headline-first dark editorial homepage did not render');
    await page.screenshot({path:resolve('design-previews/gd041-home-desktop.png'),animations:'disabled'});
    res=await page.goto(BASE+'/news?region=asia', {waitUntil:'domcontentloaded',timeout:30000});
    assert(res?.ok(),'Asia reader returned an error');
    if(asia.total>0)await populated(page,'#news-grid .news-card');
    await page.screenshot({path:resolve('design-previews/gd041-asia-desktop.png'),animations:'disabled'});
    await desktop.close();
    const mobile=await browser.newContext({viewport:{width:390,height:844},
      isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});
    const phone=await mobile.newPage();
    res=await phone.goto(BASE+'/news?region=asia', {waitUntil:'domcontentloaded',timeout:30000});
    assert(res?.ok(), 'Asia mobile reader failed');
    if(asia.total>0)await populated(phone,'#news-grid .news-card');
    const nav=await phone.evaluate(()=>{
      const summary=document.querySelector('header details.nav-more summary').getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
      touchWidth:summary.width,touchHeight:summary.height,menuRight:summary.right,viewport:window.innerWidth};
    });
    assert(!nav.overflow && nav.touchWidth>=44 && nav.touchHeight>=44 &&
      nav.menuRight<=nav.viewport+1,'mobile reader navigation broke');
    await phone.screenshot({path:resolve('design-previews/gd041-asia-mobile.png'),animations:'disabled'});
    await mobile.close();
    const storyContext=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'allow'});
    try{
      const storyPage=await storyContext.newPage();
      res=await storyPage.goto(BASE+'/story/santa-ynez-pipeline/',
        {waitUntil:'domcontentloaded',timeout:30000});
      assert(res?.ok(),'maintained story page unavailable');
      await storyPage.waitForSelector('body[data-story-ready="true"]',{timeout:15000});
      assert(await storyPage.getByRole('link',{name:/Read at Los Angeles Times/}).count()>0,
        'original publisher source link missing');
      await storyPage.screenshot({path:resolve('design-previews/gd041-story-desktop.png'),animations:'disabled'});
      await storyPage.waitForFunction(()=>navigator.serviceWorker?.controller,undefined,{timeout:15000});
      await storyContext.setOffline(true);
      await storyPage.reload({waitUntil:'domcontentloaded',timeout:30000});
      await storyPage.waitForSelector('body[data-story-ready="true"]',{timeout:15000});
      assert(await storyPage.getByRole('link',{name:/Read at Los Angeles Times/}).count()>0,
        'offline story lost source attribution');
    }finally{await storyContext.close();}
  }finally{await browser.close();}
  console.log(JSON.stringify({
    status:'GD041_INTEGRATED_PREVIEW_PASSED',exactHead:SHA,preview:BASE,
    mode:'governed-diverse-home + strict-publisher-region news + one maintained story',
    globalAvailable:diverse.total,firstEightPublishers:firstPublishers.size,asiaPublisherFeedItems:asia.total,
    caveat:'Not a statement about neutrality, event geography, complete sourcing, or production shipping',
  }));
}
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});

const { chromium } = require('@playwright/test');

const baseArg = process.argv.find(arg => arg.startsWith('--base='));
const BASE = (baseArg ? baseArg.slice('--base='.length) : 'https://globaldeets.com').replace(/\/$/, '');

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  requireCondition(
    overflow.scrollWidth <= overflow.viewport + 1 && overflow.bodyScrollWidth <= overflow.viewport + 1,
    `${label} has horizontal overflow: viewport=${overflow.viewport}, document=${overflow.scrollWidth}, body=${overflow.bodyScrollWidth}`
  );
}

async function requireTouchTarget(locator, label, minimum = 44) {
  const box = await locator.boundingBox();
  requireCondition(
    box && box.width >= minimum && box.height >= minimum,
    `${label} touch target is too small: ${box ? `${box.width}x${box.height}` : 'missing'}`
  );
}

async function waitForHomepageTrust(page) {
  await page.waitForFunction(
    () => {
      const stat = [...document.querySelectorAll('.dm-stat')].find(node =>
        node.querySelector('.dm-stat-label')?.textContent.trim() === 'Live Sources'
      );
      return stat?.querySelector('.dm-stat-value')?.textContent.trim() === '21';
    },
    undefined,
    { timeout: 20_000 }
  );
}

async function waitForNewsTrust(page) {
  await page.waitForFunction(
    () =>
      document
        .querySelector('#news-trust-bar')
        ?.textContent?.includes('21 source endpoints in the live contract'),
    undefined,
    { timeout: 20_000 }
  );
}

async function verifyHomepage(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const liveSources = page
    .locator('.dm-stat')
    .filter({ hasText: 'Live Sources' })
    .locator('.dm-stat-value');
  await liveSources.waitFor({ state: 'visible', timeout: 20_000 });
  await waitForHomepageTrust(page);
  requireCondition(
    (await liveSources.textContent())?.trim() === '21',
    'homepage did not render 21 live sources'
  );
  requireCondition(
    (await page.locator('a[href="/observatory/coverage/"]').count()) > 0,
    'homepage coverage observatory link missing'
  );
}

async function verifyNews(page) {
  const rawResponse = await page.request.get(`${BASE}/news.html`);
  requireCondition(rawResponse.ok(), `news document returned HTTP ${rawResponse.status()}`);
  const rawHtml = await rawResponse.text();
  requireCondition(
    rawHtml.includes('21 governed source endpoints'),
    'raw news HTML does not describe the 21-source governed portfolio'
  );
  requireCondition(
    rawHtml.includes('Minnesota Reformer') && rawHtml.includes('CalMatters'),
    'raw news HTML fallback source list is missing admitted subnational sources'
  );

  await page.goto(`${BASE}/news.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const subtitle = document.querySelector('.news-page-subtitle')?.textContent || '';
      return (
        subtitle.includes('Live source-linked headlines across seven routing regions') &&
        subtitle.includes('source provenance') &&
        subtitle.includes('coverage gaps')
      );
    },
    undefined,
    { timeout: 20_000 }
  );
  await page.locator('#news-grid .news-card').first().waitFor({ state: 'visible', timeout: 30_000 });
  // GD-038 F3: coverage detail is behind the "Sources & coverage" disclosure; stories come first.
  await page.locator('#news-sources-coverage summary').click();
  await page.locator('#news-coverage-context').waitFor({ state: 'visible', timeout: 30_000 });
  await waitForNewsTrust(page);

  const coverageText = (await page.locator('#news-coverage-context').textContent()) || '';
  requireCondition(
    coverageText.includes('What this feed can') && coverageText.includes('Routing region'),
    'reader coverage context did not render governed scope caveats'
  );
  await page.locator('.news-source-context').first().waitFor({ state: 'attached', timeout: 20_000 });
  requireCondition(
    (await page.locator('link[data-gd022-reader-bridge]').count()) === 1,
    'reader evidence-bridge stylesheet was not loaded'
  );
}

async function verifyMobileSurface(browser, viewport, label) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const liveSources = page.locator('.dm-stat').filter({ hasText: 'Live Sources' });
    await liveSources.waitFor({ state: 'visible', timeout: 20_000 });
    await waitForHomepageTrust(page);
    await page.locator('.dm-stat').filter({ hasText: 'Regions' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page
      .locator('.dm-stat')
      .filter({ hasText: 'Local/State Sources' })
      .waitFor({ state: 'visible', timeout: 10_000 });
    await page
      .locator('.dm-stat')
      .filter({ hasText: 'Open Coverage Gaps' })
      .waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#globe-hero-container').waitFor({ state: 'visible', timeout: 20_000 });
    await verifyNoHorizontalOverflow(page, `${label} homepage`);
    await requireTouchTarget(page.locator('header .nav-icon-btn').first(), `${label} primary nav`);

    await page.goto(`${BASE}/news.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#news-grid .news-card').first().waitFor({ state: 'visible', timeout: 30_000 });
    await requireTouchTarget(page.locator('#news-sources-coverage summary'), `${label} sources & coverage toggle`);
    await page.locator('#news-sources-coverage summary').click();
    await page.locator('#news-coverage-context').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForNewsTrust(page);
    const sourceContext = page.locator('.news-source-context').first();
    await sourceContext.waitFor({ state: 'attached', timeout: 20_000 });
    await verifyNoHorizontalOverflow(page, `${label} news reader`);
    await requireTouchTarget(page.locator('.region-tab').first(), `${label} region tab`);
    await requireTouchTarget(sourceContext.locator('summary'), `${label} source context disclosure`);
    await requireTouchTarget(page.locator('.news-read-link').first(), `${label} publisher link`);
  } finally {
    await context.close();
  }
}

async function verifyServiceWorker(browser) {
  // Do not certify a PWA just because the JS file contains the expected cache version. A fresh
  // production browser must receive real Pages headers, register, control and replay its shell.
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  try {
    const types = [
      ['/styles.css', 'text/css'],
      ['/world-desk.css', 'text/css'],
      ['/news.js', 'javascript'],
      ['/site-nav.js', 'javascript'],
      ['/service-worker.js', 'javascript'],
    ];
    for (const [path, expectedType] of types) {
      const response = await page.request.get(`${BASE}${path}`);
      requireCondition(response.ok(), `${path} returned HTTP ${response.status()}`);
      const actualType = response.headers()['content-type'] || '';
      requireCondition(actualType.includes(expectedType), `${path} served ${actualType}, expected ${expectedType}`);
    }

    const response = await page.goto(`${BASE}/index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    requireCondition(response?.ok(), 'production homepage did not load for service-worker certification');
    const csp = response.headers()['content-security-policy'] || '';
    requireCondition(
      /worker-src\s+[^;]*'self'/.test(csp),
      'production CSP does not permit same-origin service-worker registration'
    );

    const workerUrl = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      return Promise.race([
        navigator.serviceWorker.ready.then(registration => registration.active?.scriptURL || null),
        new Promise(resolve => setTimeout(() => resolve(null), 15_000)),
      ]);
    });
    requireCondition(
      workerUrl && new URL(workerUrl).pathname === '/service-worker.js',
      'production browser did not register the same-origin service worker'
    );
    await page.waitForFunction(
      () => navigator.serviceWorker.controller?.scriptURL?.endsWith('/service-worker.js'),
      undefined,
      { timeout: 15_000 }
    );
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const cache = await caches.open('globaldeets-cache-v9');
      const shell = await Promise.all(['/index.html', '/news.html', '/styles.css', '/news.js'].map(path => cache.match(path)));
      return { names, complete: shell.every(Boolean) };
    });
    requireCondition(cached.names.includes('globaldeets-cache-v9'), 'production cache v9 did not install');
    requireCondition(cached.complete, 'the production offline shell is incomplete after first install');

    // Browser-context route aborts can prevent navigation before the controlling worker
    // handles the request. Fail the network fetch *inside* the worker to prove its fallback.
    const swTarget = context.serviceWorkers().find(item =>
      new URL(item.url()).pathname === '/service-worker.js'
    );
    requireCondition(swTarget, 'production service worker target is not inspectable');
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
    await page.goto(`${BASE}/news?region=europe`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const offlineRequests = await swTarget.evaluate(() => self.__gdOfflineProbeCount);
    requireCondition(offlineRequests > 0, 'production offline fallback did not run');
    requireCondition(
      (await page.title()).includes('World News Feed'),
      'offline clean-route navigation did not load the precached News page'
    );
    requireCondition(
      new URL(page.url()).searchParams.get('region') === 'europe',
      'offline navigation discarded the region query'
    );
    const stylesApplied = await page.evaluate(() =>
      [...document.styleSheets]
        .filter(sheet => sheet.href && /\/(styles|world-desk)\.css$/.test(sheet.href))
        .map(sheet => sheet.cssRules.length)
    );
    requireCondition(
      stylesApplied.length === 2 && stylesApplied.every(n => n > 10),
      'offline production News did not retain the expected stylesheets'
    );
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await verifyHomepage(page);
    await verifyNews(page);
    await verifyServiceWorker(browser);
    await verifyMobileSurface(browser, { width: 390, height: 844 }, 'iPhone-class');
    await verifyMobileSurface(browser, { width: 360, height: 800 }, 'narrow Android-class');
    console.log(
      'Production reader verification passed: desktop + mobile rendered surfaces, visible governed metrics, 44px touch targets, raw news HTML, evidence bridge, and live MIME/CSP/service-worker registration/offline shell are current.'
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

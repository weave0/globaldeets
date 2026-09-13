const { chromium } = require('@playwright/test');

const baseArg = process.argv.find(arg => arg.startsWith('--base='));
const BASE = (baseArg ? baseArg.slice('--base='.length) : 'https://globaldeets.com').replace(/\/$/, '');

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyHomepage(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const liveSources = page
    .locator('.dm-stat')
    .filter({ hasText: 'Live Sources' })
    .locator('.dm-stat-value');
  await liveSources.waitFor({ state: 'visible', timeout: 20_000 });
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

  requireCondition(
    (await liveSources.textContent())?.trim() === '21',
    'homepage did not render 21 live sources'
  );

  const observatoryLink = page.locator('a[href="/observatory/coverage/"]');
  requireCondition((await observatoryLink.count()) > 0, 'homepage coverage observatory link missing');
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

  const subtitle = (await page.locator('.news-page-subtitle').textContent()) || '';
  requireCondition(
    subtitle.includes('Live source-linked headlines across seven routing regions') &&
      subtitle.includes('source provenance') &&
      subtitle.includes('coverage gaps'),
    'hydrated news reader subtitle did not render the governed source-context contract'
  );

  await page.locator('#news-grid .news-card').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#news-coverage-context').waitFor({ state: 'visible', timeout: 30_000 });

  const trustText = (await page.locator('#news-trust-bar').textContent()) || '';
  requireCondition(
    trustText.includes('21 source endpoints in the live contract'),
    'news trust bar did not hydrate the 21-source live contract'
  );

  const coverageText = (await page.locator('#news-coverage-context').textContent()) || '';
  requireCondition(
    coverageText.includes('What this feed can') && coverageText.includes('Routing region'),
    'reader coverage context did not render governed scope caveats'
  );

  const sourceContext = page.locator('.news-source-context').first();
  await sourceContext.waitFor({ state: 'attached', timeout: 20_000 });
  requireCondition((await sourceContext.count()) > 0, 'per-card source context did not render');

  const bridgeStyles = page.locator('link[data-gd022-reader-bridge]');
  requireCondition((await bridgeStyles.count()) === 1, 'reader evidence-bridge stylesheet was not loaded');
}

async function verifyServiceWorker(page) {
  const response = await page.request.get(`${BASE}/service-worker.js`);
  requireCondition(response.ok(), `service worker returned HTTP ${response.status()}`);
  const body = await response.text();
  requireCondition(body.includes("globaldeets-cache-v3"), 'production service worker cache version is stale');
  requireCondition(
    body.includes('self.skipWaiting()'),
    'production service worker does not activate the new shell promptly'
  );
  requireCondition(
    body.includes('self.clients.claim()'),
    'production service worker does not claim existing clients'
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await verifyHomepage(page);
    await verifyNews(page);
    await verifyServiceWorker(page);
    console.log(
      'Production reader verification passed: raw news HTML, rendered homepage, hydrated news evidence bridge, and PWA shell are current.'
    );
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

const { chromium } = require('@playwright/test');

const baseArg = process.argv.find(arg => arg.startsWith('--base='));
const BASE = (baseArg ? baseArg.slice('--base='.length) : 'https://globaldeets.com').replace(/\/$/, '');

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function requireNoHorizontalOverflow(page, label) {
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

async function requireVisible(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 20_000 });
  requireCondition(await locator.isVisible(), `${label} is not visible`);
}

async function requireTouchTarget(locator, label, minimum = 44) {
  await requireVisible(locator, label);
  const box = await locator.boundingBox();
  requireCondition(
    box && box.width >= minimum && box.height >= minimum,
    `${label} touch target is too small: ${box ? `${box.width}x${box.height}` : 'missing'}`
  );
}

async function verifySurface(page, path, coreSelector, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await requireVisible(page.locator(coreSelector).first(), `${label} core content`);
  await page.waitForTimeout(300);
  await requireNoHorizontalOverflow(page, label);
}

async function verifyPhone(browser, viewport, label) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage();

  try {
    await verifySurface(page, '/globe.html', '#globe-hero-container', `${label} globe`);
    await requireTouchTarget(page.locator('.ecosystem-toggle'), `${label} globe ecosystem menu`);
    await requireTouchTarget(page.locator('header .nav-icon-btn').first(), `${label} globe primary nav`);
    await requireTouchTarget(page.locator('.globe-filter-btn').first(), `${label} globe region filter`);

    await verifySurface(page, '/knowledge.html', '.knowledge-hero', `${label} knowledge`);
    await requireTouchTarget(page.locator('.ecosystem-toggle'), `${label} knowledge ecosystem menu`);
    await requireTouchTarget(page.locator('header .nav-icon-btn').first(), `${label} knowledge primary nav`);
    await requireTouchTarget(page.locator('.knowledge-filter-pill').first(), `${label} knowledge category filter`);

    await verifySurface(page, '/worldmap.html', '#main-content', `${label} world map`);
    await requireTouchTarget(page.locator('.ecosystem-toggle'), `${label} world map ecosystem menu`);
    await requireTouchTarget(page.locator('#view-toggle'), `${label} world map view toggle`);
    await requireTouchTarget(page.locator('#panel-toggle'), `${label} world map panel toggle`);
    await requireTouchTarget(page.locator('#location-search'), `${label} world map search`);

    await verifySurface(page, '/timeline.html', '.timeline-container', `${label} timeline`);
    await requireTouchTarget(page.locator('header .nav-icon-btn').first(), `${label} timeline primary nav`);
    await requireVisible(page.locator('.timeline-item').first(), `${label} timeline item`);

    await verifySurface(page, '/observatory/coverage/', '.observatory-shell', `${label} observatory`);
    await requireVisible(page.getByRole('heading', { name: 'Coverage & Evidence Observatory' }), `${label} observatory heading`);
    await requireVisible(page.locator('.contract-strip'), `${label} observatory contract`);

    await verifySurface(page, '/dossiers/santa-ynez-pipeline/', '#dossier-app', `${label} dossier`);
    await requireVisible(page.locator('#dossier-title'), `${label} dossier heading`);
    requireCondition(
      ((await page.locator('#dossier-title').textContent()) || '').includes('Santa Ynez Pipeline'),
      `${label} dossier canonical title is incorrect`
    );
    await requireTouchTarget(page.locator('.dossier-nav a').first(), `${label} dossier navigation`);
    await requireTouchTarget(page.locator('.source-details summary'), `${label} dossier source disclosure`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await verifyPhone(browser, { width: 390, height: 844 }, 'iPhone-class');
    await verifyPhone(browser, { width: 360, height: 800 }, 'narrow Android-class');
    console.log('Secondary mobile production verification passed: globe, knowledge, world map, timeline, observatory, and dossier fit both phone widths with usable primary controls.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});

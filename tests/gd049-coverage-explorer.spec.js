const {expect,test} = require('@playwright/test');
const fingerprint='gd049-fixture';
const records=[
  {sourceId:'premium-times',name:'Premium Times',primaryCountry:'NG',geographicScope:'national',sourceLanguages:['en'],evidenceUrls:['https://example.org/ng']},
  {sourceId:'the-east-african',name:'The East African',primaryCountry:'KE',geographicScope:'regional',sourceLanguages:['en'],evidenceUrls:['https://example.org/ke']},
  {sourceId:'bbc-world',name:'BBC World',primaryCountry:'GB',geographicScope:'global',sourceLanguages:['en'],evidenceUrls:['https://example.org/gb']}
];
const fixture=(data)=>({status:200,contentType:'application/json',body:JSON.stringify(data)});
async function setup(page, options={}) {
  await page.route('**/api/news**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/news/sources')return route.fulfill(fixture({sourceFingerprint:fingerprint,reviewedAt:'2026-10-01',validation:{valid:options.invalid!==true},sources:records}));
    if(url.pathname==='/api/news/coverage')return route.fulfill(fixture({sourceFingerprint:fingerprint,regions:[{region:'africa',sourceIds:['premium-times','the-east-african']},{region:'global',sourceIds:['bbc-world']}],gaps:[{region:'africa',id:'source-language-diversity:africa',detail:'Africa currently depends on English-language feeds.'},{region:null,id:'portfolio-language-concentration:en',detail:'The source portfolio is highly concentrated in English-language feeds.'}]}));
    if(url.pathname==='/api/news/health')return route.fulfill(fixture({
      sourceFingerprint:options.badHealth?'mismatch':fingerprint,
      generatedAt:'2026-10-10T08:00:00Z',
      sourceHealth:[{sourceId:'premium-times',lastFetchStartedAt:'2026-10-10T08:00:00Z',
        lastFetchSucceededAt:options.failedProbe?null:'2026-10-10T08:00:00Z',
        lastError:options.failedProbe?'HTTP 503':null}]
    }));
    if(url.pathname==='/api/news')return route.fulfill(fixture({sourceFingerprint:options.badNews?'mismatch':fingerprint,items:options.empty?[]:[
      {sourceId:'bbc-world',source:'BBC World',headline:'Global story',sourceUrl:'https://example.org/world'},
      {sourceId:'premium-times',source:'Premium Times',headline:'Nigeria reporting',sourceUrl:'https://example.org/report'}
    ]}));
    return route.fulfill({status:404});
  });
}
test('regional selection displays African publisher origins, not globally routed stories',async({page})=>{
  await setup(page);await page.goto('/index.html');
  await page.locator('[data-coverage-region="africa"]').click();
  await expect(page.locator('#coverage-selection')).toContainText('Africa');
  await expect(page.locator('#coverage-sources .coverage-source')).toHaveCount(2);
  await expect(page.locator('#coverage-metrics')).toContainText('2');
  await expect(page.locator('#coverage-sources')).toContainText('Nigeria');
  await expect(page.locator('#coverage-sources')).toContainText('Kenya');
  await expect(page.locator('#coverage-reports')).toContainText('Nigeria reporting');
  await expect(page.locator('#coverage-reports')).not.toContainText('Global story');
  await expect(page.locator('#coverage-gaps')).toContainText('English-language feeds');
  await expect(page.locator('#coverage-feed-link')).toHaveAttribute('href','news.html?region=africa');
  await expect(page.locator('#coverage-map svg')).toBeVisible();
  await expect(page.locator('#coverage-map #ng')).toHaveClass(/is-covered/);
});
test('country selection means publisher origin and maintains provenance links',async({page})=>{
  await setup(page);await page.goto('/index.html');
  await page.locator('#coverage-map #ng').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#coverage-selection')).toContainText('Nigeria');
  await expect(page.locator('#coverage-sources .coverage-source')).toHaveCount(1);
  await expect(page.locator('#coverage-sources')).toContainText('Publisher country: Nigeria');
  await expect(page.locator('#coverage-summary')).toContainText('does not locate news events');
  await expect(page.locator('#coverage-sources a')).toHaveAttribute('href','https://example.org/ng');
  await expect(page.locator('#coverage-sources')).toContainText('Publisher provenance reviewed: 2026-10-01');
  await expect(page.locator('#coverage-map svg')).toHaveAttribute('role','group');
});
test('empty reports and registry failure remain explicit',async({page})=>{
  await setup(page,{empty:true});await page.goto('/index.html');
  await expect(page.locator('#coverage-reports')).toContainText('No reports from the selected');
});
test('invalid source registry fails closed without publisher assertions',async({page})=>{
  await setup(page,{invalid:true});await page.goto('/index.html');
  await expect(page.locator('#coverage-status')).toContainText('Coverage registry unavailable');
  await expect(page.locator('#coverage-sources')).not.toContainText('Premium Times');
  await expect(page.locator('[data-coverage-region="africa"]')).toBeDisabled();
  await page.locator('#coverage-reset').evaluate(button => button.click());
  await expect(page.locator('#coverage-status')).toContainText('Coverage registry unavailable');
});
test('homepage loads without three.js or a globe render requirement',async({page})=>{
  await setup(page);await page.goto('/index.html');
  await expect(page.locator('script[src*="globe-hero"], script[src*="globe.gl"]')).toHaveCount(0);
  await expect(page.locator('#globe-hero-container')).toHaveCount(0);
  await expect(page.locator('#coverage-explorer')).toBeVisible();
});

test('all-publishers view retains canonical portfolio-wide coverage gaps',async({page})=>{
  await setup(page);await page.goto('/index.html');
  await expect(page.locator('#coverage-gaps')).toContainText('highly concentrated in English-language feeds');
});
test('mismatched news fingerprint cannot appear beside the reviewed registry',async({page})=>{
  await setup(page,{badNews:true});await page.goto('/index.html');
  await expect(page.locator('#coverage-sources')).toContainText('Premium Times');
  await expect(page.locator('#coverage-reports')).toContainText('Reporting is unavailable');
  await expect(page.locator('#coverage-reports')).not.toContainText('Nigeria reporting');
});
test('failed, stale and unavailable health observations are distinguished',async({page})=>{
  await setup(page,{failedProbe:true});await page.goto('/index.html');
  await expect(page.locator('#coverage-sources')).toContainText('Latest feed probe failed');
  await expect(page.locator('#coverage-sources')).not.toContainText('Last successful feed check');
  await page.unroute('**/api/news**');
});
test('outdated health observation is labeled stale and registry mismatch is unavailable',async({page})=>{
  await setup(page);await page.goto('/index.html');
  await expect(page.locator('#coverage-sources')).toContainText('Stale successful feed observation');
});
test('bad health fingerprint does not mislabel publishers as failed',async({page})=>{
  await setup(page,{badHealth:true});await page.goto('/index.html');
  await expect(page.locator('#coverage-sources')).toContainText('Feed health unavailable');
  await expect(page.locator('#coverage-sources')).not.toContainText('Latest feed probe failed');
});
test('rapid region changes cannot let a previous feed response overwrite current selection',async({page})=>{
  await setup(page);
  await page.route('**/api/news?region=africa**',async route=>{
    await new Promise(resolve=>setTimeout(resolve,300));
    if(!route.request().isNavigationRequest()) {
      try {await route.fulfill(fixture({sourceFingerprint:fingerprint,items:[{
        sourceId:'premium-times',source:'Premium Times',headline:'Delayed Africa report',sourceUrl:'https://example.org/africa'
      }]}));} catch { /* aborted stale request */ }
    }
  });
  await page.goto('/index.html');
  await page.locator('[data-coverage-region="africa"]').click();
  await page.locator('[data-coverage-region="europe"]').click();
  await expect(page.locator('#coverage-selection')).toContainText('Europe');
  await expect(page.locator('#coverage-reports')).not.toContainText('Delayed Africa report');
  await page.waitForTimeout(350);
  await expect(page.locator('#coverage-selection')).toContainText('Europe');
  await expect(page.locator('#coverage-reports')).not.toContainText('Delayed Africa report');
});

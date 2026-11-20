const { expect, test } = require('@playwright/test');

const FINGERPRINT = 'gd050-source-network-fixture';
const records = [
  {sourceId:'alpha',name:'Alpha Daily',organizationName:'Alpha Editorial',ownershipOperator:'Shared Operator',
    primaryCountry:'GB',region:'europe',geographicScope:'national',sourceLanguages:['en'],
    reviewedAt:'2026-10-01',evidenceUrls:['https://example.org/alpha']},
  {sourceId:'beta',name:'Beta Radio',organizationName:'Beta Editorial',ownershipOperator:'Shared Operator',
    primaryCountry:'FR',region:'europe',geographicScope:'regional',sourceLanguages:['fr'],
    reviewedAt:'2026-10-02',evidenceUrls:['https://example.org/beta']},
  {sourceId:'gamma',name:'Gamma News',organizationName:'Gamma Editorial',ownershipOperator:'Different Operator',
    primaryCountry:'NG',region:'africa',geographicScope:'national',sourceLanguages:['en'],
    reviewedAt:'2026-10-03',evidenceUrls:['javascript:alert(1)','https://example.org/gamma']},
  {sourceId:'unknown',name:'Unresolved Press',organizationName:'Unresolved Press',
    primaryCountry:'US',region:'americas',geographicScope:'national',sourceLanguages:['en'],evidenceUrls:[]}
];

async function mockRegistry(page, {invalid=false, missing=false, recordsOverride=records}={}) {
  await page.route('**/api/news/sources', route => {
    if(missing) return route.fulfill({status:503,body:'unavailable'});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      sourceFingerprint:FINGERPRINT,validation:{valid:!invalid},
      reviewedAt:'2026-10-01',totalSources:recordsOverride.length,sources:recordsOverride
    })});
  });
}

test('source relationships load from a validated, versioned publisher registry',async({page})=>{
  await mockRegistry(page);
  await page.goto('/source-network.html');
  await expect(page.getByRole('heading',{name:'Who is behind the news?'})).toBeVisible();
  await expect(page.locator('#sn-count')).toHaveText('4');
  await expect(page.locator('#sn-operator-count')).toHaveText('2');
  await expect(page.locator('#sn-country-count')).toHaveText('4');
  await expect(page.locator('#sn-publishers button')).toHaveCount(4);
  await expect(page.locator('#sn-review')).toContainText('not verified ultimate ownership groups');
  await expect(page.locator('#sn-status')).toContainText('Reviewed source registry loaded');
});

test('source relationships expose documented same-label peers, not inferred ownership',async({page})=>{
  await mockRegistry(page);
  await page.goto('/source-network.html');
  await page.getByRole('button',{name:/Alpha Daily/}).click();
  await expect(page.locator('#sn-inspector')).toContainText('Shared Operator');
  await expect(page.locator('#sn-inspector')).toContainText('Beta Radio');
  await expect(page.locator('#sn-inspector')).toContainText('do not automatically prove a complete ownership chain');
  await expect(page.locator('#sn-inspector a[href="https://example.org/alpha"]')).toHaveCount(1);
  await page.locator('.sn-inline-select').click();
  await expect(page.locator('#sn-inspector h3')).toHaveText('Beta Radio');
});

test('search and region controls filter the roster without inventing source gaps',async({page})=>{
  await mockRegistry(page);
  await page.goto('/source-network.html');
  await page.locator('#sn-region').selectOption('europe');
  await expect(page.locator('#sn-publishers button')).toHaveCount(2);
  await page.locator('#sn-search').fill('Beta');
  await expect(page.locator('#sn-publishers button')).toHaveCount(1);
  await expect(page.locator('#sn-publishers')).toContainText('Beta Radio');
  await page.locator('#sn-search').fill('fictional network');
  await expect(page.locator('#sn-publishers')).toContainText('No publishers match');
  await page.locator('#sn-clear').click();
  await expect(page.locator('#sn-publishers button')).toHaveCount(4);
});

test('an unknown operator remains explicitly unresolved, and unsafe evidence links are excluded',async({page})=>{
  await mockRegistry(page);
  await page.goto('/source-network.html');
  await page.getByRole('button',{name:/Unresolved Press/}).click();
  await expect(page.locator('#sn-inspector')).toContainText('Operator identity is not recorded');
  await page.getByRole('button',{name:/Gamma News/}).click();
  await expect(page.locator('#sn-inspector a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('#sn-inspector a[href="https://example.org/gamma"]')).toHaveCount(1);
});

test('invalid and failed registries fail closed rather than assert relationships',async({page})=>{
  await mockRegistry(page,{invalid:true});
  await page.goto('/source-network.html');
  await expect(page.locator('#sn-status')).toContainText('unavailable or inconsistent');
  await expect(page.locator('#sn-search')).toBeDisabled();
  await expect(page.locator('#sn-inspector')).toContainText('No verified relationship data');
  await expect(page.locator('#sn-publishers')).not.toContainText('Alpha Daily');
});

test('mobile layout has no horizontal overflow and enables keyboard details',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await mockRegistry(page);
  await page.goto('/source-network.html');
  await expect(page.locator('#sn-search')).toBeEnabled();
  await page.getByRole('button',{name:/Alpha Daily/}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sn-inspector h3')).toHaveText('Alpha Daily');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(overflow).toBe(false);
});

test('a direct news attribution link selects the exact reviewed source',async({page})=>{
  await mockRegistry(page);
  await page.goto('/source-network.html?source=gamma');
  await expect(page.locator('#sn-inspector h3')).toHaveText('Gamma News');
  await expect(page.locator('#sn-publishers button[aria-pressed="true"]')).toContainText('Gamma News');
  await page.goto('/source-network.html?source=not-a-reviewed-source');
  await expect(page.locator('#sn-inspector h3')).toHaveText('Choose a publisher');
});


test('GD-051 shows dated evidence-backed paths, then fails closed if fingerprint differs',async({page})=>{
  await mockRegistry(page);
  const graph={
    schemaVersion:1, sourceFingerprint:FINGERPRINT, validation:{valid:true},
    entities:[
      {id:'operator',name:'Alpha Group',country:'GB'},
      {id:'owner',name:'Trust',country:'GB'},
    ],
    edges:[
      {id:'one',fromSourceId:'alpha',relation:'operated-by',toEntityId:'operator',
        summary:'Recorded operation, not editorial coordination.',reviewedAt:'2026-11-19',
        evidence:[{title:'Operating disclosure',url:'https://example.org/operator'}]},
      {id:'two',fromEntityId:'operator',relation:'owned-by',toEntityId:'owner',
        summary:'The group is owned by the Trust.',reviewedAt:'2026-11-19',
        evidence:[{title:'Ownership filing',url:'https://example.org/ownership'}]},
    ],
  };
  await page.route('**/api/news/relationships',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify(graph)
  }));
  await page.goto('/source-network.html?source=alpha');
  await expect(page.locator('.sn-edge')).toHaveCount(2);
  await expect(page.locator('.sn-reviewed-links')).toContainText('Trust');
  await expect(page.locator('.sn-reviewed-links a[href="https://example.org/ownership"]')).toHaveCount(1);
  await page.unroute('**/api/news/relationships');
  await page.route('**/api/news/relationships',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({...graph,sourceFingerprint:'wrong'})
  }));
  await page.reload();
  await expect(page.locator('.sn-reviewed-links')).toContainText('evidence is unavailable');
  await expect(page.locator('.sn-edge')).toHaveCount(0);
});

test('GD-051 rejects unsafe evidence URLs without taking down publisher registry',async({page})=>{
  await mockRegistry(page);
  await page.route('**/api/news/relationships',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({
      schemaVersion:1,sourceFingerprint:FINGERPRINT,validation:{valid:true},
      entities:[{id:'operator',name:'Operator',country:'US'}],
      edges:[{id:'one',fromSourceId:'alpha',relation:'owned-by',toEntityId:'operator',
        summary:'Bad fixture',reviewedAt:'2026-11-19',
        evidence:[{title:'unsafe',url:'javascript:alert(1)'}]}]
    })
  }));
  await page.goto('/source-network.html?source=alpha');
  await expect(page.locator('.sn-reviewed-links')).toContainText('evidence is unavailable');
  await expect(page.locator('#sn-publishers button')).toHaveCount(4);
});

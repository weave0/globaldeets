const {expect,test}=require('@playwright/test');
const fixture={
  "version": "gd056-discovery-v1",
  "scope": "configured-feeds-and-reviewed-navigation-links",
  "reviewedAt": "2026-11-25",
  "sourceFingerprint": "test-fp",
  "admissionFingerprint": "test-admission",
  "validation": {
    "valid": true
  },
  "rules": {
    "automaticAdmission": false,
    "eventLocationInference": false,
    "externalArticleCollection": false,
    "languageEditionImpliesIndependentPublisher": false,
    "linkImpliesReusePermission": false
  },
  "counts": {
    "monitored": 1,
    "research": 1,
    "linkOnly": 2
  },
  "feedLanguages": [
    "en"
  ],
  "entries": [
    {
      "id": "al-jazeera",
      "name": "Al Jazeera",
      "status": "monitored",
      "region": "middle-east",
      "focus": "global",
      "country": "QA",
      "languages": [
        "en"
      ],
      "languageBasis": "configured-feed",
      "relatedSourceId": null,
      "rights": "permission-required",
      "reviewedAt": "2026-11-25",
      "note": "Configured feed.",
      "evidenceUrls": [
        "https://example.org/provenance"
      ]
    },
    {
      "id": "gv",
      "name": "Global Voices",
      "status": "research",
      "region": "global",
      "focus": "International",
      "languages": [
        "en",
        "sw"
      ],
      "languageBasis": "publisher-page-or-listed-edition",
      "relatedSourceId": null,
      "url": "https://example.org/gv",
      "editions": [
        {
          "lang": "sw",
          "url": "https://example.org/sw"
        }
      ],
      "rights": "verified-public-use",
      "rightsReviewedAt": "2026-11-25",
      "health": "not-certified",
      "itemLevelReviewRequired": true,
      "reviewedAt": "2026-11-25",
      "note": "One family.",
      "evidenceUrls": [
        "https://example.org/policy"
      ],
      "policyUrls": [
        "https://example.org/policy"
      ]
    },
    {
      "id": "al-jazeera-arabic",
      "name": "Al Jazeera Arabic",
      "region": "middle-east",
      "focus": "Arabic-language international news",
      "languages": [
        "ar"
      ],
      "url": "https://www.aljazeera.net/",
      "note": "Arabic-language edition of the already monitored Al Jazeera network. Not an additional independent publisher.",
      "relatedSourceId": "al-jazeera",
      "evidenceUrls": [
        "https://www.aljazeera.net/",
        "https://www.aljazeera.net/%D8%A7%D8%AA%D9%81%D8%A7%D9%82%D9%8A%D8%A9-%D8%A7%D9%84%D9%85%D9%88%D9%82%D8%B9"
      ],
      "reviewedAt": "2026-11-25",
      "status": "link-only",
      "languageBasis": "publisher-page-or-listed-edition",
      "rights": "not-reviewed",
      "editions": []
    },
    {
      "id": "prothom-alo",
      "name": "Prothom Alo",
      "region": "asia",
      "focus": "Bangladesh",
      "languages": [
        "bn"
      ],
      "url": "https://www.prothomalo.com/",
      "note": "Bengali-language news site with Bangladesh and world coverage.",
      "relatedSourceId": null,
      "evidenceUrls": [
        "https://www.prothomalo.com/"
      ],
      "reviewedAt": "2026-11-25",
      "status": "link-only",
      "languageBasis": "publisher-page-or-listed-edition",
      "rights": "not-reviewed",
      "editions": []
    }
  ]
};
async function setup(page,payload=fixture) {
  await page.route('**/api/news/discovery',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)}));
}
test('directory separates monitored feeds, candidates and direct links with shareable language filters',async({page})=>{
  await setup(page);
  await page.goto('/source-discovery.html');
  await expect(page.locator('.discovery-record')).toHaveCount(3);
  await expect(page.locator('#discovery-monitored')).toHaveText('1');
  await expect(page.locator('#discovery-feed-languages')).toHaveText('1');
  await expect(page.locator('#discovery-gap')).toContainText('English 1');
  await page.locator('#discovery-language').selectOption('ar');
  await expect(page.locator('.discovery-record')).toHaveCount(1);
  await expect(page.locator('.discovery-record')).toContainText('Al Jazeera Arabic');
  await expect(page.locator('.discovery-record a[href="/source-network.html?source=al-jazeera"]')).toHaveCount(1);
  await expect(page).toHaveURL(/lang=ar/);
  await page.reload();
  await expect(page.locator('#discovery-language')).toHaveValue('ar');
  await page.locator('#discovery-clear').click();
  await page.locator('#discovery-status-filter').selectOption('monitored');
  await expect(page.locator('.discovery-record[data-status="monitored"]')).toHaveCount(1);
});
test('language editions remain one candidate and missing inventory languages are discoverable',async({page})=>{
  await setup(page);
  await page.setViewportSize({width:360,height:800});
  await page.goto('/source-discovery.html?lang=sw');
  await expect(page.locator('.discovery-record')).toHaveCount(1);
  await expect(page.locator('.discovery-editions a')).toHaveAttribute('href','https://example.org/sw');
  await expect(page.locator('.discovery-editions a')).toBeVisible();
  await expect(page.locator('.discovery-record')).toContainText('Feed research only');
  await page.locator('#discovery-language').selectOption('unrepresented');
  await expect(page.locator('.discovery-record')).toHaveCount(3);
  await page.locator('#discovery-search').fill('nothing matches');
  await expect(page.locator('#discovery-results')).toContainText('does not mean reporting');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
});
test('forged rights or counts fail closed instead of asserting sources',async({page})=>{
  for(const payload of [{...fixture,counts:{...fixture.counts,monitored:99}},
    {...fixture,entries:fixture.entries.map(x=>x.status==='link-only'?{...x,rights:'verified-public-use'}:x)},
    {...fixture,entries:fixture.entries.map(x=>x.id==='gv'?{...x,url:'javascript:alert(1)'}:x)}]){
    await setup(page,payload);
    await page.goto('/source-discovery.html');
    await expect(page.locator('#discovery-status')).toContainText('unavailable or inconsistent');
    await expect(page.locator('.discovery-record')).toHaveCount(0);
    await expect(page.locator('#discovery-language')).toBeDisabled();
    await page.unroute('**/api/news/discovery');
  }
});
test('discovery authority disappears when the connection is lost',async({page})=>{
  await setup(page);
  await page.goto('/source-discovery.html');
  await expect(page.locator('.discovery-record')).toHaveCount(3);
  await page.evaluate(()=>window.dispatchEvent(new window.Event('offline')));
  await expect(page.locator('.discovery-record')).toHaveCount(0);
  await expect(page.locator('#discovery-status')).toContainText('unavailable');
});

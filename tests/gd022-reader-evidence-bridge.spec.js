const { expect, test } = require('@playwright/test');

const news = {
  cached: false,
  total: 2,
  admissionFingerprint: 'gd022-fixture',
  displayPolicyVersion: 'gd021-admission-v1',
  items: [
    {
      id: 'guardian-1',
      source: 'Guardian',
      sourceId: 'guardian',
      headline: 'Restricted source story',
      summary: null,
      sourceUrl: 'https://example.com/guardian',
      region: 'global',
      originalLang: 'en',
      translated: false,
      published: '2026-09-13T12:00:00Z',
      allowedUseStatus: 'permission-required',
      displayMode: 'headline-link',
    },
    {
      id: 'mercopress-1',
      source: 'Mercopress',
      sourceId: 'mercopress',
      headline: 'Bounded-use source story',
      summary: 'A bounded publisher excerpt is visible.',
      sourceUrl: 'https://example.com/mercopress',
      region: 'americas',
      originalLang: 'en',
      translated: false,
      published: '2026-09-13T11:00:00Z',
      allowedUseStatus: 'verified-public-use',
      displayMode: 'current-use',
    },
  ],
};

const sources = {
  totalSources: 21,
  sources: [
    {
      sourceId: 'guardian',
      name: 'Guardian',
      sourceClass: 'newsroom',
      evidenceRole: 'reporting',
      geographicScope: 'global',
      ownershipOperator: 'The Scott Trust Limited',
    },
    {
      sourceId: 'mercopress',
      name: 'Mercopress',
      sourceClass: 'news-agency',
      evidenceRole: 'reporting',
      geographicScope: 'regional',
      ownershipOperator: 'MercoPress',
    },
  ],
};

const admission = {
  summary: {
    reviewedSources: 21,
    legacyUnreviewedSources: 0,
    unknownRightsSourceIds: ['nhk', 'npr', 'the-hindu'],
  },
  liveAdmissions: [
    {
      sourceId: 'guardian',
      allowedUseStatus: 'permission-required',
      reviewedAt: '2026-09-03',
    },
    {
      sourceId: 'mercopress',
      allowedUseStatus: 'verified-public-use',
      reviewedAt: '2026-09-13',
    },
  ],
};

const coverage = {
  totalSources: 21,
  regions: [
    { region: 'americas', sourceCount: 5, languageCount: 1, languages: ['en'] },
  ],
  gaps: [
    {
      id: 'source-language-diversity:americas',
      type: 'source-language-diversity',
      severity: 'high',
      region: 'americas',
      detail: 'Americas routing coverage is concentrated in one source language.',
      nextAction: 'Add reviewed non-English source coverage.',
    },
  ],
};

const health = {
  generatedAt: new Date().toISOString(),
  healthySources: 20,
  totalSources: 21,
  sourceHealth: [],
};

async function routeGovernedSurface(page) {
  await page.route('**/api/news**', async route => {
    const url = new URL(route.request().url());
    const bodies = {
      '/api/news/sources': sources,
      '/api/news/admission': admission,
      '/api/news/coverage': coverage,
      '/api/news/health': health,
    };
    const body = bodies[url.pathname] || news;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('news reader surfaces governed provenance and rights without inventing trust scores', async ({ page }) => {
  await routeGovernedSurface(page);
  await page.goto('/news.html');

  await expect(page.locator('#news-grid .news-card')).toHaveCount(2);
  await expect(page.locator('#news-context-summary')).toContainText('21 rights records reviewed');
  await expect(page.locator('#news-context-summary')).toContainText('3 reviewed rights states still unresolved');

  const guardian = page.locator('.news-card').filter({ hasText: 'Restricted source story' });
  await guardian.locator('.news-source-context summary').click();
  await expect(guardian.locator('.news-rights-state')).toContainText('Publisher permission required');
  await expect(guardian.locator('.news-rights-state')).toContainText('withholds the publisher summary');
  await expect(guardian.locator('.news-source-facts')).toContainText('The Scott Trust Limited');
  await expect(guardian.locator('.news-source-context-caveat')).toContainText('not a truth score');
  await expect(guardian.locator('.news-summary')).toHaveCount(0);

  const merco = page.locator('.news-card').filter({ hasText: 'Bounded-use source story' });
  await merco.locator('.news-source-context summary').click();
  await expect(merco.locator('.news-rights-state')).toContainText('Bounded reuse reviewed');
  await expect(merco.locator('.news-rights-state')).toContainText('says nothing about whether the story is true');
  await expect(merco.locator('.news-summary')).toHaveCount(1);
  await expect(page.getByText(/bias rating/i)).toBeVisible();
});

test('region coverage context changes with routing filter without claiming story locality', async ({ page }) => {
  await routeGovernedSurface(page);
  await page.goto('/news.html');
  await page.getByRole('button', { name: 'Americas' }).click();

  await expect(page.locator('#news-context-summary')).toContainText('5 source endpoints route into Americas');
  await expect(page.locator('#news-context-gaps')).toContainText('concentrated in one source language');
  await expect(page.locator('.news-context-caveat')).toContainText('not a claim about publisher origin, story locality');
});

test('core headlines survive complete trust-surface failure', async ({ page }) => {
  await page.route('**/api/news**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/news') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(news) });
      return;
    }
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/news.html');
  await expect(page.locator('#news-grid .news-card')).toHaveCount(2);
  await expect(page.getByText('Restricted source story')).toBeVisible();
  await expect(page.locator('#news-context-summary')).toContainText('temporarily unavailable');
  await expect(page.locator('.news-source-context')).toHaveCount(0);
});

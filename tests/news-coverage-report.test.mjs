import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoverageReport, collectCoverageReport } from '../tools/report-news-coverage.mjs';

function response(body, { status = 200, headers = {} } = {}) {
  return new globalThis.Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function minimalResponses() {
  const core = {
    sources: {
      body: {
        sourceFingerprint: 'source-v1',
        reviewedAt: '2026-09-03',
        validation: { valid: true },
        sources: [
          {
            sourceId: 'alpha',
            name: 'Alpha News',
            primaryCountry: 'AA',
            geographicScope: 'national',
            locality: 'local',
            organizationName: 'Alpha Group',
            ownershipOperator: 'Alpha Group',
            sourceClass: 'newsroom',
            evidenceRole: 'reporting',
            sourceLanguages: ['en'],
          },
          {
            sourceId: 'beta',
            name: 'Beta News',
            primaryCountry: 'BB',
            geographicScope: 'regional',
            locality: 'regional',
            organizationName: 'Beta Network',
            ownershipOperator: 'Beta Network',
            sourceClass: 'news-agency',
            evidenceRole: 'wire-service',
            sourceLanguages: ['es'],
          },
        ],
      },
    },
    admission: {
      body: {
        admissionFingerprint: 'admission-v1',
        reviewedAt: '2026-09-13',
        validation: { valid: true },
        liveAdmissions: [
          {
            sourceId: 'alpha',
            endpointUrl: 'https://alpha.example/feed',
            endpointType: 'rss',
            endpointAuthority: 'first-party',
            allowedUseStatus: 'verified-public-use',
            currentUse: ['headline-link'],
            permittedUse: ['headline-link'],
            reviewState: 'reviewed',
            endpointEvidenceUrls: ['https://alpha.example/about'],
            usagePolicyUrls: ['https://alpha.example/terms'],
          },
          {
            sourceId: 'beta',
            endpointUrl: 'https://beta.example/feed',
            endpointType: 'rss',
            endpointAuthority: 'first-party',
            allowedUseStatus: 'permission-required',
            reviewState: 'reviewed',
          },
        ],
        researchCandidates: [],
      },
    },
    health: {
      body: {
        generatedAt: '2026-10-10T18:00:00.000Z',
        cacheAgeSeconds: 60,
        healthySources: 1,
        totalSources: 2,
        sourceHealth: [
          {
            sourceId: 'alpha',
            region: 'global',
            lang: 'en',
            url: 'https://alpha.example/feed',
            lastStatus: 200,
            lastError: null,
            storyCount: 3,
          },
          {
            sourceId: 'beta',
            region: 'americas',
            lang: 'es',
            url: 'https://beta.example/feed',
            lastStatus: 200,
            lastError: 'No stories parsed from source response.',
          },
        ],
      },
    },
    coverage: {
      body: {
        sourceFingerprint: 'source-v1',
        regions: [{ region: 'global' }, { region: 'americas' }],
        totalSources: 2,
        totalRegions: 2,
        totalLanguages: 2,
        englishSourceShare: 0.5,
        primarySourceInputs: 0,
        subnationalReporting: {
          sourceCount: 0,
          jurisdictionCount: 0,
          jurisdictionIds: [],
        },
        gaps: [{ id: 'source-admission:remediation-required', severity: 'high' }],
      },
    },
  };
  const feeds = {
    global: {
      body: {
        total: 2,
        cached: true,
        sourceFingerprint: 'source-v1',
        admissionFingerprint: 'admission-v1',
        items: [
          {
            sourceId: 'alpha',
            sourceUrl: 'https://reports.example/story/one#top',
            published: '2026-10-10T10:00:00.000Z',
            allowedUseStatus: 'verified-public-use',
            displayMode: 'headline-link',
          },
          {
            sourceId: 'beta',
            sourceUrl: 'https://reports.example/story/one',
            published: 'invalid date',
            allowedUseStatus: 'permission-required',
            displayMode: 'headline-link',
          },
        ],
      },
    },
    americas: {
      body: {
        total: 2,
        cached: true,
        items: [
          {
            sourceId: 'alpha',
            sourceUrl: 'https://reports.example/story/one',
            published: '2026-10-10T10:00:00.000Z',
          },
          {
            sourceId: 'beta',
            sourceUrl: 'https://reports.example/story/two',
            published: null,
          },
        ],
      },
    },
  };
  return { core, feeds };
}

test('coverage report keeps routing, publisher provenance, rights, health, and feed samples distinct', () => {
  const report = buildCoverageReport({
    capturedAt: '2026-10-10T18:30:00.000Z',
    baseUrl: 'https://globaldeets.com',
    ...minimalResponses(),
  });

  assert.equal(report.portfolio.configuredSourceCount, 2);
  assert.deepEqual(report.portfolio.byFeedRoutingRegion, [
    { key: 'americas', count: 1 },
    { key: 'global', count: 1 },
  ]);
  assert.deepEqual(report.portfolio.byPublisherCountry, [
    { key: 'AA', count: 1 },
    { key: 'BB', count: 1 },
  ]);
  assert.deepEqual(report.portfolio.byAllowedUseStatus, [
    { key: 'permission-required', count: 1 },
    { key: 'verified-public-use', count: 1 },
  ]);
  assert.equal(report.health.observedHealthStates.find(x => x.key === 'error').count, 1);
  assert.deepEqual(report.health.sourcesWithErrors, [
    {
      sourceId: 'beta',
      name: 'Beta News',
      httpStatus: 200,
      error: 'No stories parsed from source response.',
    },
  ]);
  assert.equal(report.sampledFeedViews.storyAppearancesAcrossViews, 4);
  assert.equal(report.sampledFeedViews.distinctCanonicalArticleUrlsAcrossViews, 2);
  assert.equal(report.sampledFeedViews.canonicalUrlsPresentUnderMultipleSourceIds, 1);
  assert.equal(report.sampledFeedViews.views[0].duplicateCanonicalArticleUrlCount, 0);
  assert.equal(report.sampledFeedViews.views[1].duplicateCanonicalArticleUrlCount, 1);
  assert.equal(report.sampledFeedViews.views[0].invalidOriginalArticleUrlCount, 0);
  assert.equal(report.sampledFeedViews.views[1].missingOrInvalidPublicationTimeCount, 1);
  assert.match(report.interpretationLimits[0], /does not measure event geography/);
});

test('coverage collection derives route queries from the canonical coverage response', async () => {
  const { core, feeds } = minimalResponses();
  const requested = [];
  const responses = {
    '/api/news/sources': core.sources.body,
    '/api/news/admission': core.admission.body,
    '/api/news/health': core.health.body,
    '/api/news/coverage': core.coverage.body,
    '/api/news?region=global&limit=100': feeds.global.body,
    '/api/news?region=americas&limit=100': feeds.americas.body,
  };
  const report = await collectCoverageReport('https://globaldeets.com', async (url, options) => {
    const requestUrl = new globalThis.URL(url);
    requested.push({ url: new globalThis.URL(requestUrl), options });
    requestUrl.searchParams.delete('_coverage_probe');
    const key = `${requestUrl.pathname}${requestUrl.search}`;
    if (!(key in responses)) return response({}, { status: 404 });
    return response(responses[key], {
      headers: { Age: '0', 'CF-Cache-Status': 'BYPASS', ETag: '"fixture"' },
    });
  });

  assert.equal(requested.length, 6);
  assert.deepEqual(
    requested
      .map(({ url }) => url.searchParams.get('region'))
      .filter(Boolean)
      .sort(),
    ['americas', 'global']
  );
  assert.ok(requested.every(({ options }) => options.cache === 'no-store'));
  assert.ok(requested.every(({ url }) => url.searchParams.has('_coverage_probe')));
  assert.equal(report.apiObservations.coverage.cfCacheStatus, 'BYPASS');
  assert.equal(report.sampledFeedViews.routeCount, 2);
});

test('coverage collection fails explicitly when a required API is unavailable', async () => {
  await assert.rejects(
    collectCoverageReport('https://globaldeets.com', async () => response({}, { status: 503 })),
    /returned HTTP 503/
  );
});

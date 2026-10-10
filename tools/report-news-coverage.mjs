import { error as logError } from 'node:console';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL, URL } from 'node:url';

const FEED_PAGE_LIMIT = 100;
const API_PATHS = {
  sources: '/api/news/sources',
  admission: '/api/news/admission',
  health: '/api/news/health',
  coverage: '/api/news/coverage',
};

export async function collectCoverageReport(
  baseUrl = process.env.GLOBALDEETS_BASE_URL || 'https://globaldeets.com',
  fetchImpl = globalThis.fetch
) {
  const origin = new URL(baseUrl);
  if (!['http:', 'https:'].includes(origin.protocol)) {
    throw new TypeError('Base URL must use HTTP or HTTPS');
  }

  const capturedAt = new Date().toISOString();
  const probeId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const coreResults = await Promise.all(
    Object.entries(API_PATHS).map(async ([key, path]) => [
      key,
      await fetchJson(origin, path, probeId, fetchImpl),
    ])
  );
  const core = Object.fromEntries(coreResults);
  const regions = core.coverage.body.regions;
  if (!Array.isArray(regions) || regions.some(entry => typeof entry.region !== 'string')) {
    throw new TypeError('Coverage API did not return its canonical routing-region inventory');
  }

  const feedResults = await Promise.all(
    regions.map(async ({ region }) => [
      region,
      await fetchJson(
        origin,
        `/api/news?region=${encodeURIComponent(region)}&limit=${FEED_PAGE_LIMIT}`,
        probeId,
        fetchImpl
      ),
    ])
  );

  return buildCoverageReport({
    capturedAt,
    baseUrl: origin.origin,
    core,
    feeds: Object.fromEntries(feedResults),
  });
}

export function buildCoverageReport({ capturedAt, baseUrl, core, feeds }) {
  const sourceRows = requiredArray(core.sources.body.sources, 'source provenance');
  const admissions = requiredArray(core.admission.body.liveAdmissions, 'source admissions');
  const health = requiredArray(core.health.body.sourceHealth, 'source health');
  const coverage = core.coverage.body;
  const admissionById = new Map(admissions.map(entry => [entry.sourceId, entry]));
  const healthById = new Map(health.map(entry => [entry.sourceId, entry]));
  const routeReports = Object.entries(feeds)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([region, result]) => summarizeFeed(region, result.body));

  const sourceAppearances = new Map();
  const urlOwners = new Map();
  for (const [region, result] of Object.entries(feeds)) {
    for (const item of requiredArray(result.body.items, `${region} feed`)) {
      const sourceId = item.sourceId || 'unknown';
      sourceAppearances.set(sourceId, (sourceAppearances.get(sourceId) || 0) + 1);
      const canonicalUrl = canonicalArticleUrl(item.sourceUrl);
      if (canonicalUrl) {
        const owners = urlOwners.get(canonicalUrl) || new Set();
        owners.add(sourceId);
        urlOwners.set(canonicalUrl, owners);
      }
    }
  }

  const sources = sourceRows
    .map(entry => {
      const admission = admissionById.get(entry.sourceId) || {};
      const observation = healthById.get(entry.sourceId) || {};
      return {
        sourceId: entry.sourceId,
        name: entry.name,
        endpointUrl: admission.endpointUrl || observation.url || null,
        feedRoutingRegion: observation.region || null,
        sourceLanguage: entry.sourceLanguages?.[0] || observation.lang || null,
        publisherCountry: entry.primaryCountry || null,
        editorialScope: entry.geographicScope || 'unknown',
        locality: entry.locality || 'unknown',
        organizationName: entry.organizationName || null,
        ownershipOperator: entry.ownershipOperator || null,
        sourceClass: entry.sourceClass || 'unknown',
        evidenceRole: entry.evidenceRole || 'unknown',
        endpointType: admission.endpointType || 'unknown',
        endpointAuthority: admission.endpointAuthority || 'unknown',
        allowedUseStatus: admission.allowedUseStatus || 'unknown',
        currentUse: admission.currentUse || [],
        permittedUse: admission.permittedUse || [],
        admissionReviewState: admission.reviewState || 'missing',
        reviewedAt: admission.reviewedAt || entry.reviewedAt || null,
        syndicatedContentBehavior: admission.syndicatedContentBehavior || 'unknown',
        itemLevelReviewRequired: admission.itemLevelReviewRequired ?? null,
        itemLevelStrategy: admission.itemLevelStrategy || null,
        endpointEvidenceUrls: admission.endpointEvidenceUrls || [],
        usagePolicyUrls: admission.usagePolicyUrls || [],
        healthState: classifyHealth(observation),
        lastHttpStatus: observation.lastStatus ?? null,
        lastError: observation.lastError || null,
        lastFetchSucceededAt: observation.lastFetchSucceededAt || null,
        snapshotStoryCount: observation.storyCount ?? null,
        appearancesInSampledViews: sourceAppearances.get(entry.sourceId) || 0,
      };
    })
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  const healthCounts = countBy(
    health.map(observation => classifyHealth(observation)),
    value => value
  );
  const multiSourceUrlCount = [...urlOwners.values()].filter(owners => owners.size > 1).length;
  const candidates = requiredArray(
    core.admission.body.researchCandidates,
    'source research candidates'
  ).map(candidate => ({
    candidateId: candidate.candidateId,
    name: candidate.name,
    endpointUrl: candidate.endpointUrl,
    endpointType: candidate.endpointType,
    endpointAuthority: candidate.endpointAuthority,
    allowedUseStatus: candidate.allowedUseStatus,
    disposition: candidate.disposition,
    syndicatedContentBehavior: candidate.syndicatedContentBehavior || 'unknown',
    itemLevelReviewRequired: candidate.itemLevelReviewRequired ?? null,
    endpointEvidenceUrls: candidate.endpointEvidenceUrls || [],
    usagePolicyUrls: candidate.usagePolicyUrls || [],
  }));

  return {
    schemaVersion: 1,
    capturedAt,
    baseUrl,
    fingerprints: {
      source: core.sources.body.sourceFingerprint,
      admission: core.admission.body.admissionFingerprint,
    },
    registryReviewDates: {
      provenance: core.sources.body.reviewedAt,
      admission: core.admission.body.reviewedAt,
    },
    apiObservations: Object.fromEntries(
      Object.entries(core).map(([key, result]) => [key, result.observation])
    ),
    portfolio: {
      configuredSourceCount: sources.length,
      provenanceValid: core.sources.body.validation?.valid === true,
      admissionValid: core.admission.body.validation?.valid === true,
      coverageInventorySourceCount: coverage.totalSources,
      routingRegionCount: coverage.totalRegions,
      languageCount: coverage.totalLanguages,
      englishSourceShare: coverage.englishSourceShare,
      primarySourceInputs: coverage.primarySourceInputs,
      byFeedRoutingRegion: countBy(sources, source => source.feedRoutingRegion),
      byPublisherCountry: countBy(sources, source => source.publisherCountry),
      bySourceLanguage: countBy(sources, source => source.sourceLanguage),
      byEditorialScope: countBy(sources, source => source.editorialScope),
      bySourceClass: countBy(sources, source => source.sourceClass),
      byEvidenceRole: countBy(sources, source => source.evidenceRole),
      byEndpointAuthority: countBy(sources, source => source.endpointAuthority),
      byAllowedUseStatus: countBy(sources, source => source.allowedUseStatus),
      byAdmissionReviewState: countBy(sources, source => source.admissionReviewState),
      subnationalReporting: {
        sourceCount: coverage.subnationalReporting?.sourceCount ?? 0,
        jurisdictionCount: coverage.subnationalReporting?.jurisdictionCount ?? 0,
        jurisdictionIds: coverage.subnationalReporting?.jurisdictionIds || [],
      },
      gaps: (coverage.gaps || []).map(gap => ({
        id: gap.id,
        severity: gap.severity,
        observed: gap.observed,
        target: gap.target,
      })),
    },
    health: {
      snapshotGeneratedAt: core.health.body.generatedAt || null,
      snapshotAgeSeconds: core.health.body.cacheAgeSeconds ?? null,
      healthySources: core.health.body.healthySources ?? null,
      totalSources: core.health.body.totalSources ?? health.length,
      observedHealthStates: healthCounts,
      sourcesWithErrors: sources
        .filter(source => source.healthState === 'error')
        .map(source => ({
          sourceId: source.sourceId,
          name: source.name,
          httpStatus: source.lastHttpStatus,
          error: source.lastError,
        })),
    },
    sampledFeedViews: {
      pageLimit: FEED_PAGE_LIMIT,
      routeCount: routeReports.length,
      views: routeReports,
      storyAppearancesAcrossViews: routeReports.reduce(
        (total, view) => total + view.returnedStoryCount,
        0
      ),
      distinctCanonicalArticleUrlsAcrossViews: urlOwners.size,
      canonicalUrlsPresentUnderMultipleSourceIds: multiSourceUrlCount,
      multipleSourceIdsMeaning:
        'An exact canonical URL appearing under multiple source IDs is an investigation signal, not proof of syndication or independent reporting.',
    },
    researchCandidates: candidates,
    interpretationLimits: [
      'Feed routing region, publisher country/editorial scope, and story event location are separate; this inventory does not measure event geography.',
      'Endpoint health measures the recorded fetch/parse observation, not rights, reporting quality, or source independence.',
      'Rights and endpoint-authority states reproduce the reviewed admission ledger; they are not legal conclusions.',
      'Feed views are page-limited snapshots. Repeated appearances across region views are not distinct reports.',
      'The coverage contract reports zero primary-source inputs; publisher and agency feeds are not primary-source documents merely because they report an event.',
    ],
    sources,
  };
}

function summarizeFeed(region, body) {
  const items = requiredArray(body.items, `${region} feed`);
  const canonicalUrls = new Set();
  let invalidOriginalArticleUrlCount = 0;
  let missingOrInvalidPublicationTimeCount = 0;
  const publicationTimes = [];

  for (const item of items) {
    const canonicalUrl = canonicalArticleUrl(item.sourceUrl);
    if (canonicalUrl) canonicalUrls.add(canonicalUrl);
    else invalidOriginalArticleUrlCount++;

    const publishedMs =
      typeof item.published === 'string' ? Date.parse(item.published) : Number.NaN;
    if (Number.isNaN(publishedMs)) {
      missingOrInvalidPublicationTimeCount++;
    } else {
      publicationTimes.push(publishedMs);
    }
  }

  return {
    feedRoutingRegionFilter: region,
    returnedStoryCount: items.length,
    reportedTotal: Number.isFinite(body.total) ? body.total : null,
    pageTruncated: Number.isFinite(body.total) ? body.total > items.length : null,
    feedSnapshotWasCached: body.cached ?? null,
    sourceFingerprint: body.sourceFingerprint || null,
    admissionFingerprint: body.admissionFingerprint || null,
    distinctCanonicalArticleUrls: canonicalUrls.size,
    duplicateCanonicalArticleUrlCount: Math.max(0, items.length - canonicalUrls.size),
    invalidOriginalArticleUrlCount,
    missingOrInvalidPublicationTimeCount,
    newestPublishedAt: publicationTimes.length
      ? new Date(Math.max(...publicationTimes)).toISOString()
      : null,
    oldestPublishedAt: publicationTimes.length
      ? new Date(Math.min(...publicationTimes)).toISOString()
      : null,
    storiesBySource: countBy(items, item => item.sourceId || 'unknown'),
    storiesByAllowedUseStatus: countBy(items, item => item.allowedUseStatus || 'unknown'),
    storiesByDisplayMode: countBy(items, item => item.displayMode || 'unknown'),
  };
}

async function fetchJson(origin, path, probeId, fetchImpl) {
  const url = new URL(path, origin);
  url.searchParams.set('_coverage_probe', probeId);
  const response = await fetchImpl(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url.pathname} returned HTTP ${response.status}`);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`${url.pathname} returned invalid JSON`, { cause: error });
  }

  return {
    body,
    observation: {
      requestedUrl: url.href,
      finalUrl: response.url || url.href,
      status: response.status,
      contentType: response.headers.get('content-type'),
      age: response.headers.get('age'),
      cfCacheStatus: response.headers.get('cf-cache-status'),
      cfRay: response.headers.get('cf-ray'),
      etag: response.headers.get('etag'),
    },
  };
}

function classifyHealth(observation) {
  if (!observation) return 'unknown';
  if (observation.lastError) return 'error';
  if (
    Number.isInteger(observation.lastStatus) &&
    observation.lastStatus >= 200 &&
    observation.lastStatus < 400
  ) {
    return 'healthy';
  }
  return 'unknown';
}

function canonicalArticleUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function countBy(values, getKey) {
  const counts = new Map();
  for (const value of values) {
    const key = getKey(value) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts]
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([key, count]) => ({ key, count }));
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} response is missing its array`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  collectCoverageReport()
    .then(report => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    })
    .catch(error => {
      logError(`Coverage report failed: ${error.message}`);
      process.exitCode = 1;
    });
}

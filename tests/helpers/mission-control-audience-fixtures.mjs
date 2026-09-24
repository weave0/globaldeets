/**
 * TEST-ONLY synthetic governed documents (GD-031).
 *
 * These build Canonical Gold 1.2 / Traffic Insights / business-event feed documents that carry
 * `fixture: false` so the adapters' happy paths can be exercised. They are deliberately never importable from
 * tools/ or observatory/, are never written to the committed seed, and any evidence built from them is only
 * ever produced in a temporary directory by a test or visual QA run. The production pipeline rejects
 * `fixture: true` documents, and the committed seed is asserted to contain no measured audience.
 */

const DAY = 86400000;
const iso = ms => new Date(ms).toISOString();
const dateOf = ms => iso(ms).slice(0, 10);

export const SYNTHETIC_END = Date.parse('2026-10-01T00:00:00Z');

/** Deterministic base 28-day request volume per property (index-weighted so traffic is realistically uneven). */
export function baseRequests(propertyIds, overrides = {}) {
  const weights = [0.32, 0.18, 0.02, 0.05, 0.11, 0, 0, 0.04, 0.03, 0.03, 0.05, 0.005, 0.03, 0, 0, 0.004, 0.06, 0.0006, 0.0008, 0.002, 0.003, 0.03, 0.02, 0.025, 0.004];
  const total = 2_400_000;
  return Object.fromEntries(propertyIds.map((id, index) => [id, overrides[id] !== undefined ? overrides[id] : Math.round(total * (weights[index] ?? 0.001))]));
}

function metric({ propertyId, days, field, value, coverage = 'full_coverage', extra = {} }) {
  const end = SYNTHETIC_END;
  return {
    metric_id: 'cloudflare.' + propertyId + '.' + days + 'd.' + field,
    label: field,
    metric_definition: 'Synthetic test metric.',
    source: 'cloudflare',
    semantics: { semantic_type: 'count', population_scope: 'test', aggregation_semantics: 'sum', unique_count_semantics: 'not_unique_count', source_boundary: 'cloudflare_zone' },
    evidence_state: 'measured',
    exactness: 'unknown',
    value,
    unit: field === 'requests' ? 'requests' : 'page views',
    coverage: { state: coverage, observed_fraction: coverage === 'full_coverage' ? 1 : 0.9 },
    observation: { start: iso(end - days * DAY), end: iso(end), timezone: 'UTC', boundary: 'half_open', partial_current_period: false, extracted_at: '2026-10-01T05:00:00Z', source_observation_id: 'obs.' + propertyId + days },
    provenance: { source_metrics: [field], source_snapshots: ['snap.test'] },
    ...extra,
  };
}

export function syntheticGold({ propertyIds, generatedAt = '2026-10-01T06:00:00Z', volumes, omit = [], partial = [], fixture = false, schema = '1.2.0', mutate } = {}) {
  const base = baseRequests(propertyIds, volumes);
  const metrics = [];
  for (const propertyId of propertyIds) {
    if (omit.includes(propertyId)) continue;
    for (const [days, factor] of [[7, 0.26], [28, 1], [90, 3.1]]) {
      const requests = Math.round(base[propertyId] * factor);
      const coverage = partial.includes(propertyId) ? 'partial_coverage' : 'full_coverage';
      metrics.push(metric({ propertyId, days, field: 'requests', value: requests, coverage }));
      metrics.push(metric({ propertyId, days, field: 'pageViews', value: Math.round(requests * 0.55), coverage }));
    }
  }
  const doc = { schema_version: schema, contract_name: 'gfd-canonical-gold', fixture, generated_at: generatedAt, pipeline_version: 'test-synthetic', metrics, topology: { nodes: [] }, source_support: [] };
  if (mutate) mutate(doc);
  return doc;
}

/**
 * Insights document. `growth` maps propertyId -> per-day growth factor over the 28-day series
 * (0.02 = +2% per day compounded linearly); default is flat.
 */
export function syntheticInsights({ propertyIds, sourceGoldGeneratedAt = '2026-10-01T06:00:00Z', volumes, growth = {}, skipSeries = [], fixture = false, mutate } = {}) {
  const base = baseRequests(propertyIds, volumes);
  const series = [];
  const comparisons = [];
  for (const propertyId of propertyIds) {
    const daily = base[propertyId] / 28;
    const points = [];
    for (let index = 0; index < 28; index += 1) {
      const factor = 1 + (growth[propertyId] || 0) * (index - 13.5);
      points.push({ date: dateOf(SYNTHETIC_END - (28 - index) * DAY), value: Math.max(0, Math.round(daily * factor)) });
    }
    if (!skipSeries.includes(propertyId)) {
      series.push({ series_id: 'cloudflare.' + propertyId + '.daily.requests', source: 'cloudflare', property_id: propertyId, metric_name: 'requests', label: 'HTTP requests', unit: 'requests', source_metric_id: 'cloudflare.' + propertyId + '.28d.requests', source_snapshot: 'snap.test', evidence_state: 'measured', exactness: 'unknown', coverage: { state: 'full_coverage', observed_fraction: 1, missing_dates: [] }, observation_start: iso(SYNTHETIC_END - 28 * DAY), observation_end: iso(SYNTHETIC_END), points, missing_dates: [], limitations: [] });
    }
    for (const period of [7, 28]) {
      const sum = (from, to) => points.slice(from, to).reduce((total, point) => total + point.value, 0);
      const current = period === 7 ? sum(21, 28) : sum(14, 28);
      const baseline = period === 7 ? sum(14, 21) : sum(0, 14);
      comparisons.push({
        property_id: propertyId,
        metric_name: 'requests',
        period_days: period,
        current_start: dateOf(SYNTHETIC_END - period * DAY),
        current_end: dateOf(SYNTHETIC_END - DAY),
        baseline_start: dateOf(SYNTHETIC_END - 2 * period * DAY),
        baseline_end: dateOf(SYNTHETIC_END - period * DAY - DAY),
        current_value: current,
        baseline_value: baseline,
        absolute_delta: current - baseline,
        percent_delta: baseline ? (current - baseline) / baseline : null,
        available: true,
        unavailable_reason: null,
        source: 'cloudflare',
        exactness: 'unknown',
        coverage_state: 'full_coverage',
        expected_date_count: period,
        missing_dates: [],
        source_metric_ids: ['cloudflare.' + propertyId + '.' + period + 'd.requests'],
        source_snapshots: ['snap.test'],
      });
    }
    comparisons.push({ property_id: propertyId, metric_name: 'requests', period_days: 90, current_start: null, current_end: null, baseline_start: null, baseline_end: null, current_value: null, baseline_value: null, absolute_delta: null, percent_delta: null, available: false, unavailable_reason: 'Insufficient daily history for a 90-day comparison.', source: 'cloudflare', exactness: 'unknown', coverage_state: 'partial_coverage', expected_date_count: null, missing_dates: [], source_metric_ids: [], source_snapshots: [] });
  }
  const doc = { schema_version: '1.1.0', contract_name: 'gfd-traffic-insights', fixture, generated_at: '2026-10-01T06:10:00Z', source_gold_schema_version: '1.2.0', source_gold_generated_at: sourceGoldGeneratedAt, series, findings: [], actions: [], limitations: [], trend_comparisons: comparisons };
  if (mutate) mutate(doc);
  return doc;
}

/** Business-event feed. `instrumented` lists properties; `records` are [propertyId, eventType, days, count]. */
export function syntheticEventsFeed({ instrumented = [], records = [], generatedAt = '2026-10-01T06:00:00Z', fixture = false, mutate } = {}) {
  const doc = {
    contractName: 'globaldeets-business-events-feed',
    schemaVersion: '1.0.0',
    fixture,
    generatedAt,
    source: { id: 'test-feed', label: 'Test feed' },
    instrumentedProperties: instrumented,
    records: records.map(([propertyId, eventType, days, count]) => ({ propertyId, eventType, window: { start: iso(SYNTHETIC_END - days * DAY), end: iso(SYNTHETIC_END), days }, count })),
  };
  if (mutate) mutate(doc);
  return doc;
}

export const asSource = (doc, extra = {}) => ({ doc, configured: true, httpStatus: 200, reason: null, ...extra });

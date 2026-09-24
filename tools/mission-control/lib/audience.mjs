/**
 * Audience contract builder (GD-031).
 *
 * Mission Control does not measure traffic. It consumes the governed Traffic Intelligence outputs:
 *   - Canonical Gold 1.2 (gfd-canonical-gold): per-zone Cloudflare metrics `cloudflare.<zone>.<7|28|90>d.<field>`
 *   - Traffic Insights 1.x (gfd-traffic-insights): producer-computed trend comparisons and daily series
 *
 * What these sources can and cannot say is part of the contract: Cloudflare zone analytics count REQUESTS,
 * not people, so nothing here is a human audience. Traffic classification (certified human / likely human /
 * automated) is unsupported by every connected source and is published as such, never inferred.
 *
 * Failure semantics: no source, an unauthorized source, a fixture, a corrupted document and a stale document
 * all produce readings with `value: null` and a reason. Nothing is coerced, and a fixture is never a fact.
 */
import { createRequire } from 'node:module';
import { emptyReading, measuredReading, validateReading } from './readings.mjs';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

export const AUDIENCE_CONTRACT_NAME = 'globaldeets-audience';
export const AUDIENCE_SCHEMA_VERSION = '1.0.0';
export const WINDOWS = Object.freeze([7, 28, 90]);
export const FIELDS = Object.freeze([
  { field: 'requests', unit: 'requests', label: 'Edge requests' },
  { field: 'pageViews', unit: 'page views', label: 'Cloudflare page views' },
]);

/** A movement is only called growth/decline when it is both proportionally and absolutely material. */
export const MATERIALITY = Object.freeze({ minPercent: 10, minAbsoluteRequests: 100 });
/** Herfindahl-Hirschman index thresholds on request shares (0-10000). */
export const CONCENTRATION = Object.freeze({ moderateFrom: 1500, concentratedFrom: 2500, dominantShareFrom: 50 });

export const CLASSIFICATION_SUPPORT = Object.freeze({
  'certified-human': 'unsupported',
  'likely-human': 'unsupported',
  'automated-agentic': 'unsupported',
  unknown: 'all-measured-traffic',
});

const round1 = value => Math.round(value * 10) / 10;

function daysBetween(start, end) {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 86400000);
}

/** Awaiting/unavailable shell: every reading is valueless and says why. */
function emptyContract({ registry, now, status, reason, insights }) {
  const ids = registry.properties.map(item => item.propertyId);
  // Cells carry a short reason; the full explanation lives once in source.reason.
  const cellReason = status === 'awaiting-authorized-source' ? 'Awaiting authorized source (see source.requirement).' : 'Source not readable (see source.reason).';
  const readingFor = unit => emptyReading(status === 'awaiting-authorized-source' ? 'awaiting-authorized-source' : 'unavailable', cellReason, { unit });
  const perWindow = unit => Object.fromEntries(WINDOWS.map(days => [days, readingFor(unit)]));
  return {
    contractName: AUDIENCE_CONTRACT_NAME,
    schemaVersion: AUDIENCE_SCHEMA_VERSION,
    generatedAt: now,
    policy: policy(),
    source: {
      status,
      kind: 'canonical-gold',
      reason,
      requirement: registry.audienceContract?.requirement || null,
      gold: null,
      insights: insights || { status: 'absent', reason: 'No Gold document was read, so no insights document is consulted.', generatedAt: null },
      observedAt: null,
      freshness: { state: 'unknown', ageHours: null, freshUntil: null, expiresAt: null },
    },
    classification: { support: CLASSIFICATION_SUPPORT, composition: null, note: classificationNote() },
    windowsDays: [...WINDOWS],
    materiality: MATERIALITY,
    estate: {
      requests: perWindow('requests'),
      pageViews: perWindow('page views'),
      propertiesExpected: ids.length,
      propertiesMeasured: 0,
      trend: Object.fromEntries(WINDOWS.map(days => [days, emptyReading('unavailable', cellReason, { unit: 'percent' })])),
      concentration: null,
      movers: { window: null, growing: [], declining: [] },
    },
    properties: registry.properties.map(property => ({
      propertyId: property.propertyId,
      requests: perWindow('requests'),
      pageViews: perWindow('page views'),
      trend: Object.fromEntries(WINDOWS.map(days => [days, emptyReading('unavailable', cellReason, { unit: 'percent' })])),
      share28d: emptyReading('unavailable', cellReason, { unit: 'percent' }),
      rank28d: null,
      direction: 'unknown',
    })),
    series: { estateDaily: { status: 'unavailable', reason, unit: 'requests', points: [], propertiesIncluded: [], incompleteDates: [] }, byProperty: [] },
  };
}

function policy() {
  return {
    edgeTrafficIsHumanAudience: false,
    missingIsZero: false,
    fixturesAreProduction: false,
    uniquesAreAdditive: false,
    trendsRequireComparableWindows: true,
    classificationIsInferredFromEdge: false,
  };
}

function classificationNote() {
  return 'Cloudflare zone analytics count requests, not people. No connected source separates certified humans, likely humans or automated agents, so all measured traffic is reported as unclassified edge requests.';
}

/** Validates a Gold document envelope. Returns an error string or null. */
export function validateGoldEnvelope(doc) {
  if (!doc || typeof doc !== 'object') return 'Gold source is not a JSON object.';
  if (doc.contract_name !== 'gfd-canonical-gold') return 'Source is not a gfd-canonical-gold document.';
  if (!/^1\.2\./.test(String(doc.schema_version))) return 'Unsupported Canonical Gold schema_version ' + doc.schema_version + '.';
  if (doc.fixture !== false) return 'Canonical Gold document is a fixture (fixture !== false); fixtures are contract test data, not observations.';
  if (!Array.isArray(doc.metrics)) return 'Canonical Gold document has no metrics array.';
  if (!Number.isFinite(Date.parse(doc.generated_at))) return 'Canonical Gold document has an invalid generated_at.';
  const ids = new Set();
  for (const metric of doc.metrics) {
    if (!metric || typeof metric.metric_id !== 'string') return 'Canonical Gold document contains a metric without a metric_id.';
    if (ids.has(metric.metric_id)) return 'Canonical Gold document repeats metric ' + metric.metric_id + '; refusing to choose between them.';
    ids.add(metric.metric_id);
  }
  return null;
}

function goldReading({ metric, days, unit, generatedAt, goldMinor, propertyId, field }) {
  const metricId = 'cloudflare.' + propertyId + '.' + days + 'd.' + field;
  if (!metric) return emptyReading('unavailable', 'Metric ' + metricId + ' is absent from the Gold document.', { unit });
  const observation = metric.observation;
  const window = observation ? { days, start: observation.start, end: observation.end } : null;
  const base = { unit, window, observedAt: generatedAt, provenance: { metricId, source: metric.source || 'cloudflare', snapshots: metric.provenance?.source_snapshots || [] } };
  if (metric.evidence_state !== 'measured') return emptyReading('unavailable', 'Metric ' + metricId + ' evidence_state is ' + metric.evidence_state + '.', base);
  if (typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0) return emptyReading('unavailable', 'Metric ' + metricId + ' has no valid non-negative value.', base);
  if (!observation || daysBetween(observation.start, observation.end) !== days) return emptyReading('incomparable', 'Metric ' + metricId + ' does not cover a ' + days + '-day window.', base);
  if (observation.partial_current_period === true) return emptyReading('incomparable', 'Metric ' + metricId + ' covers a partial current period.', base);
  const full = metric.coverage?.state === 'full_coverage';
  return measuredReading(metric.value, {
    ...base,
    partial: !full,
    comparabilityKey: ['gold', goldMinor, days + 'd', observation.end, observation.timezone || 'UTC', observation.boundary || 'half_open'].join('|'),
    confidence: full ? 'medium' : 'low',
    limitations: full ? null : 'Coverage is ' + (metric.coverage?.state || 'unknown') + (metric.coverage?.missingness_reason ? ': ' + metric.coverage.missingness_reason : '') + '. Excluded from estate totals.',
  });
}

function trendFrom(comparison) {
  if (!comparison) return emptyReading('unavailable', 'The insights document carries no comparison for this property and window.', { unit: 'percent' });
  if (comparison.available !== true) return emptyReading('incomparable', comparison.unavailable_reason || 'The producer marked this comparison unavailable.', { unit: 'percent' });
  const complete = comparison.coverage_state === 'full_coverage' && (comparison.missing_dates || []).length === 0 && comparison.expected_date_count === comparison.period_days;
  if (!complete) return emptyReading('incomparable', 'Comparison windows are not fully covered (' + comparison.coverage_state + '); no delta is calculated.', { unit: 'percent' });
  const finite = [comparison.current_value, comparison.baseline_value].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (!finite) return emptyReading('unavailable', 'Comparison values are not valid numbers.', { unit: 'percent' });
  const pct = comparison.baseline_value > 0 ? round1(((comparison.current_value - comparison.baseline_value) / comparison.baseline_value) * 100) : null;
  if (pct == null) return emptyReading('incomparable', 'The baseline period recorded zero requests; a percentage change is undefined.', { unit: 'percent', provenance: { current: comparison.current_value, baseline: comparison.baseline_value } });
  return measuredReading(pct, {
    unit: 'percent',
    window: { days: comparison.period_days, start: comparison.current_start, end: comparison.current_end },
    comparabilityKey: ['insights', comparison.period_days + 'd', comparison.current_start, comparison.current_end, comparison.baseline_start, comparison.baseline_end].join('|'),
    confidence: 'medium',
    provenance: {
      current: comparison.current_value,
      baseline: comparison.baseline_value,
      absoluteDelta: comparison.current_value - comparison.baseline_value,
      currentWindow: { start: comparison.current_start, end: comparison.current_end },
      baselineWindow: { start: comparison.baseline_start, end: comparison.baseline_end },
      sourceMetricIds: comparison.source_metric_ids || [],
    },
  });
}

function directionFor(trend) {
  if (trend.evidenceState !== 'measured') return 'unknown';
  const abs = trend.provenance?.absoluteDelta ?? 0;
  if (trend.value >= MATERIALITY.minPercent && abs >= MATERIALITY.minAbsoluteRequests) return 'growing';
  if (trend.value <= -MATERIALITY.minPercent && -abs >= MATERIALITY.minAbsoluteRequests) return 'declining';
  return 'stable';
}

/** Validates an insights document; returns { error } or { ok: true }. */
export function validateInsightsEnvelope(doc) {
  if (!doc || typeof doc !== 'object') return { error: 'Insights source is not a JSON object.' };
  if (doc.contract_name !== 'gfd-traffic-insights') return { error: 'Source is not a gfd-traffic-insights document.' };
  if (!/^1\./.test(String(doc.schema_version))) return { error: 'Unsupported insights schema_version ' + doc.schema_version + '.' };
  if (doc.fixture !== false) return { error: 'Insights document is a fixture (fixture !== false).' };
  if (!Number.isFinite(Date.parse(doc.generated_at))) return { error: 'Insights document has an invalid generated_at.' };
  for (const list of ['series', 'trend_comparisons']) if (doc[list] !== undefined && !Array.isArray(doc[list])) return { error: 'Insights ' + list + ' is not an array.' };
  for (const series of doc.series || []) {
    const dates = new Set();
    for (const point of series.points || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(point?.date)) || typeof point.value !== 'number' || !Number.isFinite(point.value) || point.value < 0) return { error: 'Insights series ' + series.series_id + ' contains an invalid point.' };
      if (dates.has(point.date)) return { error: 'Insights series ' + series.series_id + ' repeats date ' + point.date + '.' };
      dates.add(point.date);
    }
  }
  return { ok: true };
}

function estateWindowReading({ registry, rows, days, field, unit }) {
  const ids = registry.properties.map(item => item.propertyId);
  const readings = rows.map(row => ({ id: row.propertyId, reading: row[field][days] }));
  const usable = readings.filter(item => item.reading.evidenceState === 'measured');
  if (!usable.length) return emptyReading('unavailable', 'No property has a fully covered ' + days + '-day reading.', { unit });
  // Only readings on the same comparable definition are summed; anything else is named and excluded.
  const keys = new Map();
  for (const item of usable) keys.set(item.reading.comparabilityKey, (keys.get(item.reading.comparabilityKey) || 0) + 1);
  const modalKey = [...keys.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const included = usable.filter(item => item.reading.comparabilityKey === modalKey);
  const excluded = readings.filter(item => !included.includes(item)).map(item => ({ propertyId: item.id, state: item.reading.evidenceState, reason: item.reading.reason || item.reading.limitations || 'different comparability key' }));
  const total = included.reduce((sum, item) => sum + item.reading.value, 0);
  const complete = included.length === ids.length;
  return measuredReading(total, {
    partial: !complete,
    unit,
    window: included[0].reading.window,
    observedAt: included[0].reading.observedAt,
    comparabilityKey: modalKey,
    confidence: complete ? 'medium' : 'low',
    provenance: { propertiesIncluded: included.map(item => item.id), propertiesExpected: ids.length, excluded },
    limitations: complete ? null : included.length + ' of ' + ids.length + ' properties report a comparable ' + days + '-day value; the total is a lower bound, not the estate total.',
  });
}

function estateTrend({ rows, days }) {
  const usable = rows.map(row => ({ id: row.propertyId, trend: row.trend[days] })).filter(item => item.trend.evidenceState === 'measured');
  if (!usable.length) return emptyReading('unavailable', 'No property has a comparable ' + days + '-day trend.', { unit: 'percent' });
  const keys = new Map();
  for (const item of usable) {
    const key = item.trend.provenance.currentWindow.start + '|' + item.trend.provenance.currentWindow.end + '|' + item.trend.provenance.baselineWindow.start + '|' + item.trend.provenance.baselineWindow.end;
    keys.set(key, [...(keys.get(key) || []), item]);
  }
  const group = [...keys.values()].sort((a, b) => b.length - a.length)[0];
  const current = group.reduce((sum, item) => sum + item.trend.provenance.current, 0);
  const baseline = group.reduce((sum, item) => sum + item.trend.provenance.baseline, 0);
  if (baseline <= 0) return emptyReading('incomparable', 'The estate baseline period recorded zero requests; a percentage change is undefined.', { unit: 'percent' });
  const complete = group.length === rows.length;
  return measuredReading(round1(((current - baseline) / baseline) * 100), {
    partial: !complete,
    unit: 'percent',
    window: group[0].trend.window,
    comparabilityKey: group[0].trend.comparabilityKey,
    confidence: complete ? 'medium' : 'low',
    provenance: { current, baseline, absoluteDelta: current - baseline, propertiesIncluded: group.map(item => item.id), currentWindow: group[0].trend.provenance.currentWindow, baselineWindow: group[0].trend.provenance.baselineWindow },
    limitations: complete ? null : group.length + ' of ' + rows.length + ' properties have a comparable ' + days + '-day trend.',
  });
}

function concentrationFor(rows) {
  const measured = rows.filter(row => row.requests[28].evidenceState === 'measured' && row.requests[28].value > 0);
  const total = measured.reduce((sum, row) => sum + row.requests[28].value, 0);
  if (measured.length < 3 || total <= 0) return null;
  const shares = measured.map(row => ({ propertyId: row.propertyId, share: (row.requests[28].value / total) * 100 })).sort((a, b) => b.share - a.share || a.propertyId.localeCompare(b.propertyId));
  const hhi = Math.round(shares.reduce((sum, item) => sum + item.share * item.share, 0));
  const level = hhi >= CONCENTRATION.concentratedFrom ? 'concentrated' : hhi >= CONCENTRATION.moderateFrom ? 'moderate' : 'diversified';
  return {
    window: 28,
    basis: 'share of measured edge requests',
    propertiesCounted: measured.length,
    topProperty: shares[0].propertyId,
    top1SharePct: round1(shares[0].share),
    top3SharePct: round1(shares.slice(0, 3).reduce((sum, item) => sum + item.share, 0)),
    hhi,
    level,
    dominant: shares[0].share >= CONCENTRATION.dominantShareFrom,
  };
}

function buildSeries({ insights, propertyIds }) {
  const unavailable = reason => ({ estateDaily: { status: 'unavailable', reason, unit: 'requests', points: [], propertiesIncluded: [], incompleteDates: [] }, byProperty: [] });
  if (!insights) return unavailable('No valid Traffic Insights document is available, so no daily series is shown.');
  const wanted = new Set(propertyIds);
  const series = (insights.series || []).filter(item => item.metric_name === 'requests' && wanted.has(item.property_id) && Array.isArray(item.points) && item.points.length);
  if (!series.length) return unavailable('The insights document carries no daily request series.');
  const byProperty = propertyIds
    .map(id => series.find(item => item.property_id === id))
    .filter(Boolean)
    .map(item => ({ propertyId: item.property_id, coverage: item.coverage?.state || 'unknown', points: [...item.points].sort((a, b) => a.date.localeCompare(b.date)).map(point => [point.date, point.value]) }));
  const dates = [...new Set(byProperty.flatMap(item => item.points.map(point => point[0])))].sort();
  const lookup = byProperty.map(item => new Map(item.points));
  const points = [];
  const incompleteDates = [];
  for (const date of dates) {
    if (lookup.every(map => map.has(date))) points.push({ date, value: lookup.reduce((sum, map) => sum + map.get(date), 0) });
    else incompleteDates.push(date);
  }
  return {
    estateDaily: {
      status: points.length ? (incompleteDates.length || byProperty.length < propertyIds.length ? 'partial' : 'measured') : 'unavailable',
      reason: points.length ? null : 'No date has a value for every reporting property.',
      unit: 'requests',
      points,
      propertiesIncluded: byProperty.map(item => item.propertyId),
      propertiesExpected: propertyIds.length,
      incompleteDates,
    },
    byProperty,
  };
}

/**
 * Builds the audience contract.
 * @param {object} input registry, now (ISO), gold ({doc, configured, reason, httpStatus}), insights ({doc, configured, reason})
 */
export function buildAudience({ registry, now, gold, insights }) {
  const configured = Boolean(gold?.configured);
  if (!gold || !configured) {
    return emptyContract({ registry, now, status: 'awaiting-authorized-source', reason: gold?.reason || 'No governed Canonical Gold source is configured for Mission Control.' });
  }
  if (!gold.doc) {
    const denied = gold.httpStatus === 401 || gold.httpStatus === 403;
    return emptyContract({ registry, now, status: denied ? 'awaiting-authorized-source' : 'unavailable', reason: gold.reason || 'The governed Canonical Gold source could not be read.' });
  }
  const envelopeError = validateGoldEnvelope(gold.doc);
  if (envelopeError) return emptyContract({ registry, now, status: 'rejected', reason: envelopeError });

  const doc = gold.doc;
  const goldMinor = doc.schema_version.split('.').slice(0, 2).join('.');
  const freshness = semantics.evaluateFreshness(doc.generated_at, semantics.FRESHNESS_POLICY.audience, now);
  const index = new Map(doc.metrics.map(metric => [metric.metric_id, metric]));

  let insightsStatus = { status: 'absent', reason: insights?.reason || 'No insights document is configured.', generatedAt: null, sourceGoldGeneratedAt: null };
  let insightsDoc = null;
  if (insights?.doc) {
    const checked = validateInsightsEnvelope(insights.doc);
    if (checked.error) insightsStatus = { status: 'rejected', reason: checked.error, generatedAt: null, sourceGoldGeneratedAt: null };
    else if (insights.doc.source_gold_generated_at !== doc.generated_at) {
      insightsStatus = { status: 'incomparable', reason: 'The insights document was derived from a different Gold snapshot (' + insights.doc.source_gold_generated_at + ') than the Gold document read (' + doc.generated_at + '); trends are not mixed across snapshots.', generatedAt: insights.doc.generated_at, sourceGoldGeneratedAt: insights.doc.source_gold_generated_at };
    } else {
      insightsDoc = insights.doc;
      insightsStatus = { status: 'measured', reason: null, generatedAt: insights.doc.generated_at, sourceGoldGeneratedAt: insights.doc.source_gold_generated_at };
    }
  } else if (insights?.reason) {
    insightsStatus = { status: 'unavailable', reason: insights.reason, generatedAt: null, sourceGoldGeneratedAt: null };
  }

  const comparisonKey = (id, days) => id + '|' + days;
  const comparisons = new Map();
  for (const item of insightsDoc?.trend_comparisons || []) if (item.metric_name === 'requests') comparisons.set(comparisonKey(item.property_id, item.period_days), item);

  const rows = registry.properties.map(property => {
    const row = { propertyId: property.propertyId, requests: {}, pageViews: {}, trend: {} };
    for (const days of WINDOWS) {
      for (const { field, unit } of FIELDS) {
        const metric = index.get('cloudflare.' + property.propertyId + '.' + days + 'd.' + field);
        row[field][days] = goldReading({ metric, days, unit, generatedAt: doc.generated_at, goldMinor, propertyId: property.propertyId, field });
      }
      row.trend[days] = insightsDoc ? trendFrom(comparisons.get(comparisonKey(property.propertyId, days))) : emptyReading('unavailable', insightsStatus.reason, { unit: 'percent' });
    }
    return row;
  });

  const estateRequests = Object.fromEntries(WINDOWS.map(days => [days, estateWindowReading({ registry, rows, days, field: 'requests', unit: 'requests' })]));
  const estatePageViews = Object.fromEntries(WINDOWS.map(days => [days, estateWindowReading({ registry, rows, days, field: 'pageViews', unit: 'page views' })]));
  const estateTotal28 = estateRequests[28];
  const totalValue = estateTotal28.value;
  const ranked = rows
    .filter(row => row.requests[28].evidenceState === 'measured')
    .sort((a, b) => b.requests[28].value - a.requests[28].value || a.propertyId.localeCompare(b.propertyId));

  const properties = rows.map(row => {
    const rank = ranked.findIndex(item => item.propertyId === row.propertyId);
    const share = rank >= 0 && totalValue > 0 && estateTotal28.provenance?.propertiesIncluded?.includes(row.propertyId)
      ? measuredReading(round1((row.requests[28].value / totalValue) * 100), { unit: 'percent', confidence: 'medium', window: row.requests[28].window, observedAt: row.requests[28].observedAt, comparabilityKey: row.requests[28].comparabilityKey, provenance: { of: 'estate 28-day edge requests', total: totalValue } })
      : emptyReading('unavailable', 'No comparable 28-day reading, so no contribution share is calculated.', { unit: 'percent' });
    const trend = row.trend[28].evidenceState === 'measured' ? row.trend[28] : row.trend[7];
    return { ...row, share28d: share, rank28d: rank >= 0 ? rank + 1 : null, direction: directionFor(trend) };
  });

  const movers = { window: null, growing: [], declining: [] };
  for (const days of [28, 7]) {
    const candidates = properties.filter(item => item.trend[days].evidenceState === 'measured' && item.direction !== 'unknown');
    if (!candidates.length) continue;
    movers.window = days;
    const abs = item => item.trend[days].provenance.absoluteDelta;
    movers.growing = candidates.filter(item => item.trend[days].value >= MATERIALITY.minPercent && abs(item) >= MATERIALITY.minAbsoluteRequests).sort((a, b) => abs(b) - abs(a) || a.propertyId.localeCompare(b.propertyId)).slice(0, 5).map(item => ({ propertyId: item.propertyId, pct: item.trend[days].value, absoluteDelta: abs(item) }));
    movers.declining = candidates.filter(item => item.trend[days].value <= -MATERIALITY.minPercent && -abs(item) >= MATERIALITY.minAbsoluteRequests).sort((a, b) => abs(a) - abs(b) || a.propertyId.localeCompare(b.propertyId)).slice(0, 5).map(item => ({ propertyId: item.propertyId, pct: item.trend[days].value, absoluteDelta: abs(item) }));
    break;
  }

  const propertiesMeasured = ranked.length;
  const anyMeasured = propertiesMeasured > 0;
  const status = !anyMeasured ? 'unavailable' : propertiesMeasured < registry.properties.length || estateTotal28.evidenceState !== 'measured' ? 'partial' : 'measured';

  return {
    contractName: AUDIENCE_CONTRACT_NAME,
    schemaVersion: AUDIENCE_SCHEMA_VERSION,
    generatedAt: now,
    policy: policy(),
    source: {
      status,
      kind: 'canonical-gold',
      reason: anyMeasured ? null : 'The Gold document carries no fully covered per-property request metric for the governed estate.',
      requirement: null,
      gold: { contractName: doc.contract_name, schemaVersion: doc.schema_version, pipelineVersion: doc.pipeline_version || null, generatedAt: doc.generated_at, fixture: false },
      insights: insightsStatus,
      observedAt: doc.generated_at,
      freshness,
    },
    classification: { support: CLASSIFICATION_SUPPORT, composition: anyMeasured ? [{ class: 'unclassified-edge-requests', share: 100, basis: 'No connected source separates humans from automated traffic.' }] : null, note: classificationNote() },
    windowsDays: [...WINDOWS],
    materiality: MATERIALITY,
    estate: {
      requests: estateRequests,
      pageViews: estatePageViews,
      propertiesExpected: registry.properties.length,
      propertiesMeasured,
      trend: Object.fromEntries(WINDOWS.map(days => [days, insightsDoc ? estateTrend({ rows, days }) : emptyReading('unavailable', insightsStatus.reason, { unit: 'percent' })])),
      concentration: concentrationFor(rows),
      movers,
    },
    properties,
    series: buildSeries({ insights: insightsDoc, propertyIds: registry.properties.map(item => item.propertyId) }),
  };
}

/** Validates the published audience contract. Returns error strings (empty when valid). */
export function validateAudience(audience, { expectPropertyIds } = {}) {
  const errors = [];
  if (audience?.contractName !== AUDIENCE_CONTRACT_NAME) return ['audience: contractName'];
  const expectedPolicy = policy();
  for (const [key, value] of Object.entries(expectedPolicy)) if (audience.policy?.[key] !== value) errors.push('audience: policy.' + key);
  const status = audience.source?.status;
  if (!['measured', 'partial', 'awaiting-authorized-source', 'unavailable', 'rejected'].includes(status)) errors.push('audience: source.status');
  if (audience.source?.gold && audience.source.gold.fixture !== false) errors.push('audience: a fixture Gold document can never be published');
  if (['measured', 'partial'].includes(status) && !audience.source?.gold) errors.push('audience: measured audience without Gold provenance');
  if (status === 'awaiting-authorized-source' && !audience.source.requirement) errors.push('audience: awaiting-authorized-source must state the missing authority');
  for (const days of WINDOWS) {
    for (const key of ['requests', 'pageViews']) errors.push(...validateReading(audience.estate?.[key]?.[days], 'audience: estate.' + key + '.' + days));
    errors.push(...validateReading(audience.estate?.trend?.[days], 'audience: estate.trend.' + days));
  }
  if (!Array.isArray(audience.properties)) return [...errors, 'audience: properties'];
  if (expectPropertyIds && audience.properties.map(item => item.propertyId).join('|') !== expectPropertyIds.join('|')) errors.push('audience: properties are not exactly the registered properties in order');
  const valuedSources = ['measured', 'partial'].includes(status);
  for (const row of audience.properties) {
    for (const days of WINDOWS) {
      for (const key of ['requests', 'pageViews', 'trend']) {
        const reading = row[key]?.[days];
        errors.push(...validateReading(reading, 'audience: ' + row.propertyId + '.' + key + '.' + days));
        if (!valuedSources && reading?.value != null) errors.push('audience: ' + row.propertyId + '.' + key + '.' + days + ' has a value without a measured source');
      }
    }
    errors.push(...validateReading(row.share28d, 'audience: ' + row.propertyId + '.share28d'));
  }
  if (valuedSources) {
    // The published totals must be exactly reproducible from the published per-property readings.
    for (const days of WINDOWS) {
      const total = audience.estate.requests[days];
      if (total.value == null) continue;
      const included = new Set(total.provenance?.propertiesIncluded || []);
      const sum = audience.properties.filter(row => included.has(row.propertyId)).reduce((acc, row) => acc + (row.requests[days].value ?? 0), 0);
      if (sum !== total.value) errors.push('audience: estate.requests.' + days + ' (' + total.value + ') does not equal the sum of its property readings (' + sum + ')');
    }
    const shares = audience.properties.map(row => row.share28d.value).filter(value => typeof value === 'number');
    if (shares.reduce((a, b) => a + b, 0) > 100.5) errors.push('audience: contribution shares exceed 100%');
  }
  if (audience.series?.estateDaily?.points?.some(point => !Number.isFinite(point.value) || point.value < 0)) errors.push('audience: series contains an invalid point');
  return errors;
}


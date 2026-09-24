import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { registry } from './helpers/mission-control-fakes.mjs';
import { asSource, syntheticGold, syntheticInsights } from './helpers/mission-control-audience-fixtures.mjs';
import { buildAudience, validateAudience, validateGoldEnvelope, validateInsightsEnvelope } from '../tools/mission-control/lib/audience.mjs';
import { expectedPropertyIds } from '../tools/mission-control/lib/contracts.mjs';

const require = createRequire(import.meta.url);
const semantics = require('../observatory/mission-control/evidence-semantics.js');

const NOW = '2026-10-01T09:00:00Z';
const reg = registry();
const ids = reg.properties.map(item => item.propertyId);
const opts = { expectPropertyIds: expectedPropertyIds(reg) };
const build = ({ gold, insights, now = NOW } = {}) => buildAudience({ registry: reg, now, gold, insights });
const populated = (goldOptions = {}, insightOptions = {}) => build({ gold: asSource(syntheticGold({ propertyIds: ids, ...goldOptions })), insights: asSource(syntheticInsights({ propertyIds: ids, ...insightOptions })) });

const allReadings = audience => [
  ...['requests', 'pageViews'].flatMap(key => Object.values(audience.estate[key])),
  ...Object.values(audience.estate.trend),
  ...audience.properties.flatMap(row => [...Object.values(row.requests), ...Object.values(row.pageViews), ...Object.values(row.trend), row.share28d]),
];

test('no configured source: awaiting-authorized-source, every number is null (never zero), the missing authority is named', () => {
  const audience = build({ gold: { doc: null, configured: false, httpStatus: null, reason: 'No Canonical Gold source configured.' } });
  assert.equal(audience.source.status, 'awaiting-authorized-source');
  assert.deepEqual(validateAudience(audience, opts), []);
  assert.ok(audience.source.requirement.secrets.includes('MISSION_CONTROL_GOLD_TOKEN'));
  for (const reading of allReadings(audience)) {
    assert.equal(reading.value, null);
    assert.notEqual(reading.evidenceState, 'measured');
    assert.ok(reading.reason);
  }
  assert.equal(audience.estate.concentration, null);
  assert.equal(audience.series.estateDaily.points.length, 0);
  assert.equal(audience.classification.composition, null);
});

test('a rejected credential is awaiting authorization; an outage is unavailable; neither yields a value', () => {
  const denied = build({ gold: { doc: null, configured: true, httpStatus: 401, reason: 'Canonical Gold source returned HTTP 401.' } });
  assert.equal(denied.source.status, 'awaiting-authorized-source');
  const outage = build({ gold: { doc: null, configured: true, httpStatus: 503, reason: 'Canonical Gold source returned HTTP 503.' } });
  assert.equal(outage.source.status, 'unavailable');
  assert.ok(allReadings(outage).every(reading => reading.value === null && reading.evidenceState === 'unavailable'));
  assert.deepEqual(validateAudience(outage, opts), []);
});

test('fixtures are never production evidence: a fixture Gold or insights document is rejected outright', () => {
  const fixtureGold = build({ gold: asSource(syntheticGold({ propertyIds: ids, fixture: true })) });
  assert.equal(fixtureGold.source.status, 'rejected');
  assert.match(fixtureGold.source.reason, /fixture/i);
  assert.ok(allReadings(fixtureGold).every(reading => reading.value === null));

  const fixtureInsights = build({ gold: asSource(syntheticGold({ propertyIds: ids })), insights: asSource(syntheticInsights({ propertyIds: ids, fixture: true })) });
  assert.equal(fixtureInsights.source.status, 'measured', 'the Gold reading survives');
  assert.equal(fixtureInsights.source.insights.status, 'rejected');
  assert.ok(Object.values(fixtureInsights.estate.trend).every(reading => reading.value === null), 'no trend from a fixture');
  assert.equal(fixtureInsights.series.estateDaily.points.length, 0);
});

test('corrupted Gold fails closed: wrong contract, wrong schema, duplicate metric, missing metrics array', () => {
  const good = syntheticGold({ propertyIds: ids });
  assert.equal(validateGoldEnvelope(good), null);
  assert.match(validateGoldEnvelope({ ...good, contract_name: 'other' }), /not a gfd-canonical-gold/);
  assert.match(validateGoldEnvelope({ ...good, schema_version: '1.1.0' }), /Unsupported/);
  assert.match(validateGoldEnvelope({ ...good, metrics: 'nope' }), /no metrics array/);
  assert.match(validateGoldEnvelope({ ...good, generated_at: 'yesterday' }), /generated_at/);
  assert.match(validateGoldEnvelope({ ...good, metrics: [good.metrics[0], good.metrics[0]] }), /repeats metric/);
  for (const broken of [{ ...good, metrics: [good.metrics[0], good.metrics[0]] }, { ...good, schema_version: '2.0.0' }]) {
    const audience = build({ gold: asSource(broken) });
    assert.equal(audience.source.status, 'rejected');
    assert.ok(allReadings(audience).every(reading => reading.value === null));
  }
});

test('measured audience: totals are exactly the sum of property readings, with provenance, windows and a comparability key', () => {
  const audience = populated();
  assert.equal(audience.source.status, 'measured');
  assert.deepEqual(validateAudience(audience, opts), []);
  for (const days of [7, 28, 90]) {
    const total = audience.estate.requests[days];
    const sum = audience.properties.reduce((acc, row) => acc + row.requests[days].value, 0);
    assert.equal(total.value, sum);
    assert.equal(total.evidenceState, 'measured');
    assert.equal(total.window.days, days);
    assert.match(total.comparabilityKey, /^gold\|1\.2\|\d+d\|/);
    assert.equal(total.provenance.propertiesIncluded.length, ids.length);
  }
  const first = audience.properties[0].requests[28];
  assert.equal(first.provenance.metricId, 'cloudflare.globaldeets.com.28d.requests');
  assert.equal(first.observedAt, '2026-10-01T06:00:00Z');
  assert.equal(audience.source.gold.fixture, false);
  assert.equal(audience.source.freshness.state, 'fresh');
});

test('unknown is not zero: a property missing from Gold is unavailable, excluded from the total, and the total says it is a lower bound', () => {
  const audience = populated({ omit: ['heavymoose.com'] });
  const row = audience.properties.find(item => item.propertyId === 'heavymoose.com');
  assert.equal(row.requests[28].value, null);
  assert.equal(row.requests[28].evidenceState, 'unavailable');
  assert.equal(row.share28d.value, null);
  assert.equal(row.rank28d, null);
  const total = audience.estate.requests[28];
  assert.equal(total.evidenceState, 'partial');
  assert.match(total.limitations, /lower bound/);
  assert.equal(audience.source.status, 'partial');
  assert.equal(audience.estate.propertiesMeasured, ids.length - 1);
  assert.deepEqual(validateAudience(audience, opts), []);
});

test('a measured zero stays a zero and is distinguishable from unknown', () => {
  const audience = populated({ volumes: { 'foxyana.com': 0 } });
  const row = audience.properties.find(item => item.propertyId === 'foxyana.com');
  assert.equal(row.requests[28].value, 0);
  assert.equal(row.requests[28].evidenceState, 'measured');
  assert.equal(semantics.classifyReading(row.requests[28]).kind, 'zero-measured');
  const missing = populated({ omit: ['foxyana.com'] }).properties.find(item => item.propertyId === 'foxyana.com');
  assert.equal(semantics.classifyReading(missing.requests[28]).kind, 'unavailable');
  assert.notEqual(semantics.classifyReading(missing.requests[28]).kind, 'zero-measured');
});

test('partial coverage and non-matching windows are excluded from totals and shares', () => {
  const partial = populated({ partial: ['aiaimate.com'] });
  const row = partial.properties.find(item => item.propertyId === 'aiaimate.com');
  assert.equal(row.requests[28].evidenceState, 'partial');
  assert.ok(row.requests[28].limitations);
  assert.ok(!partial.estate.requests[28].provenance.propertiesIncluded.includes('aiaimate.com'));
  assert.equal(row.share28d.value, null);

  const shifted = populated({
    mutate: doc => {
      const metric = doc.metrics.find(item => item.metric_id === 'cloudflare.heavymoose.com.28d.requests');
      metric.observation.start = '2026-09-15T00:00:00Z';
    },
  });
  const shiftedRow = shifted.properties.find(item => item.propertyId === 'heavymoose.com');
  assert.equal(shiftedRow.requests[28].evidenceState, 'incomparable');
  assert.equal(shiftedRow.requests[28].value, null);

  const current = populated({
    mutate: doc => {
      doc.metrics.find(item => item.metric_id === 'cloudflare.foxyana.com.7d.requests').observation.partial_current_period = true;
    },
  });
  assert.equal(current.properties.find(item => item.propertyId === 'foxyana.com').requests[7].evidenceState, 'incomparable');
});

test('windows that end on different days are never summed together', () => {
  const audience = populated({
    mutate: doc => {
      for (const metric of doc.metrics.filter(item => /^cloudflare\.(heavymoose|foxyana)\.com\.28d\./.test(item.metric_id))) {
        metric.observation.start = '2026-09-02T00:00:00Z';
        metric.observation.end = '2026-09-30T00:00:00Z';
      }
    },
  });
  const total = audience.estate.requests[28];
  assert.equal(total.evidenceState, 'partial');
  assert.equal(total.provenance.excluded.length, 2);
  assert.deepEqual(validateAudience(audience, opts), []);
});

test('contribution and concentration are computed from measured 28-day requests only', () => {
  const audience = populated();
  const shares = audience.properties.map(row => row.share28d.value).filter(value => typeof value === 'number');
  assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 100) < 0.6);
  const top = [...audience.properties].sort((a, b) => b.requests[28].value - a.requests[28].value)[0];
  assert.equal(audience.estate.concentration.topProperty, top.propertyId);
  assert.equal(audience.properties.find(item => item.propertyId === top.propertyId).rank28d, 1);
  assert.ok(audience.estate.concentration.top3SharePct >= audience.estate.concentration.top1SharePct);
  assert.ok(['diversified', 'moderate', 'concentrated'].includes(audience.estate.concentration.level));

  const dominant = populated({ volumes: { 'globaldeets.com': 9_000_000 } });
  assert.equal(dominant.estate.concentration.dominant, true);
  assert.equal(dominant.estate.concentration.level, 'concentrated');
});

test('trends are producer-computed, comparable, and only material moves are called growth or decline', () => {
  const audience = populated({}, { growth: { 'aiaimate.com': 0.05, 'heavymoose.com': -0.05, 'foxyana.com': 0.0001 } });
  const grower = audience.properties.find(item => item.propertyId === 'aiaimate.com');
  const decliner = audience.properties.find(item => item.propertyId === 'heavymoose.com');
  assert.equal(grower.trend[28].evidenceState, 'measured');
  assert.equal(grower.direction, 'growing');
  assert.equal(decliner.direction, 'declining');
  assert.ok(grower.trend[28].value > 10 && decliner.trend[28].value < -10);
  assert.equal(grower.trend[28].provenance.currentWindow.start.length, 10);
  assert.equal(grower.trend[90].evidenceState, 'incomparable', 'an unavailable 90-day comparison is incomparable, never zero');
  assert.match(grower.trend[90].reason, /Insufficient/);
  assert.equal(audience.properties.find(item => item.propertyId === 'foxyana.com').direction, 'stable');
  assert.ok(audience.estate.movers.growing.some(entry => entry.propertyId === 'aiaimate.com'));
  assert.ok(audience.estate.movers.declining.some(entry => entry.propertyId === 'heavymoose.com'));
  assert.equal(audience.estate.movers.window, 28);
  assert.deepEqual(validateAudience(audience, opts), []);
});

test('a tiny property with a huge percentage swing is not called growth (materiality needs absolute volume too)', () => {
  const volumes = { 'goodflippinluck.com': 60 };
  const audience = populated({ volumes }, { volumes, growth: { 'goodflippinluck.com': 0.1 } });
  const row = audience.properties.find(item => item.propertyId === 'goodflippinluck.com');
  assert.ok(row.trend[28].value > 10, 'the percentage swing is large');
  assert.ok(row.trend[28].provenance.absoluteDelta < 100, 'but the absolute movement is tiny');
  assert.equal(row.direction, 'stable');
});

test('insights derived from a different Gold snapshot are incomparable and never mixed', () => {
  const audience = build({ gold: asSource(syntheticGold({ propertyIds: ids })), insights: asSource(syntheticInsights({ propertyIds: ids, sourceGoldGeneratedAt: '2026-09-30T06:00:00Z' })) });
  assert.equal(audience.source.insights.status, 'incomparable');
  assert.ok(Object.values(audience.estate.trend).every(reading => reading.value === null));
  assert.equal(audience.series.estateDaily.status, 'unavailable');
  assert.equal(audience.source.status, 'measured', 'Gold readings stand on their own');
});

test('a zero baseline makes a trend incomparable rather than infinite or zero', () => {
  const audience = populated(
    {},
    {
      mutate: doc => {
        const item = doc.trend_comparisons.find(entry => entry.property_id === 'foxyana.com' && entry.period_days === 28);
        item.baseline_value = 0;
        item.current_value = 500;
      },
    }
  );
  const trend = audience.properties.find(row => row.propertyId === 'foxyana.com').trend[28];
  assert.equal(trend.evidenceState, 'incomparable');
  assert.equal(trend.value, null);
  assert.match(trend.reason, /zero/);
});

test('incomplete daily coverage yields no delta and gaps are never interpolated in the daily series', () => {
  const audience = populated(
    {},
    {
      mutate: doc => {
        const comparison = doc.trend_comparisons.find(entry => entry.property_id === 'aiaimate.com' && entry.period_days === 7);
        comparison.coverage_state = 'partial_coverage';
        comparison.missing_dates = ['2026-09-27'];
        const series = doc.series.find(entry => entry.property_id === 'aiaimate.com');
        series.points = series.points.filter(point => point.date !== '2026-09-20');
      },
    }
  );
  assert.equal(audience.properties.find(row => row.propertyId === 'aiaimate.com').trend[7].evidenceState, 'incomparable');
  const daily = audience.series.estateDaily;
  assert.ok(daily.incompleteDates.includes('2026-09-20'));
  assert.ok(!daily.points.some(point => point.date === '2026-09-20'), 'a day missing a property is a gap, not a smaller number');
  assert.equal(daily.status, 'partial');
});

test('corrupt insights (bad point, duplicate date, negative value) are rejected as a document', () => {
  const good = syntheticInsights({ propertyIds: ids });
  assert.deepEqual(validateInsightsEnvelope(good), { ok: true });
  const dup = structuredClone(good);
  dup.series[0].points.push(dup.series[0].points[0]);
  assert.match(validateInsightsEnvelope(dup).error, /repeats date/);
  const neg = structuredClone(good);
  neg.series[1].points[3].value = -4;
  assert.match(validateInsightsEnvelope(neg).error, /invalid point/);
  assert.match(validateInsightsEnvelope({ ...good, contract_name: 'x' }).error, /not a gfd-traffic-insights/);
});

test('stale audience: freshness is evaluated, an expired source is flagged and readings are not current', () => {
  const stale = populated({ generatedAt: '2026-09-25T06:00:00Z' });
  assert.equal(stale.source.freshness.state, 'expired');
  const reading = stale.estate.requests[28];
  assert.equal(semantics.classifyReading(reading, stale.source.freshness).kind, 'stale');
  assert.equal(semantics.classifyReading(reading, stale.source.freshness).current, false);
  assert.equal(semantics.classifyReading(reading, { state: 'stale' }).current, false);
});

test('traffic classification is unsupported and never inferred from edge data', () => {
  const audience = populated();
  assert.equal(audience.classification.support['certified-human'], 'unsupported');
  assert.equal(audience.classification.support['likely-human'], 'unsupported');
  assert.equal(audience.classification.support['automated-agentic'], 'unsupported');
  assert.equal(audience.classification.composition.length, 1);
  assert.equal(audience.classification.composition[0].class, 'unclassified-edge-requests');
  assert.equal(audience.policy.edgeTrafficIsHumanAudience, false);
  assert.equal(audience.policy.uniquesAreAdditive, false);
});

test('the validator catches tampering: altered totals, a fixture flag, negative values, values without a measured source', () => {
  const audience = populated();
  const tampered = structuredClone(audience);
  tampered.estate.requests[28].value += 1;
  assert.ok(validateAudience(tampered, opts).some(error => /does not equal the sum/.test(error)));

  const fixtureFlag = structuredClone(audience);
  fixtureFlag.source.gold.fixture = true;
  assert.ok(validateAudience(fixtureFlag, opts).some(error => /fixture/.test(error)));

  const negative = structuredClone(audience);
  negative.properties[0].requests[7].value = -3;
  assert.ok(validateAudience(negative, opts).some(error => /negative/.test(error)));

  const forged = structuredClone(build({ gold: { doc: null, configured: false, httpStatus: null, reason: 'x' } }));
  forged.properties[0].requests[28] = { evidenceState: 'measured', value: 5 };
  assert.ok(validateAudience(forged, opts).some(error => /without a measured source/.test(error)));

  const zeroFromNull = structuredClone(audience);
  zeroFromNull.properties[2].requests[28] = { evidenceState: 'unavailable', value: 0, reason: 'x' };
  assert.ok(validateAudience(zeroFromNull, opts).some(error => /must not carry a value/.test(error)));
});

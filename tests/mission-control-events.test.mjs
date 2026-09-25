import assert from 'node:assert/strict';
import test from 'node:test';
import { registry } from './helpers/mission-control-fakes.mjs';
import { asSource, syntheticEventsFeed } from './helpers/mission-control-audience-fixtures.mjs';
import { buildBusinessEvents, validateBusinessEvents, validateFeed } from '../tools/mission-control/lib/events.mjs';
import { expectedPropertyIds } from '../tools/mission-control/lib/contracts.mjs';

const NOW = '2026-10-01T09:00:00Z';
const reg = registry();
const opts = { expectPropertyIds: expectedPropertyIds(reg) };
const noService = new Map([['artificelligance.com', 'no-service-published'], ['artificelligence.com', 'no-service-published'], ['fwomps.com', 'no-service-published'], ['fwomp.us', 'no-service-published']]);
const build = feed => buildBusinessEvents({ registry: reg, now: NOW, feed, availabilityById: noService });
const row = (events, id) => events.properties.find(item => item.propertyId === id);
const readings = property => property.events.flatMap(event => Object.values(event.readings));

test('no feed: nothing is connected, "not connected" and "uninstrumented" stay distinct, and no cell carries a number', () => {
  const events = build({ doc: null, configured: false, httpStatus: null, reason: 'x' });
  assert.equal(events.source.status, 'not-connected');
  assert.deepEqual(validateBusinessEvents(events, opts), []);
  assert.ok(events.source.requirement.secrets.includes('CLOUDFLARE_API_TOKEN'));
  // Properties whose source declares event-producing routes are "not connected"; the rest are "uninstrumented".
  assert.equal(row(events, 'goodflippindesign.com').instrumentation.state, 'not-connected');
  assert.equal(row(events, 'aiaimate.com').instrumentation.state, 'not-connected');
  assert.equal(row(events, 'cyancanoe.com').instrumentation.state, 'not-connected');
  assert.equal(row(events, 'heavymoose.com').instrumentation.state, 'uninstrumented');
  assert.equal(row(events, 'artificelligance.com').instrumentation.state, 'not-applicable');
  assert.equal(row(events, 'culturesherpa.com').instrumentation.state, 'not-applicable', 'a redirect alias has no outcomes of its own');
  for (const property of events.properties) {
    for (const reading of readings(property)) assert.equal(reading.value, null);
    for (const reading of Object.values(property.conversion)) assert.equal(reading.value, null);
  }
  const gfd = row(events, 'goodflippindesign.com');
  assert.ok(gfd.events.some(event => event.eventType === 'lead'));
  assert.equal(gfd.events.find(event => event.eventType === 'lead').readings[28].evidenceState, 'not-connected');
  assert.equal(row(events, 'heavymoose.com').events.length, 0, 'no outcome is declared, so no event row is invented');
  assert.equal(events.coverage.instrumented, 0);
  assert.equal(events.coverage.withDeclaredOutcome, 6);
  assert.equal(events.coverage.withCandidateProducers, 3);
});

test('a credential problem is awaiting-authorized-source, an outage is unavailable; neither yields a number', () => {
  const denied = build({ doc: null, configured: true, httpStatus: 403, reason: 'Business-event feed source returned HTTP 403.' });
  assert.equal(denied.source.status, 'awaiting-authorized-source');
  assert.equal(row(denied, 'aiaimate.com').instrumentation.state, 'awaiting-authorized-source');
  const outage = build({ doc: null, configured: true, httpStatus: 500, reason: 'x' });
  assert.equal(outage.source.status, 'unavailable');
  assert.ok(events => events);
  for (const events of [denied, outage]) {
    assert.deepEqual(validateBusinessEvents(events, opts), []);
    for (const property of events.properties) assert.ok(readings(property).every(reading => reading.value === null));
  }
});

test('a measured zero requires declared instrumentation: zero is distinct from not connected', () => {
  const feed = syntheticEventsFeed({ instrumented: ['goodflippindesign.com'], records: [['goodflippindesign.com', 'lead', 28, 0], ['goodflippindesign.com', 'lead', 7, 0], ['goodflippindesign.com', 'lead', 90, 0]] });
  const events = build(asSource(feed));
  assert.equal(events.source.status, 'measured');
  const lead = row(events, 'goodflippindesign.com').events.find(event => event.eventType === 'lead');
  assert.equal(lead.readings[28].value, 0);
  assert.equal(lead.readings[28].evidenceState, 'measured');
  const other = row(events, 'aiaimate.com').events.find(event => event.eventType === 'signup');
  assert.equal(other.readings[28].value, null);
  assert.equal(other.readings[28].evidenceState, 'not-connected');
  assert.deepEqual(validateBusinessEvents(events, opts), []);

  const claimsZero = syntheticEventsFeed({ instrumented: [], records: [['goodflippindesign.com', 'lead', 28, 0]] });
  assert.match(validateFeed(claimsZero, reg), /without declaring it instrumented/);
  assert.equal(build(asSource(claimsZero)).source.status, 'rejected');
});

test('fixture, unknown property, foreign event type, bad window, non-integer and duplicate records are all rejected', () => {
  const base = { instrumented: ['aiaimate.com'], records: [['aiaimate.com', 'signup', 28, 5]] };
  assert.equal(validateFeed(syntheticEventsFeed(base), reg), null);
  assert.match(validateFeed(syntheticEventsFeed({ ...base, fixture: true }), reg), /fixture/);
  assert.match(validateFeed(syntheticEventsFeed({ instrumented: ['nope.com'], records: [] }), reg), /unregistered property/);
  assert.match(validateFeed(syntheticEventsFeed({ instrumented: ['aiaimate.com'], records: [['aiaimate.com', 'vibes', 28, 1]] }), reg), /outside the common vocabulary/);
  assert.match(validateFeed(syntheticEventsFeed({ instrumented: ['aiaimate.com'], records: [['aiaimate.com', 'signup', 28, 1.5]] }), reg), /non-negative integer/);
  assert.match(validateFeed(syntheticEventsFeed({ instrumented: ['aiaimate.com'], records: [['aiaimate.com', 'signup', 28, -1]] }), reg), /non-negative integer/);
  assert.match(validateFeed(syntheticEventsFeed({ instrumented: ['aiaimate.com'], records: [['aiaimate.com', 'signup', 28, 1], ['aiaimate.com', 'signup', 28, 2]] }), reg), /repeats/);
  const badWindow = syntheticEventsFeed(base);
  badWindow.records[0].window.days = 7;
  assert.match(validateFeed(badWindow, reg), /window bounds/);
  assert.match(validateFeed({ contractName: 'other' }, reg), /Source is not a/);
  assert.match(validateFeed(null, reg), /not a JSON object/);
});

test('conversion rates need a comparable visit denominator; otherwise they are incomparable, never zero or infinite', () => {
  const noDenominator = build(asSource(syntheticEventsFeed({ instrumented: ['goodflippindesign.com'], records: [['goodflippindesign.com', 'lead', 28, 12]] })));
  const conversion = row(noDenominator, 'goodflippindesign.com').conversion[28];
  assert.equal(conversion.evidenceState, 'incomparable');
  assert.equal(conversion.value, null);

  const withDenominator = build(asSource(syntheticEventsFeed({ instrumented: ['goodflippindesign.com'], records: [['goodflippindesign.com', 'lead', 28, 12], ['goodflippindesign.com', 'visit', 28, 800]] })));
  const rate = row(withDenominator, 'goodflippindesign.com').conversion[28];
  assert.equal(rate.evidenceState, 'measured');
  assert.equal(rate.value, 1.5);
  assert.deepEqual(rate.provenance, { outcome: 'lead', count: 12, visits: 800 });

  const zeroVisits = build(asSource(syntheticEventsFeed({ instrumented: ['goodflippindesign.com'], records: [['goodflippindesign.com', 'lead', 28, 3], ['goodflippindesign.com', 'visit', 28, 0]] })));
  assert.equal(row(zeroVisits, 'goodflippindesign.com').conversion[28].evidenceState, 'incomparable');
});

test('estate totals sum only instrumented properties and say so; they are never presented as an estate total', () => {
  const feed = syntheticEventsFeed({ instrumented: ['goodflippindesign.com', 'aiaimate.com'], records: [['goodflippindesign.com', 'lead', 28, 10], ['aiaimate.com', 'signup', 28, 30], ['aiaimate.com', 'lead', 28, 5], ['goodflippindesign.com', 'lead', 7, 2]] });
  const events = build(asSource(feed));
  assert.equal(events.estate.totals.lead[28].value, 15);
  assert.equal(events.estate.totals.lead[28].evidenceState, 'partial');
  assert.match(events.estate.totals.lead[28].limitations, /not an estate total/);
  assert.equal(events.estate.totals.signup[28].value, 30);
  assert.equal(events.coverage.instrumented, 2);
  assert.deepEqual(validateBusinessEvents(events, opts), []);
});

test('a property the feed does not list stays not-connected/uninstrumented even when other properties report', () => {
  const events = build(asSource(syntheticEventsFeed({ instrumented: ['aiaimate.com'], records: [['aiaimate.com', 'signup', 28, 30]] })));
  assert.equal(row(events, 'goodflippindesign.com').instrumentation.state, 'not-connected');
  assert.equal(row(events, 'heavymoose.com').instrumentation.state, 'uninstrumented');
  assert.equal(row(events, 'aiaimate.com').instrumentation.state, 'instrumented');
});

test('the validator rejects forged counts, zeros without instrumentation, and fixture feeds', () => {
  const events = build({ doc: null, configured: false, httpStatus: null, reason: 'x' });
  const forged = structuredClone(events);
  forged.properties.find(item => item.propertyId === 'heavymoose.com').events.push({ eventType: 'lead', label: 'Lead', readings: { 7: { evidenceState: 'measured', value: 0 }, 28: { evidenceState: 'measured', value: 0 }, 90: { evidenceState: 'measured', value: 0 } } });
  const errors = validateBusinessEvents(forged, opts);
  assert.ok(errors.some(error => /reports zero without instrumentation/.test(error)));
  assert.ok(errors.some(error => /count without instrumentation/.test(error)));

  const fixtureFeed = build(asSource(syntheticEventsFeed({ instrumented: ['aiaimate.com'], records: [] })));
  const flagged = structuredClone(fixtureFeed);
  flagged.source.feed.fixture = true;
  assert.ok(validateBusinessEvents(flagged, opts).some(error => /fixture/.test(error)));

  const unexplained = structuredClone(events);
  unexplained.source.requirement = null;
  assert.ok(validateBusinessEvents(unexplained, opts).some(error => /must state the missing requirement/.test(error)));
});

test('the vocabulary is small, common, and does not force commerce semantics onto every property', () => {
  const events = build({ doc: null, configured: false, httpStatus: null, reason: 'x' });
  assert.ok(events.vocabulary.length <= 10);
  assert.deepEqual(events.vocabulary.filter(item => item.commerce).map(item => item.id), ['purchase']);
  assert.equal(events.policy.forceCommerceSemantics, false);
  const outcomes = new Set(events.properties.map(item => item.primaryOutcome?.type).filter(Boolean));
  assert.deepEqual([...outcomes].sort(), ['engagement', 'lead', 'signup']);
  assert.ok(![...outcomes].includes('purchase'), 'no property is forced into a purchase outcome');
});

test('an expired feed is withheld: its counts are never shown as current business outcomes', () => {
  const stale = syntheticEventsFeed({ instrumented: ['aiaimate.com'], records: [['aiaimate.com', 'signup', 28, 61]], generatedAt: '2026-09-20T06:00:00Z' });
  const events = build(asSource(stale));
  assert.equal(events.source.status, 'unavailable');
  assert.match(events.source.reason, /withheld as not current/);
  assert.equal(events.source.freshness.state, 'expired');
  assert.equal(events.coverage.instrumented, 0);
  for (const property of events.properties) assert.ok(readings(property).every(reading => reading.value === null));
  assert.deepEqual(validateBusinessEvents(events, opts), []);
});

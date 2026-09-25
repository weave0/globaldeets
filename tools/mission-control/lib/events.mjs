/**
 * Business-event contract builder (GD-031).
 *
 * A small common vocabulary (visit, engagement, CTA, lead, signup, application, purchase, download, other
 * declared outcome) with property-specific primary outcomes. Nothing is forced into commerce semantics.
 *
 * The distinction this contract exists to protect:
 *   "0 conversions observed"  = the property IS instrumented and the feed reported zero (a measured zero)
 *   "not connected"           = an event-producing route exists in source, but no governed feed carries its counts
 *   "uninstrumented"          = nothing is declared that could count this outcome
 *   "awaiting-authorized-source" / "unavailable" = a feed is configured but cannot be read
 * Only the first carries a number.
 *
 * Feed contract (input): globaldeets-business-events-feed 1.x
 *   { contractName, schemaVersion, fixture:false, generatedAt, source:{id,label},
 *     instrumentedProperties:[propertyId...],
 *     records:[{ propertyId, eventType, window:{start,end,days}, count:int>=0 }] }
 * A count of 0 is only accepted for a property the feed itself lists as instrumented.
 */
import { createRequire } from 'node:module';
import { emptyReading, measuredReading, validateReading } from './readings.mjs';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

export const EVENTS_CONTRACT_NAME = 'globaldeets-business-events';
export const EVENTS_SCHEMA_VERSION = '1.0.0';
export const FEED_CONTRACT_NAME = 'globaldeets-business-events-feed';
export const EVENT_WINDOWS = Object.freeze([7, 28, 90]);

const VOCAB_IDS = semantics.OUTCOME_VOCABULARY.map(item => item.id);
const round1 = value => Math.round(value * 10) / 10;

function policy() {
  return { missingIsZero: false, zeroRequiresInstrumentation: true, ratesRequireComparableDenominator: true, fixturesAreProduction: false, forceCommerceSemantics: false };
}

/** Validates the feed envelope and every record. Returns an error string or null. */
export function validateFeed(doc, registry) {
  if (!doc || typeof doc !== 'object') return 'Business-event feed is not a JSON object.';
  if (doc.contractName !== FEED_CONTRACT_NAME) return 'Source is not a ' + FEED_CONTRACT_NAME + ' document.';
  if (!/^1\./.test(String(doc.schemaVersion))) return 'Unsupported business-event feed schemaVersion ' + doc.schemaVersion + '.';
  if (doc.fixture !== false) return 'Business-event feed is a fixture (fixture !== false); fixtures are never observations.';
  if (!Number.isFinite(Date.parse(doc.generatedAt))) return 'Business-event feed has an invalid generatedAt.';
  if (!Array.isArray(doc.records) || !Array.isArray(doc.instrumentedProperties)) return 'Business-event feed needs records[] and instrumentedProperties[].';
  const known = new Set(registry.properties.map(item => item.propertyId));
  for (const id of doc.instrumentedProperties) if (!known.has(id)) return 'Feed declares an unregistered property ' + id + '.';
  const instrumented = new Set(doc.instrumentedProperties);
  const seen = new Set();
  for (const record of doc.records) {
    if (!known.has(record?.propertyId)) return 'Feed record references an unregistered property ' + record?.propertyId + '.';
    if (!VOCAB_IDS.includes(record.eventType)) return 'Feed record uses an event type outside the common vocabulary: ' + record.eventType + '.';
    if (!EVENT_WINDOWS.includes(record.window?.days)) return 'Feed record has an unsupported window for ' + record.propertyId + '.';
    const days = Math.round((Date.parse(record.window.end) - Date.parse(record.window.start)) / 86400000);
    if (!Number.isFinite(days) || days !== record.window.days) return 'Feed record window bounds do not match its day count for ' + record.propertyId + '.';
    if (!Number.isInteger(record.count) || record.count < 0) return 'Feed record count must be a non-negative integer (' + record.propertyId + ' ' + record.eventType + ').';
    if (record.lastEventDay != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(record.lastEventDay))) return 'Feed record lastEventDay must be a UTC date (' + record.propertyId + ' ' + record.eventType + ').';
    if (!instrumented.has(record.propertyId)) return 'Feed reports counts for ' + record.propertyId + ' without declaring it instrumented.';
    const key = [record.propertyId, record.eventType, record.window.days].join('|');
    if (seen.has(key)) return 'Feed repeats ' + key + '; refusing to choose between duplicates.';
    seen.add(key);
  }
  return null;
}

function propertyApplicable(property, availabilityById) {
  if (availabilityById?.get(property.propertyId) === 'no-service-published') return { applicable: false, reason: 'No web service is published.' };
  if (property.profile?.lifecycle === 'alias' && property.probe.expectation === 'redirects') return { applicable: false, reason: 'Redirect alias: outcomes belong to the destination property.' };
  return { applicable: true, reason: null };
}

/**
 * Builds the business-event contract.
 * @param {object} input registry, now, feed ({doc, configured, reason, httpStatus}), availabilityById (Map propertyId -> effective state)
 */
export function buildBusinessEvents({ registry, now, feed, availabilityById = new Map() }) {
  const configured = Boolean(feed?.configured);
  let sourceStatus;
  let sourceReason = null;
  let doc = null;
  if (!configured) {
    sourceStatus = 'not-connected';
    sourceReason = 'No governed business-event feed is connected. Event-producing routes may exist in source, but none reports counts to Mission Control.';
  } else if (!feed.doc) {
    sourceStatus = feed.httpStatus === 401 || feed.httpStatus === 403 ? 'awaiting-authorized-source' : 'unavailable';
    sourceReason = feed.reason || 'The business-event feed could not be read.';
  } else {
    const error = validateFeed(feed.doc, registry);
    if (error) {
      sourceStatus = 'rejected';
      sourceReason = error;
    } else {
      doc = feed.doc;
      sourceStatus = 'measured';
    }
  }

  let freshness = doc ? semantics.evaluateFreshness(doc.generatedAt, semantics.FRESHNESS_POLICY.businessEvents, now) : { state: 'unknown', ageHours: null, freshUntil: null, expiresAt: null };
  // An expired feed is never presented as current outcomes: its counts are withheld, not aged in place.
  if (doc && freshness.state === 'expired') {
    sourceStatus = 'unavailable';
    sourceReason = 'The business-event feed was generated ' + freshness.ageHours + ' hours ago, past the ' + semantics.FRESHNESS_POLICY.businessEvents.expiredAfterHours + '-hour limit; its counts are withheld as not current.';
    doc = null;
    freshness = { ...freshness, state: 'expired' };
  }
  const instrumentedIds = new Set(doc?.instrumentedProperties || []);
  const records = new Map((doc?.records || []).map(record => [[record.propertyId, record.eventType, record.window.days].join('|'), record]));
  const unavailableState = sourceStatus === 'awaiting-authorized-source' ? 'awaiting-authorized-source' : 'unavailable';

  const properties = registry.properties.map(property => {
    const declared = property.measurement?.businessEvents || { status: 'none-declared', candidateProducers: [] };
    const outcome = property.profile?.primaryOutcome || null;
    const applicability = propertyApplicable(property, availabilityById);
    let state;
    let reason;
    if (!applicability.applicable) {
      state = 'not-applicable';
      reason = applicability.reason;
    } else if (doc && instrumentedIds.has(property.propertyId)) {
      state = 'instrumented';
      reason = 'The governed feed lists this property as instrumented.';
    } else if (sourceStatus === 'awaiting-authorized-source' || sourceStatus === 'unavailable' || sourceStatus === 'rejected') {
      state = sourceStatus === 'rejected' ? 'unavailable' : unavailableState;
      reason = sourceReason;
    } else if (declared.status === 'declared-unconnected') {
      state = 'not-connected';
      reason = 'Event-producing routes exist in source (' + declared.candidateProducers.map(item => item.type).join(', ') + ') but no governed feed carries their counts.';
    } else {
      state = 'uninstrumented';
      reason = 'No event-producing route has been declared for this property.';
    }

    const readingState = ['awaiting-authorized-source', 'unavailable'].includes(state) ? state : state === 'not-connected' ? 'not-connected' : state === 'not-applicable' ? 'unknown' : 'uninstrumented';
    // Cells carry a short reason; the full explanation lives once in instrumentation.reason.
    const cellReason = { 'awaiting-authorized-source': 'Awaiting authorized source.', unavailable: 'Source not readable.', 'not-connected': 'No governed feed carries this producer.', unknown: 'Not applicable.', uninstrumented: 'No countable outcome is declared.' }[readingState];
    const eventTypes = new Set();
    if (state !== 'not-applicable') {
      if (outcome?.type) eventTypes.add(outcome.type);
      for (const item of declared.candidateProducers || []) eventTypes.add(item.type);
      if (doc) for (const record of doc.records) if (record.propertyId === property.propertyId) eventTypes.add(record.eventType);
    }
    const events = [...eventTypes].sort().map(eventType => ({
      eventType,
      // Day granularity: the counter store keeps daily counts, so the latest confirmed event is a UTC day, never a timestamp.
      lastEventDay: state === 'instrumented' ? EVENT_WINDOWS.map(days => records.get([property.propertyId, eventType, days].join('|'))?.lastEventDay || null).find(Boolean) || null : null,
      label: semantics.OUTCOME_VOCABULARY.find(item => item.id === eventType)?.label || eventType,
      readings: Object.fromEntries(
        EVENT_WINDOWS.map(days => {
          if (state === 'instrumented') {
            const record = records.get([property.propertyId, eventType, days].join('|'));
            if (!record) return [days, emptyReading('unavailable', 'The feed did not report ' + eventType + ' for a ' + days + '-day window.', { unit: 'events' })];
            return [days, measuredReading(record.count, { unit: 'events', window: record.window, observedAt: doc.generatedAt, confidence: 'medium', provenance: { source: doc.source?.id || 'business-event-feed', eventType } })];
          }
          return [days, emptyReading(readingState, cellReason, { unit: 'events' })];
        })
      ),
    }));

    // A rate needs a comparable visit denominator from the same feed and window; otherwise it stays unavailable.
    const conversion = {};
    for (const days of EVENT_WINDOWS) {
      const visit = records.get([property.propertyId, 'visit', days].join('|'));
      const primary = outcome?.type && outcome.type !== 'visit' ? records.get([property.propertyId, outcome.type, days].join('|')) : null;
      if (state !== 'instrumented') conversion[days] = emptyReading(readingState, cellReason, { unit: 'percent' });
      else if (!primary) conversion[days] = emptyReading('unavailable', 'No primary-outcome count is reported for this window.', { unit: 'percent' });
      else if (!visit || visit.count === 0) conversion[days] = emptyReading('incomparable', 'The feed reports no comparable visit denominator, so no rate is calculated.', { unit: 'percent' });
      else conversion[days] = measuredReading(round1((primary.count / visit.count) * 100), { unit: 'percent', window: primary.window, observedAt: doc.generatedAt, confidence: 'medium', provenance: { outcome: outcome.type, count: primary.count, visits: visit.count } });
    }

    return { propertyId: property.propertyId, primaryOutcome: outcome, earningPath: property.profile?.earningPath || null, instrumentation: { state, reason, candidateProducers: declared.candidateProducers || [] }, events, conversion };
  });

  const applicable = properties.filter(item => item.instrumentation.state !== 'not-applicable');
  const totals = {};
  for (const item of properties) {
    if (item.instrumentation.state !== 'instrumented') continue;
    for (const event of item.events) {
      for (const days of EVENT_WINDOWS) {
        const reading = event.readings[days];
        if (reading.evidenceState !== 'measured') continue;
        totals[event.eventType] ||= {};
        const bucket = (totals[event.eventType][days] ||= { value: 0, propertiesIncluded: [] });
        bucket.value += reading.value;
        bucket.propertiesIncluded.push(item.propertyId);
      }
    }
  }
  const instrumentedCount = properties.filter(item => item.instrumentation.state === 'instrumented').length;
  const estateTotals = Object.fromEntries(
    Object.entries(totals).map(([eventType, windows]) => [
      eventType,
      Object.fromEntries(Object.entries(windows).map(([days, bucket]) => [days, measuredReading(bucket.value, { unit: 'events', partial: bucket.propertiesIncluded.length < applicable.length, confidence: 'low', provenance: { propertiesIncluded: bucket.propertiesIncluded, propertiesApplicable: applicable.length }, limitations: 'Sum over ' + bucket.propertiesIncluded.length + ' instrumented properties of ' + applicable.length + '; not an estate total.' })])),
    ])
  );

  return {
    contractName: EVENTS_CONTRACT_NAME,
    schemaVersion: EVENTS_SCHEMA_VERSION,
    generatedAt: now,
    policy: policy(),
    vocabulary: semantics.OUTCOME_VOCABULARY,
    source: {
      status: sourceStatus,
      reason: sourceReason,
      requirement: sourceStatus === 'measured' ? null : registry.businessEventContract?.requirement || null,
      feed: doc ? { contractName: doc.contractName, schemaVersion: doc.schemaVersion, generatedAt: doc.generatedAt, source: doc.source || null, fixture: false } : null,
      observedAt: doc ? doc.generatedAt : null,
      freshness,
    },
    coverage: {
      propertiesApplicable: applicable.length,
      withDeclaredOutcome: applicable.filter(item => item.primaryOutcome).length,
      withCandidateProducers: applicable.filter(item => item.instrumentation.candidateProducers.length).length,
      instrumented: instrumentedCount,
    },
    estate: { totals: estateTotals },
    properties,
  };
}

export function validateBusinessEvents(events, { expectPropertyIds } = {}) {
  const errors = [];
  if (events?.contractName !== EVENTS_CONTRACT_NAME) return ['events: contractName'];
  for (const [key, value] of Object.entries(policy())) if (events.policy?.[key] !== value) errors.push('events: policy.' + key);
  const status = events.source?.status;
  if (!['measured', 'not-connected', 'awaiting-authorized-source', 'unavailable', 'rejected'].includes(status)) errors.push('events: source.status');
  if (events.source?.feed && events.source.feed.fixture !== false) errors.push('events: a fixture feed can never be published');
  if (status !== 'measured' && !events.source?.requirement) errors.push('events: an unconnected source must state the missing requirement');
  if (!Array.isArray(events.properties)) return [...errors, 'events: properties'];
  if (expectPropertyIds && events.properties.map(item => item.propertyId).join('|') !== expectPropertyIds.join('|')) errors.push('events: properties are not exactly the registered properties in order');
  for (const property of events.properties) {
    const label = 'events: ' + property.propertyId;
    const state = property.instrumentation?.state;
    if (!['instrumented', 'not-connected', 'uninstrumented', 'awaiting-authorized-source', 'unavailable', 'not-applicable'].includes(state)) errors.push(label + ' instrumentation.state');
    for (const event of property.events || []) {
      if (event.lastEventDay != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(event.lastEventDay))) errors.push(label + '.' + event.eventType + ' lastEventDay');
      if (state !== 'instrumented' && event.lastEventDay != null) errors.push(label + '.' + event.eventType + ' has a last event without instrumentation');
      for (const days of EVENT_WINDOWS) {
        const reading = event.readings?.[days];
        errors.push(...validateReading(reading, label + '.' + event.eventType + '.' + days));
        if (state !== 'instrumented' && reading?.value != null) errors.push(label + '.' + event.eventType + '.' + days + ' has a count without instrumentation');
        if (reading?.value === 0 && state !== 'instrumented') errors.push(label + ' reports zero without instrumentation');
      }
    }
    for (const days of EVENT_WINDOWS) errors.push(...validateReading(property.conversion?.[days], label + '.conversion.' + days));
  }
  return errors;
}

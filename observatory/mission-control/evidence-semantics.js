/**
 * Mission Control evidence semantics (GD-030).
 *
 * One implementation of freshness, comparability, and health-contract rules, loaded by the
 * browser (window.MissionControlSemantics) and by the collector/tests (CommonJS). Keeping the
 * rules in a single file means the page, the scheduled collector, and agents never disagree
 * about what counts as fresh, comparable, or healthy.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MissionControlSemantics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HOUR_MS = 3600000;
  const DAY_MS = 86400000;

  /** Cadence and age thresholds. Evidence older than expiredAfterHours may not be presented as current. */
  const FRESHNESS_POLICY = Object.freeze({
    probe: Object.freeze({ cadenceHours: 6, freshWithinHours: 8, expiredAfterHours: 24 }),
    history: Object.freeze({ cadenceHours: 6, freshWithinHours: 30, expiredAfterHours: 72 }),
    inventory: Object.freeze({ cadenceHours: 24, freshWithinHours: 48, expiredAfterHours: 168 }),
    // GD-031: governed audience (Canonical Gold) and business-event feeds are produced daily upstream.
    audience: Object.freeze({ cadenceHours: 24, freshWithinHours: 36, expiredAfterHours: 96 }),
    businessEvents: Object.freeze({ cadenceHours: 24, freshWithinHours: 36, expiredAfterHours: 96 }),
  });

  const AVAILABILITY_STATES = Object.freeze([
    'available',
    'degraded',
    'unavailable',
    'no-service-published',
    'unknown',
  ]);
  const CRITICAL_PATH_STATES = Object.freeze(['pass', 'fail', 'drift', 'unknown']);
  const HEALTH_STATES = Object.freeze([
    'verified-healthy',
    'reachable-unverified',
    'degraded',
    'critical-path-failed',
    'outage',
    'no-service-published',
    'probe-blocked',
    'contract-drift',
    'vantage-conflict',
    'evidence-stale',
    'evidence-expired',
    'health-evidence-incomplete',
  ]);
  const ESCALATION_CLASSES = Object.freeze([
    'investor-impacting-outage',
    'outage',
    'degradation',
    'maintenance',
    'observability-gap',
    'stale-evidence',
    'insufficient-evidence',
    'measurement-claim-block',
    'business-opportunity',
    'narrative-provenance',
    'none',
  ]);

  function toMs(input) {
    if (input instanceof Date) return input.getTime();
    if (typeof input === 'number') return input;
    const parsed = Date.parse(String(input ?? ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  /**
   * Age classification for a piece of evidence. `expired` evidence must be displayed as unknown,
   * never as its last known state.
   */
  function evaluateFreshness(observedAt, policy, now) {
    const observedMs = toMs(observedAt);
    const nowMs = toMs(now === undefined ? Date.now() : now);
    if (!Number.isFinite(observedMs) || !Number.isFinite(nowMs) || !policy) {
      return { state: 'unknown', ageHours: null, freshUntil: null, expiresAt: null };
    }
    const ageHours = Math.max(0, (nowMs - observedMs) / HOUR_MS);
    const freshUntil = new Date(observedMs + policy.freshWithinHours * HOUR_MS).toISOString();
    const expiresAt = new Date(observedMs + policy.expiredAfterHours * HOUR_MS).toISOString();
    let state = 'fresh';
    if (ageHours > policy.expiredAfterHours) state = 'expired';
    else if (ageHours > policy.freshWithinHours) state = 'stale';
    return { state, ageHours: Math.round(ageHours * 10) / 10, freshUntil, expiresAt };
  }

  /**
   * Applies freshness to an availability record. Expired evidence collapses to `unknown` and
   * keeps the last known state only as labelled context.
   */
  function effectiveAvailability(availability, freshness) {
    const state = availability?.state ?? 'unknown';
    if (!freshness || freshness.state === 'unknown') {
      return { state: 'unknown', stale: false, expired: false, lastKnownState: null };
    }
    if (freshness.state === 'expired') {
      return { state: 'unknown', stale: true, expired: true, lastKnownState: state === 'unknown' ? null : state };
    }
    return { state, stale: freshness.state === 'stale', expired: false, lastKnownState: null };
  }

  /**
   * The explicit health contract. HTTP reachability alone is never health: `verified-healthy`
   * requires fresh conclusive availability AND an authoritative critical-path pass.
   */
  function classifyHealth(input) {
    const { availability, criticalPath, freshness } = input;
    if (!availability || !availability.observedAt || !freshness || freshness.state === 'unknown') {
      return 'health-evidence-incomplete';
    }
    if (freshness.state === 'expired') return 'evidence-expired';
    // A confirmed outage keeps its alarm even when the observation ages; everything else that is
    // merely stale stops claiming a current state.
    if (freshness.state === 'stale' && availability.state !== 'unavailable') return 'evidence-stale';
    // Two vantages that conclusively disagree are evidence in their own right; neither answer is silently chosen.
    if (availability.conflict === true) return 'vantage-conflict';
    if (availability.blocked) return 'probe-blocked';
    if (availability.state === 'unavailable') return 'outage';
    if (availability.state === 'no-service-published') return 'no-service-published';
    if (availability.state === 'degraded') return 'degraded';
    if (availability.state !== 'available') return 'health-evidence-incomplete';
    if (criticalPath?.state === 'fail') return 'critical-path-failed';
    if (criticalPath?.state === 'drift') return 'contract-drift';
    if (criticalPath?.state === 'pass' && criticalPath.level === 'authoritative') return 'verified-healthy';
    return 'reachable-unverified';
  }

  function utcDay(input) {
    const ms = toMs(input);
    return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
  }

  /**
   * Splits a time-ordered series into segments of genuinely comparable points. A new segment starts
   * when the comparability key changes or the gap between observations exceeds maxGapMs. No line is
   * ever interpolated across a segment boundary.
   */
  function segmentComparable(points, options) {
    const maxGapMs = options?.maxGapMs ?? 2 * DAY_MS;
    const ordered = [...points].sort((a, b) => toMs(a.at) - toMs(b.at));
    const segments = [];
    let current = null;
    for (const point of ordered) {
      const startsNew =
        !current ||
        current.key !== point.key ||
        toMs(point.at) - toMs(current.points[current.points.length - 1].at) > maxGapMs;
      if (startsNew) {
        current = { key: point.key, points: [] };
        segments.push(current);
      }
      current.points.push(point);
    }
    return segments;
  }

  /**
   * A delta is only computed inside the most recent comparable segment with at least two points.
   */
  function trendSummary(points, options) {
    const segments = segmentComparable(points, options);
    const latest = segments[segments.length - 1] || null;
    const comparablePoints = latest ? latest.points.length : 0;
    if (comparablePoints < 2) {
      return {
        segments,
        comparablePoints,
        delta: null,
        reason: points.length === 0 ? 'no-measured-observations' : 'fewer-than-two-comparable-observations',
      };
    }
    const first = latest.points[0];
    const last = latest.points[comparablePoints - 1];
    const absolute = last.value - first.value;
    const pct = first.value !== 0 && Number.isFinite(first.value) ? (absolute / Math.abs(first.value)) * 100 : null;
    return {
      segments,
      comparablePoints,
      delta: { absolute, pct, from: first, to: last },
      reason: segments.length > 1 ? 'latest-comparable-segment-only' : 'comparable',
    };
  }

  /** How many of the last `days` UTC days actually have a retained snapshot. */
  function windowCoverage(snapshots, days, now) {
    const nowMs = toMs(now === undefined ? Date.now() : now);
    const cutoff = nowMs - days * DAY_MS;
    const observedDays = new Set();
    for (const snapshot of snapshots) {
      const ms = toMs(snapshot.observedAt);
      if (Number.isFinite(ms) && ms >= cutoff && ms <= nowMs) observedDays.add(utcDay(ms));
    }
    return {
      expectedDays: days,
      observedDays: observedDays.size,
      missingDays: Math.max(0, days - observedDays.size),
    };
  }

  // ── GD-031 vocabulary ────────────────────────────────────────────────────────────────────────────

  /** How a property's browser/audience instrumentation is known. Only reception evidence yields active-verified. */
  const INSTRUMENTATION_STATES = Object.freeze([
    'active-verified',
    'configured-unverified',
    'configured-invalid',
    'absent',
    'inaccessible',
    'not-applicable',
    'unknown',
  ]);

  /**
   * Every numeric cell in the audience and business-event contracts is a "reading". A reading with a
   * number is either a measured value or (only when instrumentation exists) a measured zero; every other
   * state carries null and stays visibly different.
   */
  const READING_STATES = Object.freeze([
    'measured',
    'partial',
    'uninstrumented',
    'not-connected',
    'awaiting-authorized-source',
    'unavailable',
    'stale',
    'incomparable',
    'unknown',
  ]);

  const LIFECYCLE_STATES = Object.freeze(['active', 'incubating', 'experimental', 'dormant', 'intentionally-unpublished', 'deprecated', 'alias', 'unknown']);

  const PORTFOLIO_CATEGORIES = Object.freeze({
    platform: 'Platform & studio',
    learning: 'Learning & culture',
    civic: 'Civic & public interest',
    research: 'AI & research',
    creative: 'Music & creative',
    community: 'Community & brand',
    personal: 'Personal & professional',
    reserved: 'Reserved, nothing published',
    unclassified: 'Not yet classified',
  });

  /** Small common vocabulary; properties declare which outcomes are meaningful to them, never all of them. */
  const OUTCOME_VOCABULARY = Object.freeze([
    { id: 'visit', label: 'Visit', commerce: false },
    { id: 'engagement', label: 'Meaningful engagement', commerce: false },
    { id: 'cta', label: 'Call-to-action interaction', commerce: false },
    { id: 'lead', label: 'Lead or contact', commerce: false },
    { id: 'signup', label: 'Sign-up', commerce: false },
    { id: 'application', label: 'Application', commerce: false },
    { id: 'purchase', label: 'Purchase or payment', commerce: true },
    { id: 'download', label: 'Download or content acquisition', commerce: false },
    { id: 'primary-outcome', label: 'Other declared primary outcome', commerce: false },
  ]);

  const FINDING_CATEGORIES = Object.freeze([
    'availability',
    'critical-path',
    'evidence-quality',
    'instrumentation',
    'audience',
    'business-outcomes',
    'governance',
    'infrastructure',
    'product',
  ]);

  const ACTIONABILITY_STATES = Object.freeze(['actionable-now', 'blocked-on-authority', 'decision-needed', 'monitor', 'closed']);

  /** Human wording and tone for the operating status derived from health + the owner's declared expectation. */
  const OPERATING_STATUS = Object.freeze({
    healthy: Object.freeze({ label: 'Verified healthy', tone: 'good', group: 'healthy' }),
    reachable: Object.freeze({ label: 'Responding, not yet verified', tone: 'info', group: 'reachable' }),
    degraded: Object.freeze({ label: 'Degraded', tone: 'watch', group: 'attention' }),
    failing: Object.freeze({ label: 'Failing', tone: 'bad', group: 'attention' }),
    'conflicting-evidence': Object.freeze({ label: 'Conflicting evidence', tone: 'watch', group: 'attention' }),
    blocked: Object.freeze({ label: 'Blocked from view', tone: 'muted', group: 'unknown' }),
    'expected-inactive': Object.freeze({ label: 'Inactive, as expected', tone: 'muted', group: 'inactive' }),
    'nothing-published': Object.freeze({ label: 'Nothing published', tone: 'muted', group: 'inactive' }),
    'nothing-published-intent-unknown': Object.freeze({ label: 'Nothing published, intent not declared', tone: 'muted', group: 'inactive-unknown' }),
    unknown: Object.freeze({ label: 'Unknown', tone: 'muted', group: 'unknown' }),
  });

  /** Human-facing operating status derived only from health + expectation. Never a new health claim. */
  function operatingStatusFor(health, expectation) {
    if (expectation && expectation.kind === 'expected-inactive') return { key: 'expected-inactive', tone: 'inactive' };
    if (health === 'no-service-published') return { key: expectation && expectation.lifecycle !== 'unknown' ? 'nothing-published' : 'nothing-published-intent-unknown', tone: 'unknown' };
    const map = {
      'verified-healthy': ['healthy', 'healthy'],
      'reachable-unverified': ['reachable', 'reachable'],
      outage: ['failing', 'failing'],
      'critical-path-failed': ['failing', 'failing'],
      degraded: ['degraded', 'watch'],
      'vantage-conflict': ['conflicting-evidence', 'watch'],
      'contract-drift': ['reachable', 'reachable'],
      'probe-blocked': ['blocked', 'blocked'],
      'evidence-stale': ['unknown', 'unknown'],
      'evidence-expired': ['unknown', 'unknown'],
      'health-evidence-incomplete': ['unknown', 'unknown'],
    };
    const entry = map[health] || ['unknown', 'unknown'];
    return { key: entry[0], tone: entry[1] };
  }

  /**
   * Classifies one reading for display and for headline eligibility. Zero is only ever a MEASURED zero;
   * a null value can never become zero, and an aged reading never counts as current.
   */
  function classifyReading(reading, freshness) {
    if (!reading || typeof reading !== 'object') return { kind: 'unknown', hasValue: false, current: false };
    const numeric = typeof reading.value === 'number' && Number.isFinite(reading.value);
    const state = reading.evidenceState || 'unknown';
    const expired = freshness?.state === 'expired';
    const stale = freshness?.state === 'stale';
    if ((state === 'measured' || state === 'partial') && numeric) {
      if (expired) return { kind: 'stale', hasValue: true, current: false, lastKnown: reading.value };
      const zero = reading.value === 0;
      return { kind: zero ? 'zero-measured' : state === 'partial' ? 'partial' : 'value', hasValue: true, current: !stale && state === 'measured', stale, value: reading.value };
    }
    if (state === 'measured' || state === 'partial') return { kind: 'unknown', hasValue: false, current: false };
    if (READING_STATES.includes(state)) return { kind: state, hasValue: false, current: false };
    return { kind: 'unknown', hasValue: false, current: false };
  }

  return {
    HOUR_MS,
    DAY_MS,
    FRESHNESS_POLICY,
    AVAILABILITY_STATES,
    CRITICAL_PATH_STATES,
    HEALTH_STATES,
    ESCALATION_CLASSES,
    INSTRUMENTATION_STATES,
    READING_STATES,
    LIFECYCLE_STATES,
    PORTFOLIO_CATEGORIES,
    OUTCOME_VOCABULARY,
    FINDING_CATEGORIES,
    ACTIONABILITY_STATES,
    OPERATING_STATUS,
    operatingStatusFor,
    classifyReading,
    toMs,
    utcDay,
    evaluateFreshness,
    effectiveAvailability,
    classifyHealth,
    segmentComparable,
    trendSummary,
    windowCoverage,
  };
});

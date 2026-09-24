/**
 * Mission Control view model (GD-031): pure functions shared by the page and by node tests.
 *
 * Nothing here decides a fact. Facts come from the governed contracts; this module formats them, re-evaluates
 * freshness at render time (published evidence ages), filters and sorts the work queue, validates the
 * bundle the page received (the page fails closed on anything malformed), and builds the copyable summary.
 */
(function (root, factory) {
  const semantics = typeof module === 'object' && module.exports ? require('./evidence-semantics.js') : root.MissionControlSemantics;
  const api = factory(semantics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MissionControlModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (semantics) {
  'use strict';

  const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const ACTIONABILITY_LABELS = {
    'actionable-now': 'Actionable now',
    'blocked-on-authority': 'Blocked on authority',
    'decision-needed': 'Needs a decision',
    monitor: 'Monitor',
    closed: 'Closed',
  };
  const CATEGORY_LABELS = {
    availability: 'Availability',
    'critical-path': 'Critical path',
    'evidence-quality': 'Evidence quality',
    instrumentation: 'Instrumentation',
    audience: 'Audience',
    'business-outcomes': 'Business outcomes',
    governance: 'Governance',
    infrastructure: 'Infrastructure',
    product: 'Product',
  };
  const STATE_LABELS = {
    measured: 'Measured',
    partial: 'Partial',
    uninstrumented: 'Not instrumented',
    'not-connected': 'Not connected',
    'awaiting-authorized-source': 'Awaiting source',
    unavailable: 'Unavailable',
    stale: 'Stale',
    incomparable: 'Not comparable',
    unknown: 'Unknown',
  };
  const INSTRUMENTATION_LABELS = {
    'active-verified': 'Verified receiving',
    'configured-unverified': 'Tag shipped, unverified',
    'configured-invalid': 'Placeholder tag',
    absent: 'No tag found',
    inaccessible: 'Blocked from view',
    'not-applicable': 'Not applicable',
    unknown: 'Unknown',
  };

  // ── Formatting ────────────────────────────────────────────────────────────────────────────────
  function formatNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : 'Unknown';
  }

  function formatCompact(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unknown';
    const abs = Math.abs(value);
    if (abs >= 1e6) return (value / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e4) return Math.round(value / 1e3) + 'K';
    if (abs >= 1e3) return (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(value);
  }

  function formatPct(value, signed) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unknown';
    return (signed && value > 0 ? '+' : '') + (Math.round(value * 10) / 10) + '%';
  }

  function formatDate(iso) {
    const ms = semantics.toMs(iso);
    if (!Number.isFinite(ms)) return 'unknown time';
    const date = new Date(ms);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = value => String(value).padStart(2, '0');
    return months[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ' UTC';
  }

  function formatDay(iso) {
    const ms = semantics.toMs(iso);
    if (!Number.isFinite(ms)) return 'unknown day';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const date = new Date(ms);
    return months[date.getUTCMonth()] + ' ' + date.getUTCDate();
  }

  function ageText(hours) {
    if (hours == null) return 'age unknown';
    if (hours < 1) return 'under an hour ago';
    if (hours < 48) return Math.round(hours) + 'h ago';
    return Math.round(hours / 24) + 'd ago';
  }

  function freshnessAt(observedAt, policy, now) {
    if (!observedAt) return { state: 'unknown', ageHours: null };
    return semantics.evaluateFreshness(observedAt, policy, now);
  }

  // ── Readings ──────────────────────────────────────────────────────────────────────────────────
  /**
   * How a reading is shown. The wording keeps zero, unknown, uninstrumented, awaiting, unavailable, stale and
   * incomparable visibly different; a number is only ever shown for a measured/partial reading.
   */
  function describeReading(reading, freshness, options) {
    const opts = options || {};
    const classified = semantics.classifyReading(reading, freshness);
    const compact = opts.compact ? formatCompact : formatNumber;
    switch (classified.kind) {
      case 'value':
        return { kind: 'value', text: opts.percent ? formatPct(classified.value, opts.signed) : compact(classified.value), note: classified.stale ? 'aging' : null, tone: 'value', hasValue: true };
      case 'zero-measured':
        return { kind: 'zero-measured', text: '0', note: 'measured zero', tone: 'value', hasValue: true };
      case 'partial':
        return { kind: 'partial', text: (opts.percent ? formatPct(classified.value, opts.signed) : compact(classified.value)), note: 'partial, lower bound', tone: 'partial', hasValue: true };
      case 'stale':
        return { kind: 'stale', text: 'Stale', note: 'expired; last known ' + (opts.percent ? formatPct(classified.lastKnown, opts.signed) : compact(classified.lastKnown)), tone: 'muted', hasValue: false };
      default:
        return { kind: classified.kind, text: STATE_LABELS[classified.kind] || 'Unknown', note: reading && reading.reason ? reading.reason : null, tone: 'muted', hasValue: false };
    }
  }

  // ── Operating status re-evaluated at render time ─────────────────────────────────────────────
  function effectiveStatus(row, now, policy) {
    const freshness = row.availability.observedAt ? semantics.evaluateFreshness(row.availability.observedAt, policy.probe, now) : { state: 'unknown', ageHours: null };
    const health = semantics.classifyHealth({ availability: row.availability, criticalPath: row.criticalPath, freshness });
    const status = semantics.operatingStatusFor(health, row.profile.expectation);
    return { health, freshness, key: status.key, tone: status.tone, meta: semantics.OPERATING_STATUS[status.key] };
  }

  // ── Work queue ───────────────────────────────────────────────────────────────────────────────
  const isClosed = item => ['closed', 'accepted-risk'].includes(item.status);

  function facets(items) {
    const count = keyFn => {
      const map = new Map();
      for (const item of items) for (const key of [].concat(keyFn(item))) map.set(key, (map.get(key) || 0) + 1);
      return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    };
    return {
      category: count(item => item.category),
      severity: count(item => item.severity),
      actionability: count(item => (isClosed(item) ? 'closed' : item.actionability.state)),
      confidence: count(item => item.confidence),
      subject: count(item => item.subjects),
      freshness: count(item => item.freshness.state),
    };
  }

  function filterFindings(items, f) {
    const filters = f || {};
    const query = String(filters.search || '').trim().toLowerCase();
    const wants = (value, expected) => !expected || expected === 'all' || value === expected;
    return items.filter(item => {
      const state = isClosed(item) ? 'closed' : item.actionability.state;
      if (filters.status === 'open' && isClosed(item)) return false;
      if (filters.status === 'closed' && !isClosed(item)) return false;
      if (!wants(item.severity, filters.severity)) return false;
      if (!wants(item.category, filters.category)) return false;
      if (!wants(state, filters.actionability)) return false;
      if (!wants(item.confidence, filters.confidence)) return false;
      if (!wants(item.freshness.state, filters.freshness)) return false;
      if (filters.subject && filters.subject !== 'all' && !item.subjects.includes(filters.subject)) return false;
      if (query) {
        const haystack = [item.id, item.title, item.observed, item.businessReason, item.nextAction, item.category, item.subjects.join(' ')].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function sortFindings(items, key) {
    const list = [...items];
    const byPriority = (a, b) => a.priority - b.priority;
    const compare = {
      priority: byPriority,
      severity: (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || byPriority(a, b),
      age: (a, b) => b.ageDays - a.ageDays || byPriority(a, b),
      category: (a, b) => a.category.localeCompare(b.category) || byPriority(a, b),
      score: (a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id),
    }[key || 'priority'] || byPriority;
    return list.sort(compare);
  }

  // ── Properties ───────────────────────────────────────────────────────────────────────────────
  const STATUS_ORDER = ['failing', 'conflicting-evidence', 'degraded', 'blocked', 'unknown', 'nothing-published-intent-unknown', 'nothing-published', 'reachable', 'healthy', 'expected-inactive'];

  function filterProperties(rows, f) {
    const filters = f || {};
    const query = String(filters.search || '').trim().toLowerCase();
    return rows.filter(entry => {
      const row = entry.row;
      if (filters.status && filters.status !== 'all' && entry.status.key !== filters.status) return false;
      if (filters.category && filters.category !== 'all' && (row.profile.category || 'unclassified') !== filters.category) return false;
      if (filters.lifecycle && filters.lifecycle !== 'all' && row.profile.lifecycle !== filters.lifecycle) return false;
      if (filters.instrumentation && filters.instrumentation !== 'all' && row.observability.state !== filters.instrumentation) return false;
      if (query && ![row.propertyId, row.profile.name, row.profile.purpose || '', row.deployment.project || ''].join(' ').toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function sortProperties(rows, key) {
    const list = [...rows];
    const rank = entry => entry.row.emphasisRank;
    const compare = {
      emphasis: (a, b) => rank(a) - rank(b),
      status: (a, b) => STATUS_ORDER.indexOf(a.status.key) - STATUS_ORDER.indexOf(b.status.key) || rank(a) - rank(b),
      name: (a, b) => a.row.profile.name.localeCompare(b.row.profile.name),
      tier: (a, b) => (a.row.profile.strategicTier || 9) - (b.row.profile.strategicTier || 9) || rank(a) - rank(b),
    }[key || 'emphasis'] || ((a, b) => rank(a) - rank(b));
    return list.sort(compare);
  }

  // ── Fail-closed bundle validation (the page refuses evidence it cannot trust) ────────────────
  function validateBundle(bundle) {
    const errors = [];
    const { summary, history, estate, diagnostics, audience, events, executive } = bundle;
    if (!summary || summary.missionControlId !== 'globaldeets-estate') errors.push('summary identity');
    if (summary?.investorClaimsPolicy?.edgeTrafficIsHumanAudience !== false) errors.push('summary: edge traffic policy');
    if (summary?.investorClaimsPolicy?.missingMeasurementIsZero !== false) errors.push('summary: missing measurement policy');
    if (history?.contractName !== 'globaldeets-mission-control-history' || !Array.isArray(history.snapshots)) errors.push('history contract');
    if (estate?.contractName !== 'globaldeets-estate-health' || !Array.isArray(estate.properties) || estate.properties.length !== estate.propertyCount) errors.push('estate contract');
    if (!/^2\./.test(String(estate?.schemaVersion))) errors.push('estate schema version');
    if (diagnostics?.contractName !== 'globaldeets-diagnostics-queue' || !Array.isArray(diagnostics.items)) errors.push('diagnostics contract');
    if (audience?.contractName !== 'globaldeets-audience' || !Array.isArray(audience.properties)) errors.push('audience contract');
    if (events?.contractName !== 'globaldeets-business-events' || !Array.isArray(events.properties)) errors.push('business-events contract');
    if (executive?.contractName !== 'globaldeets-executive' || !Array.isArray(executive.headline?.statements)) errors.push('executive contract');
    if (errors.length) return errors;

    if (audience.policy.edgeTrafficIsHumanAudience !== false || audience.policy.missingIsZero !== false || audience.policy.fixturesAreProduction !== false) errors.push('audience policy');
    if (audience.source.gold && audience.source.gold.fixture !== false) errors.push('audience: fixture document');
    if (events.source.feed && events.source.feed.fixture !== false) errors.push('events: fixture document');
    if (executive.policy.fixturesAreProduction !== false || executive.policy.missingIsZero !== false) errors.push('executive policy');
    if (audience.properties.length !== estate.propertyCount || events.properties.length !== estate.propertyCount) errors.push('property coverage differs across contracts');
    const ids = estate.properties.map(item => item.propertyId).join('|');
    if (audience.properties.map(item => item.propertyId).join('|') !== ids || events.properties.map(item => item.propertyId).join('|') !== ids) errors.push('property order differs across contracts');

    const valuedSource = ['measured', 'partial'].includes(audience.source.status);
    for (const row of audience.properties) {
      for (const days of [7, 28, 90]) {
        for (const key of ['requests', 'pageViews', 'trend']) {
          const reading = row[key] && row[key][days];
          if (!reading) { errors.push('audience reading missing for ' + row.propertyId); continue; }
          const valued = reading.evidenceState === 'measured' || reading.evidenceState === 'partial';
          if (valued && typeof reading.value !== 'number') errors.push('audience: ' + row.propertyId + ' measured reading without a number');
          if (!valued && reading.value !== null) errors.push('audience: ' + row.propertyId + ' carries a value without a measured state');
          if (!valuedSource && reading.value !== null) errors.push('audience: value without a measured source');
        }
      }
    }
    for (const property of events.properties) {
      for (const event of property.events) {
        for (const days of [7, 28, 90]) {
          const reading = event.readings[days];
          if (reading.value === 0 && property.instrumentation.state !== 'instrumented') errors.push('events: zero without instrumentation for ' + property.propertyId);
          if (reading.value !== null && property.instrumentation.state !== 'instrumented') errors.push('events: count without instrumentation for ' + property.propertyId);
        }
      }
    }
    for (const entry of diagnostics.items) {
      const sum = (entry.priorityBreakdown || []).reduce((total, part) => total + part.points, 0);
      if (sum !== entry.priorityScore) errors.push('diagnostics: score mismatch for ' + entry.id);
      if (!entry.actionability || !entry.freshness) errors.push('diagnostics: incomplete item ' + entry.id);
    }
    for (const row of executive.maturity) {
      if (row.denominator != null && row.numerator > row.denominator) errors.push('executive: ' + row.id + ' numerator exceeds denominator');
    }
    const composition = executive.charts && executive.charts.operationalComposition;
    if (composition && composition.data) {
      const total = composition.data.segments.reduce((sum, segment) => sum + segment.count, 0);
      if (total !== composition.data.total || total !== estate.propertyCount) errors.push('executive: composition does not cover the estate');
    }
    for (const property of estate.properties) {
      if (!property.profile || !property.observability || !semantics.INSTRUMENTATION_STATES.includes(property.observability.state)) errors.push('estate: incomplete property ' + property.propertyId);
      if (property.observability && property.observability.state === 'active-verified' && !(property.observability.reception && property.observability.reception.state === 'received')) errors.push('estate: unverified telemetry claimed for ' + property.propertyId);
    }
    return errors;
  }

  // ── Copyable summary with current evidence ages ──────────────────────────────────────────────
  function buildShareText(executive, context) {
    const ctx = context || {};
    const probeAge = ctx.probeFreshness && ctx.probeFreshness.ageHours != null ? ' (' + ageText(ctx.probeFreshness.ageHours) + ', ' + ctx.probeFreshness.state + ')' : '';
    const lines = executive.shareText.split('\n');
    const stamp = 'Copied ' + formatDate(ctx.now == null ? Date.now() : ctx.now) + '; production probes observed ' + (executive.asOf.probe ? formatDate(executive.asOf.probe) : 'never') + probeAge + '.';
    lines.splice(2, 0, stamp);
    return lines.join('\n');
  }

  return {
    SEVERITY_ORDER,
    ACTIONABILITY_LABELS,
    CATEGORY_LABELS,
    STATE_LABELS,
    INSTRUMENTATION_LABELS,
    STATUS_ORDER,
    formatNumber,
    formatCompact,
    formatPct,
    formatDate,
    formatDay,
    ageText,
    freshnessAt,
    describeReading,
    effectiveStatus,
    facets,
    filterFindings,
    sortFindings,
    filterProperties,
    sortProperties,
    validateBundle,
    buildShareText,
  };
});

/**
 * Executive summary builder (GD-031).
 *
 * The investor/operator surfaces render this file; the browser never reconstructs authoritative facts. Every
 * number here is derived from the governed contracts (estate health, audience, business events, diagnostics,
 * history) by pure functions, and every chart dataset carries its unit, evidence state, as-of time and an
 * intentional empty state describing exactly what is missing and what would unblock it.
 *
 * Overclaim guards: headlines only use evidence that is fresh enough and fully covering; a partial or
 * unavailable class is described as such, and unknown is never called a failure.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

export const EXECUTIVE_CONTRACT_NAME = 'globaldeets-executive';
export const EXECUTIVE_SCHEMA_VERSION = '1.0.0';

const pct = (numerator, denominator) => (denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null);
const fmt = value => (typeof value === 'number' ? value.toLocaleString('en-US') : 'unknown');
const plural = (count, singular, pluralForm) => count + ' ' + (count === 1 ? singular : pluralForm || singular + 's');
const isTerminal = entry => ['closed', 'accepted-risk'].includes(entry.status);

function audienceUsable(audience) {
  return Boolean(audience) && ['measured', 'partial'].includes(audience.source.status) && audience.source.freshness.state !== 'expired';
}

function emptyChart({ id, title, question, kind, unit, reason, unblockedBy, extra = {} }) {
  return { id, title, question, kind, unit, evidenceState: 'empty', asOf: null, provenance: null, data: null, empty: { title: 'Not measured yet', detail: reason, unblockedBy: unblockedBy || null }, caption: null, ...extra };
}

// ── Operating state ──────────────────────────────────────────────────────────────────────────────

const COMPOSITION = [
  { key: 'healthy', label: 'Verified healthy', tone: 'good', groups: ['healthy'] },
  { key: 'reachable', label: 'Responding, not yet verified', tone: 'info', groups: ['reachable'] },
  { key: 'attention', label: 'Degraded, failing or conflicting', tone: 'bad', groups: ['attention'] },
  { key: 'unknown', label: 'Blocked from view or unknown', tone: 'muted', groups: ['unknown'] },
  { key: 'inactive', label: 'Inactive, as expected', tone: 'inactive', groups: ['inactive'] },
  { key: 'inactive-unknown', label: 'Nothing published, intent not declared', tone: 'muted', groups: ['inactive-unknown'] },
];

function operationalComposition(estate) {
  const rows = estate.properties;
  const segments = COMPOSITION.map(segment => {
    const members = rows.filter(row => segment.groups.includes(semantics.OPERATING_STATUS[row.profile.operatingStatus.key]?.group));
    return { key: segment.key, label: segment.label, tone: segment.tone, count: members.length, properties: members.map(row => row.propertyId) };
  });
  return {
    id: 'operational-composition',
    title: 'What state is the estate in?',
    question: 'Is the estate functioning, and how much of it can we actually verify?',
    kind: 'segments',
    unit: 'properties',
    evidenceState: estate.evidence.probe.validity === 'valid' ? 'measured' : 'empty',
    asOf: estate.evidence.probe.observedAt,
    provenance: 'Production probes from ' + estate.evidence.probe.vantageCount + ' vantage' + (estate.evidence.probe.vantageCount === 1 ? '' : 's') + '; health contract ' + estate.healthContract.version,
    data: estate.evidence.probe.validity === 'valid' ? { total: rows.length, segments } : null,
    empty: estate.evidence.probe.validity === 'valid' ? null : { title: 'No probe evidence', detail: 'No valid production probe run has been collected, so the estate state is unknown.', unblockedBy: 'The next scheduled collection.' },
    caption: 'Responding is not the same as healthy: only properties that pass an authoritative critical-path check are called verified.',
  };
}

// ── Maturity ─────────────────────────────────────────────────────────────────────────────────────

function maturityRows({ estate, audience, events }) {
  const rows = estate.properties;
  const s = estate.summary;
  const applicableInstrumentation = s.instrumentation.applicable;
  const eventApplicable = events.coverage.propertiesApplicable;
  const audienceMeasured = audienceUsable(audience) ? audience.estate.propertiesMeasured : 0;
  const twoVantage = rows.filter(row => (row.availability.vantages || []).filter(item => item.conclusive).length >= 2).length;
  const probed = s.availabilityKnownZones + s.conflictingZones;
  const stateOf = (numerator, denominator, full = 100) => (denominator == null || denominator === 0 ? 'unknown' : numerator === 0 ? 'absent' : (numerator / denominator) * 100 >= full ? 'complete' : 'partial');
  const row = (id, label, decision, numerator, denominator, detail) => ({ id, label, decision, numerator, denominator, pct: pct(numerator, denominator), state: stateOf(numerator, denominator), detail });
  return [
    row('probe-coverage', 'Availability probed', 'Do we know whether each property is up?', probed, rows.length, 'Properties with a fresh, conclusive availability answer. Blocked and unknown are not counted.'),
    row('vantage-coverage', 'Independent second witness', 'Is one network the only witness?', twoVantage, s.servingExpectedZones, 'Serving properties confirmed from at least two conclusive vantages.'),
    row('critical-path', 'Authoritative critical path', 'Do we test what matters, not just the homepage?', s.criticalPathAuthoritativeZones, s.servingExpectedZones, 'Serving properties whose critical path is owner-declared and probed. The rest are checked only against a homepage baseline.'),
    row('instrumentation-tags', 'Analytics tag shipped', 'Can the page report an audience at all?', s.instrumentation.configuredUnverified + s.instrumentation.activeVerified, applicableInstrumentation, 'Serving properties whose HTML ships a real analytics tag (placeholders excluded).'),
    row('instrumentation-verified', 'Telemetry reception verified', 'Is browser data actually arriving?', s.instrumentation.activeVerified, applicableInstrumentation, 'Properties with reception evidence, not just a tag.'),
    row('audience', 'Audience measured', 'Can we say how much each property is used?', audienceMeasured, rows.length, 'Properties with a governed 28-day traffic reading.'),
    row('business-events', 'Business outcomes measured', 'Can we say what each property produces?', events.coverage.instrumented, eventApplicable, 'Properties reporting outcome events through a governed feed.'),
    row('declared-lifecycle', 'Owner-declared lifecycle', 'Do we know which states are intended?', s.ownerDeclared.lifecycle, rows.length, 'Properties whose owner has declared active, incubating, dormant or similar.'),
    row('declared-outcome', 'Owner-declared outcome', 'Do we know what success looks like?', s.ownerDeclared.primaryOutcome, rows.length, 'Properties with a declared primary outcome.'),
  ];
}

function evidenceClasses({ estate, audience, events, history, now }) {
  const historyDays = new Set(history.snapshots.filter(item => item.collector?.kind === 'scheduled').map(item => item.observedAt.slice(0, 10))).size;
  const probe = estate.evidence.probe;
  const liveState = (freshness, valid = true) => (!valid || !freshness || freshness.state === 'unknown' || freshness.state === 'expired' ? 'absent' : freshness.state === 'fresh' ? 'live' : 'aging');
  return [
    { id: 'availability', label: 'Availability probes', state: liveState(probe.freshness, probe.validity === 'valid'), asOf: probe.observedAt, detail: probe.vantageCount + ' vantage' + (probe.vantageCount === 1 ? '' : 's') },
    { id: 'inventory', label: 'Cloudflare inventory', state: liveState(estate.evidence.inventory.freshness), asOf: estate.evidence.inventory.asOf, detail: estate.evidence.inventory.refreshed ? 'refreshed' : 'carried forward' },
    { id: 'audience', label: 'Governed audience', state: audienceUsable(audience) ? liveState(audience.source.freshness) : 'absent', asOf: audience.source.observedAt, detail: audience.source.status },
    { id: 'business-events', label: 'Business outcomes', state: events.source.status === 'measured' ? liveState(events.source.freshness) : 'absent', asOf: events.source.observedAt, detail: events.source.status },
    { id: 'history', label: 'Historical snapshots', state: historyDays >= 2 ? 'live' : historyDays === 1 ? 'aging' : 'absent', asOf: history.generatedAt, detail: historyDays + ' day' + (historyDays === 1 ? '' : 's') + ' retained' },
    { id: 'instrumentation-reception', label: 'Telemetry reception', state: estate.evidence.rumReception.status === 'measured' ? 'live' : 'absent', asOf: estate.evidence.rumReception.observedAt, detail: estate.evidence.rumReception.status === 'measured' ? 'checked' : 'not checkable' },
  ].map(entry => ({ ...entry, now }));
}

// ── Knowledge matrix: what we know per property ─────────────────────────────────────────────────

const MATRIX_COLUMNS = [
  { id: 'availability', label: 'Up?' },
  { id: 'critical-path', label: 'Works?' },
  { id: 'telemetry', label: 'Measured?' },
  { id: 'audience', label: 'Used?' },
  { id: 'outcomes', label: 'Produces?' },
];

function knowledgeMatrix({ estate, audience, events }) {
  const eventsById = new Map(events.properties.map(row => [row.propertyId, row]));
  const audienceById = new Map(audience.properties.map(row => [row.propertyId, row]));
  const rows = estate.properties.map(property => {
    const health = property.diagnosticState;
    const availability = property.availability.freshness.state === 'expired' ? 'unknown' : property.availability.state;
    const status = property.profile.operatingStatus.key;
    const cell = (column, state, label) => ({ column, state, label });
    const availabilityCell = ['healthy', 'reachable'].includes(status) || availability === 'available'
      ? cell('availability', 'known', 'Responding')
      : status === 'expected-inactive' ? cell('availability', 'na', 'Inactive as expected')
      : availability === 'no-service-published' ? cell('availability', 'na', 'Nothing published')
      : ['failing', 'degraded', 'conflicting-evidence'].includes(status) ? cell('availability', 'issue', property.profile.operatingStatus.key === 'failing' ? 'Failing' : 'Needs attention')
      : cell('availability', 'unknown', status === 'blocked' ? 'Blocked from view' : 'Unknown');
    const contract = property.criticalPath.contract;
    const cpCell = availability === 'no-service-published' || contract.status === 'not-applicable' ? cell('critical-path', 'na', 'Not applicable')
      : health === 'verified-healthy' ? cell('critical-path', 'known', 'Verified')
      : health === 'critical-path-failed' ? cell('critical-path', 'issue', 'Failing')
      : contract.level === 'baseline' ? cell('critical-path', 'partial', 'Homepage only')
      : cell('critical-path', 'unknown', 'Not declared');
    const inst = property.observability.state;
    const telemetryCell = inst === 'not-applicable' ? cell('telemetry', 'na', 'Not applicable')
      : inst === 'active-verified' ? cell('telemetry', 'known', 'Verified')
      : inst === 'configured-unverified' ? cell('telemetry', 'partial', 'Tag shipped, unverified')
      : inst === 'configured-invalid' ? cell('telemetry', 'issue', 'Placeholder tag')
      : inst === 'absent' ? cell('telemetry', 'unknown', 'No tag found')
      : cell('telemetry', 'unknown', inst === 'inaccessible' ? 'Blocked from view' : 'Unknown');
    const aud = audienceById.get(property.propertyId);
    const audienceCell = audienceUsable(audience) && aud.requests[28].evidenceState === 'measured' ? cell('audience', 'known', 'Measured')
      : audienceUsable(audience) ? cell('audience', 'unknown', 'No reading')
      : cell('audience', 'unknown', audience.source.status === 'awaiting-authorized-source' ? 'Awaiting source' : 'Unavailable');
    const ev = eventsById.get(property.propertyId);
    const outcomeCell = ev.instrumentation.state === 'not-applicable' ? cell('outcomes', 'na', 'Not applicable')
      : ev.instrumentation.state === 'instrumented' ? cell('outcomes', 'known', 'Measured')
      : ev.instrumentation.state === 'not-connected' ? cell('outcomes', 'partial', 'Producer exists, not connected')
      : cell('outcomes', 'unknown', 'Not instrumented');
    return { propertyId: property.propertyId, name: property.profile.name, cells: [availabilityCell, cpCell, telemetryCell, audienceCell, outcomeCell] };
  });
  return { columns: MATRIX_COLUMNS, rows };
}

// ── Audience charts ──────────────────────────────────────────────────────────────────────────────

function audienceSection({ registry, estate, audience }) {
  const usable = audienceUsable(audience);
  const nameOf = id => estate.properties.find(row => row.propertyId === id)?.profile?.name || id;
  const status = audience.source.status;
  const awaiting = status === 'awaiting-authorized-source';
  const reason = audience.source.reason || 'The governed audience source is not readable.';
  const unblockedBy = audience.source.requirement ? audience.source.requirement.what + ' Secrets: ' + audience.source.requirement.secrets.join(', ') + '.' : null;
  const asOf = audience.source.observedAt;
  const base = { asOf, provenance: 'Canonical Gold ' + (audience.source.gold?.schemaVersion || '1.2') + (audience.source.gold?.pipelineVersion ? ' (' + audience.source.gold.pipelineVersion + ')' : '') };

  const section = { status, statusLabel: awaiting ? 'Awaiting authorized source' : status === 'measured' ? 'Measured' : status === 'partial' ? 'Partially measured' : status === 'rejected' ? 'Source rejected' : 'Unavailable', reason, requirement: audience.source.requirement, asOf, freshness: audience.source.freshness, registryWindows: registry.audienceContract?.windowsDays || [7, 28, 90] };

  const charts = {};
  if (!usable) {
    const none = (id, title, question, kind, unit, extra) => emptyChart({ id, title, question, kind, unit, reason, unblockedBy, extra });
    charts.trajectory = none('audience-trajectory', 'Is usage growing or shrinking?', 'How many requests does the estate serve each day?', 'line', 'requests per day');
    charts.contribution = none('audience-contribution', 'Which properties carry the traffic?', 'What share of estate requests does each property account for?', 'bars', 'requests, 28 days');
    charts.movers = none('audience-movers', 'What is changing?', 'Which properties are growing or declining materially?', 'bars', 'percent change');
    charts.composition = none('audience-composition', 'Who is this traffic?', 'How much is human, automated or unknown?', 'segments', 'share of requests');
    return { section, charts, cards: [] };
  }

  const windows = [7, 28, 90];
  const cards = windows.map(days => {
    const reading = audience.estate.requests[days];
    const trend = audience.estate.trend[days];
    return { days, requests: reading, trend, pageViews: audience.estate.pageViews[days] };
  });

  const daily = audience.series.estateDaily;
  charts.trajectory = daily.points.length >= 2
    ? { id: 'audience-trajectory', title: 'Is usage growing or shrinking?', question: 'How many requests does the estate serve each day?', kind: 'line', unit: 'requests per day', evidenceState: daily.status, ...base, asOf: daily.points[daily.points.length - 1].date, data: { points: daily.points, propertiesIncluded: daily.propertiesIncluded, propertiesExpected: daily.propertiesExpected, incompleteDates: daily.incompleteDates }, empty: null, caption: 'Daily edge requests summed over ' + daily.propertiesIncluded.length + ' of ' + daily.propertiesExpected + ' properties. Days missing any property are left as gaps, never estimated. Requests include automated traffic.' }
    : emptyChart({ id: 'audience-trajectory', title: 'Is usage growing or shrinking?', question: 'How many requests does the estate serve each day?', kind: 'line', unit: 'requests per day', reason: daily.reason || 'Fewer than two comparable days are available.', unblockedBy: 'The Traffic Insights document must carry a daily request series with every property present.' });

  const ranked = audience.properties.filter(row => row.requests[28].evidenceState === 'measured').sort((a, b) => b.requests[28].value - a.requests[28].value || a.propertyId.localeCompare(b.propertyId));
  charts.contribution = {
    id: 'audience-contribution', title: 'Which properties carry the traffic?', question: 'What share of estate requests does each property account for?', kind: 'bars', unit: 'requests, 28 days', evidenceState: audience.estate.requests[28].evidenceState, ...base,
    data: { total: audience.estate.requests[28].value, bars: ranked.map(row => ({ propertyId: row.propertyId, name: nameOf(row.propertyId), value: row.requests[28].value, sharePct: row.share28d.value, direction: row.direction })), unmeasured: audience.properties.filter(row => row.requests[28].evidenceState !== 'measured').map(row => ({ propertyId: row.propertyId, name: nameOf(row.propertyId), reason: row.requests[28].reason })) },
    empty: ranked.length ? null : { title: 'No comparable readings', detail: 'No property has a fully covered 28-day reading.', unblockedBy: null },
    caption: 'Share of measured edge requests. Cloudflare counts requests, not people.',
  };

  const movers = audience.estate.movers;
  if (movers.window && (movers.growing.length || movers.declining.length)) {
    charts.movers = { id: 'audience-movers', title: 'What is changing?', question: 'Which properties are growing or declining materially?', kind: 'bars', unit: 'percent change, ' + movers.window + ' days vs the prior ' + movers.window, evidenceState: 'measured', ...base, data: { window: movers.window, growing: movers.growing.map(entry => ({ ...entry, name: nameOf(entry.propertyId) })), declining: movers.declining.map(entry => ({ ...entry, name: nameOf(entry.propertyId) })), materiality: audience.materiality }, empty: null, caption: 'Only changes of at least ' + audience.materiality.minPercent + '% and ' + audience.materiality.minAbsoluteRequests + ' requests are shown.' };
  } else if (movers.window) {
    charts.movers = { ...emptyChart({ id: 'audience-movers', title: 'What is changing?', question: 'Which properties are growing or declining materially?', kind: 'bars', unit: 'percent change', reason: 'No property moved materially over the latest ' + movers.window + ' days: every comparable property changed by less than ' + audience.materiality.minPercent + '% or ' + audience.materiality.minAbsoluteRequests + ' requests.' }), empty: { title: 'Nothing moved materially', detail: 'Every comparable property changed by less than ' + audience.materiality.minPercent + '% or ' + audience.materiality.minAbsoluteRequests + ' requests.', unblockedBy: null } };
  } else {
    charts.movers = emptyChart({ id: 'audience-movers', title: 'What is changing?', question: 'Which properties are growing or declining materially?', kind: 'bars', unit: 'percent change', reason: 'No property has a comparable trend (the producer must supply matching windows with full coverage).', unblockedBy: 'Traffic Insights trend comparisons with full daily coverage.' });
  }

  charts.composition = {
    id: 'audience-composition', title: 'Who is this traffic?', question: 'How much is human, automated or unknown?', kind: 'segments', unit: 'share of requests', evidenceState: 'measured', ...base,
    data: { support: audience.classification.support, segments: audience.classification.composition, note: audience.classification.note }, empty: null,
    caption: 'No connected source separates humans from automated traffic, so all of it is unclassified. Nothing is inferred.',
  };
  return { section, charts, cards };
}

// ── Business section ─────────────────────────────────────────────────────────────────────────────

function businessSection({ estate, events }) {
  const status = events.source.status;
  const nameOf = id => estate.properties.find(row => row.propertyId === id)?.profile?.name || id;
  const declared = events.properties.filter(row => row.primaryOutcome);
  const byType = {};
  for (const row of declared) byType[row.primaryOutcome.type] = [...(byType[row.primaryOutcome.type] || []), { propertyId: row.propertyId, name: nameOf(row.propertyId), label: row.primaryOutcome.label, state: row.instrumentation.state }];
  const declaredOutcomes = Object.entries(byType).map(([type, list]) => ({ type, label: semantics.OUTCOME_VOCABULARY.find(item => item.id === type)?.label || type, properties: list })).sort((a, b) => b.properties.length - a.properties.length || a.type.localeCompare(b.type));
  const producers = events.properties.filter(row => row.instrumentation.state === 'not-connected').map(row => ({ propertyId: row.propertyId, name: nameOf(row.propertyId), types: row.instrumentation.candidateProducers.map(item => item.type) }));

  const funnelTotals = Object.entries(events.estate.totals).map(([eventType, windows]) => ({ eventType, label: semantics.OUTCOME_VOCABULARY.find(item => item.id === eventType)?.label || eventType, reading: windows[28] || null })).filter(entry => entry.reading);
  const funnel = funnelTotals.length
    ? { id: 'outcome-funnel', title: 'What business actions are occurring?', question: 'How many meaningful actions happened, and where?', kind: 'bars', unit: 'events, 28 days', evidenceState: 'measured', asOf: events.source.observedAt, provenance: 'Business-event feed ' + (events.source.feed?.source?.label || ''), data: { stages: funnelTotals }, empty: null, caption: 'Sums cover only instrumented properties.' }
    : emptyChart({ id: 'outcome-funnel', title: 'What business actions are occurring?', question: 'How many meaningful actions happened, and where?', kind: 'bars', unit: 'events, 28 days', reason: events.source.reason, unblockedBy: events.source.requirement ? events.source.requirement.what + ' Secrets: ' + events.source.requirement.secrets.join(', ') + '.' : null });
  return {
    status,
    statusLabel: status === 'not-connected' ? 'Not connected' : status === 'measured' ? 'Measured' : status === 'awaiting-authorized-source' ? 'Awaiting authorized source' : status === 'rejected' ? 'Source rejected' : 'Unavailable',
    reason: events.source.reason,
    requirement: events.source.requirement,
    coverage: events.coverage,
    declaredOutcomes,
    connectableProducers: producers,
    funnel,
  };
}

// ── Findings digest ─────────────────────────────────────────────────────────────────────────────

const digest = entry => ({ id: entry.id, title: entry.title, severity: entry.severity, category: entry.category, subjects: entry.subjects, why: entry.businessReason, action: entry.nextAction, actionability: entry.actionability.state, confidence: entry.confidence, priorityScore: entry.priorityScore });

function wins({ estate, audience, history }) {
  const list = [];
  const s = estate.summary;
  const rows = estate.properties;
  if (estate.evidence.probe.validity === 'valid' && s.servingExpectedZones > 0) {
    const responding = rows.filter(row => row.probeExpectation.expectation === 'serves-content' && ['healthy', 'reachable'].includes(row.profile.operatingStatus.key)).length;
    if (responding > 0) list.push({ id: 'win:responding', title: responding + ' of ' + s.servingExpectedZones + ' serving properties are responding', detail: 'Measured from ' + estate.evidence.probe.vantageCount + ' probe vantage' + (estate.evidence.probe.vantageCount === 1 ? '' : 's') + '; responding is not the same as verified healthy.', evidence: 'estate-health' });
  }
  const flagship = rows.find(row => row.propertyId === 'globaldeets.com');
  if (flagship?.diagnosticState === 'verified-healthy') list.push({ id: 'win:flagship-verified', title: 'GlobalDeets passes its authoritative critical path', detail: flagship.criticalPath.checks.length + ' production checks (site, news, mission-control and coverage APIs) pass on fresh evidence.', evidence: 'estate-health' });
  if (s.criticalPathAuthoritativeZones > 1) list.push({ id: 'win:critical-paths', title: s.criticalPathAuthoritativeZones + ' properties are tested on what matters, not just the homepage', detail: 'Owner-derived critical paths: ' + rows.filter(row => row.criticalPath.contract.level === 'authoritative').map(row => row.propertyId).join(', ') + '.', evidence: 'estate-registry' });
  if (s.vantages.valid >= 2 && s.vantages.conflict === 0) list.push({ id: 'win:second-vantage', title: 'A second network independently confirms the estate', detail: s.vantages.agree + ' properties agree across vantages' + (s.vantages.partial ? ', ' + s.vantages.partial + ' confirmed by one vantage while another was blocked' : '') + '; no vantage conflicts.', evidence: 'estate-health' });
  if (audienceUsable(audience) && audience.estate.movers.growing.length) {
    const top = audience.estate.movers.growing[0];
    list.push({ id: 'win:growth', title: (rows.find(row => row.propertyId === top.propertyId)?.profile?.name || top.propertyId) + ' grew ' + top.pct + '%', detail: 'Edge requests over the latest ' + audience.estate.movers.window + ' days versus the prior equal period. Includes automated traffic.', evidence: 'audience' });
  }
  const days = new Set(history.snapshots.filter(item => item.collector?.kind === 'scheduled').map(item => item.observedAt.slice(0, 10))).size;
  if (days >= 3) list.push({ id: 'win:history', title: days + ' days of dated evidence are retained', detail: 'Trends accumulate without interpolation.', evidence: 'history' });
  return list;
}

// ── Headline ─────────────────────────────────────────────────────────────────────────────────────

function headline({ estate, audience, events, diagnostics }) {
  const s = estate.summary;
  const total = estate.propertyCount;
  const life = s.lifecycle;
  const declaredCount = total - life.unknown;
  const statements = [];
  statements.push({ id: 'estate', tone: 'neutral', text: 'Good Flippin Design operates ' + total + ' web properties. ' + declaredCount + ' have an owner-declared status (' + [life.active ? life.active + ' active' : null, life.incubating ? life.incubating + ' incubating' : null, life.alias ? life.alias + ' aliases' : null].filter(Boolean).join(', ') + '); ' + life.unknown + ' have none, so their intent is shown as unknown.' });

  if (estate.evidence.probe.validity !== 'valid') {
    statements.push({ id: 'health', tone: 'unknown', text: 'No valid production probe evidence exists, so nothing can be said about whether the estate is up.' });
  } else if (estate.evidence.probe.freshness.state === 'expired') {
    statements.push({ id: 'health', tone: 'unknown', text: 'Production probe evidence has expired; the estate state is shown as unknown until the collector recovers.' });
  } else {
    const serving = s.servingExpectedZones;
    const responding = estate.properties.filter(row => row.probeExpectation.expectation === 'serves-content' && ['healthy', 'reachable'].includes(row.profile.operatingStatus.key)).length;
    const failing = estate.properties.filter(row => semantics.OPERATING_STATUS[row.profile.operatingStatus.key]?.group === 'attention').length;
    statements.push({
      id: 'health',
      tone: failing ? 'bad' : 'good',
      text: responding + ' of ' + serving + ' properties that publish a site are responding; ' + s.verifiedHealthyZones + ' ' + (s.verifiedHealthyZones === 1 ? 'is' : 'are') + ' verified healthy end-to-end. ' +
        (failing ? plural(failing, 'property needs', 'properties need') + ' attention. ' : 'None is failing. ') +
        (s.probeBlockedZones ? plural(s.probeBlockedZones, 'property is', 'properties are') + ' blocked from view (not counted as failing). ' : '') +
        (s.noServiceZones ? plural(s.noServiceZones, 'domain') + ' publish nothing.' : ''),
    });
  }
  if (audienceUsable(audience) && audience.estate.requests[28].value != null) {
    const reading = audience.estate.requests[28];
    const trend = audience.estate.trend[28];
    statements.push({ id: 'usage', tone: 'neutral', text: 'Estate traffic: ' + fmt(reading.value) + ' edge requests in the latest 28 days across ' + audience.estate.propertiesMeasured + ' of ' + total + ' properties' + (reading.evidenceState === 'partial' ? ' (a lower bound)' : '') + (trend.evidenceState === 'measured' ? ', ' + (trend.value >= 0 ? 'up ' : 'down ') + Math.abs(trend.value) + '% on the prior 28 days' : ', with no comparable prior period yet') + '. These are requests, not people: no source separates humans from automated traffic.' });
  } else {
    statements.push({ id: 'usage', tone: 'unknown', text: 'Usage cannot be stated yet: the governed traffic source is ' + (audience.source.status === 'awaiting-authorized-source' ? 'awaiting authorization' : 'not readable') + ', so no request, growth or contribution figure is shown (and none is estimated).' });
  }
  const outcomeReporting = events.coverage.instrumented;
  statements.push({ id: 'outcomes', tone: outcomeReporting ? 'neutral' : 'unknown', text: outcomeReporting ? outcomeReporting + ' of ' + events.coverage.propertiesApplicable + ' properties report business outcomes.' : 'No property reports business outcomes yet: ' + events.coverage.withDeclaredOutcome + ' declare an intended outcome and ' + events.coverage.withCandidateProducers + ' have event-producing routes that are not connected. "Zero conversions" cannot be stated for any of them.' });
  const open = diagnostics.items.filter(entry => !isTerminal(entry));
  const next = diagnostics.items.find(entry => entry.id === diagnostics.summary.nextUp);
  statements.push({ id: 'attention', tone: 'neutral', text: open.length + ' open items: ' + diagnostics.summary.actionableNow + ' actionable now, ' + diagnostics.summary.blockedOnAuthority + ' blocked on missing authority, ' + diagnostics.summary.decisionNeeded + ' need a decision.' + (next ? ' First: ' + next.title + '.' : '') });
  return statements;
}

function unknowns({ estate, audience, events }) {
  const list = [];
  const s = estate.summary;
  if (!audienceUsable(audience)) list.push({ id: 'unknown:usage', title: 'How much the properties are used', detail: 'The governed audience source is ' + audience.source.status.replace(/-/g, ' ') + '. Nothing is estimated.', closedBy: audience.source.requirement ? audience.source.requirement.what : 'A readable governed audience source.' });
  list.push({ id: 'unknown:humans', title: 'How many real people use the estate', detail: 'No connected source separates certified humans from automated traffic. Edge requests are never presented as human audience.', closedBy: 'A human-audience source with bot and agent classification.' });
  if (events.coverage.instrumented === 0) list.push({ id: 'unknown:outcomes', title: 'What the properties produce', detail: 'No business-outcome feed is connected, so no lead, sign-up or purchase count exists, not even a zero.', closedBy: events.source.requirement ? events.source.requirement.what : 'A governed outcome feed.' });
  if (s.instrumentation.activeVerified === 0) list.push({ id: 'unknown:telemetry', title: 'Whether any browser telemetry is arriving', detail: s.instrumentation.configuredUnverified + ' properties ship an analytics tag; none has reception evidence.', closedBy: 'GA4 Data API or Cloudflare Web Analytics read access.' });
  const blockedProps = estate.properties.filter(row => row.profile.operatingStatus.key === 'blocked').map(row => row.propertyId);
  if (blockedProps.length) list.push({ id: 'unknown:blocked', title: 'Whether ' + blockedProps.join(', ') + ' is up', detail: 'Every probe vantage was challenged. Blocked is not the same as down.', closedBy: 'A probe allow-list on the zone or an authenticated health path.' });
  const unknownLifecycle = estate.properties.filter(row => row.profile.lifecycle === 'unknown').length;
  if (unknownLifecycle) list.push({ id: 'unknown:lifecycle', title: 'What ' + unknownLifecycle + ' properties are meant to be', detail: 'No owner-declared lifecycle or purpose for them; production behaviour is shown without judging intent.', closedBy: 'Owners declare lifecycle and purpose in the estate registry.' });
  return list;
}

// ── Portfolio ────────────────────────────────────────────────────────────────────────────────────

function portfolio({ estate, audience }) {
  const audienceById = new Map(audience.properties.map(row => [row.propertyId, row]));
  const usable = audienceUsable(audience);
  const tiles = estate.properties.map(row => ({
    propertyId: row.propertyId,
    name: row.profile.name,
    purpose: row.profile.purpose,
    purposeSource: row.profile.provenance?.purpose || null,
    category: row.profile.category,
    lifecycle: row.profile.lifecycle,
    aliasOf: row.profile.aliasOf,
    strategicTier: row.profile.strategicTier,
    earningPath: row.profile.earningPath,
    primaryOutcome: row.profile.primaryOutcome,
    operatingStatus: row.profile.operatingStatus,
    expectation: row.profile.expectation,
    investorCritical: row.investorCritical,
    sharePct: usable ? audienceById.get(row.propertyId).share28d.value : null,
    direction: usable ? audienceById.get(row.propertyId).direction : 'unknown',
  }));
  const order = Object.keys(semantics.PORTFOLIO_CATEGORIES);
  const groups = order
    .map(id => ({ categoryId: id, label: semantics.PORTFOLIO_CATEGORIES[id], tiles: tiles.filter(tile => (tile.category || 'unclassified') === id) }))
    .filter(group => group.tiles.length);
  return { groups };
}

// ── Share text ──────────────────────────────────────────────────────────────────────────────────

function shareText({ statements, estate, audience, events, maturity, now }) {
  const lines = ['GlobalDeets Mission Control — estate summary', 'Generated ' + now + ' from governed evidence (probe run ' + (estate.evidence.probe.runId || 'none') + ', observed ' + (estate.evidence.probe.observedAt || 'never') + ').', ''];
  for (const statement of statements) lines.push('• ' + statement.text);
  lines.push('');
  lines.push('Measurement coverage:');
  for (const row of maturity) lines.push('  - ' + row.label + ': ' + (row.denominator ? row.numerator + ' of ' + row.denominator + ' (' + row.pct + '%)' : 'not applicable'));
  lines.push('');
  lines.push('Audience source: ' + audience.source.status.replace(/-/g, ' ') + '. Business-outcome feed: ' + events.source.status.replace(/-/g, ' ') + '.');
  lines.push('Unknown is not zero, reachable is not healthy, and edge requests are not people.');
  return lines.join('\n');
}

/**
 * @param {object} input registry, estate, audience, events, diagnostics, history, now (ISO)
 */
export function buildExecutive({ registry, estate, audience, events, diagnostics, history, now }) {
  const composition = operationalComposition(estate);
  const maturity = maturityRows({ estate, audience, events });
  const classes = evidenceClasses({ estate, audience, events, history, now });
  const aud = audienceSection({ registry, estate, audience });
  const business = businessSection({ estate, events });
  const statements = headline({ estate, audience, events, diagnostics });
  const open = diagnostics.items.filter(entry => !isTerminal(entry));
  const risks = open.filter(entry => entry.polarity === 'risk' && ['critical', 'high', 'medium'].includes(entry.severity)).slice(0, 5).map(digest);
  const opportunities = open.filter(entry => entry.polarity === 'opportunity' || (entry.category === 'business-outcomes' && entry.polarity !== 'risk')).slice(0, 4).map(digest);
  const gaps = open.filter(entry => entry.polarity === 'gap').slice(0, 5).map(digest);
  const next = diagnostics.items.find(entry => entry.id === diagnostics.summary.nextUp);
  const liveClasses = classes.filter(entry => entry.state === 'live').length;

  return {
    contractName: EXECUTIVE_CONTRACT_NAME,
    schemaVersion: EXECUTIVE_SCHEMA_VERSION,
    generatedAt: now,
    policy: { fixturesAreProduction: false, unknownIsFailure: false, headlinesRequireCurrentEvidence: true, edgeTrafficIsHumanAudience: false, missingIsZero: false, derivedOnly: true },
    asOf: { probe: estate.evidence.probe.observedAt, inventory: estate.evidence.inventory.asOf, audience: audience.source.observedAt, businessEvents: events.source.observedAt },
    evidence: { classes, liveClasses, totalClasses: classes.length },
    headline: { statements },
    snapshot: {
      properties: estate.propertyCount,
      lifecycle: estate.summary.lifecycle,
      verifiedHealthy: estate.summary.verifiedHealthyZones,
      responding: estate.properties.filter(row => ['healthy', 'reachable'].includes(row.profile.operatingStatus.key)).length,
      servingExpected: estate.summary.servingExpectedZones,
      attention: estate.properties.filter(row => semantics.OPERATING_STATUS[row.profile.operatingStatus.key]?.group === 'attention').length,
      blocked: estate.summary.probeBlockedZones,
      nothingPublished: estate.summary.noServiceZones,
    },
    maturity,
    portfolio: portfolio({ estate, audience }),
    knowledgeMatrix: knowledgeMatrix({ estate, audience, events }),
    audience: aud.section,
    audienceCards: aud.cards,
    business,
    findings: { nextUp: next ? digest(next) : null, counts: diagnostics.summary, risks, opportunities, gaps, wins: wins({ estate, audience, history }) },
    unknowns: unknowns({ estate, audience, events }),
    charts: { operationalComposition: composition, ...aud.charts, outcomeFunnel: business.funnel },
    shareText: shareText({ statements, estate, audience, events, maturity, now }),
    evidenceSummary: liveClasses + ' of ' + classes.length + ' evidence classes are live',
  };
}

export function validateExecutive(executive, { estate } = {}) {
  const errors = [];
  if (executive?.contractName !== EXECUTIVE_CONTRACT_NAME) return ['executive: contractName'];
  if (executive.policy?.fixturesAreProduction !== false) errors.push('executive: policy.fixturesAreProduction');
  if (executive.policy?.edgeTrafficIsHumanAudience !== false) errors.push('executive: policy.edgeTrafficIsHumanAudience');
  if (executive.policy?.missingIsZero !== false) errors.push('executive: policy.missingIsZero');
  if (!Array.isArray(executive.headline?.statements) || !executive.headline.statements.length) errors.push('executive: headline');
  for (const row of executive.maturity || []) {
    if (row.denominator != null && row.numerator > row.denominator) errors.push('executive: maturity ' + row.id + ' numerator exceeds denominator');
    if (row.denominator > 0 && row.pct !== Math.round((row.numerator / row.denominator) * 1000) / 10) errors.push('executive: maturity ' + row.id + ' pct does not match its counts');
  }
  const composition = executive.charts?.operationalComposition;
  if (composition?.data) {
    const sum = composition.data.segments.reduce((total, segment) => total + segment.count, 0);
    if (sum !== composition.data.total) errors.push('executive: operational composition (' + sum + ') does not sum to the property total (' + composition.data.total + ')');
    if (estate && composition.data.total !== estate.propertyCount) errors.push('executive: operational composition total does not match the estate');
  }
  for (const [key, chart] of Object.entries(executive.charts || {})) {
    if (!chart) continue;
    if (!['measured', 'partial', 'empty'].includes(chart.evidenceState)) errors.push('executive: chart ' + key + ' evidenceState');
    if (chart.evidenceState === 'empty' && (chart.data !== null || !chart.empty?.detail)) errors.push('executive: empty chart ' + key + ' must carry no data and an explanation');
    if (chart.evidenceState !== 'empty' && chart.data == null) errors.push('executive: chart ' + key + ' claims evidence without data');
    if (chart.evidenceState !== 'empty' && !chart.provenance) errors.push('executive: chart ' + key + ' has no provenance');
  }
  return errors;
}

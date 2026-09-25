/**
 * Estate coverage matrix (GD-033).
 *
 * One authoritative row per registered property, joining what the other plane documents already prove:
 * availability, critical path, audience evidence, business-event instrumentation, history, freshness,
 * provenance and the ranked work that would close each gap. Pure and deterministic: it derives only from
 * the assembled plane and never reads a clock, so the same evidence always yields the same bytes.
 *
 * The matrix answers "what do we KNOW about each property, how well, and what is missing" - it never
 * turns absent evidence into a healthy or zero reading. Every facet that is not verified or not
 * applicable produces a named blind spot, and a property's confidence can never exceed its weakest
 * load-bearing facet.
 */
export const COVERAGE_CONTRACT_NAME = 'globaldeets-estate-coverage-matrix';
export const COVERAGE_SCHEMA_VERSION = '1.0.0';

/** How much is KNOWN about a facet (not whether the property is healthy - that is `state`). */
export const FACET_STATUSES = Object.freeze(['verified', 'partial', 'blocked', 'awaiting-authority', 'stale', 'missing', 'unknown', 'not-applicable']);
export const FACETS = Object.freeze(['production', 'criticalPath', 'audience', 'businessEvents', 'history', 'declaration']);
export const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low', 'insufficient']);
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info', 'none'];
const FRESHNESS_ORDER = ['fresh', 'stale', 'expired', 'unknown'];
const ACTIONABLE = new Set(['open', 'in-progress', 'blocked']);
const EXPECTED_RUNS_7D = 28; // 6-hour probe cadence
const FACET_CATEGORIES = { production: ['availability'], criticalPath: ['critical-path', 'availability'], audience: ['audience', 'instrumentation'], businessEvents: ['business-outcomes'], history: ['evidence-quality'], declaration: ['governance'] };
const DEFAULT_ACTIONS = {
  production: 'Establish an independent availability reading (probe allow-list or an authenticated health path).',
  criticalPath: 'Declare and verify the routes that must work for this property.',
  audience: 'Verify browser telemetry reception and connect a governed audience source.',
  businessEvents: 'Declare the primary outcome and connect a first-party event producer.',
  history: 'Keep collecting; history accrues with each conclusive probe run.',
  declaration: 'The owner declares lifecycle, purpose and a primary outcome in the estate registry.',
};

function policy() {
  return { unknownIsHealthy: false, missingIsZero: false, blockedIsOutage: false, unregisteredSurfaceIsIgnored: false, confidenceExceedsWeakestLoadBearingFacet: false, unknownFreshnessIsFresh: false };
}

const rank = (order, value) => (order.indexOf(value) === -1 ? order.length : order.indexOf(value));
const worst = (order, values) => values.reduce((acc, value) => (rank(order, value) > rank(order, acc) ? value : acc), order[0]);
const facet = (status, state, detail, extra = {}) => ({ status, state, detail, ...extra });

function productionFacet(property) {
  const a = property.availability;
  const observedAt = a.observedAt || null;
  if (property.profile?.lifecycle === 'alias' && property.probeExpectation?.expectation === 'redirects') {
    return facet('not-applicable', a.state, 'Redirect alias: availability belongs to the destination property.', { observedAt });
  }
  if (a.state === 'no-service-published' || property.diagnosticState === 'no-service-published') {
    return facet('not-applicable', 'no-service-published', 'No web service is published, so there is nothing to be available. Ownership intent is not declared.', { observedAt });
  }
  if (a.freshness?.state === 'expired') return facet('stale', 'unknown', 'Availability evidence has expired and is treated as unknown.', { observedAt });
  if (a.blocked) return facet('blocked', 'unknown', a.reason || 'The probe was restricted by the target; this vantage cannot establish availability.', { observedAt });
  if (a.evidenceState === 'measured' && ['available', 'degraded', 'unavailable'].includes(a.state)) return facet('verified', a.state, a.reason || 'Measured by the multi-vantage probe.', { observedAt });
  return facet('unknown', a.state || 'unknown', a.reason || 'No conclusive availability evidence.', { observedAt });
}

function criticalPathFacet(property, production) {
  const c = property.criticalPath;
  const level = c.level || 'none';
  if (production.status === 'not-applicable') return facet('not-applicable', 'not-applicable', 'No critical path applies without a published service.', { level });
  if (production.status === 'blocked') return facet('blocked', 'unknown', 'Not evaluable while availability is blocked.', { level });
  if (production.status === 'stale' || c.freshness?.state === 'expired') return facet('stale', 'unknown', 'Critical-path evidence has expired.', { level });
  if (level === 'authoritative' && ['pass', 'fail'].includes(c.state)) return facet('verified', c.state, 'Owner-declared critical routes were exercised (' + (c.checks?.length || 0) + ' checks).', { level });
  if (level === 'baseline') return facet('partial', c.state || 'unknown', 'Homepage identity baseline only; no owner-declared critical path.', { level });
  if (level === 'none') return facet('missing', 'unknown', 'No critical path is declared.', { level });
  return facet('unknown', c.state || 'unknown', c.reason || 'No conclusive critical-path evidence.', { level });
}

function audienceFacet(property, audienceRow, audienceDoc) {
  const o = property.observability || {};
  const requests = audienceRow?.requests?.[28];
  const governed = requests?.evidenceState === 'measured';
  const reception = o.reception || null;
  const receiving = reception?.state === 'received';
  const sourceStatus = audienceDoc?.source?.status || 'unknown';
  const base = { governedSource: { status: sourceStatus, measured: governed, requests28d: governed ? requests.value : null }, browserTelemetry: { instrumentation: o.state || 'unknown', reception: reception ? { state: reception.state, events: reception.events, windowHours: reception.windowHours, observedAt: reception.observedAt } : null } };
  if (o.state === 'not-applicable') return facet('not-applicable', 'not-applicable', 'No published service to measure.', { collecting: false, readable: false, ...base });
  if (o.state === 'inaccessible') return facet('blocked', 'unknown', o.reason || 'The page could not be read, so its instrumentation is unknown.', { collecting: null, readable: governed, ...base });
  if (governed && receiving) return facet('verified', 'measured', 'Governed audience readings and confirmed browser-telemetry reception.', { collecting: true, readable: true, ...base });
  if (governed) return facet('partial', 'measured', 'Governed audience readings exist but browser-telemetry reception is unconfirmed.', { collecting: null, readable: true, ...base });
  if (receiving) return facet(sourceStatus === 'awaiting-authorized-source' ? 'awaiting-authority' : 'partial', 'collected-unread', reception.events + ' page loads received in ' + reception.windowHours + 'h by Cloudflare Web Analytics, but Mission Control cannot read audience counts (' + sourceStatus + ').', { collecting: true, readable: false, ...base });
  if (sourceStatus === 'awaiting-authorized-source') return facet('awaiting-authority', 'unknown', 'Audience source awaiting authority; ' + (o.state === 'configured-unverified' ? 'a tag is shipped but no reception is confirmed.' : 'no reception evidence.'), { collecting: null, readable: false, ...base });
  return facet(o.state === 'absent' ? 'missing' : 'unknown', 'unknown', o.reason || 'No audience evidence.', { collecting: null, readable: false, ...base });
}

function newestDay(eventRows) {
  const days = eventRows.map(item => item.lastEventDay).filter(Boolean).sort();
  return days.length ? days[days.length - 1] : null;
}

function businessEventsFacet(eventsRow, eventsDoc) {
  const i = eventsRow?.instrumentation || { state: 'unknown', candidateProducers: [] };
  const sourceStatus = eventsDoc?.source?.status || 'unknown';
  const candidates = (i.candidateProducers || []).map(item => ({ type: item.type, producer: item.producer, repository: item.repository || null }));
  const outcome = eventsRow?.primaryOutcome || null;
  const primary = outcome && eventsRow.events.find(item => item.eventType === outcome.type);
  const counts28d = Object.fromEntries((eventsRow?.events || []).filter(item => item.readings?.[28]?.evidenceState === 'measured').map(item => [item.eventType, item.readings[28].value]));
  const base = { primaryOutcome: outcome, candidateProducers: candidates, count28d: primary?.readings?.[28]?.evidenceState === 'measured' ? primary.readings[28].value : null, counts28d };
  const noEvent = { day: null, evidenceState: 'unknown' };
  if (i.state === 'not-applicable') return facet('not-applicable', 'not-applicable', i.reason, { producerInstalled: 'not-applicable', lastConfirmedEvent: noEvent, ...base });
  if (i.state === 'instrumented') {
    const day = newestDay(eventsRow.events);
    return facet('verified', 'instrumented', 'The governed feed lists this property as instrumented.', { producerInstalled: 'confirmed', lastConfirmedEvent: day ? { day, evidenceState: 'measured' } : { day: null, evidenceState: 'none-observed' }, ...base });
  }
  if (i.state === 'awaiting-authorized-source') return facet('awaiting-authority', 'unknown', i.reason, { producerInstalled: candidates.length ? 'declared-unconfirmed' : 'unknown', lastConfirmedEvent: noEvent, ...base });
  if (i.state === 'unavailable') return facet('unknown', 'unknown', i.reason, { producerInstalled: candidates.length ? 'declared-unconfirmed' : 'unknown', lastConfirmedEvent: noEvent, ...base });
  if (i.state === 'not-connected') return facet('missing', 'not-connected', i.reason, { producerInstalled: 'declared-unconfirmed', lastConfirmedEvent: noEvent, ...base });
  return facet('missing', 'uninstrumented', i.reason || 'No event-producing route is declared.', { producerInstalled: 'none-declared', lastConfirmedEvent: noEvent, sourceStatus, ...base });
}

function historyFacet(property, production) {
  const recent = property.availability.recent || {};
  const runs = recent.runs || 0;
  const conclusive = recent.conclusiveRuns || 0;
  const base = { windowDays: recent.windowDays || 7, probeRuns: runs, conclusiveRuns: conclusive, expectedRuns: EXPECTED_RUNS_7D, coveragePct: Math.round((conclusive / EXPECTED_RUNS_7D) * 100), availabilityRatio: recent.availabilityRatio ?? null };
  if (production.status === 'not-applicable') return facet('not-applicable', 'not-applicable', 'No published service.', base);
  if (!conclusive) return facet(production.status === 'blocked' ? 'blocked' : 'missing', 'none', 'No conclusive probe run in the last ' + base.windowDays + ' days.', base);
  if (base.coveragePct >= 90) return facet('verified', 'covered', conclusive + ' of ' + EXPECTED_RUNS_7D + ' expected probe runs were conclusive.', base);
  return facet('partial', 'accruing', conclusive + ' of ' + EXPECTED_RUNS_7D + ' expected probe runs were conclusive; history is still accruing.', base);
}

function declarationFacet(property) {
  const life = property.profile?.lifecycle || 'unknown';
  const outcome = property.profile?.primaryOutcome || null;
  const base = { lifecycle: life, primaryOutcomeDeclared: Boolean(outcome), purposeSource: property.profile?.provenance?.purpose || null };
  if (life === 'unknown') return facet('missing', 'undeclared', 'The owner has not declared what this property is meant to be; production behaviour is shown without judging intent.', base);
  if (life === 'alias') return facet('verified', 'declared', 'Declared alias' + (property.profile?.aliasOf ? ' of ' + property.profile.aliasOf : '') + '.', base);
  if (!outcome) return facet('partial', 'declared-no-outcome', 'Lifecycle is declared but no primary outcome is, so no conversion can be measured.', base);
  return facet('verified', 'declared', 'Lifecycle and primary outcome are owner-declared.', base);
}

/** Property-specific next step. The linked diagnostic (if any) is kept separately as provenance for the estate-wide work item. */
function specificAction(name, f) {
  if (name === 'production') return f.status === 'blocked' ? 'Allow-list the Mission Control probe (X-GlobalDeets-Probe header / user agent) in the zone WAF, or register an authenticated health path.' : DEFAULT_ACTIONS.production;
  if (name === 'criticalPath') return f.status === 'blocked' ? 'Unblock the probe first; the critical path cannot be evaluated until availability can be.' : 'The owner names the one route or function that proves the product works; add it to the registry so it can be verified.';
  if (name === 'audience') {
    if (f.status === 'blocked') return 'Unblock the probe so the served page can be read and its analytics tag verified, then connect the governed audience source.';
    if (f.collecting === true) return 'Browser telemetry is already received; connect the governed audience source (read credential for Canonical Gold) so the counts become readable.';
    return 'Verify the analytics tag actually delivers events (none received in 24h) and connect the governed audience source.';
  }
  if (name === 'businessEvents') {
    if (f.status === 'awaiting-authority') return 'Restore Mission Control read authority to the governed event store' + (f.candidateProducers?.length ? ', then confirm the first arriving ' + f.candidateProducers.map(item => item.type).join('/') + ' event from ' + f.candidateProducers.map(item => item.producer).join(', ') : '') + '.';
    if (f.producerInstalled === 'declared-unconfirmed') return 'Connect the declared producer (' + f.candidateProducers.map(item => item.producer).join(', ') + ') to the event plane and confirm its first event.';
    return 'Declare a primary outcome and add a first-party event producer for it.';
  }
  if (name === 'history') return DEFAULT_ACTIONS.history;
  return DEFAULT_ACTIONS[name];
}

function confidenceFor(facets) {
  const { production, criticalPath, audience } = facets;
  if (production.status === 'not-applicable') return { level: 'insufficient', basis: 'Nothing is published, so there is no service behaviour to be confident about.' };
  if (production.status !== 'verified') return { level: 'insufficient', basis: 'Availability is not established (' + production.status + ').' };
  const audienceKnown = ['verified', 'partial'].includes(audience.status) && audience.collecting === true;
  if (criticalPath.status === 'verified' && audienceKnown) return { level: 'high', basis: 'Availability and an owner-declared critical path are verified and browser telemetry is confirmed.' };
  if (criticalPath.status === 'verified') return { level: 'medium', basis: 'Availability and critical path are verified; audience reception is not confirmed.' };
  if (criticalPath.status === 'partial') return { level: 'low', basis: 'Availability is verified but the critical path is baseline (homepage) only.' };
  return { level: 'low', basis: 'Availability is verified; nothing deeper is established.' };
}

function collectionFor(facets, production) {
  if (production.status === 'not-applicable') return { status: 'not-applicable', detail: 'No published service to collect from.' };
  if (production.status === 'blocked') return { status: 'blocked', detail: 'Probes are restricted by the target; collection cannot establish availability.' };
  const applicable = FACETS.map(name => facets[name].status).filter(status => status !== 'not-applicable');
  const verified = applicable.filter(status => status === 'verified').length;
  if (verified === applicable.length) return { status: 'complete', detail: 'Every applicable facet is verified.' };
  return { status: verified ? 'partial' : 'not-collecting', detail: verified + ' of ' + applicable.length + ' applicable facets are verified.' };
}

/** Links a blind spot to the ranked diagnostic that would close it: it names the property (or is estate-wide) in a matching category. */
function linkedItems(diagnostics, propertyId, facetName) {
  const categories = FACET_CATEGORIES[facetName];
  return (diagnostics?.items || [])
    .filter(item => ACTIONABLE.has(item.status) && categories.includes(item.category) && (!item.subjects?.length || item.subjects.includes(propertyId)))
    .sort((a, b) => b.priorityScore - a.priorityScore || String(a.id).localeCompare(String(b.id)));
}

function blindSpotsFor(facets, propertyId, diagnostics) {
  const spots = [];
  for (const name of FACETS) {
    const f = facets[name];
    if (f.status === 'verified' || f.status === 'not-applicable') continue;
    // History is never a blocking gap on its own: it accrues.
    // Row severity comes only from work that names THIS property. An estate-wide item (no subjects) is the
    // reason the gap exists and supplies the action, but its severity ranks the estate-level gap, not every row.
    const items = linkedItems(diagnostics, propertyId, name);
    const scoped = items.find(item => item.subjects?.length) || null;
    const lead = items[0] || null; // highest-priority linked work, estate-wide or not: it ranks the estate-level gap
    spots.push({
      id: name + ':' + f.status,
      facet: name,
      status: f.status,
      detail: f.detail,
      severity: scoped?.severity || 'info',
      gapSeverity: lead?.severity || 'info',
      scope: scoped ? 'property' : lead ? 'estate-wide' : 'derived',
      propertyDiagnosticId: scoped?.id || null,
      businessImpact: lead?.businessImpact || 'unrated',
      nextAction: specificAction(name, f),
      diagnosticAction: lead?.nextAction || null,
      actionability: lead?.actionability?.state || 'unrated',
      ownerLane: lead?.ownerLane || null,
      diagnosticId: lead?.id || null,
      priorityScore: lead?.priorityScore ?? null,
    });
  }
  return spots.sort((a, b) => rank(SEVERITY_ORDER, a.severity) - rank(SEVERITY_ORDER, b.severity) || (b.priorityScore ?? -1000) - (a.priorityScore ?? -1000) || a.id.localeCompare(b.id));
}

function freshnessFor(property, audienceDoc, eventsDoc, estate) {
  const map = {
    availability: property.availability.freshness?.state || 'unknown',
    criticalPath: property.criticalPath.freshness?.state || 'unknown',
    audience: audienceDoc?.source?.freshness?.state || 'unknown',
    businessEvents: eventsDoc?.source?.freshness?.state || 'unknown',
    inventory: estate.evidence?.inventory?.freshness?.state || 'unknown',
  };
  // 'unknown' means the facet has never been collected; it is listed, not averaged into the age of what WAS collected.
  const observed = Object.values(map).filter(state => state !== 'unknown');
  return { ...map, worst: observed.length ? worst(FRESHNESS_ORDER, observed) : 'unknown', neverCollected: Object.entries(map).filter(([, state]) => state === 'unknown').map(([key]) => key), evidenceAsOf: property.evidenceAsOf || null };
}

function provenanceFor(property, audienceDoc, eventsDoc, estate) {
  const probe = estate.evidence?.probe || {};
  return [
    { facet: 'production', source: 'Synthetic multi-vantage probe (' + (probe.vantageCount || 0) + ' vantages)', runId: probe.runId || null, observedAt: property.availability.observedAt || null },
    { facet: 'criticalPath', source: property.criticalPath.basis || 'No declared basis', level: property.criticalPath.level || 'none', observedAt: property.criticalPath.observedAt || null },
    { facet: 'audience', source: property.observability?.source || 'none', governed: audienceDoc?.source?.kind || 'none', governedStatus: audienceDoc?.source?.status || 'unknown', observedAt: property.observability?.reception?.observedAt || null },
    { facet: 'businessEvents', source: eventsDoc?.source?.feed?.source?.id || 'none', status: eventsDoc?.source?.status || 'unknown', observedAt: eventsDoc?.source?.observedAt || null },
    { facet: 'inventory', source: estate.evidence?.inventory?.source || 'registry', observedAt: estate.evidence?.inventory?.asOf || null },
  ];
}

function surfacesFrom(estate) {
  const infra = estate.infrastructure || {};
  const surfaces = [];
  for (const item of infra.unregisteredSurfaces || []) {
    surfaces.push({ id: item.hostname, kind: 'unregistered-hostname', parentProperty: item.parentProperty || null, project: item.project || null, status: item.status, latestProductionDeployAt: item.latestProductionDeployAt || null, coverage: 'not-monitored', finding: 'Serves from the estate but is not registered, so no availability, audience or outcome evidence is collected.' });
  }
  for (const item of infra.orphanProjects || []) {
    surfaces.push({ id: item.project, kind: 'orphan-pages-project', parentProperty: null, project: item.project, status: 'no-domain', latestProductionDeployAt: item.latestProductionDeployAt || null, coverage: 'not-monitored', finding: 'A Pages project with no mapped domain: purpose and ownership are undeclared.' });
  }
  return surfaces.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

export function buildCoverageMatrix({ registry, estate, audience, events, diagnostics, now }) {
  const audienceById = new Map((audience?.properties || []).map(item => [item.propertyId, item]));
  const eventsById = new Map((events?.properties || []).map(item => [item.propertyId, item]));
  const registryById = new Map(registry.properties.map(item => [item.propertyId, item]));

  const rows = estate.properties.map(property => {
    const production = productionFacet(property);
    const facets = {
      production,
      criticalPath: criticalPathFacet(property, production),
      audience: audienceFacet(property, audienceById.get(property.propertyId), audience),
      businessEvents: businessEventsFacet(eventsById.get(property.propertyId), events),
      history: historyFacet(property, production),
      declaration: declarationFacet(property),
    };
    const blindSpots = blindSpotsFor(facets, property.propertyId, diagnostics);
    const primary = blindSpots.find(item => item.facet !== 'history') || blindSpots[0] || null;
    const confidence = confidenceFor(facets);
    const reg = registryById.get(property.propertyId);
    return {
      propertyId: property.propertyId,
      displayName: property.displayName,
      identity: {
        tier: property.profile?.strategicTier ?? null,
        investorCritical: Boolean(property.investorCritical),
        lifecycle: property.profile?.lifecycle || 'unknown',
        category: property.profile?.category || null,
        aliasOf: property.profile?.aliasOf || null,
        earningPath: property.profile?.earningPath || null,
        purpose: property.profile?.purpose || null,
        hosting: property.deployment?.provider || 'unknown',
        declaredOwner: reg?.owner || null,
      },
      facets,
      collection: collectionFor(facets, production),
      freshness: freshnessFor(property, audience, events, estate),
      provenance: provenanceFor(property, audience, events, estate),
      blindSpots,
      severity: primary ? primary.severity : 'none',
      businessImpact: primary ? primary.businessImpact : 'none',
      recommendedAction: primary ? primary.nextAction : null,
      actionability: primary ? primary.actionability : 'none',
      owner: { lane: primary?.ownerLane || null, named: reg?.owner || null },
      confidence,
    };
  });

  const surfaces = surfacesFrom(estate);
  const countBy = (list, pick, order) => Object.fromEntries(order.map(value => [value, list.filter(item => pick(item) === value).length]));
  const facetTotals = Object.fromEntries(FACETS.map(name => [name, countBy(rows, row => row.facets[name].status, FACET_STATUSES)]));

  // Estate-level gap ranking: one entry per blind-spot id, ordered by worst severity then breadth.
  const gapMap = new Map();
  for (const row of rows) {
    for (const spot of row.blindSpots) {
      const gap = gapMap.get(spot.id) || { id: spot.id, facet: spot.facet, status: spot.status, severity: spot.gapSeverity, businessImpact: spot.businessImpact, nextAction: spot.diagnosticAction || spot.nextAction, diagnosticId: spot.diagnosticId, priorityScore: spot.priorityScore, properties: [] };
      gap.properties.push(row.propertyId);
      if (rank(SEVERITY_ORDER, spot.gapSeverity) < rank(SEVERITY_ORDER, gap.severity)) Object.assign(gap, { severity: spot.gapSeverity, businessImpact: spot.businessImpact, nextAction: spot.diagnosticAction || spot.nextAction, diagnosticId: spot.diagnosticId, priorityScore: spot.priorityScore });
      gapMap.set(spot.id, gap);
    }
  }
  const gaps = [...gapMap.values()]
    .map(gap => ({ ...gap, propertyCount: gap.properties.length }))
    .sort((a, b) => rank(SEVERITY_ORDER, a.severity) - rank(SEVERITY_ORDER, b.severity) || b.propertyCount - a.propertyCount || a.id.localeCompare(b.id));

  return {
    contractName: COVERAGE_CONTRACT_NAME,
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    generatedAt: now,
    policy: policy(),
    scope: {
      registeredProperties: rows.length,
      discoveredSurfaces: surfaces.length,
      note: 'Every registered property is a row whether or not it has telemetry. Surfaces discovered in Cloudflare but absent from the registry are listed, never dropped. Repositories and internal engines with no Cloudflare presence are outside the collectable scope and are not counted.',
    },
    vocabulary: { facetStatuses: FACET_STATUSES, facets: FACETS, confidence: CONFIDENCE_LEVELS },
    totals: {
      properties: rows.length,
      facets: facetTotals,
      collection: countBy(rows, row => row.collection.status, ['complete', 'partial', 'not-collecting', 'blocked', 'not-applicable']),
      confidence: countBy(rows, row => row.confidence.level, CONFIDENCE_LEVELS),
      severity: countBy(rows, row => row.severity, SEVERITY_ORDER),
      freshness: countBy(rows, row => row.freshness.worst, FRESHNESS_ORDER),
      blindSpots: rows.reduce((sum, row) => sum + row.blindSpots.length, 0),
      withProducerConfirmed: rows.filter(row => row.facets.businessEvents.producerInstalled === 'confirmed').length,
      withLastConfirmedEvent: rows.filter(row => row.facets.businessEvents.lastConfirmedEvent.evidenceState === 'measured').length,
      surfacesNotMonitored: surfaces.length,
    },
    gaps,
    surfaces,
    rows,
  };
}

export function validateCoverageMatrix(doc, { estate } = {}) {
  const errors = [];
  if (doc?.contractName !== COVERAGE_CONTRACT_NAME) return ['coverage: contractName'];
  if (!/^1\./.test(String(doc.schemaVersion))) errors.push('coverage: schemaVersion');
  for (const [key, value] of Object.entries(policy())) if (doc.policy?.[key] !== value) errors.push('coverage: policy.' + key);
  if (!Array.isArray(doc.rows)) return [...errors, 'coverage: rows'];
  if (estate) {
    if (doc.rows.map(row => row.propertyId).join('|') !== estate.properties.map(row => row.propertyId).join('|')) errors.push('coverage: rows are not exactly the registered properties in order');
    const infra = estate.infrastructure || {};
    const expected = (infra.unregisteredSurfaces || []).length + (infra.orphanProjects || []).length;
    if ((doc.surfaces || []).length !== expected) errors.push('coverage: discovered surfaces are not all accounted for (' + (doc.surfaces || []).length + ' of ' + expected + ')');
  }
  for (const row of doc.rows) {
    const label = 'coverage: ' + row.propertyId;
    for (const name of FACETS) {
      const f = row.facets?.[name];
      if (!f || !FACET_STATUSES.includes(f.status)) {
        errors.push(label + ' facet ' + name);
        continue;
      }
      const needsSpot = f.status !== 'verified' && f.status !== 'not-applicable';
      const hasSpot = (row.blindSpots || []).some(spot => spot.facet === name);
      if (needsSpot !== hasSpot) errors.push(label + ' facet ' + name + (needsSpot ? ' has no blind spot for its gap' : ' has a blind spot without a gap'));
    }
    if (!CONFIDENCE_LEVELS.includes(row.confidence?.level)) errors.push(label + ' confidence');
    // Confidence can never outrun the evidence beneath it.
    if (['high', 'medium'].includes(row.confidence?.level) && row.facets?.production?.status !== 'verified') errors.push(label + ' claims confidence without verified availability');
    if (row.confidence?.level === 'high' && row.facets?.criticalPath?.status !== 'verified') errors.push(label + ' claims high confidence without a verified critical path');
    const events = row.facets?.businessEvents;
    if (events?.lastConfirmedEvent?.evidenceState === 'measured' && events.producerInstalled !== 'confirmed') errors.push(label + ' reports a confirmed event without a confirmed producer');
    if ((events?.count28d != null || Object.keys(events?.counts28d || {}).length) && events.status !== 'verified') errors.push(label + ' reports an event count without verified instrumentation');
    if (row.facets?.audience?.governedSource?.requests28d != null && !row.facets.audience.governedSource.measured) errors.push(label + ' reports audience requests that are not measured');
    if (row.facets?.production?.status === 'blocked' && row.facets.production.state !== 'unknown') errors.push(label + ' presents a blocked probe as a health state');
    if (row.severity !== 'none' && !(row.blindSpots || []).length) errors.push(label + ' has a severity but no blind spot');
  }
  const facetTotal = doc.totals?.facets?.production;
  if (!facetTotal || Object.values(facetTotal).reduce((a, b) => a + b, 0) !== doc.rows.length) errors.push('coverage: totals do not cover every row');
  if (doc.totals?.blindSpots !== doc.rows.reduce((sum, row) => sum + (row.blindSpots?.length || 0), 0)) errors.push('coverage: blind-spot total');
  return errors;
}

/** Plain-language table for operators (used by the coverage report CLI and CI logs). */
export function renderCoverageMarkdown(doc) {
  const cell = f => f.status + (f.state && !['unknown', 'not-applicable'].includes(f.state) && f.state !== f.status ? ' (' + f.state + ')' : '');
  const lines = [
    '# Estate coverage matrix',
    '',
    'Generated ' + doc.generatedAt + '. ' + doc.totals.properties + ' registered properties, ' + doc.totals.surfacesNotMonitored + ' discovered surfaces not monitored.',
    '',
    '| Property | Tier | Lifecycle | Production | Critical path | Audience | Business events | History | Last event | Freshness | Confidence | Severity | Next action |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...doc.rows.map(row => '| ' + [row.propertyId, row.identity.tier ?? '-', row.identity.lifecycle, cell(row.facets.production), cell(row.facets.criticalPath), cell(row.facets.audience), cell(row.facets.businessEvents), cell(row.facets.history), row.facets.businessEvents.lastConfirmedEvent.day || row.facets.businessEvents.lastConfirmedEvent.evidenceState, row.freshness.worst, row.confidence.level, row.severity, (row.recommendedAction || '-').replace(/\|/g, '/')].join(' | ') + ' |'),
    '',
    '## Highest-severity gaps',
    '',
    ...doc.gaps.slice(0, 10).map(gap => '- **' + gap.severity + '** ' + gap.id + ' (' + gap.propertyCount + ' properties): ' + gap.nextAction),
    '',
    '## Surfaces outside the registry',
    '',
    ...(doc.surfaces.length ? doc.surfaces.map(item => '- ' + item.id + ' [' + item.kind + '] ' + item.finding) : ['- none']),
    '',
  ];
  return lines.join('\n');
}

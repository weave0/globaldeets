/**
 * Derives the agent- and human-consumable diagnostics queue from evidence (GD-030, extended in GD-031).
 *
 * Findings that can be computed from probe, history, inventory, audience or business-event evidence are
 * derived here and never hand-copied. Only judgments with no derivable evidence (product opportunity,
 * narrative provenance) live in config/diagnostics-manual.json.
 *
 * GD-031: every item now carries a category, confidence, freshness, actionability (actionable now vs blocked
 * on missing authority vs needs a decision) and an EXPLAINABLE priority score with its full breakdown, so
 * "what should I work on next, and why?" is answerable from the data alone.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

export const DIAGNOSTICS_CONTRACT_NAME = 'globaldeets-diagnostics-queue';
export const DIAGNOSTICS_SCHEMA_VERSION = '2.0.0';

const SEVERITY_POINTS = { critical: 100, high: 70, medium: 40, low: 15, info: 5 };
const IMPACT_POINTS = { existential: 20, high: 12, medium: 6, low: 0 };
const ESCALATION_POINTS = { 'investor-blocking': 15, page: 12, high: 6, medium: 2, low: 0, none: 0 };
const TIER_POINTS = { 1: 12, 2: 8, 3: 4, 4: 0 };
const ACTIONABILITY_POINTS = { 'actionable-now': 20, 'decision-needed': 0, monitor: -5, 'blocked-on-authority': -20, closed: -100 };
const CONFIDENCE_POINTS = { high: 0, medium: -4, low: -10 };
const INVESTOR_CRITICAL_POINTS = 25;
const ESTATE_WIDE_SUBJECTS = 5;
const ESTATE_WIDE_POINTS = 15;
const MAX_AGE_POINTS_DAYS = 14;
const CLOSED_RETENTION_DAYS = 7;
const TERMINALS = ['closed', 'accepted-risk'];
/** A serving property with no more than this many edge requests in 28 days shows little observable use. */
export const LOW_USE_REQUESTS_28D = 1000;
/** A property holding at least this share of estate edge requests with no measurable outcome is a finding. */
export const HIGH_TRAFFIC_SHARE_PCT = 10;

export const PRIORITY_MODEL = Object.freeze({
  version: '1.0.0',
  summary: 'Score = severity + investor-critical + strategic tier + business impact + escalation + actionability + confidence + age. Higher is more urgent. Every item publishes the exact points behind its score.',
  points: { severity: SEVERITY_POINTS, businessImpact: IMPACT_POINTS, escalation: ESCALATION_POINTS, strategicTier: TIER_POINTS, actionability: ACTIONABILITY_POINTS, confidence: CONFIDENCE_POINTS, investorCritical: INVESTOR_CRITICAL_POINTS, estateWide: ESTATE_WIDE_POINTS, estateWideAboveSubjects: ESTATE_WIDE_SUBJECTS, agePerTwoDays: 1, maxAgeDays: MAX_AGE_POINTS_DAYS },
  tieBreak: 'Equal scores are ordered by item id, so ranking is deterministic.',
});

export const AGENT_CONTRACT = Object.freeze({
  sortableFields: ['priority', 'priorityScore', 'severity', 'businessImpact', 'status', 'category', 'actionability.state', 'confidence', 'ownerLane', 'ageDays', 'domain', 'escalation.level', 'escalation.class'],
  actionableStatuses: ['open', 'in-progress', 'blocked'],
  terminalStatuses: ['closed', 'accepted-risk'],
  requiredForAction: ['id', 'severity', 'businessImpact', 'status', 'category', 'ownerLane', 'ageDays', 'evidence', 'nextAction', 'escalation', 'confidence', 'freshness', 'actionability', 'subjects', 'priorityScore', 'priorityBreakdown'],
  escalationLevels: ['investor-blocking', 'page', 'high', 'medium', 'low', 'none'],
  escalationClasses: semantics.ESCALATION_CLASSES,
  categories: semantics.FINDING_CATEGORIES,
  actionabilityStates: semantics.ACTIONABILITY_STATES,
  classGuide: {
    'investor-impacting-outage': 'An investor-critical property is confirmed down or failing its authoritative critical path. Page immediately.',
    outage: 'A non-investor-critical property is confirmed unavailable. Ordinary incident.',
    degradation: 'Reachable but slow, intermittent, or failing a non-critical check.',
    maintenance: 'Routine platform hygiene: expiring certificates, parked zones needing a topology decision, contract drift.',
    'observability-gap': 'We cannot see the property well enough to know its state (no live instrumentation, single probe vantage).',
    'stale-evidence': 'Evidence exists but has aged past its freshness policy; automation may be failing.',
    'insufficient-evidence': 'The probe could not establish state (blocked/challenged, no contract). Not an outage.',
    'measurement-claim-block': 'An investor-facing claim cannot be made until the measurement is certified.',
    'business-opportunity': 'Upside that needs evidence before it is claimed.',
    'narrative-provenance': 'External or public narrative is inconsistent with the product.',
  },
});

function dayOf(iso) {
  return String(iso).slice(0, 10);
}

function ageDays(openedAt, now) {
  const opened = Date.parse(openedAt.length === 10 ? openedAt + 'T00:00:00Z' : openedAt);
  return Math.max(0, Math.floor((Date.parse(now) - opened) / 86400000));
}

function subjectsOf(entry) {
  if (Array.isArray(entry.subjects)) return entry.subjects;
  return entry.subject ? [entry.subject] : [];
}

/** Common item builder: every derived item states its category, polarity, confidence, freshness basis and actionability. */
function item(base) {
  return {
    source: 'derived',
    status: 'open',
    polarity: 'risk',
    confidence: 'high',
    freshnessBasis: 'probe',
    actionability: { state: 'actionable-now', blockedBy: null },
    ...base,
    escalation: { blocksInvestorClaim: false, ...base.escalation },
  };
}

const actionNow = () => ({ state: 'actionable-now', blockedBy: null });
const decision = () => ({ state: 'decision-needed', blockedBy: null });
const blocked = reason => ({ state: 'blocked-on-authority', blockedBy: reason });
const monitor = () => ({ state: 'monitor', blockedBy: null });

function plural(count, singular, pluralForm) {
  return count + ' ' + (count === 1 ? singular : pluralForm || singular + 's');
}

function evidenceRef(property, estate) {
  return property.propertyId + '@' + (property.availability.observedAt || estate.generatedAt);
}

// ── Availability and critical path ───────────────────────────────────────────────────────────────

function propertyOutageItems(estate) {
  const items = [];
  for (const property of estate.properties) {
    const evidenceRefValue = evidenceRef(property, estate);
    const detail = property.availability.evidence;
    const evidenceLine = detail?.http
      ? 'HTTP ' + (detail.http.status ?? 'no response') + ', DNS ' + (detail.dns?.state || 'n/a') + ', TLS ' + (detail.tls?.state || 'n/a')
      : 'no transport evidence';
    const name = property.profile?.name || property.displayName;
    const tier = property.profile?.strategicTier ?? null;

    if (property.diagnosticState === 'outage') {
      const critical = property.investorCritical;
      items.push(
        item({
          id: 'availability:outage:' + property.propertyId,
          subject: property.propertyId,
          subjects: [property.propertyId],
          rule: 'availability-outage',
          category: 'availability',
          severity: critical ? 'critical' : 'high',
          domain: 'reliability',
          businessImpact: critical ? 'existential' : 'medium',
          ownerLane: 'Platform',
          title: name + ' is unavailable',
          observed: property.availability.reason + ' Failure class: ' + property.availability.failureClass + '. ' + evidenceLine + '.',
          businessReason: critical
            ? 'An investor-critical property is down; any availability or traction claim about it is unsafe until restored.'
            : 'A property in the estate is not serving.',
          evidence: [{ type: 'production-probe', ref: evidenceRefValue, state: 'measured' }],
          nextAction: property.availability.nextAction || 'Investigate origin and DNS for ' + property.propertyId + '.',
          tier,
          escalation: {
            level: critical ? 'page' : 'high',
            class: critical ? 'investor-impacting-outage' : 'outage',
            escalateWhen: 'Outage persists across two consecutive probe runs, or an investor briefing is scheduled while it is open.',
            targetLane: 'Platform',
          },
        })
      );
    } else if (property.diagnosticState === 'critical-path-failed') {
      const critical = property.investorCritical;
      const failing = property.criticalPath.checks.filter(check => !check.pass).map(check => check.id + ' (' + check.detail + ')');
      items.push(
        item({
          id: 'criticalpath:failed:' + property.propertyId,
          subject: property.propertyId,
          subjects: [property.propertyId],
          rule: 'critical-path-failed',
          category: 'critical-path',
          severity: critical ? 'critical' : 'high',
          domain: 'reliability',
          businessImpact: critical ? 'high' : 'medium',
          ownerLane: 'Platform',
          title: name + ' responds, but its critical path is failing',
          observed: 'The authoritative critical-path contract (' + property.criticalPath.contract.basisSource + ') failed: ' + (failing.length ? failing.join('; ') : property.criticalPath.reason) + '. The homepage may look fine while the function users depend on is broken.',
          businessReason: 'The homepage may respond while the product function investors and users depend on is broken.',
          evidence: [{ type: 'critical-path-probe', ref: evidenceRefValue, state: 'measured' }],
          nextAction: 'Inspect the failing check(s) against production and the latest deploy; fix the route or correct the contract if the product intentionally changed.',
          tier,
          escalation: {
            level: critical ? 'page' : 'high',
            class: critical ? 'investor-impacting-outage' : 'degradation',
            escalateWhen: 'Failure persists for two consecutive runs.',
            targetLane: 'Platform',
          },
        })
      );
    } else if (property.diagnosticState === 'degraded') {
      items.push(
        item({
          id: 'availability:degraded:' + property.propertyId,
          subject: property.propertyId,
          subjects: [property.propertyId],
          rule: 'availability-degraded',
          category: 'availability',
          severity: property.investorCritical ? 'high' : 'medium',
          domain: 'reliability',
          businessImpact: property.investorCritical ? 'high' : 'low',
          ownerLane: 'Platform',
          title: name + ' is degraded',
          observed: property.availability.reason + (property.availability.failureClass ? ' Class: ' + property.availability.failureClass + '.' : ''),
          businessReason: 'Degraded availability erodes trust before it becomes an outage.',
          evidence: [{ type: 'production-probe', ref: evidenceRefValue, state: 'measured' }],
          nextAction: property.availability.nextAction || 'Investigate latency and error rate for ' + property.propertyId + '.',
          tier,
          escalation: {
            level: property.investorCritical ? 'high' : 'medium',
            class: property.availability.failureClass === 'tls-expiring' ? 'maintenance' : 'degradation',
            escalateWhen: 'Degradation persists across three consecutive runs or worsens to unavailable.',
            targetLane: 'Platform',
          },
        })
      );
    } else if (property.diagnosticState === 'vantage-conflict') {
      items.push(
        item({
          id: 'availability:vantage-conflict:' + property.propertyId,
          subject: property.propertyId,
          subjects: [property.propertyId],
          rule: 'vantage-conflict',
          category: 'evidence-quality',
          severity: property.investorCritical ? 'high' : 'medium',
          domain: 'reliability',
          businessImpact: property.investorCritical ? 'high' : 'medium',
          ownerLane: 'Platform',
          title: 'Probe vantages disagree about ' + name,
          observed: property.availability.reason,
          businessReason: 'When two independent networks disagree, the property may be failing for some users only. Neither answer is chosen for you.',
          evidence: [{ type: 'production-probe', ref: evidenceRefValue, state: 'measured' }],
          confidence: 'medium',
          nextAction: property.availability.nextAction,
          tier,
          escalation: { level: 'high', class: 'degradation', escalateWhen: 'The disagreement persists across two consecutive runs.', targetLane: 'Platform' },
        })
      );
    }
  }
  return items;
}

function aggregated(estate, state, config, filter = () => true) {
  const subjects = estate.properties.filter(property => property.diagnosticState === state && filter(property)).map(property => property.propertyId);
  if (!subjects.length) return [];
  return [
    item({
      subjects,
      evidence: [{ type: 'production-probe', ref: 'globaldeets-estate-health@' + estate.generatedAt, state: 'measured' }],
      ...config(subjects),
    }),
  ];
}

// ── Evidence quality ─────────────────────────────────────────────────────────────────────────────

function evidenceItems(estate, history, now, latestAttempt, audience) {
  const items = [];
  const probe = estate.evidence.probe;
  const probeFreshness = probe.freshness;
  if (probe.validity === 'none') {
    items.push(
      item({
        id: 'evidence:probe-missing',
        rule: 'probe-missing',
        category: 'evidence-quality',
        severity: 'high',
        domain: 'reliability',
        businessImpact: 'high',
        ownerLane: 'Platform',
        title: 'No production probe evidence has been collected',
        observed: 'The scheduled collector has not yet produced a valid probe run; every property availability is unknown.',
        businessReason: 'Without probes the estate can fail silently.',
        evidence: [{ type: 'probe-run', ref: 'none', state: 'unavailable' }],
        nextAction: 'Run the mission-control-evidence workflow (workflow_dispatch) and confirm it commits to the evidence branch.',
        escalation: { level: 'high', class: 'stale-evidence', escalateWhen: 'Still missing 24 hours after the collector was enabled.', targetLane: 'Platform' },
      })
    );
  } else if (['stale', 'expired'].includes(probeFreshness.state)) {
    const expired = probeFreshness.state === 'expired';
    items.push(
      item({
        id: 'evidence:probe-stale',
        rule: 'probe-stale',
        category: 'evidence-quality',
        severity: expired ? 'high' : 'medium',
        domain: 'reliability',
        businessImpact: expired ? 'high' : 'medium',
        ownerLane: 'Platform',
        title: 'Production probe evidence is ' + probeFreshness.state,
        observed: 'Latest valid probe run is ' + probeFreshness.ageHours + ' hours old (policy: fresh within ' + semantics.FRESHNESS_POLICY.probe.freshWithinHours + 'h, expired after ' + semantics.FRESHNESS_POLICY.probe.expiredAfterHours + 'h).' + (expired ? ' Availability is presented as unknown.' : ''),
        businessReason: 'Aged evidence cannot support a current health claim; the collector or its deploy may be failing.',
        evidence: [{ type: 'probe-run', ref: probe.runId, state: probeFreshness.state }],
        nextAction: 'Inspect the mission-control-evidence workflow runs; fix the failing step. Last valid evidence is preserved.',
        escalation: { level: expired ? 'high' : 'medium', class: 'stale-evidence', escalateWhen: 'Evidence becomes expired.', targetLane: 'Platform' },
      })
    );
  }
  if (latestAttempt && latestAttempt.validity === 'invalid-vantage') {
    items.push(
      item({
        id: 'evidence:probe-invalid-vantage',
        rule: 'probe-invalid-vantage',
        category: 'evidence-quality',
        severity: 'medium',
        domain: 'reliability',
        businessImpact: 'medium',
        ownerLane: 'Platform',
        title: 'Latest probe run was invalid (no canary reachable)',
        observed: 'Run ' + latestAttempt.runId + ' could not reach any independent canary host; it was discarded as evidence and the last valid run is preserved.',
        businessReason: 'A broken probe vantage must never be read as a property outage.',
        evidence: [{ type: 'probe-run', ref: latestAttempt.runId, state: 'unavailable' }],
        nextAction: 'Check runner egress; the next scheduled run will retry automatically.',
        escalation: { level: 'medium', class: 'stale-evidence', escalateWhen: 'Two consecutive runs are invalid.', targetLane: 'Platform' },
      })
    );
  }

  const scheduledSnapshots = history.snapshots.filter(snapshot => snapshot.collector?.kind === 'scheduled');
  const newestScheduled = scheduledSnapshots.length ? scheduledSnapshots[scheduledSnapshots.length - 1].observedAt : null;
  const historyFresh = newestScheduled ? semantics.evaluateFreshness(newestScheduled, semantics.FRESHNESS_POLICY.history, now) : null;
  if (historyFresh && ['stale', 'expired'].includes(historyFresh.state)) {
    items.push(
      item({
        id: 'evidence:history-stale',
        rule: 'history-stale',
        category: 'evidence-quality',
        freshnessBasis: 'history',
        severity: 'medium',
        domain: 'measurement',
        businessImpact: 'medium',
        ownerLane: 'Data / analytics',
        title: 'Historical snapshots are ' + historyFresh.state,
        observed: 'Newest scheduled snapshot is ' + historyFresh.ageHours + ' hours old.',
        businessReason: 'Trends must accumulate on schedule to be decision-grade.',
        evidence: [{ type: 'history-contract', ref: 'globaldeets-mission-control-history', state: historyFresh.state }],
        nextAction: 'Inspect the scheduled collector; missing days remain visible gaps and are never interpolated.',
        escalation: { level: 'medium', class: 'stale-evidence', escalateWhen: 'More than three consecutive days are missing.', targetLane: 'Data / analytics' },
      })
    );
  }
  if (audience?.source?.status && ['measured', 'partial'].includes(audience.source.status) && ['stale', 'expired'].includes(audience.source.freshness?.state)) {
    const expired = audience.source.freshness.state === 'expired';
    items.push(
      item({
        id: 'evidence:audience-stale',
        rule: 'audience-stale',
        category: 'evidence-quality',
        freshnessBasis: 'audience',
        severity: expired ? 'high' : 'medium',
        domain: 'measurement',
        businessImpact: 'high',
        ownerLane: 'Data / analytics',
        title: 'Audience data is ' + audience.source.freshness.state,
        observed: 'The governed Canonical Gold document was generated ' + audience.source.freshness.ageHours + ' hours ago.' + (expired ? ' Audience figures are withheld from headlines.' : ''),
        businessReason: 'Traffic figures that are days old cannot describe current usage or growth.',
        evidence: [{ type: 'canonical-gold', ref: audience.source.gold?.generatedAt || 'unknown', state: audience.source.freshness.state }],
        nextAction: 'Check the Traffic Intelligence daily pipeline (traffic-intelligence-deploy workflow) for failures.',
        escalation: { level: 'medium', class: 'stale-evidence', escalateWhen: 'Audience data expires.', targetLane: 'Data / analytics' },
      })
    );
  }
  const inventory = estate.evidence.inventory;
  const carried = [inventory.facets?.zones ? null : 'zone status', inventory.facets?.pages ? null : 'Pages deploy facts'].filter(Boolean);
  const aged = ['stale', 'expired'].includes(inventory.freshness.state);
  if (aged || carried.length) {
    items.push(
      item({
        id: 'evidence:inventory-stale',
        rule: 'inventory-incomplete',
        category: 'evidence-quality',
        freshnessBasis: 'inventory',
        confidence: 'high',
        severity: aged ? 'medium' : 'low',
        domain: 'observability',
        businessImpact: 'low',
        ownerLane: 'Platform',
        title: aged ? 'Cloudflare inventory is ' + inventory.freshness.state : 'Part of the Cloudflare inventory is carried forward, not refreshed',
        observed: (carried.length ? carried.join(', ') + ' are carried forward from the ' + inventory.baselineAsOf.slice(0, 10) + ' read. ' : '') + (aged ? 'Inventory was last observed ' + inventory.freshness.ageHours + ' hours ago. ' : ''),
        businessReason: 'Zone counts and deploy freshness are only as current as the inventory read behind them.',
        evidence: [{ type: 'inventory', ref: inventory.asOf, state: aged ? inventory.freshness.state : 'partial' }],
        nextAction: 'Grant the collector token the missing read scopes (Zone:Read, Pages:Read).',
        actionability: blocked('Cloudflare API token scopes (Zone:Read, Pages:Read)'),
        escalation: { level: aged ? 'medium' : 'low', class: 'stale-evidence', escalateWhen: 'Inventory expires (over 7 days).', targetLane: 'Platform' },
      })
    );
  }
  return items;
}

// ── Measurement coverage ─────────────────────────────────────────────────────────────────────────

function coverageItems(estate) {
  const items = [];
  const rows = estate.properties;
  const probe = estate.evidence.probe;

  if (probe.validity === 'valid' && probe.vantageCount < 2) {
    items.push(
      item({
        id: 'observability:single-probe-vantage',
        rule: 'single-vantage',
        category: 'evidence-quality',
        severity: 'low',
        domain: 'observability',
        businessImpact: 'low',
        ownerLane: 'Platform',
        title: 'Availability evidence comes from a single vantage',
        observed: 'All probes originate from ' + probe.vantage + '. A network-specific block or regional failure cannot be told apart from a property failure beyond canary checks and confirmation re-probes.',
        businessReason: 'One vantage limits confidence in confirmed outages and cannot see regional failures.',
        evidence: [{ type: 'probe-run', ref: probe.runId, state: 'measured' }],
        nextAction: 'Restore the second vantage (the secondary probe job in the mission-control-evidence workflow) and require agreement before paging.',
        escalation: { level: 'low', class: 'observability-gap', escalateWhen: 'A confirmed outage is disputed by an external report.', targetLane: 'Platform' },
      })
    );
  }

  const partial = rows.filter(row => row.availability.agreement === 'partial').map(row => row.propertyId);
  if (partial.length) {
    items.push(
      item({
        id: 'evidence:vantage-partial',
        rule: 'vantage-partial',
        category: 'evidence-quality',
        subjects: partial,
        severity: 'low',
        domain: 'observability',
        businessImpact: 'low',
        polarity: 'gap',
        confidence: 'medium',
        ownerLane: 'Platform',
        title: plural(partial.length, 'property is', 'properties are') + ' blocked from one vantage but reachable from another',
        observed: partial.join(', ') + ' challenged or blocked at least one probe vantage while another reached the page. The conclusive vantage is used; the blocked one stays visible as evidence.',
        businessReason: 'A bot challenge is insufficient evidence, not an outage; a second network resolved it without weakening any security control.',
        evidence: [{ type: 'production-probe', ref: 'globaldeets-estate-health@' + estate.generatedAt, state: 'measured' }],
        nextAction: 'No action is required for health. Optionally allow-list the probe on the affected zone (Cloudflare WAF, zone owner) to restore single-vantage completeness.',
        actionability: blocked('Cloudflare WAF authority on the affected zone (zone owner)'),
        escalation: { level: 'low', class: 'insufficient-evidence', escalateWhen: 'The second vantage also becomes blocked.', targetLane: 'Platform' },
      })
    );
  }

  // Critical-path maturity.
  const serving = rows.filter(row => row.probeExpectation.expectation === 'serves-content');
  const authoritative = rows.filter(row => row.criticalPath.contract.level === 'authoritative');
  const needs = serving.filter(row => row.criticalPath.contract.level !== 'authoritative').map(row => row.propertyId);
  items.push(
    item({
      id: 'observability:critical-path-contracts',
      rule: 'critical-path-contracts',
      category: 'critical-path',
      subjects: needs,
      severity: 'low',
      domain: 'observability',
      businessImpact: 'medium',
      polarity: 'gap',
      actionability: decision(),
      freshnessBasis: 'registry',
      ownerLane: 'Platform + property owner',
      title: needs.length + ' of ' + serving.length + ' serving properties still need an owner-declared critical path',
      observed: authoritative.length + ' of ' + serving.length + ' serving properties have an authoritative critical-path contract (' + authoritative.map(row => row.propertyId).join(', ') + '); the rest are checked only against a homepage identity baseline, which cannot prove the product works.',
      businessReason: 'Reachable-unverified is not verified health; only owned, contracted paths can prove the product works.',
      evidence: [{ type: 'estate-registry', ref: 'tools/mission-control/config/estate-registry.json', state: 'measured' }],
      nextAction: 'Each property owner names the one route or function that proves the product works (API endpoint, key page, search) and Mission Control adds it to the registry.',
      escalation: { level: 'low', class: 'insufficient-evidence', escalateWhen: 'A property is described to investors as production-grade without an authoritative contract.', targetLane: 'Platform + property owner' },
    })
  );

  // Instrumentation truth.
  const inst = state => rows.filter(row => row.observability.state === state);
  const absent = inst('absent');
  // A placeholder tag is a defect whether or not another, real tag is also present.
  const invalid = rows.filter(row => (row.observability.providers || []).some(provider => provider.placeholder));
  const unverified = inst('configured-unverified');
  const tier = list => Math.min(...list.map(row => row.profile?.strategicTier ?? 4), 4);

  if (invalid.length) {
    items.push(
      item({
        id: 'instrumentation:placeholder-tag',
        rule: 'instrumentation-placeholder',
        category: 'instrumentation',
        subjects: invalid.map(row => row.propertyId),
        severity: 'medium',
        domain: 'observability',
        businessImpact: 'medium',
        ownerLane: 'Property owner',
        title: plural(invalid.length, 'property ships', 'properties ship') + ' an analytics tag with a placeholder ID',
        observed: invalid.map(row => row.propertyId + ' (' + row.observability.providers.filter(provider => provider.placeholder).map(provider => provider.measurementId || provider.id).join(', ') + ')').join('; ') + ' load an analytics script configured with a placeholder measurement ID. That tag cannot be collecting real data' + (invalid.some(row => row.observability.state !== 'configured-invalid') ? ' (another, real tag is also present on some of these)' : '') + '.',
        businessReason: 'The page looks instrumented while measuring nothing, which would silently hide its audience.',
        evidence: [{ type: 'served-html', ref: 'production probe ' + (estate.evidence.probe.runId || 'none'), state: 'measured' }],
        nextAction: 'Replace the placeholder with the real GA4 measurement ID (or remove the tag) and redeploy.',
        tier: tier(invalid),
        escalation: { level: 'medium', class: 'observability-gap', escalateWhen: 'The property becomes part of investor material.', targetLane: 'Property owner' },
      })
    );
  }
  if (absent.length) {
    items.push(
      item({
        id: 'instrumentation:absent',
        rule: 'instrumentation-absent',
        category: 'instrumentation',
        subjects: absent.map(row => row.propertyId),
        severity: 'medium',
        domain: 'observability',
        businessImpact: 'medium',
        confidence: 'medium',
        ownerLane: 'Platform',
        title: plural(absent.length, 'serving property') + ' ship no browser analytics',
        observed: 'No known analytics tag is served in the homepage HTML of ' + absent.map(row => row.propertyId).join(', ') + '. Tags injected only by scripts cannot be seen from here, so this is a strong signal, not proof.',
        businessReason: 'Without browser telemetry a property has no measurable audience or outcome, whatever its raw request count.',
        evidence: [{ type: 'served-html', ref: 'production probe ' + (estate.evidence.probe.runId || 'none'), state: 'measured' }],
        nextAction: 'Decide per property: add Cloudflare Web Analytics or GA4, or record an explicit exemption in the registry.',
        actionability: decision(),
        tier: tier(absent),
        escalation: { level: 'medium', class: 'observability-gap', escalateWhen: 'A property in this list becomes business-critical or has an incident.', targetLane: 'Platform' },
      })
    );
  }
  const discrepancy = rows.filter(row => row.observability.discrepancy);
  if (discrepancy.length) {
    items.push(
      item({
        id: 'instrumentation:rum-flag-mismatch',
        rule: 'rum-flag-mismatch',
        category: 'instrumentation',
        subjects: discrepancy.map(row => row.propertyId),
        severity: 'medium',
        domain: 'observability',
        businessImpact: 'medium',
        confidence: 'medium',
        freshnessBasis: 'inventory',
        ownerLane: 'Platform',
        title: 'Cloudflare says RUM is on for ' + discrepancy.length + ', but no browser tag is served',
        observed: 'The last-read Cloudflare RUM flag is on for ' + discrepancy.map(row => row.propertyId).join(', ') + ', yet the served HTML of each carries no analytics tag. The flag is a carried-forward setting, not evidence of telemetry.',
        businessReason: 'Reporting these as browser-observed would overstate measurement coverage.',
        evidence: [{ type: 'cloudflare-rum-setting', ref: estate.evidence.inventory.baselineAsOf, state: 'carried-forward' }, { type: 'served-html', ref: 'production probe ' + (estate.evidence.probe.runId || 'none'), state: 'measured' }],
        nextAction: 'Confirm in Cloudflare whether Web Analytics is enabled with an installed snippet; install the snippet or clear the flag.',
        actionability: decision(),
        escalation: { level: 'medium', class: 'observability-gap', escalateWhen: 'RUM coverage is quoted in investor material.', targetLane: 'Platform' },
      })
    );
  }
  if (unverified.length) {
    items.push(
      item({
        id: 'instrumentation:reception-unverified',
        rule: 'instrumentation-unverified',
        category: 'instrumentation',
        subjects: unverified.map(row => row.propertyId),
        severity: 'low',
        domain: 'observability',
        businessImpact: 'medium',
        confidence: 'medium',
        polarity: 'gap',
        ownerLane: 'Data / analytics',
        title: plural(unverified.length, 'property ships', 'properties ship') + ' an analytics tag whose data reception is unverified',
        observed: unverified.map(row => row.propertyId).join(', ') + ' ship a real analytics tag, but nothing proves events are received. ' + (estate.evidence.rumReception.status === 'measured' ? 'Cloudflare Web Analytics reception was checked.' : 'Reception could not be checked: ' + estate.evidence.rumReception.reason),
        businessReason: 'A shipped tag is configuration, not measurement; audience claims need proof that events arrive.',
        evidence: [{ type: 'served-html', ref: 'production probe ' + (estate.evidence.probe.runId || 'none'), state: 'measured' }],
        nextAction: 'Provide read access to the analytics property (GA4 Data API) or Cloudflare Web Analytics so reception can be verified per property.',
        actionability: blocked('GA4 Data API read access or Cloudflare token with Account Analytics: Read'),
        escalation: { level: 'low', class: 'observability-gap', escalateWhen: 'Reception-based coverage is quoted in investor material.', targetLane: 'Data / analytics' },
      })
    );
  }
  return items;
}

// ── Audience (governed Canonical Gold) ───────────────────────────────────────────────────────────

function audienceItems(estate, audience) {
  const items = [];
  if (!audience) return items;
  const source = audience.source;
  const measured = ['measured', 'partial'].includes(source.status) && source.freshness.state !== 'expired';
  const nameOf = id => estate.properties.find(row => row.propertyId === id)?.profile?.name || id;

  if (!['measured', 'partial'].includes(source.status)) {
    const awaiting = source.status === 'awaiting-authorized-source';
    items.push(
      item({
        id: 'audience:governed-source',
        rule: 'audience-source',
        category: 'audience',
        severity: 'high',
        domain: 'measurement',
        businessImpact: 'high',
        freshnessBasis: 'audience',
        ownerLane: 'Data / analytics',
        openedAt: '2026-09-24',
        title: awaiting ? 'Connect the governed audience source (awaiting authorization)' : 'The governed audience source is ' + source.status,
        observed: source.reason + ' Mission Control reads Canonical Gold 1.2 and Traffic Insights; the reader is built and tested, so per-property 7/28/90-day traffic, trends, contribution and concentration appear as soon as a valid, non-fixture document is readable.',
        businessReason: 'Without a governed traffic source, usage, growth and each property\'s contribution cannot be stated at all. Nothing is estimated or shown as zero.',
        evidence: [{ type: 'audience-contract', ref: 'globaldeets-audience', state: source.status }],
        nextAction: awaiting && source.requirement ? 'Grant Mission Control read access: ' + source.requirement.what + ' Then set the repository secrets ' + source.requirement.secrets.join(' and ') + '.' : 'Inspect the audience source and its credential.',
        actionability: awaiting ? blocked(source.requirement ? source.requirement.what : 'A read credential for the governed audience source') : actionNow(),
        escalation: { level: 'high', class: 'measurement-claim-block', blocksInvestorClaim: true, escalateWhen: 'Any investor material states usage, growth or contribution figures.', targetLane: 'Data / analytics' },
      })
    );
    return items;
  }
  if (!measured) return items;

  const conc = audience.estate.concentration;
  if (conc && (conc.dominant || conc.level === 'concentrated')) {
    items.push(
      item({
        id: 'audience:concentration',
        rule: 'traffic-concentration',
        category: 'audience',
        subjects: [conc.topProperty],
        freshnessBasis: 'audience',
        severity: conc.dominant ? 'medium' : 'low',
        domain: 'measurement',
        businessImpact: 'medium',
        confidence: 'medium',
        ownerLane: 'Product strategy',
        title: 'Traffic is concentrated in ' + nameOf(conc.topProperty),
        observed: nameOf(conc.topProperty) + ' carries ' + conc.top1SharePct + '% of measured edge requests over 28 days (top three: ' + conc.top3SharePct + '%, concentration index ' + conc.hhi + ', ' + conc.level + ').',
        businessReason: 'An estate whose usage rests on one property is more exposed to that property\'s outage or decline.',
        evidence: [{ type: 'audience-contract', ref: 'globaldeets-audience@' + audience.generatedAt, state: audience.source.status }],
        nextAction: 'Decide whether the concentration is intended; if not, identify which secondary properties have the most headroom.',
        actionability: decision(),
        escalation: { level: 'low', class: 'business-opportunity', escalateWhen: 'The leading property becomes unavailable.', targetLane: 'Product strategy' },
      })
    );
  }
  for (const row of audience.properties) {
    const trend = row.trend[audience.estate.movers.window || 28];
    if (row.direction === 'declining' && trend?.evidenceState === 'measured') {
      const tier = estate.properties.find(item => item.propertyId === row.propertyId)?.profile?.strategicTier ?? null;
      items.push(
        item({
          id: 'audience:decline:' + row.propertyId,
          rule: 'traffic-decline',
          category: 'audience',
          subjects: [row.propertyId],
          freshnessBasis: 'audience',
          severity: tier && tier <= 2 ? 'high' : 'medium',
          domain: 'measurement',
          businessImpact: tier && tier <= 2 ? 'high' : 'medium',
          confidence: 'medium',
          ownerLane: 'Product strategy',
          tier,
          title: 'Edge traffic to ' + nameOf(row.propertyId) + ' fell ' + Math.abs(trend.value) + '%',
          observed: 'Requests over the latest ' + trend.window.days + ' days were ' + trend.provenance.current.toLocaleString('en-US') + ' versus ' + trend.provenance.baseline.toLocaleString('en-US') + ' in the prior equal period (' + trend.provenance.absoluteDelta.toLocaleString('en-US') + ').',
          businessReason: 'A sustained drop in traffic is an early signal of a broken funnel, a ranking loss or an outage that probes missed. Edge requests include automated traffic.',
          evidence: [{ type: 'traffic-insights', ref: trend.comparabilityKey, state: 'measured' }],
          nextAction: 'Check recent deploys, indexing and the property\'s availability history for the same window before attributing a cause.',
          escalation: { level: 'medium', class: 'degradation', escalateWhen: 'The decline persists across the next comparison window.', targetLane: 'Product strategy' },
        })
      );
    }
  }
  const growers = audience.estate.movers.growing;
  if (growers.length) {
    items.push(
      item({
        id: 'audience:growth',
        rule: 'traffic-growth',
        category: 'audience',
        polarity: 'opportunity',
        subjects: growers.map(entry => entry.propertyId),
        freshnessBasis: 'audience',
        severity: 'info',
        domain: 'measurement',
        businessImpact: 'medium',
        confidence: 'medium',
        ownerLane: 'Product strategy',
        actionability: monitor(),
        title: plural(growers.length, 'property is', 'properties are') + ' growing materially',
        observed: growers.map(entry => nameOf(entry.propertyId) + ' +' + entry.pct + '% (' + entry.absoluteDelta.toLocaleString('en-US') + ' requests)').join('; ') + ' over the latest ' + audience.estate.movers.window + ' days.',
        businessReason: 'Growth is where a small operating investment (content, conversion paths, monitoring) is most likely to compound. Edge requests include automated traffic.',
        evidence: [{ type: 'traffic-insights', ref: 'globaldeets-audience@' + audience.generatedAt, state: 'measured' }],
        nextAction: 'Confirm the growth is human (traffic classification is not available yet) and check that the growing property has a measurable outcome.',
        escalation: { level: 'none', class: 'business-opportunity', escalateWhen: 'The property is featured in investor material.', targetLane: 'Product strategy' },
      })
    );
  }
  return items;
}

// ── Business outcomes ────────────────────────────────────────────────────────────────────────────

function businessItems(estate, audience, events) {
  const items = [];
  if (!events) return items;
  const applicable = events.properties.filter(row => row.instrumentation.state !== 'not-applicable');
  const instrumented = applicable.filter(row => row.instrumentation.state === 'instrumented');
  const declared = applicable.filter(row => row.primaryOutcome);
  const producers = applicable.filter(row => row.instrumentation.state === 'not-connected');
  const nameOf = id => estate.properties.find(row => row.propertyId === id)?.profile?.name || id;

  if (events.source.status !== 'measured' || instrumented.length < applicable.length) {
    items.push(
      item({
        id: 'business-outcomes:coverage',
        rule: 'business-outcome-coverage',
        category: 'business-outcomes',
        subjects: applicable.filter(row => row.instrumentation.state !== 'instrumented').map(row => row.propertyId),
        freshnessBasis: 'events',
        severity: 'medium',
        domain: 'business',
        businessImpact: 'high',
        ownerLane: 'Product + Data',
        openedAt: '2026-09-24',
        title: instrumented.length + ' of ' + applicable.length + ' properties report business outcomes',
        observed: producers.length
          ? 'Event-producing routes exist in source for ' + producers.map(row => row.propertyId + ' (' + row.instrumentation.candidateProducers.map(entry => entry.type).join(', ') + ')').join('; ') + ', but no governed feed connects them. The rest declare no countable outcome.'
          : 'No property reports a business outcome to Mission Control. "0 conversions" cannot be stated for any property because none is instrumented.',
        businessReason: 'Traffic without outcomes cannot show that the estate produces value: leads, sign-ups, purchases and downloads are what an investor asks about after audience.',
        evidence: [{ type: 'business-event-contract', ref: 'globaldeets-business-events@' + events.generatedAt, state: events.source.status }],
        nextAction: 'Start with the properties whose producers already exist in source: publish counts to the globaldeets-business-events-feed contract (per property, event type and window) and set the events feed secrets.',
        actionability: actionNow(),
        escalation: { level: 'high', class: 'measurement-claim-block', blocksInvestorClaim: true, escalateWhen: 'Any investor material states conversion or outcome figures.', targetLane: 'Product + Data' },
      })
    );
  }
  const undeclared = applicable.filter(row => !row.primaryOutcome && estate.properties.find(item => item.propertyId === row.propertyId)?.profile?.lifecycle !== 'alias').map(row => row.propertyId);
  if (undeclared.length) {
    items.push(
      item({
        id: 'business-outcomes:declare',
        rule: 'outcome-declaration-gap',
        category: 'business-outcomes',
        subjects: undeclared,
        freshnessBasis: 'registry',
        severity: 'low',
        domain: 'business',
        businessImpact: 'medium',
        polarity: 'gap',
        actionability: decision(),
        ownerLane: 'Property owner',
        title: undeclared.length + ' of ' + applicable.length + ' properties have no declared primary outcome',
        observed: declared.length + ' properties declare what a successful visit is; ' + undeclared.length + ' do not, so nothing about them can be measured against an intent.',
        businessReason: 'A property with no declared outcome cannot be judged useful, whatever its traffic.',
        evidence: [{ type: 'estate-registry', ref: 'tools/mission-control/config/estate-registry.json', state: 'measured' }],
        nextAction: 'Owners declare one primary outcome per property from the common vocabulary (visit, engagement, CTA, lead, sign-up, application, purchase, download, or another declared outcome).',
        escalation: { level: 'low', class: 'business-opportunity', escalateWhen: 'A property is presented to investors as revenue-generating.', targetLane: 'Property owner' },
      })
    );
  }

  if (audience && ['measured', 'partial'].includes(audience.source.status) && audience.source.freshness.state !== 'expired') {
    const heavy = audience.properties.filter(row => row.share28d.evidenceState === 'measured' && row.share28d.value >= HIGH_TRAFFIC_SHARE_PCT);
    const noOutcome = heavy.filter(row => events.properties.find(item => item.propertyId === row.propertyId)?.instrumentation.state !== 'instrumented');
    if (noOutcome.length) {
      items.push(
        item({
          id: 'business-outcomes:traffic-without-outcome',
          rule: 'traffic-without-outcome',
          category: 'business-outcomes',
          subjects: noOutcome.map(row => row.propertyId),
          freshnessBasis: 'audience',
          severity: 'medium',
          domain: 'business',
          businessImpact: 'high',
          confidence: 'medium',
          ownerLane: 'Product + Data',
          title: plural(noOutcome.length, 'high-traffic property has', 'high-traffic properties have') + ' no measurable business outcome',
          observed: noOutcome.map(row => nameOf(row.propertyId) + ' (' + row.share28d.value + '% of edge requests)').join('; ') + ' carry at least ' + HIGH_TRAFFIC_SHARE_PCT + '% of estate traffic but report no outcome events.',
          businessReason: 'The properties that attract the most attention are where an unmeasured conversion path costs the most.',
          evidence: [{ type: 'audience-contract', ref: 'globaldeets-audience@' + audience.generatedAt, state: audience.source.status }],
          nextAction: 'Instrument the primary outcome on these properties first.',
          escalation: { level: 'medium', class: 'measurement-claim-block', escalateWhen: 'Traffic is quoted without outcomes.', targetLane: 'Product + Data' },
        })
      );
    }
  } else if (instrumented.length) {
    items.push(
      item({
        id: 'business-outcomes:outcomes-without-audience',
        rule: 'outcomes-without-audience',
        category: 'business-outcomes',
        subjects: instrumented.map(row => row.propertyId),
        freshnessBasis: 'events',
        severity: 'medium',
        domain: 'business',
        businessImpact: 'medium',
        confidence: 'medium',
        ownerLane: 'Data / analytics',
        title: 'Business outcomes are measured without audience context',
        observed: 'Outcome events are reported for ' + instrumented.map(row => row.propertyId).join(', ') + ', but the governed audience source is not readable, so no conversion rate against traffic can be stated.',
        businessReason: 'An outcome count without its audience cannot show whether the property converts well or merely receives little traffic.',
        evidence: [{ type: 'business-event-contract', ref: 'globaldeets-business-events@' + events.generatedAt, state: events.source.status }],
        nextAction: 'Connect the governed audience source.',
        actionability: blocked('A read credential for the governed audience source'),
        escalation: { level: 'medium', class: 'measurement-claim-block', escalateWhen: 'Conversion rates are quoted.', targetLane: 'Data / analytics' },
      })
    );
  }
  return items;
}

// ── Governance and infrastructure ────────────────────────────────────────────────────────────────

function governanceItems(estate, audience) {
  const items = [];
  const rows = estate.properties;

  const drift = rows.filter(row => row.profile.expectation.met === false && ['serving-but-declared-not-live', 'serving-but-declared-inactive'].includes(row.profile.expectation.kind));
  if (drift.length) {
    items.push(
      item({
        id: 'governance:expectation-drift',
        rule: 'expectation-drift',
        category: 'governance',
        subjects: drift.map(row => row.propertyId),
        freshnessBasis: 'registry',
        severity: 'low',
        domain: 'governance',
        businessImpact: 'low',
        confidence: 'medium',
        actionability: decision(),
        ownerLane: 'Property owner',
        title: plural(drift.length, 'property serves', 'properties serve') + ' public content the owner registry says is not live',
        observed: drift.map(row => row.propertyId + ': ' + row.profile.expectation.note.replace(/\.$/, '')).join('; ') + '. The owner registry may simply be out of date.',
        businessReason: 'Live pages the owner does not know are live, or a registry that lags production, are how brand and security surprises happen.',
        evidence: [{ type: 'owner-registry-vs-production', ref: 'estate-registry@' + estate.evidence.inventory.baselineAsOf, state: 'measured' }],
        nextAction: 'Update the owner registry to match production, or unpublish the property if it should not be live.',
        escalation: { level: 'low', class: 'narrative-provenance', escalateWhen: 'The property is linked from investor or public material as upcoming.', targetLane: 'Property owner' },
      })
    );
  }
  const missing = rows.filter(row => row.profile.lifecycle === 'unknown' && row.profile.expectation.kind !== 'nothing-published-intent-unknown').map(row => row.propertyId);
  const parked = rows.filter(row => row.profile.expectation.kind === 'nothing-published-intent-unknown').map(row => row.propertyId);
  if (parked.length) {
    items.push(
      item({
        id: 'availability:no-service-published',
        rule: 'no-service-published',
        category: 'governance',
        subjects: parked,
        freshnessBasis: 'probe',
        severity: 'low',
        domain: 'reliability',
        businessImpact: 'low',
        polarity: 'gap',
        actionability: decision(),
        ownerLane: 'Platform',
        title: plural(parked.length, 'domain') + ' publish nothing and their intent is not declared',
        observed: parked.join(', ') + ' resolve without address records and no service or intent is declared. This is not an outage.',
        businessReason: 'Owned domains that publish nothing waste brand surface, and without a declared intent no one can tell a deliberate reservation from an abandoned project.',
        evidence: [{ type: 'production-probe', ref: 'globaldeets-estate-health@' + estate.generatedAt, state: 'measured' }],
        nextAction: 'Decide per domain: reserve it (record it as intentionally unpublished), publish a placeholder, redirect to a primary property, or release it.',
        escalation: { level: 'low', class: 'maintenance', escalateWhen: 'A parked domain is referenced in investor or public material as an active property.', targetLane: 'Platform' },
      })
    );
  }
  const undeclaredActive = rows.filter(row => row.profile.expectation.kind === 'declared-active-but-nothing-published').map(row => row.propertyId);
  if (undeclaredActive.length) {
    items.push(
      item({
        id: 'governance:active-but-unpublished',
        rule: 'active-but-unpublished',
        category: 'governance',
        subjects: undeclaredActive,
        severity: 'medium',
        domain: 'governance',
        businessImpact: 'medium',
        actionability: decision(),
        ownerLane: 'Property owner',
        title: plural(undeclaredActive.length, 'property is', 'properties are') + ' declared active but publish nothing',
        observed: undeclaredActive.join(', ') + ' are declared active in the owner registry, yet no web service is published.',
        businessReason: 'An owner-declared active property with no live surface is either a missing deployment or a stale declaration.',
        evidence: [{ type: 'owner-registry-vs-production', ref: 'estate-registry', state: 'measured' }],
        nextAction: 'Restore the deployment or update the declared lifecycle.',
        escalation: { level: 'medium', class: 'maintenance', escalateWhen: 'It remains unpublished for a week.', targetLane: 'Property owner' },
      })
    );
  }
  if (missing.length) {
    items.push(
      item({
        id: 'governance:lifecycle-undeclared',
        rule: 'lifecycle-undeclared',
        category: 'governance',
        subjects: missing,
        freshnessBasis: 'registry',
        severity: 'low',
        domain: 'governance',
        businessImpact: 'low',
        polarity: 'gap',
        actionability: decision(),
        ownerLane: 'Property owner',
        title: plural(missing.length, 'property has', 'properties have') + ' no owner-declared lifecycle',
        observed: 'The owner has not declared whether ' + missing.join(', ') + ' are active, incubating, dormant or deprecated. Mission Control shows what production does and leaves the intent unknown.',
        businessReason: 'Without a declared lifecycle an expected pause looks the same as neglect, and real outages cannot be told from intended silence.',
        evidence: [{ type: 'estate-registry', ref: 'tools/mission-control/config/estate-registry.json', state: 'measured' }],
        nextAction: 'Owners declare each property\'s lifecycle and purpose in the estate registry.',
        escalation: { level: 'low', class: 'narrative-provenance', escalateWhen: 'A property is described to investors without a declared lifecycle.', targetLane: 'Property owner' },
      })
    );
  }

  const infra = estate.infrastructure;
  if (infra?.evidenceState === 'measured') {
    const surfaces = infra.unregisteredSurfaces.filter(entry => entry.status === 'active');
    if (surfaces.length) {
      items.push(
        item({
          id: 'infrastructure:unregistered-surfaces',
          rule: 'new-production-surface',
          category: 'infrastructure',
          subjects: [...new Set(surfaces.map(entry => entry.parentProperty).filter(Boolean))],
          freshnessBasis: 'inventory',
          severity: 'low',
          domain: 'governance',
          businessImpact: 'low',
          confidence: 'medium',
          actionability: decision(),
          ownerLane: 'Platform',
          title: plural(surfaces.length, 'production surface') + ' outside the governed registry',
          observed: surfaces.map(entry => entry.hostname + ' (Pages project ' + entry.project + ')').join('; ') + ' serve from Cloudflare Pages custom domains that are not in the estate registry, so they are neither probed nor measured.',
          businessReason: 'A live surface nobody registered has no owner, no health evidence and no audience accounting.',
          evidence: [{ type: 'cloudflare-pages-inventory', ref: infra.observedAt, state: 'measured' }],
          nextAction: 'Register each surface (and its purpose) in the estate registry, or retire it.',
          escalation: { level: 'low', class: 'maintenance', escalateWhen: 'A surface is linked from public or investor material.', targetLane: 'Platform' },
        })
      );
    }
    if (infra.orphanProjects.length) {
      items.push(
        item({
          id: 'infrastructure:pages-projects-without-domain',
          rule: 'infrastructure-without-use',
          category: 'infrastructure',
          subjects: [],
          freshnessBasis: 'inventory',
          severity: 'low',
          domain: 'governance',
          businessImpact: 'low',
          confidence: 'medium',
          actionability: decision(),
          ownerLane: 'Platform',
          title: plural(infra.orphanProjects.length, 'Pages project') + ' with no custom domain',
          observed: infra.orphanProjects.map(entry => entry.project).join(', ') + ' exist on Cloudflare Pages with no custom domain mapped, so they serve no governed property. They may still answer on a pages.dev address that is not monitored.',
          businessReason: 'Deployed projects nobody reaches through a governed domain consume the platform without observable use, and their pages.dev addresses stay public and unmonitored.',
          evidence: [{ type: 'cloudflare-pages-inventory', ref: infra.observedAt, state: 'measured' }],
          nextAction: 'For each project decide: map a domain, archive, or delete.',
          escalation: { level: 'low', class: 'maintenance', escalateWhen: 'A project contains content that should not be public.', targetLane: 'Platform' },
        })
      );
    }
  }

  if (audience && ['measured', 'partial'].includes(audience.source.status) && audience.source.freshness.state !== 'expired') {
    const lowUse = audience.properties
      .filter(row => row.requests[28].evidenceState === 'measured' && row.requests[28].value <= LOW_USE_REQUESTS_28D)
      .map(row => row.propertyId)
      .filter(id => {
        const property = rows.find(entry => entry.propertyId === id);
        return property && ['available', 'degraded'].includes(property.availability.state) && property.profile.lifecycle !== 'alias' && property.deployment.provider === 'cloudflare-pages';
      });
    if (lowUse.length) {
      items.push(
        item({
          id: 'infrastructure:low-observable-use',
          rule: 'low-observable-use',
          category: 'infrastructure',
          subjects: lowUse,
          freshnessBasis: 'audience',
          severity: 'low',
          domain: 'measurement',
          businessImpact: 'low',
          confidence: 'medium',
          actionability: decision(),
          ownerLane: 'Product strategy',
          title: plural(lowUse.length, 'deployed property shows', 'deployed properties show') + ' little observable use',
          observed: lowUse.join(', ') + ' are served from Cloudflare Pages but recorded at most ' + LOW_USE_REQUESTS_28D.toLocaleString('en-US') + ' edge requests in 28 days, including any automated traffic.',
          businessReason: 'Maintained properties nobody uses are the clearest candidates to consolidate, promote, or retire.',
          evidence: [{ type: 'audience-contract', ref: 'globaldeets-audience@' + audience.generatedAt, state: audience.source.status }],
          nextAction: 'Decide per property: promote it, fold it into a stronger property, or retire it.',
          escalation: { level: 'low', class: 'business-opportunity', escalateWhen: 'A low-use property is on the roadmap for investment.', targetLane: 'Product strategy' },
        })
      );
    }
  }
  return items;
}

function measurementItems(history, audience) {
  const items = [];
  const measured = [...history.snapshots].reverse().find(snapshot => snapshot.globaldeetsOperational?.evidenceState === 'measured');
  const certified = history.snapshots.some(snapshot => snapshot.certifiedAudience?.evidenceState === 'measured' && snapshot.certifiedAudience.certified === true);
  const op = measured?.globaldeetsOperational;
  const synthetic = op && typeof op.syntheticHealthVisits === 'number' ? op.syntheticHealthVisits : null;
  const govern = audience && ['measured', 'partial'].includes(audience.source.status);
  const observed = govern
    ? 'Governed edge requests are now read for ' + audience.estate.propertiesMeasured + ' properties, but Cloudflare counts requests, not people, and no connected source separates certified humans from automated traffic. Probe traffic and other automation remain unclassified.'
    : op
      ? 'The latest measured operational edge snapshot (' + measured.snapshotId + ') ' +
        (typeof op.edgeVisits === 'number' ? 'contains ' + op.edgeVisits.toLocaleString('en-US') + ' raw visits' : 'reports no edge-visit count (unavailable, not zero)') +
        (synthetic != null ? ', including ' + synthetic.toLocaleString('en-US') + ' attached to a synthetic health path' : '') +
        '. Mission Control probes add tagged synthetic traffic that must also be excluded.'
      : 'No measured operational edge snapshot is retained, and no certified audience dataset exists.';
  items.push(
    item({
      id: 'measurement:audience-certification',
      rule: 'audience-certification',
      category: 'audience',
      priorityHint: 1,
      freshnessBasis: 'audience',
      severity: 'critical',
      domain: 'measurement',
      status: certified ? 'closed' : 'in-progress',
      businessImpact: 'existential',
      ownerLane: 'Data / analytics',
      openedAt: '2026-09-23',
      title: 'Certify human audience metrics',
      observed,
      businessReason: 'Operational edge telemetry cannot responsibly stand in for human traction. Investors will ask how many real people use this.',
      evidence: [{ type: 'mission-control-snapshot', ref: measured?.snapshotId || 'none', state: op ? 'measured' : 'unavailable' }],
      nextAction: 'Connect certified GA4/RUM-quality audience ingestion (history ingestion seam: certified-audience) with explicit bot, monitor, API, asset, and Mission Control probe exclusions.',
      actionability: blocked('A human-audience source with bot/agent classification (GA4 Data API or first-party browser telemetry with verified reception)'),
      escalation: {
        level: 'investor-blocking',
        class: 'measurement-claim-block',
        blocksInvestorClaim: !certified,
        escalateWhen: 'Any investor material attempts to present raw edge visits or requests as human audience before certification.',
        targetLane: 'Data / analytics + Product narrative',
      },
    })
  );

  const scheduled = history.snapshots.filter(snapshot => snapshot.collector?.kind === 'scheduled');
  const opComparable = history.snapshots.filter(snapshot => snapshot.globaldeetsOperational?.evidenceState === 'measured').length;
  const days = scheduled.length;
  items.push(
    item({
      id: 'data:history-density',
      rule: 'history-density',
      category: 'evidence-quality',
      priorityHint: 5,
      freshnessBasis: 'history',
      polarity: 'gap',
      actionability: monitor(),
      severity: 'medium',
      domain: 'measurement',
      status: days >= 90 ? 'closed' : 'in-progress',
      businessImpact: 'medium',
      ownerLane: 'Data / analytics',
      openedAt: '2026-09-24',
      title: 'Accumulate enough comparable history for 7/28/90-day trends',
      observed: days + ' scheduled daily snapshot' + (days === 1 ? '' : 's') + ' retained (' + Math.min(days, 90) + '/90 days of a full 90-day view); ' + opComparable + ' measured operational-traffic snapshot' + (opComparable === 1 ? '' : 's') + '; certified audience history: none.',
      businessReason: 'Trend charts become decision-grade only when they contain comparable observations rather than decorative lines.',
      evidence: [{ type: 'history-contract', ref: 'globaldeets-mission-control-history@' + history.schemaVersion, state: 'measured' }],
      nextAction: 'Scheduled collection accumulates snapshots automatically; connect the governed audience source to add comparable traffic points.',
      escalation: { level: 'medium', class: 'measurement-claim-block', escalateWhen: 'A chart attempts to calculate a trend from fewer than two comparable measured observations.', targetLane: 'Data / analytics' },
    })
  );
  return items;
}

function manualItems(manual) {
  return manual.items.map(entry =>
    item({
      confidence: 'medium',
      freshnessBasis: 'registry',
      polarity: entry.domain === 'opportunity' ? 'opportunity' : 'risk',
      actionability: entry.status === 'closed' ? { state: 'closed', blockedBy: null } : decision(),
      ...entry,
      source: 'manual',
      escalation: { blocksInvestorClaim: false, class: entry.escalation.class || 'none', ...entry.escalation },
    })
  );
}

// ── Scoring and ranking ──────────────────────────────────────────────────────────────────────────

function freshnessFor(basis, estate, audience, events, history, now) {
  const probe = estate.evidence.probe;
  switch (basis) {
    case 'probe':
      return { state: probe.freshness.state, observedAt: probe.observedAt, basis: 'Production probes' };
    case 'inventory':
      return { state: estate.evidence.inventory.freshness.state, observedAt: estate.evidence.inventory.asOf, basis: 'Cloudflare inventory' };
    case 'audience':
      return { state: audience?.source?.freshness?.state || 'unknown', observedAt: audience?.source?.observedAt || null, basis: 'Governed audience source' };
    case 'events':
      return { state: events?.source?.freshness?.state || 'unknown', observedAt: events?.source?.observedAt || null, basis: 'Business-event feed' };
    case 'history': {
      const scheduled = history.snapshots.filter(snapshot => snapshot.collector?.kind === 'scheduled');
      const observedAt = scheduled.length ? scheduled[scheduled.length - 1].observedAt : null;
      return { state: observedAt ? semantics.evaluateFreshness(observedAt, semantics.FRESHNESS_POLICY.history, now).state : 'unknown', observedAt, basis: 'Historical snapshots' };
    }
    default:
      return { state: 'static', observedAt: null, basis: 'Registry configuration' };
  }
}

/** Explainable score. Returns { score, breakdown } where breakdown lists every contributing factor. */
export function scoreItem(entry, { investorCriticalIds, tierById }) {
  const breakdown = [];
  const add = (factor, points, why) => {
    if (points !== 0) breakdown.push({ factor, points, why });
  };
  add('severity', SEVERITY_POINTS[entry.severity] ?? 0, 'Severity is ' + entry.severity + '.');
  const subjects = subjectsOf(entry);
  if (subjects.length > ESTATE_WIDE_SUBJECTS) {
    // A finding that touches most of the estate is not specifically about any one property's importance.
    add('estate-wide', ESTATE_WIDE_POINTS, 'Affects ' + subjects.length + ' properties across the estate.');
  } else {
    if (subjects.some(id => investorCriticalIds.has(id))) add('investor-critical', INVESTOR_CRITICAL_POINTS, 'Affects an investor-critical property.');
    const tiers = subjects.map(id => tierById.get(id)).filter(value => Number.isFinite(value));
    const tier = Number.isFinite(entry.tier) ? entry.tier : tiers.length ? Math.min(...tiers) : null;
    if (tier) add('strategic-tier', TIER_POINTS[tier] ?? 0, 'Affects a tier ' + tier + ' property in the owner strategy.');
  }
  add('business-impact', IMPACT_POINTS[entry.businessImpact] ?? 0, 'Business impact is ' + entry.businessImpact + '.');
  add('escalation', ESCALATION_POINTS[entry.escalation.level] ?? 0, 'Escalation level is ' + entry.escalation.level + '.');
  const actionability = TERMINALS.includes(entry.status) ? 'closed' : entry.actionability.state;
  add('actionability', ACTIONABILITY_POINTS[actionability] ?? 0, actionability === 'actionable-now' ? 'Can be worked on now.' : actionability === 'blocked-on-authority' ? 'Blocked on authority that is not available yet.' : actionability === 'monitor' ? 'Nothing to fix; watch it.' : 'Needs a decision.');
  add('confidence', CONFIDENCE_POINTS[entry.confidence] ?? 0, 'Evidence confidence is ' + entry.confidence + '.');
  const age = Math.min(entry.ageDays ?? 0, MAX_AGE_POINTS_DAYS);
  add('age', Math.floor(age / 2), 'Open for ' + (entry.ageDays ?? 0) + ' days.');
  return { score: breakdown.reduce((sum, part) => sum + part.points, 0), breakdown };
}

function sortQueue(items) {
  return [...items].sort((a, b) => {
    const terminalA = TERMINALS.includes(a.status) ? 1 : 0;
    const terminalB = TERMINALS.includes(b.status) ? 1 : 0;
    return terminalA - terminalB || b.priorityScore - a.priorityScore || (a.priorityHint ?? 999) - (b.priorityHint ?? 999) || a.id.localeCompare(b.id);
  });
}

/**
 * @param {object} input estate (built estate-health), history, manual config, previous diagnostics (or null),
 *                       audience, events, now (ISO), latestAttempt
 */
export function buildDiagnostics({ estate, history, manual, previous = null, latestAttempt = null, audience = null, events = null, now }) {
  const previousById = new Map((previous?.items || []).map(entry => [entry.id, entry]));
  const derived = [
    ...propertyOutageItems(estate),
    ...aggregated(estate, 'probe-blocked', subjects => ({
      id: 'availability:probe-blocked',
      rule: 'probe-blocked',
      category: 'availability',
      severity: 'medium',
      domain: 'reliability',
      businessImpact: 'low',
      polarity: 'gap',
      ownerLane: 'Platform',
      title: plural(subjects.length, 'property', 'properties') + ' could not be assessed from any vantage (probe blocked)',
      observed: subjects.join(', ') + ' challenged, rate-limited, or gated every probe vantage. Availability is unknown, not failed.',
      businessReason: 'Blocked probes leave real outages invisible.',
      nextAction: 'Allow-list the probe user agent / X-GlobalDeets-Probe header for these hosts (Cloudflare WAF, zone owner) or register an authenticated health path.',
      actionability: blocked('Cloudflare WAF authority on the affected zone (zone owner)'),
      escalation: { level: 'medium', class: 'insufficient-evidence', escalateWhen: 'A blocked property is also investor-critical.', targetLane: 'Platform' },
    })),
    ...aggregated(estate, 'contract-drift', subjects => ({
      id: 'criticalpath:contract-drift',
      rule: 'contract-drift',
      category: 'critical-path',
      severity: 'low',
      domain: 'reliability',
      businessImpact: 'low',
      confidence: 'medium',
      ownerLane: 'Platform',
      title: plural(subjects.length, 'baseline contract') + ' no longer ' + (subjects.length === 1 ? 'matches' : 'match') + ' production',
      observed: subjects.join(', ') + ' answered but did not match their observed homepage baseline. The property may have intentionally changed.',
      businessReason: 'Stale contracts hide real breakage; confirmed changes must be re-baselined.',
      nextAction: 'Review each property; update the registry baseline if the change is intentional, otherwise investigate as a regression.',
      escalation: { level: 'low', class: 'maintenance', escalateWhen: 'Drift coincides with a degraded or failing availability probe.', targetLane: 'Platform' },
    })),
    ...evidenceItems(estate, history, now, latestAttempt, audience),
    ...coverageItems(estate),
    ...audienceItems(estate, audience),
    ...businessItems(estate, audience, events),
    ...governanceItems(estate, audience),
  ];
  const measured = measurementItems(history, audience);
  const manualQueue = manualItems(manual);

  const investorCriticalIds = new Set(estate.properties.filter(row => row.investorCritical).map(row => row.propertyId));
  const tierById = new Map(estate.properties.filter(row => Number.isFinite(row.profile?.strategicTier)).map(row => [row.propertyId, row.profile.strategicTier]));

  const all = [...derived, ...measured, ...manualQueue].map(entry => {
    const prior = previousById.get(entry.id);
    const openedAt = entry.openedAt || prior?.openedAt || dayOf(now);
    const subjects = subjectsOf(entry);
    return { ...entry, subjects, openedAt, ageDays: ageDays(openedAt, now), freshness: freshnessFor(entry.freshnessBasis, estate, audience, events, history, now) };
  });

  // Derived incident items that cleared are retained briefly as closed, preserving their history.
  const currentIds = new Set(all.map(entry => entry.id));
  for (const prior of previous?.items || []) {
    if (prior.source !== 'derived' || currentIds.has(prior.id)) continue;
    if (!/^(availability:(outage|degraded|vantage-conflict)|criticalpath:failed):/.test(prior.id)) continue;
    const closedAt = prior.closedAt || now;
    if (ageDays(closedAt, now) >= CLOSED_RETENTION_DAYS) continue;
    all.push({ category: 'availability', confidence: 'medium', freshness: { state: 'unknown', observedAt: null, basis: 'Retained from an earlier run' }, ...prior, status: 'closed', closedAt, actionability: { state: 'closed', blockedBy: null }, subjects: subjectsOf(prior), ageDays: ageDays(prior.openedAt, now), nextAction: 'Recovered; monitor. This item is retained for ' + CLOSED_RETENTION_DAYS + ' days.' });
  }

  const scored = all.map(entry => {
    const { score, breakdown } = scoreItem(entry, { investorCriticalIds, tierById });
    return { ...entry, priorityScore: score, priorityBreakdown: breakdown };
  });
  const sorted = sortQueue(scored).map((entry, index) => {
    const rest = { ...entry };
    delete rest.priorityHint;
    delete rest.freshnessBasis;
    delete rest.tier;
    return { ...rest, priority: index + 1 };
  });

  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    contractName: DIAGNOSTICS_CONTRACT_NAME,
    generatedAt: now,
    agentContract: AGENT_CONTRACT,
    priorityModel: PRIORITY_MODEL,
    derivation: {
      note: 'Items with source "derived" are computed from probe, history, inventory, audience and business-event evidence on every collection run; source "manual" items are hand-authored judgments with no derivable evidence.',
      derivedRules: [...new Set(sorted.filter(entry => entry.source === 'derived').map(entry => entry.rule))].sort(),
    },
    summary: {
      open: sorted.filter(entry => !TERMINALS.includes(entry.status)).length,
      actionableNow: sorted.filter(entry => !TERMINALS.includes(entry.status) && entry.actionability.state === 'actionable-now').length,
      blockedOnAuthority: sorted.filter(entry => !TERMINALS.includes(entry.status) && entry.actionability.state === 'blocked-on-authority').length,
      decisionNeeded: sorted.filter(entry => !TERMINALS.includes(entry.status) && entry.actionability.state === 'decision-needed').length,
      nextUp: sorted.find(entry => !TERMINALS.includes(entry.status) && entry.actionability.state === 'actionable-now')?.id || null,
    },
    items: sorted,
  };
}

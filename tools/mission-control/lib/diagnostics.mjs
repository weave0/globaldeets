/**
 * Derives the agent-consumable diagnostics queue from evidence (GD-030).
 *
 * Findings that can be computed from probe, history, or inventory evidence are derived here and never
 * hand-copied. Only judgments with no derivable evidence (product opportunity, narrative provenance,
 * business-event taxonomy) live in config/diagnostics-manual.json.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

export const DIAGNOSTICS_CONTRACT_NAME = 'globaldeets-diagnostics-queue';
export const DIAGNOSTICS_SCHEMA_VERSION = '1.1.0';

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const IMPACT_RANK = { existential: 0, high: 1, medium: 2, low: 3 };
const ESCALATION_RANK = { 'investor-blocking': 0, page: 1, high: 2, medium: 3, low: 4, none: 5 };
const CLOSED_RETENTION_DAYS = 7;

export const AGENT_CONTRACT = Object.freeze({
  sortableFields: [
    'priority',
    'severity',
    'businessImpact',
    'status',
    'ownerLane',
    'ageDays',
    'domain',
    'escalation.level',
    'escalation.class',
  ],
  actionableStatuses: ['open', 'in-progress', 'blocked'],
  terminalStatuses: ['closed', 'accepted-risk'],
  requiredForAction: ['id', 'severity', 'businessImpact', 'status', 'ownerLane', 'ageDays', 'evidence', 'nextAction', 'escalation'],
  escalationLevels: ['investor-blocking', 'page', 'high', 'medium', 'low', 'none'],
  escalationClasses: semantics.ESCALATION_CLASSES,
  classGuide: {
    'investor-impacting-outage': 'An investor-critical property is confirmed down or failing its authoritative critical path. Page immediately.',
    outage: 'A non-investor-critical property is confirmed unavailable. Ordinary incident.',
    degradation: 'Reachable but slow, intermittent, or failing a non-critical check.',
    maintenance: 'Routine platform hygiene: expiring certificates, parked zones needing a topology decision, contract drift.',
    'observability-gap': 'We cannot see the property well enough to know its state (RUM off, single probe vantage).',
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

function item(base) {
  return {
    source: 'derived',
    status: 'open',
    ...base,
    escalation: { blocksInvestorClaim: false, ...base.escalation },
  };
}

function propertyOutageItems(estate) {
  const items = [];
  for (const property of estate.properties) {
    const evidenceRef = property.propertyId + '@' + (property.availability.observedAt || estate.generatedAt);
    const detail = property.availability.evidence;
    const evidenceLine = detail?.http
      ? 'HTTP ' + (detail.http.status ?? 'no response') + ', DNS ' + (detail.dns?.state || 'n/a') + ', TLS ' + (detail.tls?.state || 'n/a')
      : 'no transport evidence';

    if (property.diagnosticState === 'outage') {
      const critical = property.investorCritical;
      items.push(
        item({
          id: 'availability:outage:' + property.propertyId,
          subject: property.propertyId,
          rule: 'availability-outage',
          severity: critical ? 'critical' : 'high',
          domain: 'reliability',
          businessImpact: critical ? 'existential' : 'medium',
          ownerLane: 'Platform',
          title: property.displayName + ' is unavailable',
          observed: property.availability.reason + ' Failure class: ' + property.availability.failureClass + '. ' + evidenceLine + '.',
          businessReason: critical
            ? 'An investor-critical property is down; any availability or traction claim about it is unsafe until restored.'
            : 'A property in the estate is not serving.',
          evidence: [{ type: 'production-probe', ref: evidenceRef, state: 'measured' }],
          nextAction: property.availability.nextAction || 'Investigate origin and DNS for ' + property.propertyId + '.',
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
      items.push(
        item({
          id: 'criticalpath:failed:' + property.propertyId,
          subject: property.propertyId,
          rule: 'critical-path-failed',
          severity: critical ? 'critical' : 'high',
          domain: 'reliability',
          businessImpact: critical ? 'high' : 'medium',
          ownerLane: 'Platform',
          title: property.displayName + ' is reachable but failing its critical path',
          observed: 'Authoritative critical-path check failed: ' + property.criticalPath.reason + '.',
          businessReason: 'The homepage may respond while the product function investors and users depend on is broken.',
          evidence: [{ type: 'critical-path-probe', ref: evidenceRef, state: 'measured' }],
          nextAction: 'Inspect the failing check(s) against production and the latest deploy; fix or correct the contract if the product intentionally changed.',
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
          rule: 'availability-degraded',
          severity: property.investorCritical ? 'high' : 'medium',
          domain: 'reliability',
          businessImpact: property.investorCritical ? 'high' : 'low',
          ownerLane: 'Platform',
          title: property.displayName + ' is degraded',
          observed: property.availability.reason + (property.availability.failureClass ? ' Class: ' + property.availability.failureClass + '.' : ''),
          businessReason: 'Degraded availability erodes trust before it becomes an outage.',
          evidence: [{ type: 'production-probe', ref: evidenceRef, state: 'measured' }],
          nextAction: property.availability.nextAction || 'Investigate latency and error rate for ' + property.propertyId + '.',
          escalation: {
            level: property.investorCritical ? 'high' : 'medium',
            class: property.availability.failureClass === 'tls-expiring' ? 'maintenance' : 'degradation',
            escalateWhen: 'Degradation persists across three consecutive runs or worsens to unavailable.',
            targetLane: 'Platform',
          },
        })
      );
    }
  }
  return items;
}

function aggregated(estate, state, config) {
  const subjects = estate.properties.filter(property => property.diagnosticState === state).map(property => property.propertyId);
  if (!subjects.length) return [];
  return [
    item({
      subjects,
      evidence: [{ type: 'production-probe', ref: 'globaldeets-estate-health@' + estate.generatedAt, state: 'measured' }],
      ...config(subjects),
    }),
  ];
}

function evidenceItems(estate, history, now, latestAttempt) {
  const items = [];
  const probe = estate.evidence.probe;
  const probeFreshness = probe.freshness;
  if (probe.validity === 'none') {
    items.push(
      item({
        id: 'evidence:probe-missing',
        rule: 'probe-missing',
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
  const inventory = estate.evidence.inventory;
  const carried = [
    inventory.facets?.zones ? null : 'zone status',
    inventory.facets?.pages ? null : 'Pages deploy facts',
    inventory.facets?.rum ? null : 'RUM settings',
  ].filter(Boolean);
  const aged = ['stale', 'expired'].includes(inventory.freshness.state);
  if (aged || carried.length) {
    items.push(
      item({
        id: 'evidence:inventory-stale',
        rule: 'inventory-incomplete',
        severity: aged ? 'medium' : 'low',
        domain: 'observability',
        businessImpact: 'low',
        ownerLane: 'Platform',
        title: aged ? 'Cloudflare inventory is ' + inventory.freshness.state : 'Part of the Cloudflare inventory is carried forward, not refreshed',
        observed: (carried.length ? carried.join(', ') + ' are carried forward from the ' + inventory.asOf.slice(0, 10) + ' read and are not refreshed by the collector. ' : '') +
          (aged ? 'Inventory was last observed ' + inventory.freshness.ageHours + ' hours ago. ' : '') +
          'RUM coverage is therefore never plotted as a fresh measurement.',
        businessReason: 'Zone counts, RUM coverage, and deploy freshness are only as current as the inventory read behind them.',
        evidence: [{ type: 'inventory', ref: inventory.asOf, state: aged ? inventory.freshness.state : 'partial' }],
        nextAction: 'Grant the collector token the missing read scopes (Zone:Read, Pages:Read, Account Analytics/Web Analytics read) so each facet refreshes automatically.',
        escalation: { level: aged ? 'medium' : 'low', class: 'stale-evidence', escalateWhen: 'Inventory expires (over 7 days) or a carried-forward fact is used in investor material as current.', targetLane: 'Platform' },
      })
    );
  }
  return items;
}

function coverageItems(estate) {
  const items = [];
  const rumOff = estate.properties.filter(property => property.observability.state === 'unobserved').map(property => property.propertyId);
  if (rumOff.length) {
    items.push(
      item({
        id: 'observability:rum-coverage',
        rule: 'rum-coverage',
        subjects: rumOff,
        severity: 'medium',
        domain: 'observability',
        businessImpact: 'medium',
        ownerLane: 'Platform',
        title: 'Resolve ' + rumOff.length + ' browser-observability gap' + (rumOff.length === 1 ? '' : 's'),
        observed: 'RUM is off for ' + rumOff.join(', ') + '; ' + estate.summary.rumObservedZones + ' of ' + estate.summary.activeZones + ' zones are observed.',
        businessReason: 'Unobserved properties are harder to diagnose and cannot contribute comparable browser evidence.',
        evidence: [{ type: 'cloudflare-rum-inventory', ref: estate.evidence.inventory.asOf, state: 'measured' }],
        nextAction: 'Enable RUM where appropriate or explicitly record an exemption with rationale.',
        escalation: { level: 'medium', class: 'observability-gap', escalateWhen: 'A currently unobserved property becomes business-critical or has a production incident.', targetLane: 'Platform' },
      })
    );
  }
  const probe = estate.evidence.probe;
  if (probe.validity === 'valid' && probe.vantageCount < 2) {
    items.push(
      item({
        id: 'observability:single-probe-vantage',
        rule: 'single-vantage',
        severity: 'low',
        domain: 'observability',
        businessImpact: 'low',
        ownerLane: 'Platform',
        title: 'Availability evidence comes from a single vantage',
        observed: 'All probes originate from ' + probe.vantage + '. Regional or runner-specific routing problems cannot be distinguished from property failures beyond canary checks and confirmation re-probes.',
        businessReason: 'One vantage limits confidence in confirmed outages and cannot see regional failures.',
        evidence: [{ type: 'probe-run', ref: probe.runId, state: 'measured' }],
        nextAction: 'Add a second independent vantage (for example a Cloudflare Worker cron probe) and require agreement before paging.',
        escalation: { level: 'low', class: 'observability-gap', escalateWhen: 'A confirmed outage is disputed by an external report.', targetLane: 'Platform' },
      })
    );
  }
  const noContract = estate.properties.filter(property => !property.criticalPath.contract && property.availability.state !== 'no-service-published').map(property => property.propertyId);
  const authoritative = estate.properties.filter(property => property.criticalPath.contract?.level === 'authoritative').length;
  const baselineOnly = estate.properties.filter(property => property.criticalPath.contract?.level === 'baseline').length;
  items.push(
    item({
      id: 'observability:critical-path-contracts',
      rule: 'critical-path-contracts',
      subjects: noContract,
      severity: 'low',
      domain: 'observability',
      businessImpact: 'medium',
      ownerLane: 'Platform',
      title: 'Most properties lack an authoritative critical-path contract',
      observed: authoritative + ' of ' + estate.propertyCount + ' properties have an authoritative critical-path contract; ' + baselineOnly + ' have only a homepage identity baseline; ' + noContract.length + ' have no contract (redirect aliases and undeclared parked zones are counted here or in the no-service finding).',
      businessReason: 'Reachable-unverified is not verified health; only owned, contracted paths can prove the product works.',
      evidence: [{ type: 'estate-registry', ref: 'tools/mission-control/config/estate-registry.json', state: 'measured' }],
      nextAction: 'Owners of each property declare a stable critical path (API endpoint, key page, or function) and add it to the registry.',
      escalation: { level: 'low', class: 'insufficient-evidence', escalateWhen: 'A property is described to investors as production-grade without an authoritative contract.', targetLane: 'Platform + property owner' },
    })
  );
  return items;
}

function measurementItems(history) {
  const items = [];
  const measured = [...history.snapshots].reverse().find(snapshot => snapshot.globaldeetsOperational?.evidenceState === 'measured');
  const certified = history.snapshots.some(snapshot => snapshot.certifiedAudience?.evidenceState === 'measured' && snapshot.certifiedAudience.certified === true);
  const op = measured?.globaldeetsOperational;
  const synthetic = op && typeof op.syntheticHealthVisits === 'number' ? op.syntheticHealthVisits : null;
  const observed = op
    ? 'The latest measured operational edge snapshot (' + measured.snapshotId + ') ' +
      (typeof op.edgeVisits === 'number' ? 'contains ' + op.edgeVisits.toLocaleString('en-US') + ' raw visits' : 'reports no edge-visit count (unavailable, not zero)') +
      (synthetic != null ? ', including ' + synthetic.toLocaleString('en-US') + ' attached to a synthetic health path' : '') +
      '. Mission Control probes add tagged synthetic traffic that must also be excluded.'
    : 'No measured operational edge snapshot is retained, and no certified audience dataset exists.';
  items.push(
    item({
      id: 'measurement:audience-certification',
      rule: 'audience-certification',
      priorityHint: 1,
      severity: 'critical',
      domain: 'measurement',
      status: certified ? 'closed' : 'in-progress',
      businessImpact: 'existential',
      ownerLane: 'Data / analytics',
      openedAt: '2026-09-23',
      title: 'Certify human audience metrics',
      observed,
      businessReason: 'Operational edge telemetry cannot responsibly stand in for human traction.',
      evidence: [{ type: 'mission-control-snapshot', ref: measured?.snapshotId || 'none', state: op ? 'measured' : 'unavailable' }],
      nextAction: 'Connect certified GA4/RUM-quality audience ingestion (history ingestion seam: certified-audience) with explicit bot, monitor, API, asset, and Mission Control probe exclusions.',
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
      priorityHint: 5,
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
      nextAction: 'Scheduled collection accumulates snapshots automatically; connect a governed Canonical Gold source (goldBindings) to add comparable operational-edge points.',
      escalation: { level: 'medium', class: 'measurement-claim-block', escalateWhen: 'A chart attempts to calculate a trend from fewer than two comparable measured observations.', targetLane: 'Data / analytics' },
    })
  );

  return items;
}

function manualItems(manual) {
  return manual.items.map(entry =>
    item({
      ...entry,
      source: 'manual',
      escalation: { blocksInvestorClaim: false, class: entry.escalation.class || 'none', ...entry.escalation },
    })
  );
}

function sortQueue(items) {
  return [...items].sort((a, b) => {
    const terminalA = ['closed', 'accepted-risk'].includes(a.status) ? 1 : 0;
    const terminalB = ['closed', 'accepted-risk'].includes(b.status) ? 1 : 0;
    return (
      terminalA - terminalB ||
      (ESCALATION_RANK[a.escalation.level] ?? 9) - (ESCALATION_RANK[b.escalation.level] ?? 9) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (IMPACT_RANK[a.businessImpact] ?? 9) - (IMPACT_RANK[b.businessImpact] ?? 9) ||
      (a.priorityHint ?? 999) - (b.priorityHint ?? 999) ||
      a.id.localeCompare(b.id)
    );
  });
}

/**
 * @param {object} input estate (built estate-health), history, manual config, previous diagnostics (or null),
 *                       now (ISO), latestAttempt
 */
export function buildDiagnostics({ estate, history, manual, previous = null, latestAttempt = null, now }) {
  const previousById = new Map((previous?.items || []).map(entry => [entry.id, entry]));
  const derived = [
    ...propertyOutageItems(estate),
    ...aggregated(estate, 'no-service-published', subjects => ({
      id: 'availability:no-service-published',
      rule: 'no-service-published',
      severity: 'low',
      domain: 'reliability',
      businessImpact: 'low',
      ownerLane: 'Platform',
      title: subjects.length + ' active zone' + (subjects.length === 1 ? '' : 's') + ' publish no web service',
      observed: subjects.join(', ') + ' resolve without address records and no service is declared. This is not an outage.',
      businessReason: 'Owned domains that publish nothing waste brand surface and cannot be assessed for health.',
      nextAction: 'Decide per domain: publish a placeholder, redirect to a primary property, or record it as intentionally parked in the registry.',
      escalation: { level: 'low', class: 'maintenance', escalateWhen: 'A parked domain is referenced in investor or public material as an active property.', targetLane: 'Platform' },
    })),
    ...aggregated(estate, 'probe-blocked', subjects => ({
      id: 'availability:probe-blocked',
      rule: 'probe-blocked',
      severity: 'medium',
      domain: 'reliability',
      businessImpact: 'low',
      ownerLane: 'Platform',
      title: subjects.length + ' propert' + (subjects.length === 1 ? 'y' : 'ies') + ' could not be assessed (probe blocked)',
      observed: subjects.join(', ') + ' challenged, rate-limited, or gated the probe. Availability is unknown, not failed.',
      businessReason: 'Blocked probes leave real outages invisible.',
      nextAction: 'Allow-list the probe user agent / X-GlobalDeets-Probe header for these hosts or register an authenticated health path.',
      escalation: { level: 'medium', class: 'insufficient-evidence', escalateWhen: 'A blocked property is also investor-critical.', targetLane: 'Platform' },
    })),
    ...aggregated(estate, 'contract-drift', subjects => ({
      id: 'criticalpath:contract-drift',
      rule: 'contract-drift',
      severity: 'low',
      domain: 'reliability',
      businessImpact: 'low',
      ownerLane: 'Platform',
      title: subjects.length + ' baseline contract' + (subjects.length === 1 ? '' : 's') + ' no longer match production',
      observed: subjects.join(', ') + ' answered but did not match their observed homepage baseline. The property may have intentionally changed.',
      businessReason: 'Stale contracts hide real breakage; confirmed changes must be re-baselined.',
      nextAction: 'Review each property; update the registry baseline if the change is intentional, otherwise investigate as a regression.',
      escalation: { level: 'low', class: 'maintenance', escalateWhen: 'Drift coincides with a degraded or failing availability probe.', targetLane: 'Platform' },
    })),
    ...evidenceItems(estate, history, now, latestAttempt),
    ...coverageItems(estate),
  ];
  const measured = measurementItems(history);
  const manualQueue = manualItems(manual);

  const all = [...derived, ...measured, ...manualQueue].map(entry => {
    const prior = previousById.get(entry.id);
    const openedAt = entry.openedAt || prior?.openedAt || dayOf(now);
    return { ...entry, openedAt, ageDays: ageDays(openedAt, now) };
  });

  // Derived incident items that cleared are retained briefly as closed, preserving their history.
  const currentIds = new Set(all.map(entry => entry.id));
  for (const prior of previous?.items || []) {
    if (prior.source !== 'derived' || currentIds.has(prior.id)) continue;
    if (!/^(availability:(outage|degraded)|criticalpath:failed):/.test(prior.id)) continue;
    const closedAt = prior.closedAt || now;
    if (ageDays(closedAt, now) >= CLOSED_RETENTION_DAYS) continue;
    all.push({ ...prior, status: 'closed', closedAt, ageDays: ageDays(prior.openedAt, now), nextAction: 'Recovered; monitor. This item is retained for ' + CLOSED_RETENTION_DAYS + ' days.' });
  }

  const sorted = sortQueue(all).map((entry, index) => {
    const rest = { ...entry };
    delete rest.priorityHint;
    return { ...rest, priority: index + 1 };
  });

  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    contractName: DIAGNOSTICS_CONTRACT_NAME,
    generatedAt: now,
    agentContract: AGENT_CONTRACT,
    derivation: {
      note: 'Items with source "derived" are computed from probe, history, and inventory evidence on every collection run; source "manual" items are hand-authored judgments with no derivable evidence.',
      derivedRules: [...new Set(sorted.filter(entry => entry.source === 'derived').map(entry => entry.rule))].sort(),
    },
    items: sorted,
  };
}

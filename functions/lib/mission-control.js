// functions/lib/mission-control.js
//
// GD-027 Mission Control: a read-only, fail-closed operational-health observatory covering
// GlobalDeets itself and the sibling ecosystem sites (aiaimate.com, culturesherpa.org,
// goodflippinvibes.com, citizenapproved.org) that are linked from GlobalDeets but not
// otherwise monitored anywhere.
//
// Mission Control is not a health score. It does not compute an uptime SLA, a composite
// readiness percentage, or an automatic priority ranking beyond the severities a human
// assigned when a gap was curated. See docs/mission-control.md for the full contract.

import {
  MISSION_CONTROL_GAPS,
  MISSION_CONTROL_GAP_CATEGORIES,
  MISSION_CONTROL_GAP_SEVERITIES,
  MISSION_CONTROL_GAP_STATUSES,
} from './mission-control-gaps.js';

export const MISSION_CONTROL_ID = 'mission-control';
export const MISSION_CONTROL_VERSION = '2026-09-23.1';

export const ECOSYSTEM_SITES = Object.freeze([
  Object.freeze({
    id: 'globaldeets',
    name: 'GlobalDeets',
    domain: 'globaldeets.com',
    url: 'https://globaldeets.com/',
    role: 'flagship',
  }),
  Object.freeze({
    id: 'culturesherpa',
    name: 'Culture Sherpa',
    domain: 'culturesherpa.org',
    url: 'https://culturesherpa.org/',
    role: 'sibling',
  }),
  Object.freeze({
    id: 'aiaimate',
    name: 'aiaimate',
    domain: 'aiaimate.com',
    url: 'https://aiaimate.com/',
    role: 'sibling',
  }),
  Object.freeze({
    id: 'goodflippinvibes',
    name: 'Good Flippin Vibes',
    domain: 'goodflippinvibes.com',
    url: 'https://goodflippinvibes.com/',
    role: 'sibling',
  }),
  Object.freeze({
    id: 'citizenapproved',
    name: 'Citizen Approved',
    domain: 'citizenapproved.org',
    url: 'https://citizenapproved.org/',
    role: 'sibling',
  }),
]);

const SEVERITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

export function buildMissionControl({ curatedGaps = MISSION_CONTROL_GAPS, siteProbes = [] } = {}) {
  requireArray(curatedGaps, 'curatedGaps');
  requireArray(siteProbes, 'siteProbes');

  const probeBySiteId = new Map(siteProbes.map(probe => [probe.siteId, probe]));
  const sites = ECOSYSTEM_SITES.map(site => {
    const probe = probeBySiteId.get(site.id) || null;
    return Object.freeze({
      ...site,
      probe: probe
        ? Object.freeze({
            reachable: probe.reachable === true,
            httpStatus: typeof probe.httpStatus === 'number' ? probe.httpStatus : null,
            latencyMs: typeof probe.latencyMs === 'number' ? probe.latencyMs : null,
            checkedAt: probe.checkedAt || null,
            error: probe.error || null,
          })
        : null,
    });
  });

  const probeGeneratedGaps = sites
    .filter(site => site.probe && site.probe.reachable !== true)
    .map(site =>
      Object.freeze({
        id: `live-probe:${site.id}:unreachable`,
        site: site.domain,
        category: 'operability',
        severity: site.role === 'flagship' ? 'critical' : 'high',
        title: `${site.name} did not respond to a live health probe`,
        observedState: site.probe.error
          ? `Probe error: ${site.probe.error}`
          : `HTTP ${site.probe.httpStatus ?? 'unknown'} at last check.`,
        targetState: `${site.name} responds with a successful status within the probe timeout.`,
        nextAction:
          'Check hosting/DNS/TLS for this domain directly; re-run Mission Control to confirm recovery.',
        detectedAt: site.probe.checkedAt || null,
        status: 'open',
        origin: 'live-probe',
      })
    );

  const gaps = [
    ...curatedGaps.map(gap => Object.freeze({ ...gap, origin: gap.origin || 'curated' })),
    ...probeGeneratedGaps,
  ].sort(bySeverityThenId);

  const openGaps = gaps.filter(gap => gap.status !== 'resolved');

  const gapSummary = Object.freeze({
    totalGaps: gaps.length,
    openGaps: openGaps.length,
    resolvedGaps: gaps.length - openGaps.length,
    bySeverity: countBy(openGaps, gap => gap.severity, MISSION_CONTROL_GAP_SEVERITIES),
    byCategory: countBy(openGaps, gap => gap.category, MISSION_CONTROL_GAP_CATEGORIES),
    bySite: countBy(openGaps, gap => gap.site),
  });

  const siteHealthSummary = Object.freeze({
    totalSites: sites.length,
    sitesProbed: sites.filter(site => site.probe !== null).length,
    sitesReachable: sites.filter(site => site.probe && site.probe.reachable === true).length,
    sitesUnreachable: sites.filter(site => site.probe && site.probe.reachable !== true).length,
  });

  const missionControl = {
    observatoryId: MISSION_CONTROL_ID,
    observatoryVersion: MISSION_CONTROL_VERSION,
    rules: {
      compositeHealthScore: false,
      uptimeSlaGuarantee: false,
      automaticRemediation: false,
      automaticSeverityInference: false,
      liveProbeIsFullDiagnosis: false,
      curatedGapImpliesActiveWork: false,
    },
    sites,
    siteHealthSummary,
    gapSummary,
    gaps,
  };

  return Object.freeze(missionControl);
}

export function validateMissionControl(missionControl) {
  const issues = {
    structureErrors: [],
    semanticErrors: [],
    invalidGaps: [],
    duplicateIds: [],
  };

  if (!plainObject(missionControl)) {
    issues.structureErrors.push('missionControl:not-object');
    return finishValidation(issues);
  }

  if (missionControl.observatoryId !== MISSION_CONTROL_ID) {
    issues.semanticErrors.push('observatoryId:mismatch');
  }
  if (missionControl.observatoryVersion !== MISSION_CONTROL_VERSION) {
    issues.semanticErrors.push('observatoryVersion:mismatch');
  }

  const rules = missionControl.rules;
  if (!plainObject(rules)) {
    issues.structureErrors.push('rules:not-object');
  } else {
    for (const field of [
      'compositeHealthScore',
      'uptimeSlaGuarantee',
      'automaticRemediation',
      'automaticSeverityInference',
      'liveProbeIsFullDiagnosis',
      'curatedGapImpliesActiveWork',
    ]) {
      if (rules[field] !== false) issues.semanticErrors.push(`rules.${field}:must-be-false`);
    }
  }

  if (
    !Array.isArray(missionControl.sites) ||
    missionControl.sites.length !== ECOSYSTEM_SITES.length
  ) {
    issues.structureErrors.push('sites:count-mismatch');
  }

  if (!Array.isArray(missionControl.gaps)) {
    issues.structureErrors.push('gaps:not-array');
  } else {
    const seenIds = new Set();
    for (const gap of missionControl.gaps) {
      const gapErrors = validateGapShape(gap);
      if (gapErrors.length)
        issues.invalidGaps.push({ id: gap?.id || 'unknown', errors: gapErrors });
      if (gap?.id) {
        if (seenIds.has(gap.id)) issues.duplicateIds.push(gap.id);
        seenIds.add(gap.id);
      }
    }
  }

  return finishValidation(issues);
}

function validateGapShape(gap) {
  const errors = [];
  if (!plainObject(gap)) return ['gap:not-object'];
  if (typeof gap.id !== 'string' || !gap.id) errors.push('id:missing');
  if (typeof gap.site !== 'string' || !gap.site) errors.push('site:missing');
  if (!MISSION_CONTROL_GAP_CATEGORIES.includes(gap.category)) errors.push('category:invalid');
  if (!MISSION_CONTROL_GAP_SEVERITIES.includes(gap.severity)) errors.push('severity:invalid');
  if (!MISSION_CONTROL_GAP_STATUSES.includes(gap.status)) errors.push('status:invalid');
  if (typeof gap.title !== 'string' || !gap.title) errors.push('title:missing');
  if (typeof gap.observedState !== 'string' || !gap.observedState)
    errors.push('observedState:missing');
  if (typeof gap.targetState !== 'string' || !gap.targetState) errors.push('targetState:missing');
  if (typeof gap.nextAction !== 'string' || !gap.nextAction) errors.push('nextAction:missing');
  return errors;
}

function finishValidation(issues) {
  const valid =
    issues.structureErrors.length === 0 &&
    issues.semanticErrors.length === 0 &&
    issues.invalidGaps.length === 0 &&
    issues.duplicateIds.length === 0;
  return { valid, ...issues };
}

function bySeverityThenId(a, b) {
  const rankDiff = (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99);
  if (rankDiff !== 0) return rankDiff;
  return String(a.id).localeCompare(String(b.id));
}

function countBy(items, keyFn, knownKeys = null) {
  const counts = {};
  if (Array.isArray(knownKeys)) for (const key of knownKeys) counts[key] = 0;
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.freeze(counts);
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
}

function plainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ECOSYSTEM_SITES,
  MISSION_CONTROL_ID,
  MISSION_CONTROL_VERSION,
  buildMissionControl,
  validateMissionControl,
} from '../functions/lib/mission-control.js';
import { MISSION_CONTROL_GAPS } from '../functions/lib/mission-control-gaps.js';
import { onRequestGet, onRequestOptions } from '../functions/api/ops/mission-control.js';

function mutable(value) {
  return structuredClone(value);
}

function reachableProbe(site, overrides = {}) {
  return {
    siteId: site.id,
    reachable: true,
    httpStatus: 200,
    latencyMs: 120,
    checkedAt: '2026-09-23T00:00:00.000Z',
    error: null,
    ...overrides,
  };
}

test('canonical mission control validates and preserves the no-scoring contract', () => {
  const siteProbes = ECOSYSTEM_SITES.map(site => reachableProbe(site));
  const missionControl = buildMissionControl({ siteProbes });
  const validation = validateMissionControl(missionControl);

  assert.equal(missionControl.observatoryId, MISSION_CONTROL_ID);
  assert.equal(missionControl.observatoryVersion, MISSION_CONTROL_VERSION);
  assert.equal(missionControl.sites.length, ECOSYSTEM_SITES.length);
  assert.equal(missionControl.siteHealthSummary.sitesReachable, ECOSYSTEM_SITES.length);
  assert.equal(missionControl.siteHealthSummary.sitesUnreachable, 0);
  assert.equal(missionControl.rules.compositeHealthScore, false);
  assert.equal(missionControl.rules.uptimeSlaGuarantee, false);
  assert.equal(missionControl.rules.automaticRemediation, false);
  assert.equal(missionControl.gaps.length, MISSION_CONTROL_GAPS.length);
  assert.equal(validation.valid, true, JSON.stringify(validation));
});

test('an unreachable site generates a live-probe gap without mutating the curated registry', () => {
  const siteProbes = ECOSYSTEM_SITES.map((site, index) =>
    index === 1
      ? {
          siteId: site.id,
          reachable: false,
          httpStatus: null,
          latencyMs: 6000,
          checkedAt: '2026-09-23T00:00:00.000Z',
          error: 'Timed out after 6000ms',
        }
      : reachableProbe(site)
  );
  const missionControl = buildMissionControl({ siteProbes });
  const liveGaps = missionControl.gaps.filter(gap => gap.origin === 'live-probe');

  assert.equal(liveGaps.length, 1);
  assert.equal(liveGaps[0].site, ECOSYSTEM_SITES[1].domain);
  assert.equal(liveGaps[0].severity, 'high');
  assert.equal(missionControl.siteHealthSummary.sitesUnreachable, 1);
  assert.equal(validateMissionControl(missionControl).valid, true);
  assert.equal(
    MISSION_CONTROL_GAPS.some(gap => gap.id.startsWith('live-probe:')),
    false
  );
});

test('the flagship site is escalated to critical severity when unreachable', () => {
  const siteProbes = ECOSYSTEM_SITES.map(site =>
    site.role === 'flagship'
      ? {
          siteId: site.id,
          reachable: false,
          httpStatus: 502,
          latencyMs: 900,
          checkedAt: '2026-09-23T00:00:00.000Z',
          error: null,
        }
      : reachableProbe(site)
  );
  const missionControl = buildMissionControl({ siteProbes });
  const flagshipGap = missionControl.gaps.find(
    gap => gap.id === 'live-probe:globaldeets:unreachable'
  );

  assert.ok(flagshipGap);
  assert.equal(flagshipGap.severity, 'critical');
});

test('validator fails closed on scoring rules, count drift, malformed gaps, and duplicate ids', () => {
  const scored = mutable(buildMissionControl());
  scored.rules.compositeHealthScore = true;
  assert.equal(validateMissionControl(scored).valid, false);

  const missingSite = mutable(buildMissionControl());
  missingSite.sites = missingSite.sites.slice(1);
  assert.ok(validateMissionControl(missingSite).structureErrors.includes('sites:count-mismatch'));

  const malformedGap = mutable(buildMissionControl());
  malformedGap.gaps[0].severity = 'catastrophic';
  const malformedResult = validateMissionControl(malformedGap);
  assert.equal(malformedResult.valid, false);
  assert.equal(malformedResult.invalidGaps.length, 1);

  const duplicated = mutable(buildMissionControl());
  duplicated.gaps.push({ ...duplicated.gaps[0] });
  assert.ok(validateMissionControl(duplicated).duplicateIds.includes(duplicated.gaps[0].id));

  assert.equal(validateMissionControl(null).valid, false);
  assert.equal(
    validateMissionControl(undefined).structureErrors.includes('missionControl:not-object'),
    true
  );
});

test('every curated gap satisfies the required shape', () => {
  for (const gap of MISSION_CONTROL_GAPS) {
    assert.equal(typeof gap.id, 'string');
    assert.ok(gap.id.length > 0);
    assert.equal(typeof gap.title, 'string');
    assert.ok(['critical', 'high', 'medium', 'low'].includes(gap.severity));
    assert.ok(['open', 'in-progress', 'resolved'].includes(gap.status));
    assert.equal(typeof gap.nextAction, 'string');
    assert.ok(gap.nextAction.length > 0);
  }
  const ids = MISSION_CONTROL_GAPS.map(gap => gap.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a total probe outage degrades to an all-sites-unreachable payload instead of a hard failure', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    throw new Error('network unreachable in test sandbox');
  };

  const response = await onRequestGet({
    request: new Request('https://globaldeets.com/api/ops/mission-control'),
  });
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.integrity.valid, true);
  assert.equal(payload.observatoryId, MISSION_CONTROL_ID);
  assert.equal(payload.siteHealthSummary.sitesReachable, 0);
  assert.equal(
    payload.gaps.filter(gap => gap.origin === 'live-probe').length,
    ECOSYSTEM_SITES.length
  );
});

test('OPTIONS preflight responds with 204 and CORS headers', async () => {
  const response = await onRequestOptions({
    request: new Request('https://globaldeets.com/api/ops/mission-control'),
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

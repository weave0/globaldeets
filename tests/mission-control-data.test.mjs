import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const readText = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const history = readJson('observatory/mission-control/history.json');
const estate = readJson('observatory/mission-control/estate-health.json');
const diagnostics = readJson('observatory/mission-control/diagnostics.json');

test('GD-029 history contract preserves unknown audience and supports 7/28/90 views', () => {
  assert.equal(history.contractName, 'globaldeets-mission-control-history');
  assert.deepEqual(history.supportedWindowsDays, [7, 28, 90]);
  assert.equal(history.policy.missingSnapshotIsZero, false);
  assert.equal(history.policy.certifiedAudienceMayUseOperationalTelemetry, false);

  const current = history.snapshots.find(item => item.snapshotId === '2026-09-24.1');
  assert.ok(current);
  assert.equal(current.certifiedAudience.evidenceState, 'unavailable');
  assert.equal(current.certifiedAudience.value, null);
  assert.equal(current.globaldeetsOperational.evidenceState, 'unavailable');
  assert.equal(current.globaldeetsOperational.edgeRequests, null);

  const comparable = history.snapshots.find(item => item.snapshotId === '2026-09-23.2');
  assert.equal(comparable.globaldeetsOperational.edgeRequests, 157486);
  assert.equal(comparable.globaldeetsOperational.edgeVisits, 36391);
  assert.equal(comparable.globaldeetsOperational.syntheticHealthVisits, 31681);
  assert.equal(comparable.globaldeetsOperational.investorSafe, false);
});

test('GD-029 estate health covers all 25 active zones and keeps unknown health unknown', () => {
  assert.equal(estate.contractName, 'globaldeets-estate-health');
  assert.equal(estate.propertyCount, 25);
  assert.equal(estate.properties.length, 25);
  assert.equal(new Set(estate.properties.map(item => item.propertyId)).size, 25);
  assert.equal(estate.properties[0].propertyId, 'globaldeets.com');
  assert.equal(estate.properties[1].propertyId, 'culturesherpa.org');

  const unobserved = estate.properties
    .filter(item => item.observability.state === 'unobserved')
    .map(item => item.propertyId)
    .sort();
  assert.deepEqual(unobserved, ['artificelligance.com', 'artificelligence.com', 'fwomp.us', 'fwomps.com']);

  assert.equal(estate.summary.rumObservedZones, 21);
  assert.equal(estate.summary.availabilityKnownZones, 0);
  assert.equal(estate.summary.criticalPathKnownZones, 0);
  assert.equal(estate.summary.pagesMappedActiveZones, 10);

  for (const property of estate.properties) {
    assert.equal(property.zone.status, 'active');
    assert.equal(property.availability.state, 'unknown');
    assert.equal(property.availability.evidenceState, 'unavailable');
    assert.equal(property.criticalPath.state, 'unknown');
    assert.equal(property.criticalPath.evidenceState, 'unavailable');
  }
});

test('GD-029 deploy freshness is bounded to observed serving-domain mappings', () => {
  const withDeploy = estate.properties.filter(item => item.deployment.latestProductionDeployAt);
  assert.equal(withDeploy.length, 10);
  assert.ok(withDeploy.every(item => item.deployment.servingDomainState === 'observed'));

  const brett = estate.properties.find(item => item.propertyId === 'brettleeweaver.com');
  assert.equal(brett.deployment.servingDomainState, 'no_active_domain');
  assert.equal(brett.deployment.latestProductionDeployAt, null);

  const culture = estate.properties.find(item => item.propertyId === 'culturesherpa.org');
  assert.equal(culture.deployment.evidenceState, 'unavailable');
  assert.equal(culture.deployment.latestProductionDeployAt, null);
});

test('GD-029 diagnostics are sortable and agent-consumable with escalation semantics', () => {
  assert.equal(diagnostics.contractName, 'globaldeets-diagnostics-queue');
  assert.ok(diagnostics.agentContract.sortableFields.includes('escalation.level'));

  const required = diagnostics.agentContract.requiredForAction;
  for (const item of diagnostics.items) {
    for (const key of required) assert.ok(Object.hasOwn(item, key), item.id + ' missing ' + key);
    assert.ok(Array.isArray(item.evidence));
    assert.ok(item.evidence.length > 0);
    assert.ok(item.escalation.escalateWhen);
    assert.ok(item.escalation.targetLane);
  }

  const audience = diagnostics.items.find(item => item.id === 'measurement:audience-certification');
  assert.equal(audience.severity, 'critical');
  assert.equal(audience.escalation.level, 'investor-blocking');
  assert.equal(audience.escalation.blocksInvestorClaim, true);
});

test('GD-029 live investor-adjacent surfaces reject portfolio-era analytics copy', () => {
  const categories = readText('categories.html');
  const missionHtml = readText('observatory/mission-control/index.html');
  const missionJs = readText('observatory/mission-control/mission-control.js');

  assert.doesNotMatch(categories, /Data Platform Showcase/i);
  assert.match(categories, /Source-first world information/i);
  assert.match(missionHtml, /Historical data plane/i);
  assert.match(missionHtml, /Property health &amp; evidence/i);
  assert.match(missionHtml, /Certified audience/i);
  assert.match(missionJs, /No GA4\/RUM-quality human-audience series has passed the evidence gate yet/);
});

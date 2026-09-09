import assert from 'node:assert/strict';
import test from 'node:test';

import { SOURCES } from '../functions/api/news.js';
import { buildCoverageInventory } from '../functions/lib/news-coverage.js';
import {
  SOURCE_ADMISSIONS,
  SOURCE_RESEARCH_CANDIDATES,
  isProductionAdmissible,
  validateSourceAdmissions,
} from '../functions/lib/news-source-admission.js';
import {
  SOURCE_PROVENANCE,
  validateSourceProvenance,
} from '../functions/lib/news-source-provenance.js';
import {
  buildLocalReportingObservatory,
  validateLocalReportingObservatory,
} from '../functions/lib/local-reporting-observatory.js';

function mutable(value) {
  return structuredClone(value);
}

test('GD-019 admits two operator-distinct subnational sources across two explicit jurisdictions', () => {
  const coverage = buildCoverageInventory();
  const sourceIds = new Set(coverage.subnationalReporting.sourceIds);

  assert.equal(SOURCES.length, 21);
  assert.equal(validateSourceAdmissions().valid, true);
  assert.equal(validateSourceProvenance().valid, true);
  assert.equal(coverage.subnationalReporting.sourceCount, 2);
  assert.deepEqual(coverage.subnationalReporting.jurisdictionIds, ['US-CA', 'US-MN']);
  assert.equal(coverage.subnationalReporting.jurisdictionCount, 2);
  assert.equal(coverage.subnationalReporting.operatorCount, 2);
  assert.ok(sourceIds.has('minnesota-reformer'));
  assert.ok(sourceIds.has('calmatters'));
  assert.equal(coverage.gaps.some(gap => gap.id === 'geographic-scope:subnational'), false);
  assert.equal(
    coverage.gaps.some(gap => gap.id === 'geographic-scope:subnational-jurisdictions'),
    false
  );
});

test('routing region, publisher origin, reviewed source scope, and item locality remain distinct', () => {
  const coverage = buildCoverageInventory();
  for (const source of coverage.subnationalReporting.sources) {
    assert.equal(source.routingRegion, 'americas');
    assert.equal(source.scopeType, 'state-province');
    assert.notEqual(source.routingRegion, source.scopeType);
    assert.equal(source.primaryCountry, 'US');
    assert.equal(source.jurisdictionScheme, 'ISO 3166-2');
    assert.equal(source.jurisdictionIds.length, 1);
    assert.equal(source.scopeBasis, 'publisher-declared-reviewed');
  }
  assert.equal(coverage.localityRules.routingRegionIsGeographicScope, false);
  assert.equal(coverage.localityRules.publisherOriginIsEventLocality, false);
  assert.equal(coverage.localityRules.sourceScopeMakesEveryItemLocal, false);
  assert.equal(coverage.localityRules.subnationalReportingIsPrimaryEvidence, false);
  assert.equal(coverage.localityRules.localPublisherImpliesIndependentCorroboration, false);
});

test('subnational provenance cannot substitute country, routing, or label assertions for reviewed jurisdiction evidence', () => {
  const missingJurisdiction = mutable(SOURCE_PROVENANCE);
  const minnesota = missingJurisdiction.find(entry => entry.sourceId === 'minnesota-reformer');
  minnesota.jurisdictionIds = [];
  assert.ok(validateSourceProvenance(SOURCES, missingJurisdiction).invalidEntries.includes('minnesota-reformer'));

  const missingScopeEvidence = mutable(SOURCE_PROVENANCE);
  missingScopeEvidence.find(entry => entry.sourceId === 'calmatters').scopeEvidenceUrls = [];
  assert.ok(validateSourceProvenance(SOURCES, missingScopeEvidence).invalidEntries.includes('calmatters'));

  const unreviewedScope = mutable(SOURCE_PROVENANCE);
  unreviewedScope.find(entry => entry.sourceId === 'calmatters').scopeBasis = 'unknown';
  assert.ok(validateSourceProvenance(SOURCES, unreviewedScope).invalidEntries.includes('calmatters'));
});

test('new local value does not bypass the existing source-admission gate', () => {
  const minnesota = SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'minnesota-reformer');
  const calmatters = SOURCE_ADMISSIONS.find(entry => entry.sourceId === 'calmatters');
  assert.equal(isProductionAdmissible(minnesota), true);
  assert.equal(isProductionAdmissible(calmatters), true);
  assert.equal(minnesota.legacy, false);
  assert.equal(calmatters.legacy, false);
  assert.equal(minnesota.itemLevelReviewRequired, false);
  assert.equal(calmatters.itemLevelReviewRequired, false);

  const unsafe = mutable(SOURCE_ADMISSIONS);
  const unsafeMinnesota = unsafe.find(entry => entry.sourceId === 'minnesota-reformer');
  unsafeMinnesota.allowedUseStatus = 'permission-required';
  const validation = validateSourceAdmissions(SOURCES, unsafe);
  assert.equal(validation.valid, false);
  assert.ok(validation.unadmittedNewSourceIds.includes('minnesota-reformer'));
});

test('LAist remains research-only because mixed-origin feed content requires item-level restriction handling', () => {
  const laist = SOURCE_RESEARCH_CANDIDATES.find(candidate => candidate.candidateId === 'laist-local');
  assert.ok(laist);
  assert.equal(laist.disposition, 'research');
  assert.equal(laist.endpointAuthority, 'first-party');
  assert.equal(laist.allowedUseStatus, 'verified-public-use');
  assert.equal(laist.itemLevelReviewRequired, true);
  assert.equal(SOURCE_ADMISSIONS.some(entry => entry.sourceId === 'laist'), false);
  assert.equal(SOURCES.some(source => source.name === 'LAist'), false);
});

test('local reporting observatory is read-only and rejects semantic collapse or research self-promotion', () => {
  const locality = buildLocalReportingObservatory();
  assert.equal(validateLocalReportingObservatory(locality).valid, true);
  assert.equal(locality.sourceCount, 2);
  assert.equal(locality.jurisdictionCount, 2);
  assert.equal(locality.rules.observatoryIsAdmissionAuthority, false);
  assert.equal(locality.rules.automaticSourceWeighting, false);

  const scopeCollapse = mutable(locality);
  scopeCollapse.sources[0].routingRegion = scopeCollapse.sources[0].scopeType;
  assert.ok(
    validateLocalReportingObservatory(scopeCollapse).errors.some(error =>
      error.endsWith(':routing-scope-collapse')
    )
  );

  const itemCollapse = mutable(locality);
  itemCollapse.rules.sourceScopeMakesEveryItemLocal = true;
  assert.ok(
    validateLocalReportingObservatory(itemCollapse).errors.includes(
      'locality.rules.sourceScopeMakesEveryItemLocal:must-be-false'
    )
  );

  const selfPromotion = mutable(locality);
  selfPromotion.sourceIds.push('laist-local');
  selfPromotion.sourceCount += 1;
  assert.ok(
    validateLocalReportingObservatory(selfPromotion).errors.includes(
      'locality:laist-local:research-self-promotion'
    )
  );
});

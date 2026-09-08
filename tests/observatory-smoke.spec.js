const { expect, test } = require('@playwright/test');

const fixture = {
  generatedAt: '2026-09-08T21:30:00.000Z',
  observatoryId: 'coverage-evidence',
  observatoryVersion: '2026-09-08.1',
  sourceFingerprint: 'fixture-source-fingerprint',
  admissionFingerprint: 'fixture-admission-fingerprint',
  rules: {
    truthScore: false,
    editorialVerdict: false,
    compositeCoverageScore: false,
    publisherQualityScore: false,
    newsCoverageIsEvidenceCoverage: false,
    collectionEligibilityRequiresEndpointReview: true,
    reviewedDirectoryIsCollectionAuthority: false,
    automaticRemediation: false,
  },
  newsCoverage: {
    totalSources: 19,
    totalRegions: 7,
    totalLanguages: 2,
    englishSourceShare: 18 / 19,
    primarySourceInputs: 0,
    gapCount: 11,
    regions: [
      {
        region: 'pacific',
        sourceCount: 1,
        languageCount: 1,
        sourceOriginCountryCount: 1,
        publisherCount: 1,
      },
      {
        region: 'global',
        sourceCount: 4,
        languageCount: 2,
        sourceOriginCountryCount: 4,
        publisherCount: 4,
      },
    ],
    sourceOriginCountries: [],
    sourceClasses: [],
    evidenceRoles: [],
    geographicScopes: [],
    provenance: { valid: true },
    admission: { valid: true },
  },
  sourceRights: {
    totalLiveSources: 19,
    reviewedLiveSources: 2,
    reviewedLiveSourceIds: ['ap', 'guardian'],
    legacyUnreviewedSources: 17,
    legacyUnreviewedSourceIds: ['bbc-world', 'cna', 'dawn'],
    remediationSourceIds: ['ap', 'guardian'],
    unknownRightsSourceIds: ['bbc-world', 'cna', 'dawn'],
    researchCandidates: [
      {
        candidateId: 'rnz-pacific',
        name: 'RNZ Pacific',
        disposition: 'research',
        collectionEligible: false,
      },
    ],
  },
  institutionalEvidence: {
    reviewedSources: 10,
    issuingPrimarySources: 8,
    collectionEligibleSources: 1,
    directoryOnlySources: 9,
    endpointReviewedSources: 1,
    knowledgeCatalogIsIngestionAuthority: false,
    endpointReviewRequired: true,
    sources: [
      {
        sourceId: 'knowledge:economy:eurostat',
        sourceClass: 'statistical-office',
        evidenceRole: 'issuing-primary',
        jurisdiction: 'European Union',
        collectionState: 'endpoint-reviewed',
        collectionEligible: true,
        machineReadableEndpointCount: 1,
        verifiedEndpointCount: 1,
        documentTypes: ['dataset', 'statistical-release'],
      },
    ],
  },
  evidenceCoverage: {
    dossierCount: 1,
    dossierIds: ['santa-ynez-pipeline'],
    evidenceClasses: [
      { documentType: 'government-release', count: 4 },
      { documentType: 'judgment', count: 2 },
      { documentType: 'corporate-filing', count: 1 },
      { documentType: 'regulator-release', count: 1 },
    ],
    provenance: { sourceClasses: [], evidenceRoles: [], uniqueSourceCount: 10, scoringApplied: false },
    dossiers: [
      {
        dossierId: 'santa-ynez-pipeline',
        dossierVersion: '2026-09-03.1',
        title: 'Santa Ynez Pipeline — Evidence Dossier',
        status: 'developing',
        integrityValid: true,
        eventCount: 7,
        claimCount: 11,
        evidenceCount: 8,
        unresolvedClaimCount: 5,
        correctionCount: 1,
        eventCoverage: [
          {
            eventId: 'event:order',
            title: 'Federal court issues mixed order',
            primaryEvidenceCount: 1,
            hasPrimaryEvidence: true,
            reportingSourceCount: 1,
          },
          {
            eventId: 'event:correction',
            title: 'Justice Department corrects release',
            primaryEvidenceCount: 0,
            hasPrimaryEvidence: false,
            reportingSourceCount: 0,
          },
        ],
      },
    ],
  },
  operationalHealth: {
    status: 'unavailable',
    generatedAt: null,
    totalSources: 19,
    healthySources: null,
    degradedSources: null,
    degradedSourceIds: [],
  },
  gaps: [
    {
      id: 'governance:source-rights-review-debt',
      domain: 'source-governance',
      type: 'source-rights-review-debt',
      severity: 'high',
      observed: 17,
      target: 0,
      affectedIds: ['bbc-world'],
      detail: 'Live legacy sources remain explicitly unreviewed for usage rights.',
      nextAction: 'Complete evidence-backed source-by-source rights review.',
      requires: ['manual-review'],
    },
    {
      id: 'evidence:institutional-collection-eligibility',
      domain: 'evidence-coverage',
      type: 'institutional-collection-eligibility',
      severity: 'high',
      observed: 1,
      target: 'endpoint review for selected remaining candidates',
      affectedIds: ['knowledge:governance:united-nations'],
      detail: 'Reviewed institutional directories are not collection authority; one governed source does not eliminate the remaining acquisition gap.',
      nextAction: 'Perform endpoint-specific collection and rights review for selected candidates.',
      requires: ['manual-review', 'code'],
    },
  ],
  integrity: { valid: true },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/intelligence/observatory/coverage', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture),
    });
  });
});

test('coverage observatory renders an integrity-valid decomposed intelligence surface', async ({ page }) => {
  await page.goto('/observatory/coverage/');

  await expect(page.getByRole('heading', { name: 'Coverage & Evidence Observatory' })).toBeVisible();
  await expect(page.locator('body[data-observatory-ready="true"]')).toBeVisible();
  await expect(page.getByText('Integrity validated')).toBeVisible();
  await expect(page.getByText('Legacy rights reviews open')).toBeVisible();
  await expect(page.getByText('Institutional sources collection-eligible')).toBeVisible();
  await expect(page.getByText('News coverage ≠ evidence coverage')).toBeVisible();
  await expect(page.locator('#dossier-list .dossier-card')).toHaveCount(1);
  await expect(page.locator('#gap-list .gap-card')).toHaveCount(2);
  await expect(page.locator('#observatory-error')).toBeHidden();
});

test.describe('coverage observatory mobile surface', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('remains readable without horizontal overflow', async ({ page }) => {
    await page.goto('/observatory/coverage/');
    await expect(page.locator('body[data-observatory-ready="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Explicit gaps' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });
});

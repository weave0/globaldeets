#!/usr/bin/env node

function argValue(name) {
  const arg = process.argv.find(value => value.startsWith(name));
  return arg ? arg.slice(name.length) : null;
}

const BASE = (argValue('--base=') || 'https://globaldeets.com').replace(/\/$/, '');
const TIMEOUT_MS = 12_000;

async function request(path) {
  return fetch(`${BASE}${path}`, {
    headers: {
      'User-Agent': 'GlobalDeets-ObservatoryVerifier/1.0',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function json(path) {
  const response = await request(path);
  if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw new Error(`${path} returned non-JSON content`);
  }
  return response.json();
}

async function html(path) {
  const response = await request(path);
  if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
  if (!(response.headers.get('content-type') || '').includes('text/html')) {
    throw new Error(`${path} returned non-HTML content`);
  }
  return response.text();
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const [observatory, coverage, sources, admission, evidenceSchema, dossier, page] = await Promise.all([
    json('/api/intelligence/observatory/coverage'),
    json('/api/news/coverage'),
    json('/api/news/sources'),
    json('/api/news/admission'),
    json('/api/intelligence/evidence-schema'),
    json('/api/intelligence/dossiers/santa-ynez-pipeline'),
    html('/observatory/coverage/'),
  ]);

  requireCondition(observatory.observatoryId === 'coverage-evidence', 'observatory identity changed');
  requireCondition(typeof observatory.observatoryVersion === 'string', 'observatory version missing');
  requireCondition(observatory.integrity?.valid === true, 'observatory integrity failed');
  requireCondition(observatory.rules?.truthScore === false, 'observatory truth score must remain disabled');
  requireCondition(observatory.rules?.editorialVerdict === false, 'observatory editorial verdict must remain disabled');
  requireCondition(observatory.rules?.compositeCoverageScore === false, 'composite coverage score must remain disabled');
  requireCondition(observatory.rules?.publisherQualityScore === false, 'publisher quality score must remain disabled');
  requireCondition(observatory.rules?.newsCoverageIsEvidenceCoverage === false, 'news/evidence separation changed');
  requireCondition(observatory.rules?.collectionEligibilityRequiresEndpointReview === true, 'endpoint review gate changed');
  requireCondition(observatory.rules?.reviewedDirectoryIsCollectionAuthority === false, 'reviewed directory became collection authority');
  requireCondition(observatory.rules?.automaticRemediation === false, 'observatory must remain read-only');

  requireCondition(
    observatory.sourceFingerprint === coverage.sourceFingerprint &&
      observatory.sourceFingerprint === sources.sourceFingerprint &&
      observatory.sourceFingerprint === admission.sourceFingerprint,
    'observatory source fingerprint disagrees with canonical news APIs'
  );
  requireCondition(
    observatory.admissionFingerprint === admission.admissionFingerprint,
    'observatory admission fingerprint disagrees with admission API'
  );
  requireCondition(
    observatory.newsCoverage?.totalSources === sources.totalSources &&
      observatory.sourceRights?.totalLiveSources === admission.liveAdmissions.length,
    'observatory live source counts disagree with canonical APIs'
  );
  requireCondition(observatory.newsCoverage?.provenance?.valid === true, 'observatory provenance invalid');
  requireCondition(observatory.newsCoverage?.admission?.valid === true, 'observatory admission invalid');

  const reviewedLive = admission.liveAdmissions.filter(entry => entry.reviewState === 'reviewed').length;
  const legacyUnreviewed = admission.liveAdmissions.filter(entry => entry.reviewState === 'legacy-unreviewed').length;
  requireCondition(observatory.sourceRights?.reviewedLiveSources === reviewedLive, 'reviewed live source count drifted');
  requireCondition(observatory.sourceRights?.legacyUnreviewedSources === legacyUnreviewed, 'legacy review debt count drifted');
  requireCondition(legacyUnreviewed === 17, 'GD-017 baseline must preserve the 17-source rights-review debt');

  requireCondition(
    observatory.institutionalEvidence?.reviewedSources === evidenceSchema.institutionalSources?.reviewedSources,
    'institutional reviewed source count disagrees with evidence schema'
  );
  requireCondition(
    observatory.institutionalEvidence?.collectionEligibleSources === evidenceSchema.institutionalSources?.collectionEligibleSources,
    'institutional collection eligibility disagrees with evidence schema'
  );
  requireCondition(observatory.institutionalEvidence?.reviewedSources === 10, 'reviewed institutional candidate baseline changed');
  requireCondition(observatory.institutionalEvidence?.collectionEligibleSources === 0, 'institutional collection silently enabled');

  requireCondition(observatory.evidenceCoverage?.dossierCount === 1, 'GD-017 dossier baseline changed');
  const dossierSummary = observatory.evidenceCoverage?.dossiers?.find(item => item.dossierId === 'santa-ynez-pipeline');
  requireCondition(Boolean(dossierSummary), 'Santa Ynez dossier missing from observatory');
  requireCondition(dossierSummary.integrityValid === true, 'observatory exposes invalid dossier');
  requireCondition(dossierSummary.eventCount === dossier.events.length, 'observatory event count disagrees with dossier API');
  requireCondition(dossierSummary.claimCount === dossier.claims.length, 'observatory claim count disagrees with dossier API');
  requireCondition(dossierSummary.evidenceCount === dossier.evidence.length, 'observatory evidence count disagrees with dossier API');
  requireCondition(dossierSummary.unresolvedClaimCount > 0, 'unresolved claim debt missing');
  requireCondition(dossierSummary.correctionCount === dossier.corrections.length, 'correction count disagrees with dossier API');
  requireCondition(dossierSummary.unknownCount === dossier.unknowns.length, 'unknown count disagrees with dossier API');

  const gapTypes = new Set(observatory.gaps.map(gap => gap.type));
  requireCondition(gapTypes.has('source-rights-review-debt'), 'source-rights debt gap missing');
  requireCondition(gapTypes.has('institutional-collection-eligibility'), 'institutional evidence eligibility gap missing');
  requireCondition(gapTypes.has('unresolved-claims'), 'unresolved dossier claim gap missing');
  requireCondition(gapTypes.has('correction-artifact-retention'), 'correction artifact gap missing');
  requireCondition(
    observatory.gaps.every(gap => typeof gap.nextAction === 'string' && Array.isArray(gap.requires)),
    'one or more observatory gaps lack operational actions'
  );

  requireCondition(page.includes('data-observatory-id="coverage-evidence"'), 'observatory page identity marker missing');
  requireCondition(page.includes('Coverage &amp; Evidence Observatory'), 'observatory page shell missing');
  requireCondition(page.includes('News coverage ≠ evidence coverage'), 'observatory semantic separation label missing');

  console.log(
    `Coverage & Evidence Observatory certified: ${observatory.newsCoverage.totalSources} live news sources, ${legacyUnreviewed} rights reviews open, ${observatory.institutionalEvidence.reviewedSources} institutional candidates / ${observatory.institutionalEvidence.collectionEligibleSources} collection-eligible, ${dossierSummary.unresolvedClaimCount} unresolved claims, ${observatory.gaps.length} explicit gaps`
  );
})().catch(error => {
  console.error(`Coverage & Evidence Observatory verification failed: ${error.message}`);
  process.exit(1);
});

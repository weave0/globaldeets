// Deterministic coverage inventory derived from the canonical news source contract.
// Provenance and admission enrich observability but intentionally do not alter feed fetching/cache identity.

import { SOURCES, slugifySourceName } from '../api/news.js';
import { SOURCE_ADMISSIONS, validateSourceAdmissions } from './news-source-admission.js';
import { SOURCE_PROVENANCE, validateSourceProvenance } from './news-source-provenance.js';

export const COVERAGE_POLICY = Object.freeze({
  minimumSourcesPerRegion: 2,
  portfolioEnglishConcentrationThreshold: 0.8,
  minimumPrimarySourceInputs: 1,
});

export function buildCoverageInventory(
  sources = SOURCES,
  provenance = SOURCE_PROVENANCE,
  admissions = SOURCE_ADMISSIONS
) {
  const provenanceValidation = validateSourceProvenance(sources, provenance);
  const admissionValidation = validateSourceAdmissions(sources, admissions);
  const provenanceById = new Map(provenance.map(entry => [entry.sourceId, entry]));
  const admissionById = new Map(admissions.map(entry => [entry.sourceId, entry]));
  const normalizedSources = sources
    .map(source => {
      const sourceId = slugifySourceName(source.name);
      const metadata = provenanceById.get(sourceId) || {};
      const admission = admissionById.get(sourceId) || {};
      return {
        sourceId,
        name: source.name,
        region: source.region,
        lang: source.lang,
        sourceClass: metadata.sourceClass || 'unknown',
        evidenceRole: metadata.evidenceRole || 'unknown',
        geographicScope: metadata.geographicScope || 'unknown',
        primaryCountry: metadata.primaryCountry || null,
        locality: metadata.locality || 'unknown',
        ownershipOperatorKnown: Boolean(metadata.ownershipOperator),
        admissionReviewState: admission.reviewState || 'missing',
        allowedUseStatus: admission.allowedUseStatus || 'missing',
        endpointAuthority: admission.endpointAuthority || 'missing',
      };
    })
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  const regionGroups = groupSources(normalizedSources, 'region');
  const languageGroups = groupSources(normalizedSources, 'lang');
  const sourceClassGroups = groupSources(normalizedSources, 'sourceClass');
  const evidenceRoleGroups = groupSources(normalizedSources, 'evidenceRole');
  const geographicScopeGroups = groupSources(normalizedSources, 'geographicScope');
  const countryGroups = groupSources(
    normalizedSources.filter(source => source.primaryCountry),
    'primaryCountry'
  );

  const regions = summarizeGroups(regionGroups, 'region', members => ({
    languageCount: new Set(members.map(source => source.lang)).size,
    languages: [...new Set(members.map(source => source.lang))].sort(),
  }));
  const languages = summarizeGroups(languageGroups, 'lang');
  const sourceClasses = summarizeGroups(sourceClassGroups, 'sourceClass');
  const evidenceRoles = summarizeGroups(evidenceRoleGroups, 'evidenceRole');
  const geographicScopes = summarizeGroups(geographicScopeGroups, 'geographicScope');
  const sourceOriginCountries = summarizeGroups(countryGroups, 'country');

  const admission = buildAdmissionInventory(admissions, admissionValidation);
  const gaps = buildGapSignals(
    normalizedSources,
    regions,
    provenanceValidation,
    admissionValidation,
    admission
  );
  const englishSources = normalizedSources.filter(source => source.lang === 'en').length;
  const primarySourceInputs = normalizedSources.filter(
    source => source.evidenceRole === 'primary-source'
  ).length;

  return {
    totalSources: normalizedSources.length,
    totalRegions: regions.length,
    totalLanguages: languages.length,
    englishSourceShare:
      normalizedSources.length === 0 ? 0 : roundRatio(englishSources / normalizedSources.length),
    nonEnglishSources: normalizedSources
      .filter(source => source.lang !== 'en')
      .map(source => source.sourceId),
    primarySourceInputs,
    provenance: {
      valid: provenanceValidation.valid,
      reviewedSources: provenance.length,
      missingSourceIds: provenanceValidation.missingSourceIds,
      orphanSourceIds: provenanceValidation.orphanSourceIds,
      duplicateIds: provenanceValidation.duplicateIds,
      invalidEntries: provenanceValidation.invalidEntries,
      unknownOwnershipOperatorSourceIds: normalizedSources
        .filter(source => !source.ownershipOperatorKnown)
        .map(source => source.sourceId),
    },
    admission,
    regions,
    languages,
    sourceClasses,
    evidenceRoles,
    geographicScopes,
    sourceOriginCountries,
    gaps,
  };
}

function buildAdmissionInventory(admissions, validation) {
  return {
    valid: validation.valid,
    reviewedSources: admissions.filter(entry => entry.reviewState === 'reviewed').length,
    legacyUnreviewedSources: admissions.filter(entry => entry.reviewState === 'legacy-unreviewed').length,
    remediationSourceIds: admissions
      .filter(entry => ['permission-required', 'contract-required', 'prohibited'].includes(entry.allowedUseStatus))
      .map(entry => entry.sourceId)
      .sort(),
    unknownRightsSourceIds: admissions
      .filter(entry => entry.allowedUseStatus === 'unknown')
      .map(entry => entry.sourceId)
      .sort(),
    missingSourceIds: validation.missingSourceIds,
    orphanSourceIds: validation.orphanSourceIds,
    endpointDriftSourceIds: validation.endpointDriftSourceIds,
    unadmittedNewSourceIds: validation.unadmittedNewSourceIds,
  };
}

function buildGapSignals(
  sources,
  regions,
  provenanceValidation,
  admissionValidation,
  admission
) {
  const gaps = [];

  for (const region of regions) {
    if (region.sourceCount < COVERAGE_POLICY.minimumSourcesPerRegion) {
      gaps.push({
        id: `regional-redundancy:${region.region}`,
        type: 'regional-redundancy',
        severity: 'high',
        region: region.region,
        observed: region.sourceCount,
        target: COVERAGE_POLICY.minimumSourcesPerRegion,
        detail: `${region.region} has fewer than ${COVERAGE_POLICY.minimumSourcesPerRegion} independent feed inputs in the current contract.`,
      });
    }
  }

  const englishOnlyRegions = regions.filter(
    region => region.region !== 'global' && region.languages.length === 1 && region.languages[0] === 'en'
  );

  for (const region of englishOnlyRegions) {
    gaps.push({
      id: `source-language-diversity:${region.region}`,
      type: 'source-language-diversity',
      severity: 'medium',
      region: region.region,
      observed: region.languages,
      target: 'include at least one non-English source-language input where reliable coverage exists',
      detail: `${region.region} currently depends entirely on English-language feed inputs.`,
    });
  }

  const englishCount = sources.filter(source => source.lang === 'en').length;
  const englishShare = sources.length === 0 ? 0 : englishCount / sources.length;
  if (englishShare >= COVERAGE_POLICY.portfolioEnglishConcentrationThreshold) {
    gaps.push({
      id: 'portfolio-language-concentration:en',
      type: 'portfolio-language-concentration',
      severity: 'high',
      region: null,
      observed: roundRatio(englishShare),
      target: `< ${COVERAGE_POLICY.portfolioEnglishConcentrationThreshold}`,
      detail: 'The source portfolio is highly concentrated in English-language feed inputs.',
    });
  }

  const primarySourceInputs = sources.filter(source => source.evidenceRole === 'primary-source').length;
  if (primarySourceInputs < COVERAGE_POLICY.minimumPrimarySourceInputs) {
    gaps.push({
      id: 'evidence-role:primary-source-inputs',
      type: 'evidence-role',
      severity: 'high',
      region: null,
      observed: primarySourceInputs,
      target: COVERAGE_POLICY.minimumPrimarySourceInputs,
      detail: 'The live source contract contains reporting and wire inputs but no primary-source institutional evidence feeds.',
    });
  }

  const subnationalSources = sources.filter(source => source.geographicScope === 'subnational').length;
  if (subnationalSources === 0) {
    gaps.push({
      id: 'geographic-scope:subnational',
      type: 'geographic-scope',
      severity: 'medium',
      region: null,
      observed: 0,
      target: 'measurable subnational/local coverage where strategically relevant',
      detail: 'No current source is classified as a subnational/local source, limiting visibility below national and regional narratives.',
    });
  }

  if (!provenanceValidation.valid) {
    gaps.push({
      id: 'provenance-registry:invalid',
      type: 'provenance-integrity',
      severity: 'critical',
      region: null,
      observed: provenanceValidation,
      target: 'exactly one valid provenance record per live source',
      detail: 'The provenance registry does not exactly match the canonical live source contract.',
    });
  }

  if (!admissionValidation.valid) {
    gaps.push({
      id: 'source-admission:invalid',
      type: 'source-admission-integrity',
      severity: 'critical',
      region: null,
      observed: admissionValidation,
      target: 'exactly one structurally valid admission record per live source and fully reviewed admission for every new source',
      detail: 'The source-admission registry does not satisfy the canonical live-source contract.',
    });
  }

  if (admission.legacyUnreviewedSources > 0) {
    gaps.push({
      id: 'source-admission:legacy-review-backlog',
      type: 'source-admission-review',
      severity: 'high',
      region: null,
      observed: admission.legacyUnreviewedSources,
      target: 0,
      detail: 'Legacy live sources remain explicitly unreviewed for usage rights and require source-by-source admission review.',
    });
  }

  if (admission.remediationSourceIds.length > 0) {
    gaps.push({
      id: 'source-admission:remediation-required',
      type: 'source-admission-remediation',
      severity: 'high',
      region: null,
      observed: admission.remediationSourceIds,
      target: 'authorized use path or reviewed restrictive fallback for each source',
      detail: 'One or more reviewed legacy sources have permission/contract restrictions that require explicit remediation rather than silent removal or assumption.',
    });
  }

  return gaps.sort((a, b) => a.id.localeCompare(b.id));
}

function summarizeGroups(groups, keyName, enrich = () => ({})) {
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, members]) => ({
      [keyName]: key,
      sourceCount: members.length,
      sourceIds: members.map(source => source.sourceId).sort(),
      ...enrich(members),
    }));
}

function groupSources(sources, field) {
  return sources.reduce((groups, source) => {
    const key = source[field] || 'unknown';
    groups[key] ||= [];
    groups[key].push(source);
    return groups;
  }, {});
}

function roundRatio(value) {
  return Math.round(value * 10000) / 10000;
}

// Deterministic coverage inventory derived from the canonical news source contract.
// This module intentionally does not alter feed fetching or cache identity.

import { SOURCES, slugifySourceName } from '../api/news.js';

export const COVERAGE_POLICY = Object.freeze({
  minimumSourcesPerRegion: 2,
  portfolioEnglishConcentrationThreshold: 0.8,
});

export function buildCoverageInventory(sources = SOURCES) {
  const normalizedSources = sources
    .map(source => ({
      sourceId: slugifySourceName(source.name),
      name: source.name,
      region: source.region,
      lang: source.lang,
    }))
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  const regionGroups = groupSources(normalizedSources, 'region');
  const languageGroups = groupSources(normalizedSources, 'lang');

  const regions = Object.entries(regionGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, members]) => ({
      region,
      sourceCount: members.length,
      languageCount: new Set(members.map(source => source.lang)).size,
      languages: [...new Set(members.map(source => source.lang))].sort(),
      sourceIds: members.map(source => source.sourceId).sort(),
    }));

  const languages = Object.entries(languageGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lang, members]) => ({
      lang,
      sourceCount: members.length,
      sourceIds: members.map(source => source.sourceId).sort(),
    }));

  const gaps = buildGapSignals(normalizedSources, regions);
  const englishSources = normalizedSources.filter(source => source.lang === 'en').length;

  return {
    totalSources: normalizedSources.length,
    totalRegions: regions.length,
    totalLanguages: languages.length,
    englishSourceShare:
      normalizedSources.length === 0 ? 0 : roundRatio(englishSources / normalizedSources.length),
    nonEnglishSources: normalizedSources
      .filter(source => source.lang !== 'en')
      .map(source => source.sourceId),
    regions,
    languages,
    gaps,
  };
}

function buildGapSignals(sources, regions) {
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

  return gaps.sort((a, b) => a.id.localeCompare(b.id));
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

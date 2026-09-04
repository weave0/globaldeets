// Initial UN M49-backed place seed for countries represented by the current news-source origins.
// This is intentionally incomplete; it establishes the identity/import contract before a full M49 snapshot.

import { createM49PlaceEntity } from './intelligence-model.js';

export const M49_SOURCE_URL = 'https://unstats.un.org/unsd/methodology/m49/overview/';
export const M49_SEED_REVIEWED_AT = '2026-09-03';

export const M49_SEED_METADATA = Object.freeze({
  standard: 'United Nations Statistics Division M49',
  sourceUrl: M49_SOURCE_URL,
  reviewedAt: M49_SEED_REVIEWED_AT,
  complete: false,
  scope: 'countries represented by current news-source provenance origins',
  runtimeFetchRequired: false,
});

export const M49_PLACE_SEED = Object.freeze([
  seed('Australia', '036', 'AU', 'AUS', '009', 'Oceania', '053', 'Australia and New Zealand'),
  seed('France', '250', 'FR', 'FRA', '150', 'Europe', '155', 'Western Europe'),
  seed('Germany', '276', 'DE', 'DEU', '150', 'Europe', '155', 'Western Europe'),
  seed('India', '356', 'IN', 'IND', '142', 'Asia', '034', 'Southern Asia'),
  seed('Japan', '392', 'JP', 'JPN', '142', 'Asia', '030', 'Eastern Asia'),
  seed(
    'Kenya',
    '404',
    'KE',
    'KEN',
    '002',
    'Africa',
    '202',
    'Sub-Saharan Africa',
    '014',
    'Eastern Africa'
  ),
  seed(
    'Nigeria',
    '566',
    'NG',
    'NGA',
    '002',
    'Africa',
    '202',
    'Sub-Saharan Africa',
    '011',
    'Western Africa'
  ),
  seed('Pakistan', '586', 'PK', 'PAK', '142', 'Asia', '034', 'Southern Asia'),
  seed('Qatar', '634', 'QA', 'QAT', '142', 'Asia', '145', 'Western Asia'),
  seed('Republic of Korea', '410', 'KR', 'KOR', '142', 'Asia', '030', 'Eastern Asia'),
  seed('Singapore', '702', 'SG', 'SGP', '142', 'Asia', '035', 'South-eastern Asia'),
  seed('Türkiye', '792', 'TR', 'TUR', '142', 'Asia', '145', 'Western Asia'),
  seed('Ukraine', '804', 'UA', 'UKR', '150', 'Europe', '151', 'Eastern Europe'),
  seed(
    'United Kingdom of Great Britain and Northern Ireland',
    '826',
    'GB',
    'GBR',
    '150',
    'Europe',
    '154',
    'Northern Europe'
  ),
  seed(
    'United States of America',
    '840',
    'US',
    'USA',
    '019',
    'Americas',
    '021',
    'Northern America'
  ),
  seed(
    'Uruguay',
    '858',
    'UY',
    'URY',
    '019',
    'Americas',
    '419',
    'Latin America and the Caribbean',
    '005',
    'South America'
  ),
].sort((a, b) => a.standardIds.m49.localeCompare(b.standardIds.m49)));

export function getSeedPlaceByIsoAlpha2(code) {
  const normalized = String(code || '').trim().toUpperCase();
  return M49_PLACE_SEED.find(place => place.standardIds.isoAlpha2 === normalized) || null;
}

export function getSeedPlaceByM49(code) {
  const normalized = String(code || '').trim().padStart(3, '0');
  return M49_PLACE_SEED.find(place => place.standardIds.m49 === normalized) || null;
}

function seed(
  displayName,
  m49,
  isoAlpha2,
  isoAlpha3,
  regionCode,
  regionName,
  subregionCode,
  subregionName,
  intermediateRegionCode = null,
  intermediateRegionName = null
) {
  return createM49PlaceEntity({
    displayName,
    m49,
    isoAlpha2,
    isoAlpha3,
    evidenceRefs: [M49_SOURCE_URL],
    reviewedAt: M49_SEED_REVIEWED_AT,
    attributes: {
      m49Region: { code: regionCode, name: regionName },
      m49Subregion: { code: subregionCode, name: subregionName },
      m49IntermediateRegion:
        intermediateRegionCode && intermediateRegionName
          ? { code: intermediateRegionCode, name: intermediateRegionName }
          : null,
    },
  });
}

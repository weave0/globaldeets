// GD-054: article-specific, reviewed distribution evidence. No inferred edges.
import { SOURCE_PROVENANCE } from './news-source-provenance.js';

export const DISTRIBUTION_SCHEMA_VERSION = 1;
export const DISTRIBUTION_SCOPE = 'reviewed-article-pairs-only';

// Explicit article hosts, not RSS proxy hosts or arbitrary domains. Expand only
// alongside reviewed evidence and the existing source-admission contract.
export const ARTICLE_HOSTS = Object.freeze({
  ap: ['apnews.com'],
  guardian: ['www.theguardian.com'],
  calmatters: ['calmatters.org'],
  'minnesota-reformer': ['minnesotareformer.com'],
});

export const DISTRIBUTION_RECORDS = Object.freeze([
  {
    "id": "ap-guardian-sam-moore-2025-01",
    "status": "active",
    "relation": "wire-attributed-version",
    "title": "Sam Moore obituary",
    "publishedOn": "2025-01-11",
    "reviewedAt": "2026-11-25",
    "origin": {
      "sourceId": "ap",
      "url": "https://apnews.com/article/obituary-sam-moore-bcdf09de45e2475a8c016d30b4297709"
    },
    "republication": {
      "sourceId": "guardian",
      "url": "https://www.theguardian.com/music/2025/jan/11/soul-man-singer-sam-moore-dies-aged-89-from-surgery-complications"
    },
    "evidenceSummary": "The Guardian explicitly credits Associated Press in Florida; its report corresponds to the AP-published obituary, with editorial differences. This establishes the attributed article relationship, not a licensing contract or an identical version."
  },
]);

const TYPES = new Set(['wire-attributed-version', 'declared-republication']);
const STATES = new Set(['active', 'withdrawn']);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function endpoint(value, sourceIds) {
  if (!value || !sourceIds.has(value.sourceId) || typeof value.url !== 'string' ||
      value.url.length > 2048) return false;
  try {
    const url = new URL(value.url);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !url.port && !url.hash && url.pathname !== '/' &&
      url.href === value.url && (ARTICLE_HOSTS[value.sourceId] || []).includes(url.hostname);
  } catch { return false; }
}

// Validation proves registry shape and constraints, not the truth of the external
// evidence. A dated review of both exact article pages is a separate admission step.
export function validateDistributionRecords(records = DISTRIBUTION_RECORDS, sources = SOURCE_PROVENANCE) {
  if (!Array.isArray(records) || !Array.isArray(sources)) return { valid: false, errors: ['registry-array-required'] };
  const sourceIds = new Set(sources.map(source => source?.sourceId));
  const errors = [];
  const ids = new Set();
  const activeTargets = new Set();
  const activeOrigins = new Set();
  const pairs = new Set();
  for (const entry of records) {
    if (!entry || !ID.test(entry.id || '') || ids.has(entry.id)) {
      errors.push('invalid-or-duplicate-id'); continue;
    }
    ids.add(entry.id);
    if (!TYPES.has(entry.relation) || !STATES.has(entry.status) ||
        !text(entry.title, 180) || !text(entry.evidenceSummary, 600) ||
        !date(entry.publishedOn) || !date(entry.reviewedAt) || entry.reviewedAt < entry.publishedOn ||
        !endpoint(entry.origin, sourceIds) || !endpoint(entry.republication, sourceIds) ||
        entry.origin.sourceId === entry.republication.sourceId ||
        entry.origin.url === entry.republication.url) {
      errors.push('invalid-record:' + entry.id); continue;
    }
    if (entry.status === 'withdrawn') {
      if (!date(entry.withdrawnAt) || entry.withdrawnAt < entry.reviewedAt ||
          !text(entry.withdrawalReason, 600)) errors.push('invalid-withdrawal:' + entry.id);
      continue;
    }
    if (entry.withdrawnAt != null || entry.withdrawalReason != null) errors.push('active-with-withdrawal:' + entry.id);
    const from = entry.origin.url;
    const to = entry.republication.url;
    const pair = from + '\u001f' + to;
    if (pairs.has(pair) || activeTargets.has(to)) errors.push('duplicate-or-conflicting-target:' + entry.id);
    pairs.add(pair);
    activeOrigins.add(from);
    activeTargets.add(to);
  }
  // V1 supports only direct, one-hop relationships; no chains or cycles.
  if ([...activeOrigins].some(url => activeTargets.has(url))) errors.push('chained-or-cyclic-active-record');
  return { valid: errors.length === 0, errors };
}

export function distributionPayload(sourceFingerprint, records = DISTRIBUTION_RECORDS, sources = SOURCE_PROVENANCE) {
  if (!validateDistributionRecords(records, sources).valid) return null;
  return {
    schemaVersion: DISTRIBUTION_SCHEMA_VERSION, scope: DISTRIBUTION_SCOPE,
    sourceFingerprint, validation: { valid: true },
    records: records.map(entry => ({
      id: entry.id, status: entry.status, relation: entry.relation, title: entry.title,
      publishedOn: entry.publishedOn, reviewedAt: entry.reviewedAt,
      origin: { ...entry.origin }, republication: { ...entry.republication },
      evidenceSummary: entry.evidenceSummary,
      ...(entry.status === 'withdrawn' ? { withdrawnAt: entry.withdrawnAt, withdrawalReason: entry.withdrawalReason } : {}),
    })),
  };
}

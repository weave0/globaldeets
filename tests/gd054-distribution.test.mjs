import assert from 'node:assert/strict';
import test from 'node:test';
import { DISTRIBUTION_RECORDS, validateDistributionRecords, distributionPayload } from '../functions/lib/article-distribution.js';
import { onRequestGet } from '../functions/api/news/syndication.js';
import { SOURCES, SOURCE_FINGERPRINT } from '../functions/api/news.js';

const seed = DISTRIBUTION_RECORDS[0];
const clone = () => structuredClone(seed);

test('reviewed records have exact distinct admitted endpoints and bounded evidence', () => {
  assert.equal(SOURCES.length, 21);
  assert.equal(validateDistributionRecords().valid, true);
  assert.equal(seed.origin.sourceId, 'ap');
  assert.equal(seed.republication.sourceId, 'guardian');
  assert.equal(seed.relation, 'wire-attributed-version');
});
test('unsafe URLs, mismatched source identity, malformed dates and empty evidence fail closed', () => {
  for (const edit of [
    e => { e.origin.url = 'javascript:alert(1)'; },
    e => { e.origin.url = 'https://apnews.com.evil.example/article'; },
    e => { e.origin.url = 'https://user@apnews.com/article'; },
    e => { e.origin.url += '#anchor'; },
    e => { e.origin.url = 'https://apnews.com/'; },
    e => { e.origin.sourceId = 'guardian'; },
    e => { e.reviewedAt = '2026-02-31'; },
    e => { e.reviewedAt = '2024-01-01'; },
    e => { e.evidenceSummary = ''; },
    e => { e.relation = 'same-headline'; },
  ]) {
    const entry = clone(); edit(entry);
    assert.equal(validateDistributionRecords([entry]).valid, false);
    assert.equal(distributionPayload(SOURCE_FINGERPRINT, [entry]), null);
  }
});
test('duplicate targets, reversed links, and ambiguous chains fail closed', () => {
  const repeated = { ...clone(), id: 'different-id' };
  assert.equal(validateDistributionRecords([seed, repeated]).valid, false);
  const reversed = { ...clone(), id: 'reverse-id', origin: seed.republication, republication: seed.origin };
  assert.equal(validateDistributionRecords([seed, reversed]).valid, false);
});
test('withdrawn records require dated correction history and are distinctly marked', () => {
  const entry = { ...clone(), status: 'withdrawn' };
  assert.equal(validateDistributionRecords([entry]).valid, false);
  entry.withdrawnAt = '2026-11-25';
  entry.withdrawalReason = 'Evidence no longer supports the relationship.';
  assert.equal(validateDistributionRecords([entry]).valid, true);
  assert.equal(distributionPayload(SOURCE_FINGERPRINT, [entry]).records[0].status, 'withdrawn');
});
test('live authority is no-store, fingerprint-bound, and separate from admission', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.match(response.headers.get('CDN-Cache-Control'), /no-store/);
  const data = await response.json();
  assert.equal(data.sourceFingerprint, SOURCE_FINGERPRINT);
  assert.equal(data.scope, 'reviewed-article-pairs-only');
  assert.equal(data.validation.valid, true);
  assert.equal(data.records.length, DISTRIBUTION_RECORDS.length);
});

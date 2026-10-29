import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectFeed, inspectXmlStructure, probeResearchCandidate, MAX_FEED_BYTES } from '../tools/source-research-probe.mjs';
import { SOURCE_RESEARCH_CANDIDATES, SOURCE_ADMISSIONS } from '../functions/lib/news-source-admission.js';
import { SOURCES } from '../functions/api/news.js';

const candidate = SOURCE_RESEARCH_CANDIDATES.find(entry => entry.candidateId === 'global-voices-original');
const now = new Date('2026-10-28T12:00:00Z');
const rss = '<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title>' +
  '<item><title>A</title><link>https://example.org/one</link><guid>a</guid><pubDate>Wed, 28 Oct 2026 09:00:00 GMT</pubDate><dc:creator>Reporter</dc:creator></item>' +
  '<item><title>B</title><link>https://example.org/one#fragment</link><guid>b</guid><pubDate>bad date</pubDate></item>' +
  '</channel></rss>';
function mockFetch(text, opts = {}) {
  return async (_url, request) => {
    assert.equal(request.redirect, 'manual');
    assert.equal(request.method, 'GET');
    return new Response(text, opts);
  };
}
test('bounded RSS metadata distinguishes duplicates, dates and origin signals from certified rights', () => {
  const report = inspectFeed(rss, { now });
  assert.equal(report.format, 'rss');
  assert.equal(report.sampledItems, 2);
  assert.equal(report.duplicateCanonicalLinks, 1);
  assert.equal(report.parseableDates, 1);
  assert.equal(report.invalidDates, 1);
  assert.equal(report.newestSampleAgeHours, 3);
  assert.equal(report.itemReuseRightsCertified, false);
  assert.equal(report.itemOriginCertified, false);
});
test('Atom alternate links and future dates are observed, not admitted', () => {
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>id1</id><link rel="alternate" href="https://example.org/story"/><updated>2026-10-30T00:00:00Z</updated></entry></feed>';
  const report = inspectFeed(atom, { now });
  assert.equal(report.format, 'atom');
  assert.equal(report.canonicalLinks, 1);
  assert.equal(report.futureDated, 1);
});
test('invalid XML, DTD, HTML and non-root markup fail closed', () => {
  for (const xml of ['<html></html>', '<rss><channel></rss>', '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', '<rss/><rss/>', '<rss>&unresolved;</rss>', '<rss><item></rss>', 'not xml']) {
    assert.throws(() => inspectXmlStructure(xml));
  }
});
test('feed evidence never promotes a research candidate and preserves 21 source inventory', async () => {
  const initialAdmissions = SOURCE_ADMISSIONS.length;
  const initialSources = SOURCES.length;
  const report = await probeResearchCandidate(candidate, { now, fetchImpl: mockFetch(rss, { headers: { 'content-type': 'application/rss+xml' } }) });
  assert.equal(report.observation, 'xml-structure-observed');
  assert.equal(report.productionEligible, false);
  assert.equal(report.itemReuseRightsCertified, false);
  assert.equal(report.evidence.sampledItems, 2);
  assert.equal(SOURCE_ADMISSIONS.length, initialAdmissions);
  assert.equal(SOURCES.length, initialSources);
  assert.equal(initialSources, 21);
});
test('redirects are recorded and never followed; HTML is rejected', async () => {
  const redirect = await probeResearchCandidate(candidate, { now, fetchImpl: mockFetch('', { status: 302, headers: { location: 'https://example.net/' } }) });
  assert.equal(redirect.observation, 'redirect-requires-review');
  const html = await probeResearchCandidate(candidate, { now, fetchImpl: mockFetch('<html/>', { headers: { 'content-type': 'text/html' } }) });
  assert.equal(html.observation, 'html-instead-of-feed');
});
test('fetch failure and stream size are explicitly reported', async () => {
  const failure = await probeResearchCandidate(candidate, { now, fetchImpl: async () => { throw new Error('network unavailable'); } });
  assert.equal(failure.observation, 'probe-failed');
  const big = await probeResearchCandidate(candidate, { now, maxBytes: 100, fetchImpl: mockFetch(rss, { headers: { 'content-type': 'application/rss+xml' } }) });
  assert.equal(big.observation, 'probe-failed');
  assert.match(big.error, /evidence cap/);
  assert.equal(MAX_FEED_BYTES, 524288);
});
test('unknown candidates cannot trigger network requests', async () => {
  let called = false;
  await assert.rejects(() => probeResearchCandidate({ ...candidate, candidateId: 'unknown' }, { fetchImpl: async () => { called = true; } }));
  assert.equal(called, false);
});

test('publisher RSS directory is not silently probed as a feed', async () => {
  const directory = SOURCE_RESEARCH_CANDIDATES.find(entry => entry.candidateId === 'rnz-pacific');
  assert.equal(directory.endpointType, 'rss-directory');
  let networkCalled = false;
  const report = await probeResearchCandidate(directory, {
    now,
    fetchImpl: async () => { networkCalled = true; throw new Error('should not fetch directory'); },
  });
  assert.equal(networkCalled, false);
  assert.equal(report.observation, 'feed-endpoint-not-established');
  assert.equal(report.httpStatus, undefined);
  assert.equal(report.productionEligible, false);
});

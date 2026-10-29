import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectFeed, inspectXmlStructure, sanitizeFeedForMetadata, probeResearchCandidate, MAX_FEED_BYTES } from '../tools/source-research-probe.mjs';
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

test('lookalike directory candidate cannot override its governed endpoint type', async () => {
  const directory = SOURCE_RESEARCH_CANDIDATES.find(entry => entry.candidateId === 'rnz-pacific');
  let called = false;
  await assert.rejects(() => probeResearchCandidate({ ...directory, endpointType: 'rss' }, {
    now,
    fetchImpl: async () => { called = true; return new Response(rss); },
  }), /exact governed research registry entry/);
  assert.equal(called, false);
});

test('CDATA bylines remain observable while markup-looking article content cannot invent feed items', () => {
  const feed = '<?xml version="1.0"?><rss><channel>' +
    '<item><title><![CDATA[<item><dc:creator>Fake Author</dc:creator></item>]]></title>' +
    '<link>https://news.example/story</link>' +
    '<dc:creator><![CDATA[Real Reporter]]></dc:creator>' +
    '<pubDate>Wed, 28 Oct 2026 10:00:00 GMT</pubDate>' +
    '<content:encoded><![CDATA[<entry><rights>CC BY</rights></entry><source>other</source>]]></content:encoded>' +
    '</item></channel></rss>';
  const report = inspectFeed(feed, { now });
  assert.equal(report.sampledItems, 1, 'CDATA must not forge additional items');
  assert.equal(report.creatorSignals, 1, 'a genuine CDATA byline must survive');
  assert.equal(report.attributionLinkPairs, 1);
  assert.equal(report.originSignals, 0, 'markup in article body is not provenance evidence');
  assert.equal(report.itemRightsSignals, 0, 'markup in article body is not licensing evidence');
  assert.equal(report.itemsRequiringIndividualProvenanceReview, 1);
  assert.equal(report.autoAdmittableItems, 0);
  assert.equal(report.itemOriginCertified, false);
  assert.equal(report.itemReuseRightsCertified, false);
  assert.ok(sanitizeFeedForMetadata(feed).includes('&lt;entry&gt;'));
  assert.ok(!JSON.stringify(report).includes('Real Reporter'), 'no author content retained');
  assert.ok(!JSON.stringify(report).includes('news.example/story'), 'no story URL retained');
});

test('author/link completeness is counted without inferring that source owns the material', () => {
  const feed = '<rss><channel>' +
    '<item><link>https://example.org/first</link><dc:creator><![CDATA[First]]></dc:creator></item>' +
    '<item><link>https://example.org/second</link><dc:creator><![CDATA[ ]]></dc:creator></item>' +
    '<item><dc:creator><![CDATA[Third]]></dc:creator><source>Other Wire</source><copyright>Some publisher</copyright></item>' +
    '</channel></rss>';
  const report = inspectFeed(feed, { now });
  assert.equal(report.sampledItems, 3);
  assert.equal(report.creatorSignals, 2);
  assert.equal(report.attributionLinkPairs, 1);
  assert.equal(report.missingCreatorSignals, 1);
  assert.equal(report.missingCanonicalLinks, 1);
  assert.equal(report.originSignals, 1);
  assert.equal(report.itemRightsSignals, 1);
  assert.equal(report.itemsRequiringIndividualProvenanceReview, 3);
  assert.equal(report.autoAdmittableItems, 0);
});

test('Atom nested author name is an attribution signal, not a clearance decision', () => {
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom">' +
    '<entry><link rel="alternate" href="https://example.net/first"/><author><name>Example Writer</name></author></entry>' +
    '</feed>';
  const report = inspectFeed(atom, { now });
  assert.equal(report.creatorSignals, 1);
  assert.equal(report.attributionLinkPairs, 1);
  assert.equal(report.autoAdmittableItems, 0);
});

test('CDATA containing a fake root closure does not bypass XML validation or create extra entries', () => {
  const rssCdata = '<rss><channel><item><description><![CDATA[</item></channel></rss><rss>]]></description>' +
    '<link>https://example.net/a</link></item></channel></rss>';
  assert.equal(inspectFeed(rssCdata, { now }).sampledItems, 1);
});

test('publisher-host differences are review hints only, with no item-level leakage', () => {
  const feed = '<rss><channel>' +
    '<item><link>https://news.example.org/a</link><dc:creator>A</dc:creator></item>' +
    '<item><link>https://sub.news.example.org/b</link></item>' +
    '<item><link>https://external.example.net/partner</link></item>' +
    '<item><link>https://news.example.org.attacker.example.net/imposter</link></item>' +
    '</channel></rss>';
  const result = inspectFeed(feed, { now, publisherHost: 'news.example.org' });
  assert.equal(result.samePublisherHostLinks, 2);
  assert.equal(result.offPublisherHostLinks, 2);
  assert.equal(result.itemsRequiringIndividualProvenanceReview, 4);
  assert.equal(result.autoAdmittableItems, 0);
  assert.equal(result.itemOriginCertified, false);
  assert.ok(!JSON.stringify(result).includes('external.example.net'));
  assert.equal(inspectFeed(feed, { now }).samePublisherHostLinks, null, 'untested host evidence must remain unknown');
});

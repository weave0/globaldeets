import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARTICLE_ORIGIN_TRACE_VERSION, extractFeedOriginHint, addExactArticleLinkOverlap,
} from '../functions/lib/article-origin-trace.js';
import {
  SOURCES, fetchAllSources, applyAdmissionPolicy, regenerateFeed, getFeedCacheIdentity,
} from '../functions/api/news.js';
import * as admission from '../functions/lib/news-source-admission.js';

const article = 'https://example.org/story-one';
const hint = (block, link = article) => extractFeedOriginHint(block, link);

test('missing feed origin metadata is unresolved, not original reporting', () => {
  const result = hint('<title>News</title><description>Story with no attribution marker</description>');
  assert.equal(result.version, ARTICLE_ORIGIN_TRACE_VERSION);
  assert.equal(result.status, 'not-recorded');
  assert.equal(result.originalReportingVerified, false);
  assert.equal(result.syndicationVerified, false);
  assert.equal(result.referenceUrl, null);
});

test('direct feed-source and original-link markers produce typed, limited hints', () => {
  const self = hint('<source url="https://example.org/feed.xml">Source</source>');
  assert.equal(self.status, 'same-article-host-reference');
  assert.equal(self.markerKind, 'feed-source');
  const external = hint('<dc:source>https://other.example/article</dc:source>');
  assert.equal(external.status, 'external-host-reference');
  assert.equal(external.referenceUrl, 'https://other.example/article');
  assert.equal(external.originalReportingVerified, false);
  const orig = hint('<feedburner:origLink>https://example.org/story-one</feedburner:origLink>');
  assert.equal(orig.status, 'same-article-host-reference');
  assert.equal(orig.markerKind, 'original-link');
});

test('CDATA, nested article HTML, and comments cannot forge direct source attribution', () => {
  const xml = '<description><![CDATA[<source url="https://bad.example/">Claimed source</source>]]></description>' +
    '<content:encoded><source url="https://bad.example">Body source</source></content:encoded>' +
    '<!-- <dc:source>https://bad.example</dc:source> -->' +
    '<title>&lt;source url="https://bad.example"&gt;</title>';
  assert.equal(hint(xml).status, 'not-recorded');
});

test('unsafe and conflicting hints fail closed', () => {
  for (const text of [
    '<source url="javascript:alert(1)"/>',
    '<source url="https://user:password@example.org/rss"/>',
    '<source>Wire service (no URL)</source>',
    '<source url="https://example.org.evil.test/stolen"/> <source url="https://example.org/feed"/>',
  ]) {
    const result = hint(text);
    assert.ok(['unresolved-marker', 'mixed-references'].includes(result.status), text);
    assert.equal(result.referenceUrl, null);
  }
  assert.equal(
    hint('<source url="https://example.org/feed"/><dc:source>https://other.example/news</dc:source>').status,
    'mixed-references'
  );
  assert.equal(
    hint('<source url="https://example.org/feed"/><feedburner:origLink>https://example.org/feed</feedburner:origLink>').status,
    'mixed-references'
  );
});

test('exact article URL overlap counts distinct feeds, never title similarity', () => {
  const items = [
    { sourceId: 'one', source: 'One', headline: 'An event', sourceUrl: article },
    { sourceId: 'two', source: 'Two', headline: 'Different words', sourceUrl: article },
    { sourceId: 'two', source: 'Two', headline: 'Duplicate within Two', sourceUrl: article },
    { sourceId: 'three', source: 'Three', headline: 'An event', sourceUrl: article + '?utm=1' },
    { sourceId: 'four', source: 'Four', headline: 'An event', sourceUrl: 'https://example.org/other' },
  ];
  addExactArticleLinkOverlap(items);
  assert.deepEqual(items[0].exactLinkOverlap, {
    matchType: 'exact-article-url', distinctPublisherCount: 2,
    otherPublishers: [{ sourceId: 'two', name: 'Two' }],
  });
  assert.equal(items[1].exactLinkOverlap.distinctPublisherCount, 2);
  assert.equal(items[2].exactLinkOverlap.distinctPublisherCount, 2);
  assert.equal(items[3].exactLinkOverlap, null);
  assert.equal(items[4].exactLinkOverlap, null);
});

test('the parser, admission boundary, and source-overlap pipeline stay connected', async t => {
  const savedFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = savedFetch; });
  const target = SOURCES.filter(source => ['Minnesota Reformer', 'CalMatters'].includes(source.name));
  assert.equal(target.length, 2);
  globalThis.fetch = async url => {
    const name = String(url).includes('minnesota') ? 'One' : 'Two';
    return new Response(
      '<rss><channel><item><title>Headline ' + name + '</title>' +
      '<link>' + article + '</link>' +
      '<source url="https://syndicator.example/entry">Partner reference</source>' +
      '<description>Summary of an example</description>' +
      '<pubDate>Wed, 18 Nov 2026 10:00:00 GMT</pubDate>' +
      '</item></channel></rss>',
      { status: 200, headers: { 'Content-Type': 'application/rss+xml' } }
    );
  };
  const result = await fetchAllSources(target);
  assert.equal(result.items.length, 2);
  assert.ok(result.items.every(item => item.feedOriginHint.status === 'external-host-reference'));
  const governed = await applyAdmissionPolicy(result.items);
  assert.equal(governed.items.length, 2);
  assert.ok(governed.items.every(item => item.feedOriginHint.version === ARTICLE_ORIGIN_TRACE_VERSION));
  const regenerated = await regenerateFeed(
    {}, getFeedCacheIdentity(admission.ADMISSION_FINGERPRINT), admission, target
  );
  assert.equal(regenerated.items.length, 2);
  assert.ok(regenerated.items.every(item => item.exactLinkOverlap?.distinctPublisherCount === 2));
  assert.equal(regenerated.items.every(item => item.sourceUrl === article), true);
});

test('a bounded provenance trace cannot enlarge the admitted source inventory', () => {
  assert.equal(SOURCES.length, 21);
  assert.equal(admission.SOURCE_ADMISSIONS.length, 21);
  const large = hint('a'.repeat(20001));
  assert.equal(large.status, 'unresolved-marker');
  assert.equal(large.referenceUrl, null);
});

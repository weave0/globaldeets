import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyItemSourceHints as classify } from '../tools/source-origin-signals.mjs';
import { SOURCE_ADMISSIONS, SOURCE_RESEARCH_CANDIDATES } from '../functions/lib/news-source-admission.js';
import { SOURCES } from '../functions/api/news.js';

const options = { publisherHost: 'globalvoices.org' };
test('missing provenance remains unresolved, never certified', () => {
  const result = classify('<title>Report</title><dc:creator>Writer</dc:creator>', options);
  assert.equal(result.status, 'unresolved');
  assert.equal(result.sourceMarkerPresent, false);
  assert.equal(result.productionEligible, false);
  assert.equal(result.itemOriginCertified, false);
  assert.equal(result.itemReuseRightsCertified, false);
});
test('explicit direct publisher source is a hint, not a certification', () => {
  const result = classify('<source url="https://globalvoices.org/feed/">GV</source>', options);
  assert.equal(result.status, 'publisher-source-hint');
  assert.equal(result.sourceMarkerPresent, true);
  assert.equal(result.itemOriginCertified, false);
});
test('external direct source hint distinguishes partner risk', () => {
  const result = classify('<source url="https://partner.example/news">Partner</source>', options);
  assert.equal(result.status, 'external-source-hint');
});
test('mixing publisher and partner sources is contradictory and fail-closed', () => {
  const result = classify('<source url="https://globalvoices.org/feed/">Publisher</source><dc:source>https://external.example/story</dc:source>', options);
  assert.equal(result.status, 'conflicting-source-hints');
  assert.equal(result.productionEligible, false);
});
test('unknown, invalid and untrusted source text never establish ownership', () => {
  for (const xml of [
    '<source>Wire partner</source>', '<source url="javascript:alert(1)">Publisher</source>',
    '<source url="https://globalvoices.org.attacker.example/origin"/>',
    '<source url="https://user:secret@globalvoices.org/feed"/>',
  ]) {
    const result = classify(xml, options);
    assert.notEqual(result.status, 'publisher-source-hint');
    assert.equal(result.productionEligible, false);
  }
});
test('CDATA and nested article content cannot forge source metadata', () => {
  const result = classify(
    '<description><![CDATA[<source url="https://partner.example/">Injected</source>]]></description>' +
    '<content:encoded><div><source url="https://partner.example/">Text</source></div></content:encoded>' +
    '<title>&lt;source url="https://partner.example/"&gt;</title>', options);
  assert.equal(result.status, 'unresolved');
  assert.equal(result.sourceMarkerPresent, false);
});
test('Atom nested source href is a hint, not proof of original reporting', () => {
  const result = classify('<source><id>https://partner.example/feed</id><link href="https://partner.example/feed"/></source>', options);
  assert.equal(result.status, 'external-source-hint');
});
test('hostname checks require dot boundary', () => {
  assert.equal(classify('<source url="https://sub.globalvoices.org/feed"/>', options).status, 'publisher-source-hint');
  assert.equal(classify('<source url="https://globalvoices.org.evil.example/feed"/>', options).status, 'external-source-hint');
  assert.equal(classify('<source url="https://globalvoices.org/feed"/>').status, 'unresolved');
});
test('outputs contain no article URLs, bylines or content; inventories unchanged', () => {
  const result = classify('<source url="https://partner.example/secret-story">Secret Reporter</source>', options);
  const json = JSON.stringify(result);
  assert.ok(!json.includes('partner.example'));
  assert.ok(!json.includes('Secret Reporter'));
  assert.equal(SOURCES.length, 21);
  assert.equal(SOURCE_ADMISSIONS.length, 21);
  assert.equal(SOURCE_RESEARCH_CANDIDATES.every(c => c.disposition === 'research'), true);
});

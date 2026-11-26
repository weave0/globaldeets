import assert from 'node:assert/strict';
import test from 'node:test';
import { SOURCE_RESEARCH_CANDIDATES, SOURCE_ADMISSIONS } from '../functions/lib/news-source-admission.js';
import { SOURCES } from '../functions/api/news.js';
import { PILOT_VERSION, PILOT_MAX_ITEMS, PILOT_MAX_BYTES, REVIEWED_ITEMS,
  collectPilotMetadata, inspectMultilingualPilot } from '../tools/multilingual-item-review.mjs';
import { probeResearchCandidate } from '../tools/source-research-probe.mjs';

const gv=SOURCE_RESEARCH_CANDIDATES.find(x=>x.candidateId==='global-voices-original');
const ab=SOURCE_RESEARCH_CANDIDATES.find(x=>x.candidateId==='agencia-brasil');
const now=new Date('2026-11-26T12:00:00Z');
const xml=items=>'<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>'+items+'</channel></rss>';
const item=(url='https://globalvoices.org/2026/11/25/example/',extra='',author='<![CDATA[Example Reporter]]>')=>
  '<item><title>Example title</title><link>'+url+'</link><dc:creator>'+author+'</dc:creator>'+
  '<pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate>'+extra+'</item>';
const original=xml(item());
const row=collectPilotMetadata(original,gv,{now}).rows[0];
const review={version:PILOT_VERSION,status:'reviewed',candidateId:gv.candidateId,url:row.url,
  title:row.title,author:row.author,publishedAt:row.publishedAt,snapshotSha256:row.snapshotSha256,
  articleEvidenceUrl:row.url,policyUrl:'https://globalvoices.org/about/global-voices-attribution-policy/',
  licenseUrl:'https://creativecommons.org/licenses/by/3.0/',language:'en',
  origin:'publisher-created-original',noThirdPartyRestrictions:true,publisherAttributionRetained:true,
  regularReuseScopeReviewed:true,scope:'original-headline-link-only',
  reviewedAt:'2026-11-26T10:00:00.000Z',reviewerNote:'Synthetic review fixture, not an actual publisher review.'};

test('structurally complete feed metadata is not rights clearance',()=>{
  const report=inspectMultilingualPilot(original,gv,{now});
  assert.equal(report.structurallyReady,1);
  assert.equal(report.reviewedForReleaseConsideration,0);
  assert.equal(report.blockers['no-current-exact-item-review'],1);
  assert.equal(report.publicItems,0);
  assert.equal(report.productionEligible,false);
  assert.equal(REVIEWED_ITEMS.length,0);
  for(const value of [row.url,row.title,row.author,row.snapshotSha256]) assert.ok(!JSON.stringify(report).includes(value));
});
test('only exact current human-review fixtures match, never becoming public',()=>{
  const report=inspectMultilingualPilot(original,gv,{now,reviews:[review]});
  assert.equal(report.reviewedForReleaseConsideration,1);
  assert.equal(report.publicItems,0);
  assert.equal(report.productionEligible,false);
  assert.equal(report.translationCalls,0);
  for(const change of [{status:'withdrawn'},{snapshotSha256:'0'.repeat(64)},{author:'Other'},
    {reviewedAt:'2026-11-01T10:00:00.000Z'},{reviewedAt:'2026-11-27T10:00:00.000Z'},
    {origin:'translated-edition'},{noThirdPartyRestrictions:false},{regularReuseScopeReviewed:false},
    {scope:'excerpt-and-translation'},{licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
    {articleEvidenceUrl:'https://globalvoices.org/'},{language:'fr'}]){
    assert.equal(inspectMultilingualPilot(original,gv,{now,reviews:[{...review,...change}]}).reviewedForReleaseConsideration,0);
  }
  assert.equal(inspectMultilingualPilot(original,gv,{now,reviews:[review,review]}).reviewedForReleaseConsideration,0);
  assert.equal(inspectMultilingualPilot(xml(item(row.url,'<description>Updated content</description>')),gv,{now,reviews:[review]}).reviewedForReleaseConsideration,0);
});
test('direct metadata cannot be forged by nested items, content, ambiguous fields or wrong hosts',()=>{
  const nested=xml('<description>'+item()+'</description>'+item(row.url,
    '<description><![CDATA[<dc:creator>Fake</dc:creator><item>Fake</item>]]></description>',''));
  const result=inspectMultilingualPilot(nested,gv,{now});
  assert.equal(result.sampledItems,1);
  assert.equal(result.structurallyReady,0);
  assert.equal(result.blockers['missing-or-ambiguous-byline'],1);
  const hostile=xml(item('https://globalvoices.org.evil.test/story')+
    item('https://user@globalvoices.org/story')+item('https://globalvoices.org/story#fragment')+
    item(row.url,'<author>Second</author>'));
  const blocked=inspectMultilingualPilot(hostile,gv,{now});
  assert.equal(blocked.structurallyReady,0);
  assert.equal(blocked.blockers['unresolved-exact-publisher-url'],3);
  assert.equal(blocked.blockers['missing-or-ambiguous-byline'],1);
});
test('source markers, unresolved rights, translations and duplicate links block even reviewed items',()=>{
  for(const extra of ['<source url="https://other.example/">Partner</source>',
    '<dc:rights>All rights reserved</dc:rights>','<cc:license/>','<dc:language>fr</dc:language>',
    '<originalLink>https://fr.globalvoices.org/story</originalLink>']){
    const content=xml(item(row.url,extra));
    const changed=collectPilotMetadata(content,gv,{now}).rows[0];
    assert.equal(inspectMultilingualPilot(content,gv,{now,reviews:[{...review,snapshotSha256:changed.snapshotSha256}]}).reviewedForReleaseConsideration,0);
  }
  const duplicate=inspectMultilingualPilot(xml(item()+item()),gv,{now,reviews:[review]});
  assert.equal(duplicate.blockers['duplicate-article-url'],2);
  assert.equal(duplicate.structurallyReady,0);
});
test('Agencia Brasil remains blocked even with an otherwise complete mock review',()=>{
  const feed=xml(item('https://agenciabrasil.ebc.com.br/geral/noticia/2026-11/example'));
  const brazil=collectPilotMetadata(feed,ab,{now}).rows[0];
  const result=inspectMultilingualPilot(feed,ab,{now,reviews:[{...review,...brazil,
    articleEvidenceUrl:brazil.url,policyUrl:'https://agenciabrasil.ebc.com.br/sobre',licenseUrl:null,language:'pt'}]});
  assert.equal(result.structurallyReady,1);
  assert.equal(result.blockers['publisher-use-scope-unresolved'],1);
  assert.equal(result.reviewedForReleaseConsideration,0);
});
test('byte, item, candidate and nesting bounds are enforced',()=>{
  const many=inspectMultilingualPilot(xml(item().repeat(PILOT_MAX_ITEMS+5)),gv,{now});
  assert.equal(many.sampledItems,PILOT_MAX_ITEMS);
  assert.equal(many.unexaminedItems,5);
  assert.throws(()=>inspectMultilingualPilot('x'.repeat(PILOT_MAX_BYTES+1),gv,{now}),/byte cap/);
  assert.throws(()=>inspectMultilingualPilot(original,{...gv},{now}),/governed pilot/);
  assert.throws(()=>inspectMultilingualPilot('<!DOCTYPE rss><rss/>',gv,{now}));
  assert.throws(()=>inspectMultilingualPilot('<rss><channel></rss>',gv,{now}));
});
test('existing bounded network probe emits aggregate readiness only without source changes',async()=>{
  let calls=0;
  const report=await probeResearchCandidate(gv,{now,fetchImpl:async(url,options)=>{
    calls++;
    assert.equal(url,gv.endpointUrl);
    assert.equal(options.redirect,'manual');
    return new Response(original,{headers:{'content-type':'application/rss+xml'}});
  }});
  assert.equal(calls,1);
  assert.equal(report.multilingualPilot.sampledItems,1);
  assert.equal(report.multilingualPilot.publicItems,0);
  assert.equal(report.productionEligible,false);
  assert.equal(SOURCES.length,21);
  assert.equal(SOURCE_ADMISSIONS.length,21);
  assert.ok(!JSON.stringify(report).includes(row.author));
  assert.ok(!JSON.stringify(report).includes(row.url));
});

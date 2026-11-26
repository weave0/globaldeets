import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscovery, validateDiscovery, RESEARCH_DISCOVERY, DIRECT_DISCOVERY, safeDiscoveryUrl } from '../functions/lib/source-discovery.js';
import { onRequestGet } from '../functions/api/news/discovery.js';
import { SOURCES, SOURCE_FINGERPRINT } from '../functions/api/news.js';
import { SOURCE_RESEARCH_CANDIDATES, ADMISSION_FINGERPRINT } from '../functions/lib/news-source-admission.js';

test('directory preserves canonical feed inventory and separates additional links',()=>{
  const result=buildDiscovery();
  assert.ok(result);
  assert.equal(result.counts.monitored,SOURCES.length);
  assert.equal(SOURCES.length,21);
  assert.equal(result.counts.research,SOURCE_RESEARCH_CANDIDATES.length);
  assert.equal(result.counts.linkOnly,DIRECT_DISCOVERY.length);
  assert.deepEqual(result.feedLanguages,['en','ja']);
  assert.equal(result.entries.filter(x=>x.status==='monitored'&&x.languages[0]==='en').length,20);
  assert.ok(result.entries.filter(x=>x.status==='link-only').every(x=>x.rights==='not-reviewed'));
  assert.ok(result.entries.filter(x=>x.status==='research').every(x=>x.health==='not-certified'));
  assert.equal(result.entries.find(x=>x.id==='al-jazeera-arabic').relatedSourceId,'al-jazeera');
  assert.equal(result.entries.filter(x=>x.id==='global-voices-original').length,1);
  assert.ok(result.entries.find(x=>x.id==='global-voices-original').languages.includes('sw'));
});
test('research discovery rejects missing metadata, duplicate ids, unreviewed candidates, unsafe links and invented related publishers',()=>{
  assert.equal(validateDiscovery().valid,true);
  assert.equal(validateDiscovery(RESEARCH_DISCOVERY.slice(1),DIRECT_DISCOVERY).valid,false);
  assert.equal(validateDiscovery(RESEARCH_DISCOVERY,[...DIRECT_DISCOVERY,DIRECT_DISCOVERY[0]]).valid,false);
  assert.equal(validateDiscovery(RESEARCH_DISCOVERY,DIRECT_DISCOVERY.map((x,i)=>i===0?{...x,url:'javascript:alert(1)'}:x)).valid,false);
  assert.equal(validateDiscovery(RESEARCH_DISCOVERY,DIRECT_DISCOVERY.map((x,i)=>i===0?{...x,relatedSourceId:'invented'}:x)).valid,false);
  assert.equal(validateDiscovery(RESEARCH_DISCOVERY,DIRECT_DISCOVERY,SOURCE_RESEARCH_CANDIDATES.map((x,i)=>i===0?{...x,disposition:'production'}:x)).valid,false);
  assert.equal(validateDiscovery(RESEARCH_DISCOVERY,DIRECT_DISCOVERY.map((x,i)=>i===0?{...x,reviewedAt:'2026-02-30'}:x)).valid,false);
  for(const url of ['http://example.org/','javascript:alert(1)','https://user:pass@example.org/','https://localhost/','https://127.0.0.1/','https://example.org:8080/']) assert.equal(safeDiscoveryUrl(url),false);
});
test('live authority is uncached and carries both canonical fingerprints',async()=>{
  const response=await onRequestGet();
  assert.equal(response.status,200);
  assert.match(response.headers.get('Cache-Control'),/no-store/);
  const data=await response.json();
  assert.equal(data.sourceFingerprint,SOURCE_FINGERPRINT);
  assert.equal(data.admissionFingerprint,ADMISSION_FINGERPRINT);
  assert.ok(Object.values(data.rules).every(value=>value===false));
});

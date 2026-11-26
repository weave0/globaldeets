// GD-057: research-only exact-snapshot review. No production imports, writes,
// translation calls or approval based on feed metadata.
import { createHash } from 'node:crypto';
import { SOURCE_RESEARCH_CANDIDATES } from '../functions/lib/news-source-admission.js';
import { classifyItemSourceHints } from './source-origin-signals.mjs';

export const PILOT_VERSION = 'gd057-shadow-v1';
export const PILOT_MAX_BYTES = 512 * 1024;
export const PILOT_MAX_ITEMS = 30;
export const MAX_REVIEW_AGE_MS = 7 * 86400000;
const POLICIES = Object.freeze({
  'global-voices-original': Object.freeze({
    host:'globalvoices.org', language:'en',
    policyUrl:'https://globalvoices.org/about/global-voices-attribution-policy/',
    licenseUrl:'https://creativecommons.org/licenses/by/3.0/',
    additionalHold:null,
  }),
  'agencia-brasil': Object.freeze({
    host:'agenciabrasil.ebc.com.br', language:'pt',
    policyUrl:'https://agenciabrasil.ebc.com.br/sobre',
    licenseUrl:null,
    additionalHold:'publisher-use-scope-unresolved',
  }),
});
export const PILOT_IDS = Object.freeze(Object.keys(POLICIES));
// Empty by design: no verified per-item snapshots are available yet.
export const REVIEWED_ITEMS = Object.freeze([]);

function requirePilot(candidate) {
  if (!SOURCE_RESEARCH_CANDIDATES.includes(candidate) || candidate.disposition !== 'research' ||
      candidate.healthVerificationStatus !== 'research-only' || candidate.permittedUse.length !== 0 ||
      !Object.hasOwn(POLICIES, candidate.candidateId)) throw new Error('governed pilot candidate required');
  const policy = POLICIES[candidate.candidateId];
  if (new URL(candidate.endpointUrl).hostname !== policy.host ||
      !candidate.usagePolicyUrls.includes(policy.policyUrl)) throw new Error('pilot policy or host drift');
  return policy;
}

function endTag(xml, start) {
  let quote = null;
  for (let i = start + 1; i < xml.length; i++) {
    const ch = xml[i];
    if (quote) { if (ch === quote) quote = null; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i;
  }
  throw new Error('unterminated tag');
}

// This scanner accepts only an RSS/channel/item hierarchy, not arbitrary nested
// item lookalikes. It does not expand entities, process namespaces or execute XML.
// The caller also runs the existing structural feed validator.
function scan(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml,'utf8') > PILOT_MAX_BYTES) throw new Error('pilot byte cap exceeded');
  const stack = [], items = [];
  let root = null, rootClosed = false, channelCount = 0, item = null, pos = 0;
  let total = 0;
  while (pos < xml.length) {
    const start = xml.indexOf('<',pos);
    const until = start === -1 ? xml.length : start;
    if ((!stack.length) && xml.slice(pos,until).trim()) throw new Error('text outside RSS root');
    if (start === -1) break;
    if (xml.startsWith('<!--',start) || xml.startsWith('<![CDATA[',start) || xml.startsWith('<?',start)) {
      const prefix = xml.startsWith('<!--',start) ? 4 : xml.startsWith('<![CDATA[',start) ? 9 : 2;
      const suffix = prefix === 4 ? '-->' : prefix === 9 ? ']]>' : '?>';
      const end = xml.indexOf(suffix,start+prefix);
      if (end < 0 || (prefix === 9 && !stack.length)) throw new Error('invalid XML special section');
      pos = end + suffix.length; continue;
    }
    if (xml.startsWith('<!',start)) throw new Error('XML declarations not allowed');
    const close = endTag(xml,start);
    const raw = xml.slice(start,close+1);
    const match = /^<(\/)?([A-Za-z_][\w:.-]*)([\s\S]*)>$/.exec(raw);
    if (!match) throw new Error('malformed tag');
    const name = match[2], closing = Boolean(match[1]), selfClosing = !closing && /\/\s*>$/.test(raw);
    const path = stack.map(entry=>entry.name);
    if (closing) {
      if (match[3].trim() || stack.at(-1)?.name !== name) throw new Error('invalid nesting');
      const entry = stack.pop();
      if (item && path.length === 4 && path.slice(0,3).join('/') === 'rss/channel/item')
        item.fields.push({name, inner:xml.slice(entry.contentStart,start), attrs:entry.attrs});
      if (item && path.join('/') === 'rss/channel/item') {
        item.inner = xml.slice(item.contentStart,start);
        item.sha256 = createHash('sha256').update(xml.slice(item.start,close+1),'utf8').digest('hex');
        items.push(item); item = null;
      }
      if (!stack.length) rootClosed = true;
    } else {
      if (rootClosed) throw new Error('multiple roots');
      if (!stack.length) { if (root || name !== 'rss' || selfClosing) throw new Error('RSS required'); root = name; }
      if (path.join('/') === 'rss' && name === 'channel') channelCount++;
      if (path.join('/') === 'rss/channel' && name === 'item') {
        total++;
        if (!selfClosing && total <= PILOT_MAX_ITEMS)
          item = { start, contentStart:close+1, fields:[] };
      }
      if (item && path.join('/') === 'rss/channel/item' && selfClosing)
        item.fields.push({name,inner:'',attrs:match[3]});
      if (!selfClosing) stack.push({name,contentStart:close+1,attrs:match[3]});
      else if (path.join('/') === 'rss/channel' && name === 'item' && total <= PILOT_MAX_ITEMS)
        items.push({fields:[],inner:'',sha256:createHash('sha256').update(raw,'utf8').digest('hex')});
    }
    if (stack.length > 64) throw new Error('RSS nesting cap exceeded');
    pos = close+1;
  }
  if (stack.length || !rootClosed || channelCount !== 1) throw new Error('incomplete RSS/channel');
  return {items,total};
}

// A literal direct scalar only. Do not accept nested HTML, email-style authors,
// or invented metadata buried in an article body.
function scalar(raw) {
  if (typeof raw !== 'string' || raw.length > 8192) return '';
  const value = raw.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(value);
  if (!cdata && /[<>]/.test(value)) return '';
  const decoded = cdata ? cdata[1] : value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (whole,key) => {
    if (key[0] === '#') {
      const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : Number(key.slice(1));
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n) : whole;
    }
    return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[key.toLowerCase()] || whole;
  });
  return /[<>\u0000-\u001f\u007f]/.test(decoded) ? '' : decoded.trim();
}
function one(fields,names) {
  const selected = fields.filter(field=>names.includes(field.name));
  return selected.length === 1 ? scalar(selected[0].inner) : '';
}
function articleUrl(value,host) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    // Exact first-party article URL; no redirects, query normalization or fragment removal.
    if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password ||
        url.port || url.hash || url.pathname === '/' || url.href !== value) return null;
    return value;
  } catch { return null; }
}
const RIGHTS_NAMES = new Set(['rights','license','cc:license','dc:rights','copyright']);
function rightsMarkerBlocked(fields,policy) {
  return fields.filter(field=>RIGHTS_NAMES.has(field.name.toLowerCase())).some(field=>{
    // A recognized marker is only compatible metadata, never an approval.
    // All non-exact or mixed markers are held for human review.
    const value=scalar(field.inner);
    return !policy.licenseUrl || value !== policy.licenseUrl;
  });
}
function translationMarker(fields) {
  return fields.some(field=>/^(?:translation|translated|originalLanguage|originalLink|language|dc:language)$/i.test(field.name));
}

// Returns transient metadata for local human review. Never log this array in CI.
// The observed byline and language are hints, not findings of authorship or originality.
export function collectPilotMetadata(xml,candidate,{now=new Date()}={}) {
  const policy=requirePilot(candidate);
  const at=new Date(now).valueOf();
  if (!Number.isFinite(at)) throw new Error('invalid observation time');
  const {items,total}=scan(xml);
  const rows=items.map(item=>{
    const title=one(item.fields,['title']);
    const author=one(item.fields,['dc:creator','author']);
    const url=articleUrl(one(item.fields,['link']),policy.host);
    const date=Date.parse(one(item.fields,['pubDate','dc:date','published']));
    const source=classifyItemSourceHints(item.inner,{publisherHost:policy.host});
    const reasons=[];
    if (!url) reasons.push('unresolved-exact-publisher-url');
    if (!title || title.length > 500) reasons.push('missing-or-ambiguous-title');
    if (!author || author.length > 200 || /@/.test(author)) reasons.push('missing-or-ambiguous-byline');
    if (!Number.isFinite(date) || date > at + 6*3600000) reasons.push('invalid-or-future-publication-date');
    if (source.sourceMarkerPresent) reasons.push('source-attribution-marker-requires-review');
    if (rightsMarkerBlocked(item.fields,policy)) reasons.push('unresolved-item-rights-marker');
    if (translationMarker(item.fields)) reasons.push('language-or-translation-marker-requires-review');
    return {candidateId:candidate.candidateId,url,title,author,
      publishedAt:Number.isFinite(date)?new Date(date).toISOString():null,
      snapshotSha256:item.sha256,configuredLanguage:policy.language,reasons};
  });
  const counts = new Map();
  for (const row of rows) if (row.url) counts.set(row.url,(counts.get(row.url)||0)+1);
  for (const row of rows) if (row.url && counts.get(row.url)>1) row.reasons.push('duplicate-article-url');
  return {total,rows};
}

function exactReview(row,reviews,policy,at) {
  const matches=reviews.filter(review=>review?.candidateId===row.candidateId && review.url===row.url);
  if (matches.length !== 1) return false;
  const review=matches[0];
  const reviewedAt=Date.parse(review.reviewedAt);
  return review.version===PILOT_VERSION && review.status==='reviewed' &&
    review.snapshotSha256===row.snapshotSha256 && /^[a-f0-9]{64}$/.test(review.snapshotSha256) &&
    review.title===row.title && review.author===row.author && review.publishedAt===row.publishedAt &&
    review.articleEvidenceUrl===row.url && review.policyUrl===policy.policyUrl &&
    review.licenseUrl===policy.licenseUrl && review.language===policy.language &&
    review.origin==='publisher-created-original' && review.noThirdPartyRestrictions===true &&
    review.publisherAttributionRetained===true && review.regularReuseScopeReviewed===true &&
    review.scope==='original-headline-link-only' &&
    typeof review.reviewerNote==='string' && review.reviewerNote.trim().length>=20 &&
    Number.isFinite(reviewedAt) && new Date(reviewedAt).toISOString()===review.reviewedAt &&
    reviewedAt<=at && at-reviewedAt<=MAX_REVIEW_AGE_MS;
}

export function inspectMultilingualPilot(xml,candidate,{now=new Date(),reviews=REVIEWED_ITEMS}={}) {
  const policy=requirePilot(candidate);
  if (!Array.isArray(reviews) || reviews.length>1000) throw new Error('invalid review ledger');
  const {total,rows}=collectPilotMetadata(xml,candidate,{now});
  const at=new Date(now).valueOf();
  const blockers={};
  let structurallyReady=0, reviewedForReleaseConsideration=0;
  for (const row of rows) {
    const reasons=[...row.reasons];
    if (!reasons.length) structurallyReady++;
    if (policy.additionalHold) reasons.push(policy.additionalHold);
    if (!exactReview(row,reviews,policy,at)) reasons.push('no-current-exact-item-review');
    if (!reasons.length) reviewedForReleaseConsideration++;
    for (const reason of new Set(reasons)) blockers[reason]=(blockers[reason]||0)+1;
  }
  return {version:PILOT_VERSION,candidateId:candidate.candidateId,totalItemsObserved:total,
    sampledItems:rows.length,structurallyReady,reviewedForReleaseConsideration,blockers,
    unexaminedItems:Math.max(0,total-rows.length),productionEligible:false,
    publicItems:0,translationCalls:0,mediaItems:0,retainedArticleBodies:0,
    caveat:'Structural readiness and exact human review matches are not permission certification or production admission. No content is published.'};
}

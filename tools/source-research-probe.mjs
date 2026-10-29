#!/usr/bin/env node
// GD-048 research-only feed probe. Network observations NEVER imply reuse rights or production admission.
// Run explicitly: node tools/source-research-probe.mjs --candidate=global-voices-original (or --all).
import { pathToFileURL } from 'node:url';
import { SOURCE_RESEARCH_CANDIDATES, SOURCE_ADMISSIONS } from '../functions/lib/news-source-admission.js';

export const PROBE_VERSION = 'gd048-research-probe-v1';
export const MAX_FEED_BYTES = 512 * 1024;
const MAX_SAMPLE_ITEMS = 30;
const TIMEOUT_MS = 10000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tagEnd(xml, start) {
  let quote = null;
  for (let i = start + 1; i < xml.length; i++) {
    const c = xml[i];
    if (quote) { if (c === quote) quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  throw new Error('unterminated XML tag');
}

// Checks nesting, root and XML markup without executing entities, DTDs or external references.
// This is deliberately a structural probe, not a full XML schema or namespace validator.
export function inspectXmlStructure(xml) {
  assert(typeof xml === 'string' && xml.trim(), 'empty XML');
  const stack = [];
  let root = null;
  let rootClosed = false;
  let pos = 0;
  let checkable = '';
  while (pos < xml.length) {
    const open = xml.indexOf('<', pos);
    const end = open === -1 ? xml.length : open;
    const data = xml.slice(pos, end);
    if ((!root || rootClosed) && data.trim()) throw new Error('text outside XML root');
    checkable += data;
    if (open === -1) break;
    if (xml.startsWith('<!--', open)) {
      const close = xml.indexOf('-->', open + 4);
      if (close === -1) throw new Error('unclosed XML comment');
      pos = close + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', open)) {
      const close = xml.indexOf(']]>', open + 9);
      if (close === -1) throw new Error('unclosed CDATA');
      if (stack.length === 0) throw new Error('CDATA outside XML root');
      pos = close + 3;
      continue;
    }
    if (xml.startsWith('<?', open)) {
      const close = xml.indexOf('?>', open + 2);
      if (close === -1) throw new Error('unclosed XML declaration');
      pos = close + 2;
      continue;
    }
    if (xml.startsWith('<!', open)) throw new Error('DTD and declarations not accepted for research probe');
    const close = tagEnd(xml, open);
    const tag = xml.slice(open, close + 1);
    checkable += tag;
    const match = /^<\s*(\/)?([A-Za-z_][\w:.-]*)\b[\s\S]*>$/.exec(tag);
    if (!match) throw new Error('invalid XML tag');
    const closing = Boolean(match[1]);
    const selfClosing = !closing && /\/\s*>$/.test(tag);
    const name = match[2];
    if (closing) {
      if (/[^\s]/.test(tag.slice(2 + name.length, -1))) throw new Error('invalid close tag');
      if (stack.pop() !== name) throw new Error('unbalanced XML tags');
      if (stack.length === 0) rootClosed = true;
    } else {
      if (rootClosed) throw new Error('multiple XML roots');
      if (!root) root = name;
      if (!selfClosing) stack.push(name);
      else if (stack.length === 0) rootClosed = true;
    }
    pos = close + 1;
  }
  if (stack.length || !root || !rootClosed) throw new Error('incomplete XML document');
  // Unknown named entities are not XML-predefined entities. Do not resolve or fetch them.
  if (/&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[\da-f]+);)/i.test(checkable))
    throw new Error('unresolved or malformed XML entity');
  const kind = root.toLowerCase();
  if (!['rss', 'feed', 'rdf:rdf'].includes(kind)) throw new Error('not an RSS or Atom feed');
  return kind === 'feed' ? 'atom' : 'rss';
}

function contentOf(xml, names) {
  for (const name of names) {
    const pattern = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '\\s*>', 'i');
    const match = pattern.exec(xml);
    if (match) return match[1].replace(/<[^>]+>/g, '').replace(/&amp;/gi, '&').trim();
  }
  return '';
}

function itemLink(block, kind) {
  if (kind === 'rss') return contentOf(block, ['link']);
  const links = [...block.matchAll(/<link\b([^>]*)\/?\s*>/gi)];
  const alternate = links.find(m => /\brel\s*=\s*["']alternate["']/i.test(m[1])) || links[0];
  return alternate?.[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]?.replace(/&amp;/gi, '&') || '';
}

function canonicalKey(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

// No headlines, item bodies, GUIDs, authors or article URLs are persisted in the evidence output.
export function inspectFeed(xml, { now = new Date() } = {}) {
  const format = inspectXmlStructure(xml);
  // Remove CDATA/comment bodies so markup-looking article content cannot forge feed entries.
  const safe = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const itemPattern = format === 'atom'
    ? /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry\s*>/gi
    : /<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi;
  const blocks = [...safe.matchAll(itemPattern)];
  const sample = blocks.slice(0, MAX_SAMPLE_ITEMS);
  const seen = new Set();
  let linked = 0, dated = 0, invalidDates = 0, futureDated = 0, duplicateLinks = 0;
  let guidPresent = 0, creatorPresent = 0, originSignalPresent = 0, rightsSignalPresent = 0;
  let newest = -Infinity;
  const at = new Date(now).getTime();
  assert(Number.isFinite(at), 'invalid observation time');
  for (const [, block] of sample) {
    const link = canonicalKey(itemLink(block, format));
    if (link) {
      linked++;
      if (seen.has(link)) duplicateLinks++;
      seen.add(link);
    }
    if (contentOf(block, format === 'atom' ? ['id'] : ['guid'])) guidPresent++;
    if (contentOf(block, format === 'atom' ? ['author', 'dc:creator'] : ['dc:creator', 'author'])) creatorPresent++;
    if (/<(?:source|dc:source|original|originalLink)\b/i.test(block)) originSignalPresent++;
    if (/<(?:rights|license|cc:license|dc:rights)\b/i.test(block)) rightsSignalPresent++;
    const rawDate = contentOf(block, format === 'atom'
      ? ['published', 'updated'] : ['pubDate', 'dc:date', 'published']);
    if (rawDate) {
      const timestamp = Date.parse(rawDate);
      if (Number.isFinite(timestamp)) {
        dated++;
        newest = Math.max(newest, timestamp);
        if (timestamp > at + 6 * 3600000) futureDated++;
      } else invalidDates++;
    }
  }
  const newestAgeHours = newest === -Infinity ? null : Math.round((at - newest) / 360000) / 10;
  return {
    xmlStructure: 'passed', format, totalEntriesObserved: blocks.length, sampledItems: sample.length,
    canonicalLinks: linked, duplicateCanonicalLinks: duplicateLinks,
    guidOrIdPresent: guidPresent, parseableDates: dated, invalidDates, futureDated,
    newestSampleAgeHours: newestAgeHours, creatorSignals: creatorPresent,
    originSignals: originSignalPresent, itemRightsSignals: rightsSignalPresent,
    itemOriginCertified: false, itemReuseRightsCertified: false,
    caveat: 'Counts describe bounded feed markup, not independent reporting, verified origins, full XML schema validity or usage rights',
  };
}

async function readBounded(response, maxBytes) {
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > maxBytes) throw new Error('content-length exceeds evidence cap');
  if (!response.body) throw new Error('empty HTTP response body');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('stream exceeds evidence cap');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function probeResearchCandidate(candidate, { fetchImpl = fetch, now = new Date(), maxBytes = MAX_FEED_BYTES } = {}) {
  assert(SOURCE_RESEARCH_CANDIDATES.some(entry =>
    entry.candidateId === candidate?.candidateId && entry.endpointUrl === candidate?.endpointUrl),
  'candidate is not in the governed research registry');
  assert(candidate.disposition === 'research', 'research disposition required');
  assert(Number.isInteger(maxBytes) && maxBytes > 0 && maxBytes <= MAX_FEED_BYTES, 'invalid byte cap');
  const url = new URL(candidate.endpointUrl);
  assert(url.protocol === 'https:' && !url.username && !url.password, 'HTTPS endpoint required');
  const observedAt = new Date(now).toISOString();
  const report = {
    probeVersion: PROBE_VERSION, observedAt,
    candidateId: candidate.candidateId, endpointUrl: candidate.endpointUrl,
    publisherUseStatus: candidate.allowedUseStatus,
    registryDisposition: 'research', productionEligible: false,
    itemReuseRightsCertified: false, observation: 'not-attempted',
  };
  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET', redirect: 'manual', headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    report.httpStatus = response.status;
    report.contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (response.status >= 300 && response.status < 400) {
      report.observation = 'redirect-requires-review';
      report.redirectLocation = response.headers.get('location') || null;
      await response.body?.cancel().catch(() => {});
      return report;
    }
    if (!response.ok) {
      report.observation = 'http-error';
      await response.body?.cancel().catch(() => {});
      return report;
    }
    if (/html/i.test(report.contentType)) {
      report.observation = 'html-instead-of-feed';
      await response.body?.cancel().catch(() => {});
      return report;
    }
    const xml = await readBounded(response, maxBytes);
    report.bytesRead = new TextEncoder().encode(xml).byteLength;
    report.evidence = inspectFeed(xml, { now });
    report.observation = 'xml-structure-observed';
  } catch (error) {
    report.observation = 'probe-failed';
    report.error = error instanceof Error ? error.message.slice(0, 160) : 'unknown error';
  }
  return report;
}

async function main(argv) {
  const candidateArg = argv.find(arg => arg.startsWith('--candidate='));
  const all = argv.length === 1 && argv[0] === '--all';
  assert(all || (argv.length === 1 && candidateArg), 'usage: --candidate=ID or --all');
  const selected = all ? SOURCE_RESEARCH_CANDIDATES
    : SOURCE_RESEARCH_CANDIDATES.filter(entry => entry.candidateId === candidateArg.slice(12));
  assert(selected.length > 0, 'unknown research candidate');
  const existingCount = SOURCE_ADMISSIONS.length;
  const results = [];
  for (const candidate of selected) results.push(await probeResearchCandidate(candidate));
  assert(SOURCE_ADMISSIONS.length === existingCount, 'production admission inventory changed during probe');
  console.log(JSON.stringify({ probeVersion: PROBE_VERSION, inventoryBeforeAndAfter: existingCount,
    results }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });

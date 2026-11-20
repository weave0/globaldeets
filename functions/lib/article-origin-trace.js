// GD-052: bounded, feed-declared article-origin hints and exact-URL overlap.
// No headline similarity, publisher ownership, editorial independence, syndication,
// article licensing, original reporting, or corroboration is inferred here.
export const ARTICLE_ORIGIN_TRACE_VERSION = 'gd052-feed-origin-v1';
export const FEED_HINT_STATUSES = Object.freeze([
  'not-recorded',
  'unresolved-marker',
  'same-article-host-reference',
  'external-host-reference',
  'mixed-references',
]);

const DIRECT_SOURCE_TAGS = new Set(['source', 'dc:source']);
const DIRECT_ORIGINAL_LINK_TAGS = new Set(['feedburner:origlink', 'origlink']);
const MAX_MARKER_XML = 20_000;
const MAX_MARKERS = 8;

function shieldXmlContent(value) {
  // Embedded HTML / CDATA must never impersonate item-level XML siblings.
  return value.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_whole, text) =>
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

function tagEnd(xml, start) {
  let quote = null;
  for (let i = start + 1; i < xml.length; i++) {
    const char = xml[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === '>') return i;
  }
  return -1;
}

function directMarkers(xml) {
  const safe = shieldXmlContent(xml);
  const markers = [];
  let depth = 0;
  let active = null;
  for (let pos = 0; pos < safe.length && markers.length <= MAX_MARKERS;) {
    const start = safe.indexOf('<', pos);
    if (start < 0) break;
    const end = tagEnd(safe, start);
    if (end < 0) break;
    const raw = safe.slice(start, end + 1);
    pos = end + 1;
    if (raw.startsWith('<!') || raw.startsWith('<?')) continue;
    const tag = /^<\s*(\/)?([A-Za-z_][\w:.-]*)([\s\S]*)>$/.exec(raw);
    if (!tag) continue;
    const closing = Boolean(tag[1]);
    const name = tag[2].toLowerCase();
    const selfClose = !closing && /\/\s*>$/.test(raw);
    if (closing) {
      depth--;
      if (active && depth === 0 && active.name === name) {
        markers.push({ name, attributes: active.attributes, body: safe.slice(active.end, start) });
        active = null;
      }
    } else {
      if (depth === 0 && (DIRECT_SOURCE_TAGS.has(name) || DIRECT_ORIGINAL_LINK_TAGS.has(name))) {
        const attributes = tag[3].replace(/\/\s*$/, '');
        if (selfClose) markers.push({ name, attributes, body: '' });
        else active = { name, attributes, end: pos };
      }
      if (!selfClose) depth++;
    }
    if (depth < 0) break;
  }
  return markers;
}

function decodeXmlUrl(text) {
  return text.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
}

function safeUrl(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2048) return null;
  try {
    const url = new URL(decodeXmlUrl(text.trim()));
    if (url.protocol !== 'https:' || url.username || url.password ||
        !url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.local')) return null;
    return url.href;
  } catch { return null; }
}

function markerLinks(marker) {
  const links = [];
  const attrs = marker.attributes || '';
  for (const match of attrs.matchAll(/\b(?:url|href)\s*=\s*(['"])(.*?)\1/gi)) links.push(match[2]);
  const body = marker.body.trim();
  if (/^https?:\/\//i.test(body)) links.push(body);
  if (marker.name === 'source') {
    for (const match of body.matchAll(/<id(?:\s[^>]*)?>(https?:\/\/[^<]+)<\/id\s*>/gi)) links.push(match[1]);
    for (const match of body.matchAll(/<link\b([^>]*)\/?>/gi)) {
      const href = /\bhref\s*=\s*(['"])(.*?)\1/i.exec(match[1]);
      if (href) links.push(href[2]);
    }
  }
  return links;
}

function host(url) {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return null; }
}

export function extractFeedOriginHint(itemXml, articleUrl) {
  const empty = {
    version: ARTICLE_ORIGIN_TRACE_VERSION,
    status: 'not-recorded',
    markerKind: null,
    referenceUrl: null,
    originalReportingVerified: false,
    syndicationVerified: false,
  };
  if (typeof itemXml !== 'string' || !itemXml || itemXml.length > MAX_MARKER_XML) {
    return { ...empty, status: 'unresolved-marker' };
  }
  const markers = directMarkers(itemXml);
  if (!markers.length) return empty;
  if (markers.length > MAX_MARKERS) return { ...empty, status: 'mixed-references' };
  const kinds = new Set(markers.map(marker => DIRECT_SOURCE_TAGS.has(marker.name) ? 'feed-source' : 'original-link'));
  const urls = [];
  let invalid = false;
  for (const marker of markers) {
    const declared = markerLinks(marker);
    if (!declared.length) invalid = true;
    for (const raw of declared) {
      const url = safeUrl(raw);
      if (!url) invalid = true;
      else urls.push(url);
    }
  }
  const unique = [...new Set(urls)];
  const articleHost = host(safeUrl(articleUrl) || '');
  if (invalid || !unique.length || !articleHost) {
    return { ...empty, status: 'unresolved-marker' };
  }
  if (unique.length !== 1 || kinds.size !== 1) {
    return { ...empty, status: 'mixed-references' };
  }
  const referenceUrl = unique[0];
  return {
    ...empty,
    status: host(referenceUrl) === articleHost
      ? 'same-article-host-reference'
      : 'external-host-reference',
    markerKind: [...kinds][0],
    referenceUrl,
  };
}

export function addExactArticleLinkOverlap(items) {
  if (!Array.isArray(items)) return [];
  // Compare the exact provided article URL, not a guessed canonical URL, an
  // article title, a stripped query string, or a URL from an unrelated period.
  const groups = new Map();
  for (const item of items) {
    if (!item || !safeUrl(item.sourceUrl) || !/^[a-z0-9-]+$/.test(item.sourceId || '')) continue;
    const key = item.sourceUrl;
    if (!groups.has(key)) groups.set(key, new Map());
    const group = groups.get(key);
    if (!group.has(item.sourceId)) group.set(item.sourceId, String(item.source || item.sourceId));
  }
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const group = groups.get(item.sourceUrl);
    const others = group && group.size > 1
      ? [...group].filter(([id]) => id !== item.sourceId).sort(([a], [b]) => a.localeCompare(b))
      : [];
    item.exactLinkOverlap = others.length
      ? { matchType: 'exact-article-url', distinctPublisherCount: group.size,
          otherPublishers: others.map(([sourceId, name]) => ({ sourceId, name })) }
      : null;
  }
  return items;
}

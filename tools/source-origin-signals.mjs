// GD-049 research-only source hints. This is not an origin verifier or rights evaluator.
// Consume item/entry *inner* XML only; always keep reported output aggregate-only.
const MARKER_NAMES = new Set(['source', 'dc:source', 'originallink', 'feedburner:origlink']);

function safeMetadataXml(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_whole, value) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

function tagEnd(xml, start) {
  let quote = null;
  for (let i = start + 1; i < xml.length; i++) {
    const c = xml[i];
    if (quote) { if (c === quote) quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return -1;
}

// Only direct children of <item> or <entry> count. A nested <source> in an
// article body, title, description or Atom <content> is not provenance metadata.
function directSourceMarkers(xml) {
  const safe = safeMetadataXml(xml);
  const markers = [];
  let depth = 0;
  let active = null;
  for (let pos = 0; pos < safe.length;) {
    const start = safe.indexOf('<', pos);
    if (start < 0) break;
    const end = tagEnd(safe, start);
    if (end < 0) break;
    const raw = safe.slice(start, end + 1);
    pos = end + 1;
    if (raw.startsWith('<?') || raw.startsWith('<!')) continue;
    const m = /^<\s*(\/)?([A-Za-z_][\w:.-]*)([\s\S]*)>$/.exec(raw);
    if (!m) continue;
    const closing = Boolean(m[1]);
    const name = m[2].toLowerCase();
    const selfClosing = !closing && /\/\s*>$/.test(raw);
    if (closing) {
      depth--;
      if (active && depth === 0 && active.name === name) {
        markers.push({ name, attributes: active.attributes, inner: safe.slice(active.end, start) });
        active = null;
      }
    } else {
      if (depth === 0 && MARKER_NAMES.has(name)) {
        const attributes = m[3].replace(/\/\s*$/, '');
        if (selfClosing) markers.push({ name, attributes, inner: '' });
        else active = { name, attributes, end: pos };
      }
      if (!selfClosing) depth++;
    }
    if (depth < 0) break;
  }
  return markers;
}

function markerUrls(marker) {
  const found = [];
  const attributes = marker.attributes;
  for (const match of attributes.matchAll(/\b(?:url|href)\s*=\s*(['"])(.*?)\1/gi)) found.push(match[2]);
  const innerText = marker.inner.replace(/<[^>]*>/g, '').trim();
  if (/^https?:\/\//i.test(innerText)) found.push(innerText);
  // Atom <source> may contain an originating feed <id> and/or <link href>.
  if (marker.name === 'source') {
    for (const match of marker.inner.matchAll(/<id(?:\s[^>]*)?>(https?:\/\/[^<]+)<\/id\s*>/gi)) found.push(match[1]);
    for (const match of marker.inner.matchAll(/<link\b([^>]*)\/?>/gi)) {
      const href = /\bhref\s*=\s*(['"])(.*?)\1/i.exec(match[1]);
      if (href) found.push(href[2]);
    }
  }
  return found;
}

function hostnameOf(value) {
  try {
    const url = new URL(value.replace(/&amp;/gi, '&'));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.hostname.toLowerCase();
  } catch { return null; }
}

export function classifyItemSourceHints(innerXml, { publisherHost = null } = {}) {
  if (typeof innerXml !== 'string') throw new TypeError('item XML must be text');
  if (publisherHost !== null &&
    (typeof publisherHost !== 'string' || !/^[a-z0-9.-]+$/i.test(publisherHost)))
    throw new TypeError('publisherHost must be a hostname or null');
  const markers = directSourceMarkers(innerXml);
  let publisher = false, external = false, unresolved = false;
  for (const marker of markers) {
    const urls = markerUrls(marker);
    if (!urls.length) unresolved = true;
    for (const value of urls) {
      const host = hostnameOf(value);
      if (!host || !publisherHost) { unresolved = true; continue; }
      const expected = publisherHost.toLowerCase();
      if (host === expected || host.endsWith('.' + expected)) publisher = true;
      else external = true;
    }
  }
  const status = publisher && external ? 'conflicting-source-hints'
    : external ? 'external-source-hint'
    : publisher ? 'publisher-source-hint' : 'unresolved';
  return Object.freeze({
    status,
    sourceMarkerPresent: markers.length > 0,
    unresolvedSourceMarker: unresolved,
    // Source-host hints alone never certify original reporting, article licensing,
    // permitted translation or eligibility to use an item in production.
    itemOriginCertified: false,
    itemReuseRightsCertified: false,
    productionEligible: false,
  });
}

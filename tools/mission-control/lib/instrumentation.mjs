/**
 * Live browser-instrumentation truth (GD-031).
 *
 * Replaces the carried-forward "RUM on/off" flag with what production actually serves: the probe already
 * fetches each homepage, so the same response is inspected for known analytics tags. Detection is evidence
 * that a tag is *shipped*; it is never evidence that events are *received*. Only reception evidence
 * (for example Cloudflare Web Analytics page-load counts by host) can produce `active-verified`.
 *
 * States: active-verified | configured-unverified | configured-invalid | absent | inaccessible | not-applicable | unknown
 */

const SCRIPT_TAG = /<script\b[^>]*>/gi;
const CF_BEACON_SRC = /static\.cloudflareinsights\.com\/beacon(?:\.min)?\.js/i;
const CF_BEACON_TOKEN = /data-cf-beacon\s*=\s*(?:'([^']*)'|"([^"]*)")/i;
const GTAG_SRC = /googletagmanager\.com\/gtag\/js\?[^"'\s>]*\bid=(G-[A-Z0-9]+)/gi;
const GTAG_CONFIG = /gtag\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]+)['"]/gi;
const GTM_SRC = /googletagmanager\.com\/gtm\.js\?[^"'\s>]*\bid=(GTM-[A-Z0-9]+)/gi;
const OTHER_PROVIDERS = [
  { id: 'plausible', pattern: /plausible\.io\/js\//i },
  { id: 'fathom', pattern: /cdn\.usefathom\.com/i },
  { id: 'umami', pattern: /umami(?:\.is|\.js)|data-website-id/i },
  { id: 'matomo', pattern: /matomo\.js|piwik\.js/i },
  { id: 'posthog', pattern: /posthog(?:\.com|\.js)/i },
];

export function isPlaceholderMeasurementId(id, placeholders = []) {
  if (!id) return false;
  const upper = String(id).toUpperCase();
  return /^G-X+$/.test(upper) || /^G-0+$/.test(upper) || placeholders.map(item => item.toUpperCase()).includes(upper);
}

function unique(list) {
  return [...new Set(list)];
}

/**
 * Inspects served HTML for known analytics tags. Pure.
 * @returns {{ evaluated: boolean, providers: object[], bytesInspected: number, complete: boolean, reason: string|null }}
 */
export function detectInstrumentation(html, { contentType = null, truncated = false, placeholders = [] } = {}) {
  if (typeof html !== 'string' || !html.length) return { evaluated: false, providers: [], bytesInspected: 0, complete: false, reason: 'No response body was available to inspect.' };
  if (contentType && !/html/i.test(contentType)) return { evaluated: false, providers: [], bytesInspected: html.length, complete: false, reason: 'Response was not HTML.' };
  const providers = [];

  const ids = unique([...html.matchAll(GTAG_SRC), ...html.matchAll(GTAG_CONFIG)].map(match => match[1].toUpperCase()));
  for (const id of ids) providers.push({ id: 'ga4', measurementId: id, placeholder: isPlaceholderMeasurementId(id, placeholders) });

  for (const match of html.matchAll(GTM_SRC)) providers.push({ id: 'google-tag-manager', containerId: match[1].toUpperCase(), placeholder: false });

  for (const tag of html.match(SCRIPT_TAG) || []) {
    if (!CF_BEACON_SRC.test(tag)) continue;
    const token = CF_BEACON_TOKEN.exec(tag);
    let siteTag = null;
    if (token) {
      const raw = token[1] ?? token[2] ?? '';
      try {
        siteTag = JSON.parse(raw.replace(/&quot;/g, '"')).token || null;
      } catch (_error) {
        siteTag = null;
      }
    }
    providers.push({ id: 'cloudflare-web-analytics', siteTag, placeholder: false });
    break;
  }

  for (const other of OTHER_PROVIDERS) if (other.pattern.test(html)) providers.push({ id: other.id, placeholder: false });

  return {
    evaluated: true,
    providers,
    bytesInspected: html.length,
    complete: !truncated,
    reason: providers.length ? null : truncated ? 'No known analytics tag in the first ' + html.length + ' bytes (the response was truncated).' : 'No known analytics tag in the served homepage HTML. Tags injected only by scripts cannot be seen from here.',
  };
}

/**
 * Classifies one property's instrumentation from probe evidence.
 * @param {object} input
 *   availabilityState  effective availability of the property (available|degraded|unavailable|no-service-published|unknown)
 *   blocked            true when every conclusive vantage was blocked
 *   redirectOnly       true when the property only redirects elsewhere
 *   detection          detectInstrumentation() result from the authoritative vantage, or null
 *   reception          reception evidence for the property host, or null: { state: 'received'|'none-received'|'unavailable', events, windowHours, observedAt }
 */
export function classifyInstrumentation({ availabilityState, blocked = false, redirectOnly = false, detection, reception = null }) {
  if (availabilityState === 'no-service-published') {
    return { state: 'not-applicable', providers: [], reason: 'No web service is published, so there is nothing to instrument.', confidence: 'high' };
  }
  if (redirectOnly) {
    return { state: 'not-applicable', providers: [], reason: 'This address only redirects; the destination property carries the instrumentation.', confidence: 'high' };
  }
  if (blocked) {
    return { state: 'inaccessible', providers: [], reason: 'The page could not be read from any vantage (blocked), so its instrumentation is unknown.', confidence: 'high' };
  }
  if (!detection || !detection.evaluated) {
    return { state: 'unknown', providers: [], reason: detection?.reason || 'No fresh page was inspected for this property.', confidence: 'high' };
  }
  const real = detection.providers.filter(item => !item.placeholder);
  if (real.length) {
    const receivedForBeacon = reception?.state === 'received' && real.some(item => item.id === 'cloudflare-web-analytics');
    if (receivedForBeacon) {
      return { state: 'active-verified', providers: detection.providers, reason: 'Cloudflare Web Analytics received ' + reception.events + ' page loads for this host in the last ' + reception.windowHours + ' hours.', confidence: 'high', reception };
    }
    const only = real.map(item => item.id);
    let reason = 'A ' + only.join(' + ') + ' tag is shipped in the homepage HTML, but no evidence shows events are being received.';
    if (reception?.state === 'none-received' && real.some(item => item.id === 'cloudflare-web-analytics')) {
      reason = 'The Cloudflare Web Analytics tag is shipped but reported zero page loads for this host in the last ' + reception.windowHours + ' hours.';
    }
    return { state: 'configured-unverified', providers: detection.providers, reason, confidence: 'medium', reception };
  }
  if (detection.providers.length) {
    return { state: 'configured-invalid', providers: detection.providers, reason: 'An analytics tag is present but uses a placeholder measurement ID, so it cannot be collecting real data.', confidence: 'high' };
  }
  return { state: 'absent', providers: [], reason: detection.reason, confidence: detection.complete ? 'medium' : 'low' };
}

/** Estate-level roll-up used by findings and the executive view. Denominator: properties that publish a web page. */
export function summarizeInstrumentation(rows) {
  const applicable = rows.filter(row => row.observability.state !== 'not-applicable');
  const count = state => applicable.filter(row => row.observability.state === state).length;
  return {
    applicable: applicable.length,
    activeVerified: count('active-verified'),
    configuredUnverified: count('configured-unverified'),
    configuredInvalid: count('configured-invalid'),
    absent: count('absent'),
    inaccessible: count('inaccessible'),
    unknown: count('unknown'),
  };
}

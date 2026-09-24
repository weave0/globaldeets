/**
 * Estate availability + critical-path probe engine (GD-030).
 *
 * Every dependency (fetch, DNS, TLS, sleep, clock) is injectable so the engine is deterministic under
 * test. The engine never decides "healthy": it records evidence (DNS, HTTP, TLS, contract checks) and
 * a run-level observation. Health is derived later by the explicit health contract.
 */

const HTTP_OK = status => status >= 200 && status < 300;

export const FAILURE_NEXT_ACTIONS = Object.freeze({
  'dns-nxdomain': 'Confirm the zone still delegates to Cloudflare and that a DNS record for this hostname exists.',
  'dns-no-address-records': 'Zone resolves but publishes no A/AAAA/CNAME for the web host. Decide: publish a placeholder, redirect, or record the property as intentionally parked in the registry.',
  'dns-failure': 'Re-run from a second resolver; check authoritative nameserver health for the zone.',
  'connect-refused': 'Origin/edge refused the TCP connection. Check the hosting provider status and proxy settings.',
  'connect-timeout': 'TCP connect timed out. Check origin availability, firewall rules, and provider status.',
  'connection-reset': 'Connection was reset mid-handshake. Check edge/WAF rules and origin health.',
  'tls-failure': 'TLS handshake or certificate validation failed. Inspect the certificate chain, expiry, and SNI/host mapping.',
  'http-timeout': 'The server accepted the connection but did not respond in time. Check origin latency and worker/function errors.',
  'http-5xx': 'Server returned a 5xx. Inspect origin/worker logs and the most recent deploy.',
  'http-4xx': 'Root path returned a client error. Confirm the site root is still published and not misrouted.',
  'redirect-loop': 'Redirect chain exceeded the limit or looped. Inspect redirect rules and canonical host settings.',
  'redirect-invalid': 'A redirect response had no usable Location. Inspect redirect rules.',
  'edge-challenge': 'The edge served a bot challenge to the probe. This is insufficient evidence, not an outage: allow-list the probe user agent/header or add a second vantage.',
  'access-restricted': 'The property gates its root (401/403). Record an authenticated or public health path in the registry.',
  'rate-limited': 'Probe was rate limited (429). Reduce cadence or allow-list the probe.',
  'vantage-failure': 'The probe vantage could not reach independent canary hosts; this run is invalid evidence. Re-run collection and check runner egress.',
  'tls-expiring': 'Certificate expires soon. Confirm auto-renewal (Cloudflare Universal SSL / origin cert) is active.',
  'unexpected-content': 'Response did not match the expected page contract. Review whether the property was intentionally changed and update the registry contract.',
});

export function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function extractTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : null;
}

async function readLimited(response, maxBytes) {
  if (!response.body) return { text: '', bytes: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytes;
      if (value.byteLength >= remaining) {
        // Never retain more than the cap, even when a single chunk crosses it.
        chunks.push(value.subarray(0, remaining));
        bytes += remaining;
        truncated = true;
        break;
      }
      bytes += value.byteLength;
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch (_error) {
      // Body already drained or closed.
    }
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(merged), bytes, truncated };
}

export function classifyNetworkError(error) {
  const cause = error?.cause || error;
  const code = String(cause?.code || error?.code || '');
  const name = String(error?.name || '');
  const message = String(cause?.message || error?.message || '');
  if (name === 'TimeoutError' || name === 'AbortError' || /UND_ERR_(HEADERS|BODY)_TIMEOUT/.test(code)) return 'http-timeout';
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'connect-timeout';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NODATA') return 'dns-failure';
  if (code === 'ECONNREFUSED') return 'connect-refused';
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return 'connection-reset';
  if (/CERT|SSL|TLS|ERR_TLS|SELF_SIGNED|ALTNAME/i.test(code + ' ' + message)) return 'tls-failure';
  return 'connect-timeout';
}

/** DNS classification: distinguishes a host that does not exist from a zone that publishes no web address. */
export async function resolveHost(host, resolver, clock = Date.now) {
  const started = clock();
  const settle = async fn => {
    try {
      const value = await fn(host);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, code: String(error?.code || 'UNKNOWN') };
    }
  };
  const [a, aaaa] = await Promise.all([settle(resolver.resolve4), settle(resolver.resolve6)]);
  const addresses = (a.ok ? a.value.length : 0) + (aaaa.ok ? aaaa.value.length : 0);
  const durationMs = clock() - started;
  if (addresses > 0) return { state: 'resolved', addresses, errorCode: null, durationMs };
  const codes = [a.code, aaaa.code].filter(Boolean);
  if (codes.every(code => code === 'ENOTFOUND' || code === 'ENODATA')) {
    // Both types answered with "nothing".
    return {
      // An NXDOMAIN on either query means the name is not delegated at all; only all-ENODATA is a name without addresses.
      state: codes.includes('ENOTFOUND') ? 'nxdomain' : 'no-address-records',
      addresses: 0,
      errorCode: codes.join(','),
      durationMs,
    };
  }
  return { state: 'error', addresses: 0, errorCode: codes.join(','), durationMs };
}

async function fetchOnce(url, options, ctx) {
  const { fetchImpl, contract } = ctx;
  const chain = [];
  let current = url;
  const started = ctx.now();
  for (let hop = 0; hop <= contract.maxRedirects; hop += 1) {
    const response = await fetchImpl(current, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(contract.timeoutMs),
      headers: {
        'user-agent': contract.userAgent,
        accept: options.accept || 'text/html,application/json;q=0.9,*/*;q=0.5',
        [contract.syntheticHeader.toLowerCase()]: contract.syntheticHeaderValue,
      },
    });
    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      try {
        await response.body?.cancel();
      } catch (_error) {
        // Ignore: redirect bodies are irrelevant.
      }
      if (!location) return { failure: 'redirect-invalid', status, chain, finalUrl: current, durationMs: ctx.now() - started };
      const next = new URL(location, current).toString();
      chain.push({ from: current, to: next, status });
      if (chain.length > contract.maxRedirects) return { failure: 'redirect-loop', status, chain, finalUrl: next, durationMs: ctx.now() - started };
      current = next;
      continue;
    }
    const body = await readLimited(response, contract.maxBodyBytes);
    return {
      status,
      chain,
      finalUrl: current,
      contentType: response.headers.get('content-type') || null,
      server: response.headers.get('server') || null,
      cfMitigated: response.headers.get('cf-mitigated') || null,
      text: body.text,
      bytes: body.bytes,
      durationMs: ctx.now() - started,
    };
  }
  return { failure: 'redirect-loop', status: null, chain, finalUrl: current, durationMs: ctx.now() - started };
}

function looksLikeChallenge(result) {
  if (result.cfMitigated) return true;
  if ([403, 429, 503].includes(result.status) && /just a moment|attention required|cf-challenge|captcha/i.test(result.text || '')) return true;
  return false;
}

/** Interprets one fetch outcome into an observation state. */
export function interpretHttp(result, contract) {
  if (result.failure) return { observed: 'failed', failureClass: result.failure };
  const { status } = result;
  if (looksLikeChallenge(result)) return { observed: 'blocked', failureClass: 'edge-challenge' };
  if (status === 429) return { observed: 'blocked', failureClass: 'rate-limited' };
  if (status === 401 || status === 403) return { observed: 'blocked', failureClass: 'access-restricted' };
  if (status >= 500) return { observed: 'failed', failureClass: 'http-5xx' };
  if (status >= 400) return { observed: 'degraded', failureClass: 'http-4xx' };
  if (HTTP_OK(status)) {
    if (result.durationMs > contract.slowMs) return { observed: 'degraded', failureClass: null, slow: true };
    return { observed: 'available', failureClass: null };
  }
  return { observed: 'degraded', failureClass: 'http-4xx' };
}

async function fetchWithRetries(url, options, ctx) {
  const { contract, sleep } = ctx;
  const attempts = Math.max(1, contract.attempts);
  let last = null;
  let count = 0;
  for (let index = 0; index < attempts; index += 1) {
    const delay = contract.retryDelaysMs?.[index] ?? 0;
    if (index > 0 && delay > 0) await sleep(delay);
    count += 1;
    let result;
    try {
      result = await fetchOnce(url, options, ctx);
    } catch (error) {
      result = { failure: classifyNetworkError(error), status: null, chain: [], finalUrl: url, durationMs: 0, errorMessage: String(error?.cause?.code || error?.message || error).slice(0, 160) };
    }
    const interpreted = interpretHttp(result, contract);
    last = { result, interpreted };
    // Only definitive good responses and vantage-restricted responses end retries early.
    if (interpreted.observed === 'available' || interpreted.observed === 'blocked') break;
  }
  return { ...last, attempts: count };
}

function evaluateJsonPath(document, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), document);
}

function matchesType(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'string') return typeof value === 'string' && value.length > 0;
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return true;
}

/** Evaluates a single critical-path check against a fetched response. Pure. */
export function evaluateCheck(check, response) {
  const base = { id: check.id, path: check.path, status: response?.status ?? null, durationMs: response?.durationMs ?? null };
  if (!response || response.failure || response.status == null) return { ...base, pass: false, detail: 'no-response' };
  if (!HTTP_OK(response.status)) return { ...base, pass: false, detail: 'status-' + response.status };
  if (check.contentType && !String(response.contentType || '').toLowerCase().includes(check.contentType)) {
    return { ...base, pass: false, detail: 'content-type-mismatch:' + (response.contentType || 'none') };
  }
  if (check.kind === 'page' && check.titleMatches) {
    const title = extractTitle(response.text);
    if (!title) return { ...base, pass: false, detail: 'title-missing' };
    if (!new RegExp(check.titleMatches, 'i').test(title)) return { ...base, pass: false, detail: 'title-mismatch:' + title.slice(0, 80) };
  }
  if (check.kind === 'json') {
    let document;
    try {
      document = JSON.parse(response.text);
    } catch (_error) {
      return { ...base, pass: false, detail: 'json-invalid' };
    }
    for (const requirement of check.jsonRequires || []) {
      const value = evaluateJsonPath(document, requirement.path);
      if (value === undefined) return { ...base, pass: false, detail: 'json-missing:' + requirement.path };
      if (requirement.type && !matchesType(value, requirement.type)) return { ...base, pass: false, detail: 'json-type:' + requirement.path };
      if (Object.hasOwn(requirement, 'equals') && value !== requirement.equals) return { ...base, pass: false, detail: 'json-value:' + requirement.path };
    }
  }
  if (check.maxLatencyMs && response.durationMs > check.maxLatencyMs) return { ...base, pass: false, detail: 'latency:' + response.durationMs };
  return { ...base, pass: true, detail: 'ok' };
}

async function evaluateCriticalPath(property, primary, ctx) {
  const spec = property.probe.criticalPath;
  if (!spec) {
    return {
      state: 'unknown',
      level: null,
      basis: null,
      checks: [],
      reason: property.probe.criticalPathReason || 'No honest critical-path contract exists for this property yet; only availability is probed.',
    };
  }
  if (!['available', 'degraded'].includes(primary.observed)) {
    return { state: 'unknown', level: spec.level, basis: spec.basis, checks: [], reason: 'Not evaluable while availability is ' + primary.observed + '.' };
  }
  const checks = [];
  for (const check of spec.checks) {
    if (check.path === property.probe.path && primary.response && !primary.response.failure) {
      checks.push(evaluateCheck(check, primary.response));
      continue;
    }
    let response;
    try {
      response = await fetchOnce(new URL(check.path, property.probe.origin).toString(), { accept: check.kind === 'json' ? 'application/json' : undefined }, ctx);
    } catch (error) {
      response = { failure: classifyNetworkError(error), status: null };
    }
    checks.push(evaluateCheck(check, response));
  }
  const failed = checks.filter(item => !item.pass);
  const finalHost = property.probe.expectedFinalHost;
  if (finalHost && primary.response?.finalUrl && new URL(primary.response.finalUrl).hostname !== finalHost) {
    failed.push({ id: 'final-host', pass: false, detail: 'final-host:' + new URL(primary.response.finalUrl).hostname });
    checks.push(failed[failed.length - 1]);
  }
  if (!failed.length) return { state: 'pass', level: spec.level, basis: spec.basis, checks, reason: null };
  return {
    state: spec.level === 'authoritative' ? 'fail' : 'drift',
    level: spec.level,
    basis: spec.basis,
    checks,
    reason: failed.map(item => item.id + ':' + item.detail).join('; '),
  };
}

async function inspectTls(host, ctx) {
  if (!ctx.tlsInspect) return { state: 'unknown', daysRemaining: null, validTo: null };
  try {
    const info = await ctx.tlsInspect(host, 443, ctx.contract.timeoutMs);
    const validToMs = Date.parse(info.validTo);
    if (!Number.isFinite(validToMs)) return { state: 'unknown', daysRemaining: null, validTo: null };
    const daysRemaining = Math.floor((validToMs - ctx.now()) / 86400000);
    return {
      state: daysRemaining < 0 ? 'invalid' : daysRemaining <= ctx.contract.tlsExpiryWarnDays ? 'expiring' : 'valid',
      daysRemaining,
      validTo: new Date(validToMs).toISOString(),
    };
  } catch (_error) {
    return { state: 'unknown', daysRemaining: null, validTo: null };
  }
}

/**
 * Probe one property. Returns per-property evidence with a run-level observation:
 * available | degraded | unavailable | no-service-published | unknown (with `blocked`).
 */
export async function probeProperty(property, ctx) {
  const probedAt = new Date(ctx.now()).toISOString();
  const url = new URL(property.probe.path || '/', property.probe.origin).toString();
  const host = new URL(url).hostname;
  const dns = await resolveHost(host, ctx.resolver, ctx.now);

  const record = { propertyId: property.propertyId, probedAt, dns, http: null, tls: null, criticalPath: null };

  if (dns.state === 'nxdomain' || dns.state === 'no-address-records') {
    const declaredService = property.probe.expectation !== 'unspecified';
    record.http = { state: 'not-attempted', attempts: 0 };
    record.tls = { state: 'unknown', daysRemaining: null, validTo: null };
    record.criticalPath = await evaluateCriticalPath(property, { observed: 'failed' }, ctx);
    record.observation = declaredService
      ? {
          state: 'unavailable',
          blocked: false,
          failureClass: dns.state === 'nxdomain' ? 'dns-nxdomain' : 'dns-no-address-records',
          reason: 'Property is expected to serve content but DNS ' + (dns.state === 'nxdomain' ? 'does not resolve' : 'publishes no address records') + '.',
        }
      : {
          state: 'no-service-published',
          blocked: false,
          failureClass: dns.state === 'nxdomain' ? 'dns-nxdomain' : 'dns-no-address-records',
          reason: 'Zone is active but publishes no web address, and no service is declared for it. This is a topology decision, not an outage.',
        };
    record.observation.nextAction = FAILURE_NEXT_ACTIONS[record.observation.failureClass];
    return record;
  }

  const fetched = await fetchWithRetries(url, { accept: 'text/html,application/json;q=0.9' }, ctx);
  const { result, interpreted } = fetched;
  record.http = {
    state: interpreted.observed,
    status: result.status ?? null,
    finalUrl: result.finalUrl || url,
    redirects: (result.chain || []).map(hop => ({ from: hop.from, to: hop.to, status: hop.status })),
    durationMs: result.durationMs ?? null,
    contentType: result.contentType || null,
    bytes: result.bytes ?? null,
    attempts: fetched.attempts,
    errorCode: result.errorMessage || null,
  };
  record.tls = await inspectTls(host, ctx);
  const primary = { observed: interpreted.observed, response: result.failure ? null : result };
  record.criticalPath = await evaluateCriticalPath(property, primary, ctx);

  let state;
  let blocked = false;
  let failureClass = interpreted.failureClass;
  let reason;
  if (interpreted.failureClass === 'dns-failure' && property.probe.expectation === 'unspecified') {
    // The resolver could not classify the miss, but the OS resolver confirms the name does not resolve and no
    // service is declared: a topology decision, not an outage.
    state = 'no-service-published';
    reason = 'Zone is active but the hostname does not resolve, and no service is declared for it. This is a topology decision, not an outage.';
    record.observation = { state, blocked, failureClass: 'dns-nxdomain', reason, nextAction: FAILURE_NEXT_ACTIONS['dns-nxdomain'] };
    return record;
  }
  if (interpreted.observed === 'available') {
    state = 'available';
    reason = 'HTTP ' + result.status + ' from ' + new URL(result.finalUrl).hostname + ' in ' + result.durationMs + ' ms.';
    if (record.tls.state === 'expiring') {
      state = 'degraded';
      failureClass = 'tls-expiring';
      reason += ' Certificate expires in ' + record.tls.daysRemaining + ' days.';
    }
  } else if (interpreted.observed === 'degraded') {
    state = 'degraded';
    reason = interpreted.slow ? 'Responded but exceeded the ' + ctx.contract.slowMs + ' ms latency budget (' + result.durationMs + ' ms).' : 'Root responded with HTTP ' + result.status + '.';
  } else if (interpreted.observed === 'blocked') {
    state = 'unknown';
    blocked = true;
    reason = 'Probe was restricted by the target (' + interpreted.failureClass + '); this vantage cannot establish availability.';
  } else {
    state = 'unavailable';
    reason = 'All ' + fetched.attempts + ' attempts failed (' + interpreted.failureClass + ').';
  }
  record.observation = { state, blocked, failureClass, reason, nextAction: failureClass ? FAILURE_NEXT_ACTIONS[failureClass] || null : null };
  return record;
}

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    })
  );
  return results;
}

async function probeCanaries(canaries, ctx) {
  const results = [];
  for (const canary of canaries) {
    try {
      const response = await ctx.fetchImpl(canary.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(ctx.contract.timeoutMs), headers: { 'user-agent': ctx.contract.userAgent } });
      try {
        await response.body?.cancel();
      } catch (_error) {
        // Ignore.
      }
      results.push({ id: canary.id, ok: response.status >= 200 && response.status < 500, status: response.status });
    } catch (error) {
      results.push({ id: canary.id, ok: false, status: null, errorCode: String(error?.cause?.code || error?.name || 'error') });
    }
  }
  return results;
}

/**
 * Probe the full estate. If no independent canary is reachable the run is marked invalid-vantage and
 * every property observation is downgraded to unknown, so a broken runner can never fabricate outages.
 */
export async function probeEstate(registry, ctx, runMeta = {}) {
  const contract = registry.probeContract;
  const full = { ...ctx, contract };
  const startedAt = new Date(ctx.now()).toISOString();
  const canaries = await probeCanaries(registry.canaries || [], full);
  const vantageValid = canaries.length === 0 ? true : canaries.some(item => item.ok);

  let properties;
  if (!vantageValid) {
    properties = registry.properties.map(property => ({
      propertyId: property.propertyId,
      probedAt: startedAt,
      dns: null,
      http: { state: 'not-attempted', attempts: 0 },
      tls: { state: 'unknown', daysRemaining: null, validTo: null },
      criticalPath: { state: 'unknown', level: null, basis: null, checks: [], reason: 'Probe vantage invalid.' },
      observation: {
        state: 'unknown',
        blocked: false,
        failureClass: 'vantage-failure',
        reason: 'No independent canary was reachable from the probe vantage; this run is not evidence about the property.',
        nextAction: FAILURE_NEXT_ACTIONS['vantage-failure'],
      },
    }));
  } else {
    properties = await pool(registry.properties, contract.concurrency, property => probeProperty(property, full));
  }

  return {
    contractName: 'globaldeets-probe-run',
    schemaVersion: '1.0.0',
    runId: runMeta.runId || startedAt,
    startedAt,
    finishedAt: new Date(ctx.now()).toISOString(),
    vantage: contract.vantage,
    vantageCount: 1,
    validity: vantageValid ? 'valid' : 'invalid-vantage',
    canaries,
    syntheticTraffic: {
      userAgent: contract.userAgent,
      header: contract.syntheticHeader + ': ' + contract.syntheticHeaderValue,
      note: 'Probe requests are synthetic monitor traffic and must be excluded from certified human-audience classification.',
    },
    confirmation: null,
    properties,
  };
}

/**
 * Re-probes only properties whose observation was a failure, then merges. A property is `confirmed`
 * failed only if the second, independently delayed pass also fails; a recovery is recorded as
 * intermittent (degraded) rather than silently discarded.
 */
export async function confirmFailures(registry, run, ctx) {
  if (run.validity !== 'valid') return run;
  const failed = run.properties.filter(item => item.observation.state === 'unavailable');
  if (!failed.length) return run;
  const contract = registry.probeContract;
  const full = { ...ctx, contract };
  if (contract.confirmationDelayMs > 0) await ctx.sleep(contract.confirmationDelayMs);
  const byId = new Map(registry.properties.map(property => [property.propertyId, property]));
  const confirmedAt = new Date(ctx.now()).toISOString();
  const rechecks = await pool(failed, contract.concurrency, item => probeProperty(byId.get(item.propertyId), full));
  const merged = run.properties.map(item => {
    const index = failed.findIndex(failedItem => failedItem.propertyId === item.propertyId);
    if (index === -1) return item;
    const recheck = rechecks[index];
    if (recheck.observation.state === 'unavailable') {
      return { ...item, observation: { ...item.observation, confirmed: true, confirmedAt, reason: item.observation.reason + ' Confirmed by an independent re-probe after ' + contract.confirmationDelayMs + ' ms.' } };
    }
    return {
      ...recheck,
      observation: {
        ...recheck.observation,
        state: 'degraded',
        failureClass: item.observation.failureClass,
        reason: 'Intermittent: first pass failed (' + item.observation.failureClass + ') but the confirmation re-probe succeeded.',
        nextAction: FAILURE_NEXT_ACTIONS[item.observation.failureClass],
        confirmed: false,
      },
    };
  });
  return { ...run, finishedAt: confirmedAt, confirmation: { at: confirmedAt, reprobed: failed.map(item => item.propertyId) }, properties: merged };
}

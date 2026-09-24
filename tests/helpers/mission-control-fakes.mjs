import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const registry = () => JSON.parse(readFileSync(new URL('../../tools/mission-control/config/estate-registry.json', import.meta.url), 'utf8'));

export const T0 = Date.parse('2026-10-01T12:00:00Z');

/** Deterministic clock: advances only when a test or fake network call moves it. */
export function makeClock(start = T0) {
  let current = start;
  return { now: () => current, advance: ms => (current += ms), set: value => (current = value) };
}

export function html(title, extra = '') {
  return '<!doctype html><html><head><title>' + title + '</title></head><body>' + extra + '</body></html>';
}

/**
 * Builds a fake fetch from a site table: host -> behaviour.
 * behaviour: { status, title, contentType, redirectTo, error: { code, name }, latencyMs, body, paths: { '/x': {...} } }
 */
export function makeFetch(sites, clock) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), headers: init.headers });
    const site = sites[url.hostname];
    if (!site) {
      const error = new TypeError('fetch failed');
      error.cause = { code: 'ENOTFOUND' };
      throw error;
    }
    const behaviour = (site.paths && site.paths[url.pathname]) || site;
    if (behaviour.error) {
      const error = new TypeError('fetch failed');
      error.cause = behaviour.error;
      if (behaviour.error.name) error.name = behaviour.error.name;
      throw error;
    }
    if (behaviour.latencyMs && clock) clock.advance(behaviour.latencyMs);
    if (behaviour.redirectTo) {
      return new Response(null, { status: behaviour.redirectStatus || 301, headers: { location: behaviour.redirectTo } });
    }
    const contentType = behaviour.contentType || 'text/html; charset=utf-8';
    const body = behaviour.body !== undefined ? behaviour.body : contentType.includes('json') ? JSON.stringify(behaviour.json ?? {}) : html(behaviour.title || 'Site');
    return new Response(body, { status: behaviour.status || 200, headers: { 'content-type': contentType, ...(behaviour.headers || {}) } });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

export function makeResolver(hosts, overrides = {}) {
  const lookup = host => {
    if (overrides[host]) return overrides[host];
    if (hosts.has(host)) return { a: ['192.0.2.1'], aaaa: [] };
    return { a: 'ENODATA', aaaa: 'ENODATA' };
  };
  const answer = (value, code) => {
    if (typeof value === 'string') {
      const error = new Error(value);
      error.code = value;
      return Promise.reject(error);
    }
    if (!value.length) {
      const error = new Error('ENODATA');
      error.code = 'ENODATA';
      return Promise.reject(error);
    }
    void code;
    return Promise.resolve(value);
  };
  return { resolve4: host => answer(lookup(host).a), resolve6: host => answer(lookup(host).aaaa) };
}

/** Builds a JSON body that satisfies a check's jsonRequires (dotted paths, equals, type). */
function jsonSatisfying(requirements) {
  const body = {};
  for (const requirement of requirements) {
    const keys = requirement.path.split('.');
    let cursor = body;
    for (const key of keys.slice(0, -1)) cursor = cursor[key] ||= {};
    const value = Object.hasOwn(requirement, 'equals') ? requirement.equals : requirement.type === 'array' ? [] : requirement.type === 'number' ? 1 : requirement.type === 'object' ? {} : 'x';
    cursor[keys[keys.length - 1]] = value;
  }
  return body;
}

const CANARIES = { 'www.cloudflare.com': { title: 'cf' }, 'example.com': { title: 'Example Domain' } };

/** A healthy estate: every serving property answers 2xx with its baseline title; parked zones publish nothing. */
export function healthyWorld(reg = registry(), clock = makeClock()) {
  const sites = { ...CANARIES };
  const served = new Set(['www.cloudflare.com', 'example.com']);
  for (const property of reg.properties) {
    const host = new URL(property.probe.origin).hostname;
    if (property.probe.expectation === 'unspecified') continue;
    served.add(host);
    if (property.probe.expectedFinalHost && property.probe.expectedFinalHost !== host) {
      sites[host] = { redirectTo: 'https://' + property.probe.expectedFinalHost + '/' };
      const finalBaseline = property.probe.criticalPath?.checks?.find(check => check.kind === 'page' && check.titleMatches);
      sites[property.probe.expectedFinalHost] = { title: finalBaseline ? finalBaseline.titleMatches : property.displayName + ' home' };
      served.add(property.probe.expectedFinalHost);
      continue;
    }
    const baseline = property.probe.criticalPath?.checks?.find(check => check.kind === 'page');
    const title = baseline ? baseline.titleMatches.replace(/^cultur$/i, 'Explore Cultures') : property.displayName;
    // Every non-root check of a registered critical-path contract is served in the healthy world, so an owner-derived
    // authoritative contract passes unless a test deliberately breaks it.
    const paths = {};
    for (const check of property.probe.criticalPath?.checks || []) {
      const pathname = check.path.split('?')[0];
      if (pathname === (property.probe.path || '/')) continue;
      paths[pathname] = check.kind === 'json'
        ? { contentType: 'application/json', json: jsonSatisfying(check.jsonRequires || []) }
        : { body: html(property.displayName, (check.bodyIncludes || []).join(' ') + ' ' + 'x'.repeat(check.minBytes || 0)) };
    }
    const rootCheck = property.probe.criticalPath?.checks?.find(check => check.path === (property.probe.path || '/'));
    const root = rootCheck?.minBytes ? { title, body: html(title, 'x'.repeat(rootCheck.minBytes)) } : { title };
    sites[host] = Object.keys(paths).length ? { ...root, paths } : root;
  }
  sites['globaldeets.com'] = {
    title: 'GlobalDeets — Earth Information',
    paths: {
      '/api/news/health': { contentType: 'application/json', json: { totalSources: 21, healthySources: 16, sourceHealth: [] } },
      '/observatory/mission-control/mission-control-data.json': { contentType: 'application/json', json: { missionControlId: 'globaldeets-estate' } },
      '/api/intelligence/observatory/coverage': { contentType: 'application/json', json: { observatoryId: 'coverage-evidence' } },
    },
  };
  // Redirect hosts with an expected final host that is also a registry property (e.g. culturesherpa.org).
  sites['culturesherpa.org'] = { title: 'Explore Cultures' };
  const fetchImpl = makeFetch(sites, clock);
  const resolver = makeResolver(served);
  return { sites, served, fetchImpl, resolver, clock };
}

export function makeDeps(world, extra = {}) {
  const clock = world.clock;
  return {
    fetchImpl: world.fetchImpl,
    resolver: world.resolver,
    tlsInspect: async () => ({ validTo: new Date(clock.now() + 90 * 86400000).toUTCString() }),
    sleep: async ms => clock.advance(ms),
    readFile: async path => readFileSync(path, 'utf8'),
    now: clock.now,
    ...extra,
  };
}

export const quickRegistry = () => {
  const reg = registry();
  reg.probeContract = { ...reg.probeContract, retryDelaysMs: [0, 1, 1], confirmationDelayMs: 1, timeoutMs: 5000 };
  return reg;
};

import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyNetworkError, confirmFailures, evaluateCheck, extractTitle, probeEstate, probeProperty } from '../tools/mission-control/lib/probe.mjs';
import { healthyWorld, makeClock, makeDeps, makeFetch, makeResolver, quickRegistry } from './helpers/mission-control-fakes.mjs';

function setup(mutate) {
  const reg = quickRegistry();
  const clock = makeClock();
  const world = healthyWorld(reg, clock);
  if (mutate) mutate(world, reg);
  return { reg, clock, world, deps: makeDeps(world), byId: id => reg.properties.find(item => item.propertyId === id) };
}

const ctxFor = (reg, deps) => ({ ...deps, contract: reg.probeContract });

test('healthy estate: all 25 properties are probed and serving properties are available', async () => {
  const { reg, deps } = setup();
  const run = await probeEstate(reg, deps, { runId: 'r1' });
  assert.equal(run.validity, 'valid');
  assert.equal(run.properties.length, 25);
  const states = Object.groupBy ? Object.groupBy(run.properties, item => item.observation.state) : null;
  const byState = state => run.properties.filter(item => item.observation.state === state).length;
  assert.equal(byState('available'), 21);
  assert.equal(byState('no-service-published'), 4, 'the four parked zones are topology decisions, not outages');
  assert.equal(byState('unavailable'), 0);
  void states;
  const gd = run.properties.find(item => item.propertyId === 'globaldeets.com');
  assert.equal(gd.criticalPath.state, 'pass');
  assert.equal(gd.criticalPath.level, 'authoritative');
  assert.equal(gd.criticalPath.checks.length, 4);
  assert.equal(run.syntheticTraffic.header, 'X-GlobalDeets-Probe: mission-control');
});

test('probe requests carry the documented synthetic-traffic markers', async () => {
  const { reg, deps, world } = setup();
  await probeProperty(reg.properties[0], ctxFor(reg, deps));
  const call = world.fetchImpl.calls.find(item => item.url === 'https://globaldeets.com/');
  assert.match(call.headers['user-agent'], /GlobalDeets-MissionControl-Probe/);
  assert.equal(call.headers['x-globaldeets-probe'], 'mission-control');
});

test('DNS distinguishes NXDOMAIN and no-address zones; undeclared parked zones are not outages', async () => {
  const { reg, deps, byId } = setup();
  const parked = await probeProperty(byId('fwomps.com'), ctxFor(reg, deps));
  assert.equal(parked.dns.state, 'no-address-records');
  assert.equal(parked.observation.state, 'no-service-published');
  assert.match(parked.observation.reason, /not an outage/);
  assert.ok(parked.observation.nextAction);

  // A property that DECLARES a service but has no address records is a real outage.
  const declared = structuredClone(byId('fwomps.com'));
  declared.probe.expectation = 'serves-content';
  const outage = await probeProperty(declared, ctxFor(reg, deps));
  assert.equal(outage.observation.state, 'unavailable');
  assert.equal(outage.observation.failureClass, 'dns-no-address-records');

  const nx = makeResolver(new Set(), { 'fwomps.com': { a: 'ENOTFOUND', aaaa: 'ENOTFOUND' } });
  const nxRecord = await probeProperty(declared, ctxFor(reg, { ...deps, resolver: nx }));
  assert.equal(nxRecord.dns.state, 'nxdomain');
  assert.equal(nxRecord.observation.failureClass, 'dns-nxdomain');
});

test('HTTP 200 is available but never health: no critical-path contract stays unknown', async () => {
  const { reg, deps, byId } = setup();
  const record = await probeProperty(byId('culturesherpa.com'), ctxFor(reg, deps));
  assert.equal(record.observation.state, 'available');
  assert.equal(record.criticalPath.state, 'unknown');
  assert.match(record.criticalPath.reason, /alias|contract/i);
});

test('5xx across every attempt is unavailable with failure class, evidence, and next action', async () => {
  const { reg, deps, byId, world } = setup(world => {
    world.sites['agentkagent.com'] = { status: 503, title: 'oops' };
  });
  const record = await probeProperty(byId('agentkagent.com'), ctxFor(reg, deps));
  assert.equal(record.observation.state, 'unavailable');
  assert.equal(record.observation.failureClass, 'http-5xx');
  assert.equal(record.http.attempts, 3);
  assert.equal(record.http.status, 503);
  assert.ok(record.observation.nextAction);
  assert.ok(record.probedAt);
  assert.equal(world.fetchImpl.calls.filter(call => call.url === 'https://agentkagent.com/').length, 3);
});

test('a transient failure that recovers within retries is available, not an outage', async () => {
  let attempts = 0;
  const { reg, deps, byId, world } = setup();
  const inner = world.fetchImpl;
  const flaky = async (input, init) => {
    if (String(input) === 'https://aiaimate.com/') {
      attempts += 1;
      if (attempts === 1) {
        const error = new TypeError('fetch failed');
        error.cause = { code: 'ECONNRESET' };
        throw error;
      }
    }
    return inner(input, init);
  };
  const record = await probeProperty(byId('aiaimate.com'), ctxFor(reg, { ...deps, fetchImpl: flaky }));
  assert.equal(record.observation.state, 'available');
  assert.equal(record.http.attempts, 2);
});

test('edge challenges and access restrictions are insufficient evidence, never outages', async () => {
  const { reg, deps, byId } = setup(world => {
    world.sites['cyancanoe.com'] = { status: 403, headers: { 'cf-mitigated': 'challenge' }, body: 'Just a moment...' };
    world.sites['foxyana.com'] = { status: 401 };
    world.sites['citizenapproved.org'] = { status: 429 };
  });
  for (const [id, expectedClass] of [['cyancanoe.com', 'edge-challenge'], ['foxyana.com', 'access-restricted'], ['citizenapproved.org', 'rate-limited']]) {
    const record = await probeProperty(byId(id), ctxFor(reg, deps));
    assert.equal(record.observation.state, 'unknown', id);
    assert.equal(record.observation.blocked, true, id);
    assert.equal(record.observation.failureClass, expectedClass, id);
  }
});

test('slow responses and expiring certificates degrade rather than fail', async () => {
  const { reg, deps, byId } = setup(world => {
    world.sites['heavymoose.com'] = { title: 'Heavy Moose | Official Artist Site', latencyMs: 9000 };
  });
  const slow = await probeProperty(byId('heavymoose.com'), ctxFor(reg, deps));
  assert.equal(slow.observation.state, 'degraded');
  assert.match(slow.observation.reason, /latency budget/);

  const expiring = await probeProperty(byId('lowertownstpaul.org'), ctxFor(reg, { ...deps, tlsInspect: async () => ({ validTo: new Date(deps.now() + 5.5 * 86400000).toUTCString() }) }));
  assert.equal(expiring.observation.state, 'degraded');
  assert.equal(expiring.observation.failureClass, 'tls-expiring');
  assert.equal(expiring.tls.daysRemaining, 5);
});

test('redirect loops and invalid redirects are failures; hop chains are recorded', async () => {
  const { reg, deps, byId } = setup(world => {
    world.sites['goodflippinnews.com'] = { redirectTo: 'https://goodflippinnews.com/loop' };
  });
  const loop = await probeProperty(byId('goodflippinnews.com'), ctxFor(reg, deps));
  assert.equal(loop.observation.state, 'unavailable');
  assert.equal(loop.observation.failureClass, 'redirect-loop');

  const followed = await probeProperty(byId('culturesherpa.com'), ctxFor(reg, deps));
  assert.equal(followed.http.redirects.length, 1);
  assert.equal(new URL(followed.http.finalUrl).hostname, 'culturesherpa.org');
});

test('network errors are classified into actionable failure classes', () => {
  const make = (code, name) => Object.assign(new TypeError('fetch failed'), { cause: { code }, name: name || 'TypeError' });
  assert.equal(classifyNetworkError(make('ECONNREFUSED')), 'connect-refused');
  assert.equal(classifyNetworkError(make('ECONNRESET')), 'connection-reset');
  assert.equal(classifyNetworkError(make('UND_ERR_CONNECT_TIMEOUT')), 'connect-timeout');
  assert.equal(classifyNetworkError(make('CERT_HAS_EXPIRED')), 'tls-failure');
  assert.equal(classifyNetworkError(make('ENOTFOUND')), 'dns-failure');
  assert.equal(classifyNetworkError(Object.assign(new Error('t'), { name: 'TimeoutError' })), 'http-timeout');
});

test('critical-path failures differ by contract level: authoritative fails, baseline drifts', async () => {
  const { reg, deps, byId } = setup(world => {
    world.sites['globaldeets.com'].paths['/api/news/health'] = { contentType: 'application/json', json: { totalSources: 'many' } };
    world.sites['agentkagent.com'] = { title: 'Totally different site' };
  });
  const authoritative = await probeProperty(byId('globaldeets.com'), ctxFor(reg, deps));
  assert.equal(authoritative.observation.state, 'available', 'reachability is unaffected');
  assert.equal(authoritative.criticalPath.state, 'fail');
  assert.match(authoritative.criticalPath.reason, /news-health/);

  const baseline = await probeProperty(byId('agentkagent.com'), ctxFor(reg, deps));
  assert.equal(baseline.observation.state, 'available');
  assert.equal(baseline.criticalPath.state, 'drift');
});

test('critical path is not evaluated while availability is failing', async () => {
  const { reg, deps, byId } = setup(world => {
    world.sites['globaldeets.com'] = { status: 500, title: 'x' };
  });
  const record = await probeProperty(byId('globaldeets.com'), ctxFor(reg, deps));
  assert.equal(record.observation.state, 'unavailable');
  assert.equal(record.criticalPath.state, 'unknown');
  assert.match(record.criticalPath.reason, /Not evaluable/);
});

test('an unreachable vantage invalidates the run instead of fabricating 25 outages', async () => {
  const { reg, deps } = setup();
  const dead = makeFetch({}, deps);
  const run = await probeEstate(reg, { ...deps, fetchImpl: dead }, { runId: 'r-dead' });
  assert.equal(run.validity, 'invalid-vantage');
  assert.equal(run.properties.length, 25);
  assert.ok(run.properties.every(item => item.observation.state === 'unknown' && item.observation.failureClass === 'vantage-failure'));
  assert.ok(run.properties.every(item => item.observation.state !== 'unavailable'));
});

test('failures are confirmed by a delayed re-probe; recoveries are recorded as intermittent', async () => {
  const { reg, deps, world } = setup(world => {
    world.sites['agentkagent.com'] = { status: 502, title: 'x' };
    world.sites['aiaimate.com'] = { status: 502, title: 'x' };
  });
  const first = await probeEstate(reg, deps, { runId: 'r2' });
  assert.equal(first.properties.find(item => item.propertyId === 'agentkagent.com').observation.confirmed, undefined);

  // Recover aiaimate.com before the confirmation pass; agentkagent stays down.
  world.sites['aiaimate.com'] = { title: 'AIAIMate — Free, Visual AI Literacy' };
  const confirmed = await confirmFailures(reg, first, deps);
  const down = confirmed.properties.find(item => item.propertyId === 'agentkagent.com');
  assert.equal(down.observation.state, 'unavailable');
  assert.equal(down.observation.confirmed, true);
  const flapped = confirmed.properties.find(item => item.propertyId === 'aiaimate.com');
  assert.equal(flapped.observation.state, 'degraded');
  assert.equal(flapped.observation.confirmed, false);
  assert.match(flapped.observation.reason, /Intermittent/);
  assert.deepEqual([...confirmed.confirmation.reprobed].sort(), ['agentkagent.com', 'aiaimate.com']);
});

test('check evaluator handles page, json, content-type, and latency contracts', () => {
  const page = { status: 200, contentType: 'text/html', text: '<title>Hello &amp; welcome</title>', durationMs: 10 };
  assert.equal(extractTitle(page.text), 'Hello & welcome');
  assert.equal(evaluateCheck({ id: 'a', kind: 'page', contentType: 'text/html', titleMatches: 'welcome' }, page).pass, true);
  assert.equal(evaluateCheck({ id: 'a', kind: 'page', titleMatches: 'nope' }, page).pass, false);
  assert.equal(evaluateCheck({ id: 'a', kind: 'json', contentType: 'application/json', jsonRequires: [{ path: 'x' }] }, page).detail.startsWith('content-type'), true);
  const json = { status: 200, contentType: 'application/json', text: '{"a":{"b":[1]}}', durationMs: 50 };
  assert.equal(evaluateCheck({ id: 'j', kind: 'json', jsonRequires: [{ path: 'a.b', type: 'array' }] }, json).pass, true);
  assert.equal(evaluateCheck({ id: 'j', kind: 'json', jsonRequires: [{ path: 'a.c' }] }, json).detail, 'json-missing:a.c');
  assert.equal(evaluateCheck({ id: 'j', kind: 'json', maxLatencyMs: 10, jsonRequires: [] }, json).detail, 'latency:50');
  assert.equal(evaluateCheck({ id: 'x', kind: 'page' }, { status: 404, contentType: 'text/html', text: '' }).detail, 'status-404');
});

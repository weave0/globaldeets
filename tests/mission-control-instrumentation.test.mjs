import assert from 'node:assert/strict';
import test from 'node:test';
import { CF_BEACON, GA4, collect, newDir, tagHost } from './helpers/mission-control-plane.mjs';
import { classifyInstrumentation, detectInstrumentation, isPlaceholderMeasurementId, summarizeInstrumentation } from '../tools/mission-control/lib/instrumentation.mjs';
import { fetchRumReception, receptionFor } from '../tools/mission-control/lib/rum-reception.mjs';
import { validateEstate } from '../tools/mission-control/lib/contracts.mjs';

const page = tags => '<!doctype html><html><head><title>x</title>' + tags + '</head><body>hello</body></html>';

test('detection: GA4 script, inline config, GTM, Cloudflare beacon token, and a clean page', () => {
  const ga = detectInstrumentation(page(GA4('G-ABC123DEF4')), { contentType: 'text/html' });
  assert.deepEqual(ga.providers, [{ id: 'ga4', measurementId: 'G-ABC123DEF4', placeholder: false }]);
  const inline = detectInstrumentation(page("<script>gtag('config', 'G-WM6Q66W9W0');</script>"));
  assert.equal(inline.providers[0].measurementId, 'G-WM6Q66W9W0');
  const gtm = detectInstrumentation(page('<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABCD12"></script>'));
  assert.equal(gtm.providers[0].id, 'google-tag-manager');
  const beacon = detectInstrumentation(page(CF_BEACON('abc123def456')));
  assert.deepEqual(beacon.providers, [{ id: 'cloudflare-web-analytics', siteTag: 'abc123def456', placeholder: false }]);
  const clean = detectInstrumentation(page(''));
  assert.deepEqual(clean.providers, []);
  assert.equal(clean.evaluated, true);
  assert.match(clean.reason, /Tags injected only by scripts cannot be seen/);
});

test('detection: a placeholder measurement ID is recognized and never counted as a real tag', () => {
  for (const id of ['G-XXXXXXXXXX', 'G-XXXXXXXX', 'G-0000000000']) assert.equal(isPlaceholderMeasurementId(id), true);
  assert.equal(isPlaceholderMeasurementId('G-WM6Q66W9W0'), false);
  assert.equal(isPlaceholderMeasurementId('G-CUSTOM1234', ['G-CUSTOM1234']), true, 'the registry can name extra placeholders');
  const detection = detectInstrumentation(page(GA4('G-XXXXXXXXXX')));
  assert.equal(detection.providers[0].placeholder, true);
  const state = classifyInstrumentation({ availabilityState: 'available', detection });
  assert.equal(state.state, 'configured-invalid');
});

test('detection: non-HTML, empty and truncated bodies are handled honestly', () => {
  assert.equal(detectInstrumentation('', {}).evaluated, false);
  assert.equal(detectInstrumentation('{"a":1}', { contentType: 'application/json' }).evaluated, false);
  const truncated = detectInstrumentation(page(''), { truncated: true });
  assert.equal(truncated.complete, false);
  assert.match(truncated.reason, /truncated/);
  assert.equal(classifyInstrumentation({ availabilityState: 'available', detection: truncated }).confidence, 'low');
});

test('classification: every state is reachable and each keeps its meaning', () => {
  const detected = detectInstrumentation(page(GA4('G-REAL123456')));
  assert.equal(classifyInstrumentation({ availabilityState: 'no-service-published' }).state, 'not-applicable');
  assert.equal(classifyInstrumentation({ availabilityState: 'available', redirectOnly: true, detection: detected }).state, 'not-applicable');
  assert.equal(classifyInstrumentation({ availabilityState: 'unknown', blocked: true }).state, 'inaccessible');
  assert.equal(classifyInstrumentation({ availabilityState: 'unknown', detection: null }).state, 'unknown');
  assert.equal(classifyInstrumentation({ availabilityState: 'available', detection: detectInstrumentation(page('')) }).state, 'absent');
  const unverified = classifyInstrumentation({ availabilityState: 'available', detection: detected });
  assert.equal(unverified.state, 'configured-unverified');
  assert.match(unverified.reason, /no evidence shows events are being received/);
});

test('a shipped tag is never reception: only received Cloudflare page loads make a property active-verified', () => {
  const ga = detectInstrumentation(page(GA4('G-REAL123456')));
  const withReception = { state: 'received', events: 900, windowHours: 24, observedAt: 'x' };
  assert.equal(classifyInstrumentation({ availabilityState: 'available', detection: ga, reception: withReception }).state, 'configured-unverified', 'a GA4 tag is not verified by Cloudflare reception');
  const beacon = detectInstrumentation(page(CF_BEACON('tok')));
  assert.equal(classifyInstrumentation({ availabilityState: 'available', detection: beacon, reception: withReception }).state, 'active-verified');
  const silent = classifyInstrumentation({ availabilityState: 'available', detection: beacon, reception: { state: 'none-received', events: 0, windowHours: 24 } });
  assert.equal(silent.state, 'configured-unverified');
  assert.match(silent.reason, /zero page loads/);
  assert.equal(classifyInstrumentation({ availabilityState: 'available', detection: beacon, reception: { state: 'unavailable' } }).state, 'configured-unverified');
});

test('reception reader: maps hosts, and every failure is an explicit unavailable with a reason', async () => {
  const now = () => Date.parse('2026-10-01T12:00:00Z');
  const ok = body => async () => new Response(JSON.stringify(body), { status: 200 });
  const groups = [{ count: 40, dimensions: { requestHost: 'Heavymoose.com' } }, { count: 5, dimensions: { requestHost: 'www.heavymoose.com' } }, { count: 7, dimensions: { requestHost: 'foxyana.com' } }];
  const measured = await fetchRumReception({ token: 't', accountId: 'a', fetchImpl: ok({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: groups }] } } }), now });
  assert.equal(measured.status, 'measured');
  assert.equal(receptionFor(measured, 'heavymoose.com').events, 45);
  assert.equal(receptionFor(measured, 'heavymoose.com').state, 'received');
  assert.equal(receptionFor(measured, 'aiaimate.com').state, 'none-received', 'a successful query with no rows for a host is a measured none');

  const denied = await fetchRumReception({ token: 't', accountId: 'a', fetchImpl: ok({ errors: [{ message: 'not authorized for that dataset' }] }), now });
  assert.equal(denied.status, 'unavailable');
  assert.match(denied.reason, /not authorized/);
  assert.equal(receptionFor(denied, 'heavymoose.com').state, 'unavailable');
  assert.equal((await fetchRumReception({ token: '', accountId: 'a', fetchImpl: ok({}), now })).status, 'unavailable');
  assert.match((await fetchRumReception({ token: 't', accountId: 'a', fetchImpl: ok({ data: { viewer: { accounts: [{}] } } }), now })).reason, /no RUM page-load dataset/);
  assert.match((await fetchRumReception({ token: 't', accountId: 'a', fetchImpl: async () => { throw new Error('boom'); }, now })).reason, /unreachable/);
  assert.match((await fetchRumReception({ token: 't', accountId: 'a', fetchImpl: async () => new Response('nope', { status: 500 }), now })).reason, /HTTP 500/);
});

test('end to end: served tags decide instrumentation truth, not the carried-forward RUM flag', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, {
    mutate: world => {
      tagHost(world, 'aiaimate.com', GA4('G-REAL123456'));
      tagHost(world, 'heavymoose.com', GA4('G-XXXXXXXXXX'));
      tagHost(world, 'foxyana.com', CF_BEACON('siteTagFox'));
      tagHost(world, 'agentkagent.com', '');
    },
  });
  const row = id => plane.estate.properties.find(item => item.propertyId === id);
  assert.equal(row('aiaimate.com').observability.state, 'configured-unverified');
  assert.equal(row('aiaimate.com').observability.evidenceState, 'measured');
  assert.equal(row('heavymoose.com').observability.state, 'configured-invalid');
  assert.equal(row('foxyana.com').observability.state, 'configured-unverified', 'a beacon without reception evidence is unverified');
  assert.equal(row('agentkagent.com').observability.state, 'absent');
  assert.equal(row('agentkagent.com').observability.rum, 'on');
  assert.equal(row('agentkagent.com').observability.discrepancy, 'setting-on-but-no-beacon-served');
  assert.equal(row('agentkagent.com').observability.rumSetting.evidenceState, 'carried-forward');
  assert.equal(row('artificelligance.com').observability.state, 'not-applicable', 'nothing is published, so nothing to instrument');
  assert.equal(row('culturesherpa.com').observability.state, 'not-applicable', 'a redirect alias is judged at its destination');
  const summary = plane.estate.summary.instrumentation;
  assert.equal(summary.activeVerified, 0);
  assert.equal(summary.configuredUnverified, 2);
  assert.equal(summary.configuredInvalid, 1);
  assert.equal(summarizeInstrumentation(plane.estate.properties).applicable, summary.applicable);
  assert.deepEqual(validateEstate(plane.estate), []);
});

test('end to end: Cloudflare reception evidence promotes only a shipped Cloudflare beacon to active-verified', async () => {
  const dir = newDir();
  const cloudflare = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/graphql')) {
      const body = { data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [{ count: 321, dimensions: { requestHost: 'foxyana.com' } }] }] } } };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    void init;
    const ok = (result, info = { total_pages: 1 }) => new Response(JSON.stringify({ success: true, result, result_info: info }), { status: 200 });
    if (url.includes('/zones')) return ok([{ name: 'foxyana.com', status: 'active' }]);
    if (url.includes('/domains')) return ok([]);
    return ok([], { total_count: 0 });
  };
  const { plane } = await collect(dir, {
    cloudflare,
    env: { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' },
    mutate: world => {
      tagHost(world, 'foxyana.com', CF_BEACON('siteTagFox'));
      tagHost(world, 'aiaimate.com', CF_BEACON('siteTagAia'));
    },
  });
  const row = id => plane.estate.properties.find(item => item.propertyId === id);
  assert.equal(row('foxyana.com').observability.state, 'active-verified');
  assert.equal(row('foxyana.com').observability.reception.events, 321);
  assert.equal(row('aiaimate.com').observability.state, 'configured-unverified', 'beacon shipped, but the query shows no page loads for it');
  assert.equal(plane.estate.evidence.rumReception.status, 'measured');
  assert.equal(plane.estate.summary.instrumentation.activeVerified, 1);
  assert.deepEqual(validateEstate(plane.estate), []);
});

test('a blocked or failing page is inaccessible or unknown, never "absent"', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, {
    mutate: world => {
      world.sites['brettleeweaver.com'] = { status: 403, title: 'Just a moment...', body: '<html><title>Just a moment...</title>cf-challenge</html>' };
      world.sites['citizenapproved.org'] = { status: 500, title: 'x' };
    },
  });
  const row = id => plane.estate.properties.find(item => item.propertyId === id);
  assert.equal(row('brettleeweaver.com').observability.state, 'inaccessible');
  assert.notEqual(row('brettleeweaver.com').observability.state, 'absent');
  assert.notEqual(row('citizenapproved.org').observability.state, 'absent');
});

test('the validator rejects instrumentation claims the evidence cannot support', async () => {
  const dir = newDir();
  const { plane } = await collect(dir, { mutate: world => tagHost(world, 'aiaimate.com', GA4('G-REAL123456')) });
  const forged = structuredClone(plane.estate);
  forged.properties.find(item => item.propertyId === 'aiaimate.com').observability.state = 'active-verified';
  assert.ok(validateEstate(forged).some(error => /active-verified instrumentation without reception evidence/.test(error)));
  const noProvider = structuredClone(plane.estate);
  noProvider.properties.find(item => item.propertyId === 'aiaimate.com').observability.providers = [];
  assert.ok(validateEstate(noProvider).some(error => /without a real provider/.test(error)));
  const relabelled = structuredClone(plane.estate);
  relabelled.properties[0].observability.rumSetting.evidenceState = 'measured';
  assert.ok(validateEstate(relabelled).some(error => /RUM setting labelled measured/.test(error)));
});

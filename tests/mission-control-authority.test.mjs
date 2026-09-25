import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPreflight } from '../tools/mission-control/lib/authority.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'tools/mission-control/config/authority-manifest.json'), 'utf8'));
const NOW = () => Date.parse('2026-09-25T16:30:00.000Z');
const ENV = { CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct', EVENTS_SOURCE: 'https://feed.test/v1/feed', EVENTS_SOURCE_TOKEN: 'feed' };

const reply = (status, json) => ({ status, ok: status < 300, json: async () => json });
const denied = () => reply(403, { success: false, errors: [{ code: 9109, message: 'Unauthorized to access requested resource' }] });

function fakeCloudflare({ deny = [], graphqlError = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(url);
    const hit = key => url.includes(key);
    if (hit('/tokens/verify')) return reply(200, { success: true, result: { status: 'active' } });
    if (hit('/graphql')) {
      if (graphqlError) return reply(200, { data: null, errors: [{ message: graphqlError }] });
      return deny.includes('graphql') ? reply(200, { data: null, errors: [{ message: 'not authorized for that account' }] }) : reply(200, { data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [] }] } } });
    }
    if (hit('/zones')) return deny.includes('zones') ? denied() : reply(200, { success: true, result: [] });
    if (hit('/pages/projects')) return deny.includes('pages') ? denied() : reply(200, { success: true, result: [] });
    if (hit('/d1/database/')) return deny.includes('d1') ? denied() : reply(200, { success: true, result: {} });
    if (hit('feed.test')) return init.headers.authorization === 'Bearer feed' ? reply(200, { contractName: 'globaldeets-business-events-feed', instrumentedProperties: ['a.com'] }) : reply(401, { error: 'Unauthorized.' });
    throw new Error('unexpected ' + url);
  };
  return { fetchImpl, calls };
}

test('a fully provisioned credential passes and never touches D1 when the Worker feed is configured', async () => {
  const cf = fakeCloudflare();
  const report = await runPreflight({ manifest, env: ENV, fetchImpl: cf.fetchImpl, now: NOW });
  assert.equal(report.healthy, true, JSON.stringify(report.failures));
  assert.equal(report.results.find(r => r.id === 'cloudflare.d1.read').status, 'skipped');
  assert.ok(!cf.calls.some(url => url.includes('/d1/')));
});

test('a denied capability names the exact Cloudflare permission to add', async () => {
  const report = await runPreflight({ manifest, env: ENV, fetchImpl: fakeCloudflare({ deny: ['pages'] }).fetchImpl, now: NOW });
  assert.equal(report.healthy, false);
  assert.deepEqual(report.failures.map(f => f.id), ['cloudflare.pages.read']);
  assert.equal(report.failures[0].status, 'denied');
  assert.match(report.failures[0].detail, /9109/);
  assert.match(report.failures[0].remedy, /Account → Cloudflare Pages → Read/);
});

test('without the Worker feed, D1 Read becomes required and its absence is named precisely', async () => {
  const env = { ...ENV, EVENTS_SOURCE: '', EVENTS_SOURCE_TOKEN: '' };
  const report = await runPreflight({ manifest, env, fetchImpl: fakeCloudflare({ deny: ['d1'] }).fetchImpl, now: NOW });
  const ids = report.failures.map(f => f.id).sort();
  assert.deepEqual(ids, ['cloudflare.d1.read', 'events.feed.read']);
  assert.match(report.failures.find(f => f.id === 'cloudflare.d1.read').remedy, /Account → D1 → Read/);
});

test('without the Worker feed, a working D1 REST read satisfies business events', async () => {
  const env = { ...ENV, EVENTS_SOURCE: '', EVENTS_SOURCE_TOKEN: '' };
  const report = await runPreflight({ manifest, env, fetchImpl: fakeCloudflare().fetchImpl, now: NOW });
  assert.equal(report.healthy, true);
  assert.equal(report.results.find(r => r.id === 'events.feed.read').status, 'fallback');
});

test('a rejected feed token and an unauthorized RUM query both fail with remedies', async () => {
  const env = { ...ENV, EVENTS_SOURCE_TOKEN: 'wrong' };
  const report = await runPreflight({ manifest, env, fetchImpl: fakeCloudflare({ deny: ['graphql'] }).fetchImpl, now: NOW });
  assert.deepEqual(report.failures.map(f => f.id).sort(), ['cloudflare.analytics.read', 'events.feed.read']);
  assert.match(report.failures.find(f => f.id === 'cloudflare.analytics.read').remedy, /Account Analytics → Read/);
  assert.match(report.failures.find(f => f.id === 'events.feed.read').remedy, /MISSION_CONTROL_EVENTS_TOKEN/);
});


test('a non-authorization GraphQL error is classified as an upstream error, not a missing permission', async () => {
  const report = await runPreflight({ manifest, env: ENV, fetchImpl: fakeCloudflare({ graphqlError: 'Unknown field rumPageloadEventsAdaptiveGroups' }).fetchImpl, now: NOW });
  const item = report.failures.find(f => f.id === 'cloudflare.analytics.read');
  assert.equal(item.status, 'error');
  assert.match(item.remedy, /not classified as an authorization failure/i);
  assert.doesNotMatch(item.remedy, /Account Analytics/);
});

test('missing secrets are reported as missing without any network call', async () => {
  const cf = fakeCloudflare();
  const report = await runPreflight({ manifest, env: {}, fetchImpl: cf.fetchImpl, now: NOW });
  assert.equal(cf.calls.length, 0);
  assert.ok(report.failures.every(f => f.status === 'missing'));
});

// The authority contract: no collector code may reach a Cloudflare API path or read a credential the manifest does not declare.
test('every Cloudflare API resource used by the collector is declared in the authority manifest', () => {
  const libDir = join(root, 'tools/mission-control/lib');
  const RESOURCES = ['zones', 'pages', 'd1', 'graphql', 'workers', 'r2', 'kv', 'storage', 'dns_records', 'tokens', 'analytics', 'rulesets', 'firewall', 'queues', 'hyperdrive', 'vectorize', 'ai', 'images', 'stream', 'logpush', 'access', 'email', 'members', 'roles', 'billing', 'tunnels', 'cfd_tunnel', 'secrets_store', 'load_balancers'];
  const pattern = new RegExp('/(' + RESOURCES.join('|') + ')(?=[/?\'"`$])', 'g');
  const declared = manifest.capabilities.flatMap(c => (c.apiPaths || []).map(path => ({ resource: path.split('/')[1], consumers: c.consumers })));
  for (const file of readdirSync(libDir).filter(name => name.endsWith('.mjs') && name !== 'authority.mjs')) {
    const source = readFileSync(join(libDir, file), 'utf8');
    if (!source.includes('api.cloudflare.com')) continue;
    const used = new Set([...source.matchAll(pattern)].map(m => m[1]));
    assert.ok(used.size, file + ' calls Cloudflare but no API resource was recognized; declare it in authority-manifest.json');
    for (const resource of used) {
      const match = declared.find(entry => entry.resource === resource && entry.consumers.includes('tools/mission-control/lib/' + file));
      assert.ok(match, file + ' uses Cloudflare /' + resource + ' but no capability in authority-manifest.json declares it for this file');
    }
  }
});

test('every secret the evidence workflow passes to the collector is declared in the authority manifest', () => {
  const workflow = readFileSync(join(root, '.github/workflows/mission-control-evidence.yml'), 'utf8');
  const used = new Set([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]));
  const declared = new Set([manifest.credential.secret, manifest.credential.accountSecret, ...manifest.capabilities.flatMap(c => c.secrets || [])]);
  // Gold/insights sources are governed by the audience contract, not Cloudflare authority.
  const audience = new Set(['MISSION_CONTROL_GOLD_SOURCE', 'MISSION_CONTROL_GOLD_TOKEN', 'MISSION_CONTROL_INSIGHTS_SOURCE']);
  for (const name of used) assert.ok(declared.has(name) || audience.has(name), 'workflow secret ' + name + ' is not declared in authority-manifest.json');
});

// GD-036: the audience feed is probed exactly as the collector reads it, and every condition stays distinct.
const AUDIENCE_ENV = { ...ENV, GOLD_SOURCE: 'https://traffic.test/gold/canonical-gold-m1.2.json', GOLD_SOURCE_TOKEN: 'mcf_feed' };
const validGold = { contract_name: 'gfd-canonical-gold', schema_version: '1.2.0', fixture: false, generated_at: '2026-09-25T06:00:00Z', metrics: [{ metric_id: 'a' }] };
const validInsights = { contract_name: 'gfd-traffic-insights', schema_version: '1.1.0', fixture: false, generated_at: '2026-09-25T06:10:00Z', series: [], trend_comparisons: [] };

function withAudience(handler) {
  const cf = fakeCloudflare();
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    if (String(url).startsWith('https://traffic.test/')) {
      seen.push({ url: String(url), authorization: init.headers?.authorization });
      return handler(String(url), init);
    }
    return cf.fetchImpl(url, init);
  };
  return { fetchImpl, seen };
}
const audienceResult = async (env, handler) => {
  const world = withAudience(handler);
  const report = await runPreflight({ manifest, env, fetchImpl: world.fetchImpl, now: NOW });
  return { report, item: report.results.find(r => r.id === 'audience.feed.read'), seen: world.seen };
};
const feedReply = (url, init, { gold = validGold, insights = validInsights, token = 'mcf_feed' } = {}) => {
  if (init.headers?.authorization !== 'Bearer ' + token) return new Response('no', { status: 401 });
  return new Response(JSON.stringify(url.includes('insights') ? insights : gold), { status: 200, headers: { 'content-type': 'application/json' } });
};

test('audience feed: a connected feed passes, and one credential is used for both documents', async () => {
  const { item, report, seen } = await audienceResult(AUDIENCE_ENV, (url, init) => feedReply(url, init));
  assert.equal(item.status, 'ok');
  assert.equal(report.healthy, true);
  assert.deepEqual(seen.map(call => [call.url, call.authorization]), [
    ['https://traffic.test/gold/canonical-gold-m1.2.json', 'Bearer mcf_feed'],
    ['https://traffic.test/gold/traffic-insights-1.0.json', 'Bearer mcf_feed'],
  ]);
});

test('audience feed: source missing, credential missing and credential rejected are three different findings', async () => {
  const noSource = await audienceResult({ ...AUDIENCE_ENV, GOLD_SOURCE: '' }, () => assert.fail('no request without a source'));
  assert.equal(noSource.item.status, 'missing');
  assert.match(noSource.item.detail, /MISSION_CONTROL_GOLD_SOURCE is not set/);

  const noToken = await audienceResult({ ...AUDIENCE_ENV, GOLD_SOURCE_TOKEN: '' }, (url, init) => feedReply(url, init));
  assert.equal(noToken.item.status, 'denied');
  assert.match(noToken.item.detail, /MISSION_CONTROL_GOLD_TOKEN is not set/);

  const wrong = await audienceResult({ ...AUDIENCE_ENV, GOLD_SOURCE_TOKEN: 'mcf_wrong' }, (url, init) => feedReply(url, init));
  assert.equal(wrong.item.status, 'denied');
  assert.match(wrong.item.detail, /rejected MISSION_CONTROL_GOLD_TOKEN/);
  assert.match(wrong.item.remedy, /MISSION_CONTROL_FEED_TOKEN/);
  assert.match(wrong.item.remedy, /No Cloudflare API token/);
  for (const { item } of [noToken, wrong]) assert.ok(!JSON.stringify(item).includes('mcf_wrong') && !JSON.stringify(item).includes('mcf_feed'), 'the credential is never reported');
});

test('audience feed: an outage, a bot challenge, a malformed body, a fixture and a schema mismatch are not authorization failures', async () => {
  const cases = [
    ['outage', () => new Response('down', { status: 503 }), /HTTP 503/],
    ['challenge', () => new Response('<html>Just a moment</html>', { status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' } }), /edge challenge/],
    ['malformed', () => new Response('<html>oops</html>', { status: 200 }), /not valid JSON/],
    ['fixture', (url, init) => feedReply(url, init, { gold: { ...validGold, fixture: true } }), /fixture/],
    ['schema', (url, init) => feedReply(url, init, { gold: { ...validGold, schema_version: '2.0.0' } }), /schema-mismatch/],
    ['insights fixture', (url, init) => feedReply(url, init, { insights: { ...validInsights, fixture: true } }), /Insights is fixture/],
  ];
  for (const [name, handler, detail] of cases) {
    const { item, report } = await audienceResult(AUDIENCE_ENV, handler);
    assert.equal(item.status, 'error', name);
    assert.match(item.detail, detail, name);
    assert.match(item.remedy, /not a credential problem/, name);
    assert.equal(report.healthy, true, name + ': a degradable audience feed never fails the whole run');
  }
});

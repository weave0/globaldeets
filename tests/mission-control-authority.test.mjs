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

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { purgeRetiredEdgeCache } = require('../tools/purge-retired-edge-cache.js');
const { RETIRED_PATHS } = require('../tools/verify-boundary-retired-prod.js');
const deployWorkflow = readFileSync(
  new URL('../.github/workflows/deploy.yml', import.meta.url),
  'utf8'
);

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function zoneResponse(
  zones = [{ id: 'zone-id', name: 'globaldeets.com', account: { id: 'account-id' } }]
) {
  return response({ success: true, result: zones });
}

test('purges only canonical retired paths on both public Pages hostnames', async () => {
  const calls = [];
  const count = await purgeRetiredEdgeCache({
    accountId: 'account-id',
    apiToken: 'test-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return calls.length === 1
        ? zoneResponse()
        : response({ success: true, result: { id: 'purge-id' } });
    },
  });

  assert.equal(count, RETIRED_PATHS.length * 2);
  assert.equal(calls.length, 2);
  assert.equal(typeof calls[0].options.signal?.aborted, 'boolean');
  assert.equal(typeof calls[1].options.signal?.aborted, 'boolean');
  assert.notEqual(calls[0].options.signal, calls[1].options.signal);
  assert.equal(calls[0].url.origin, 'https://api.cloudflare.com');
  assert.equal(calls[0].url.pathname, '/client/v4/zones');
  assert.equal(calls[0].url.searchParams.get('name'), 'globaldeets.com');
  assert.equal(calls[0].url.searchParams.get('account.id'), 'account-id');
  assert.equal(calls[0].url.searchParams.get('status'), 'active');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[1].url.pathname, '/client/v4/zones/zone-id/purge_cache');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    files: ['https://globaldeets.com', 'https://www.globaldeets.com'].flatMap(origin =>
      RETIRED_PATHS.map(path => `${origin}${path}`)
    ),
  });
});

test('deployment purges retired paths before and after Pages publication', () => {
  const purgeSteps = [
    ...deployWorkflow.matchAll(/- name: Purge retired public paths from Cloudflare edge cache/g),
  ].map(match => match.index);
  const purgeCommands = [
    ...deployWorkflow.matchAll(/run: node tools\/purge-retired-edge-cache\.js/g),
  ].map(match => match.index);
  const deployIndex = deployWorkflow.indexOf('- name: Deploy to Cloudflare Pages');
  const productionVerificationIndex = deployWorkflow.indexOf(
    '- name: Verify production deployment'
  );

  assert.equal(purgeSteps.length, 2);
  assert.equal(purgeCommands.length, 2);
  assert.ok(purgeSteps[0] < deployIndex, 'pre-deploy purge validates permissions');
  assert.ok(
    purgeSteps[1] > deployIndex && purgeSteps[1] < productionVerificationIndex,
    'post-deploy purge clears any stale response repopulated before the origin switched'
  );
  const boundaryVerification = deployWorkflow.slice(
    deployWorkflow.indexOf('- name: Verify public product boundary holds')
  );
  assert.match(boundaryVerification, /--base=https:\/\/globaldeets\.com/);
  assert.match(boundaryVerification, /--base=https:\/\/www\.globaldeets\.com/);
});

test('requires both Cloudflare credentials before making a request', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return zoneResponse();
  };

  await assert.rejects(
    purgeRetiredEdgeCache({ accountId: 'account-id', apiToken: '', fetchImpl }),
    /CLOUDFLARE_API_TOKEN is required/
  );
  await assert.rejects(
    purgeRetiredEdgeCache({ accountId: '', apiToken: 'test-token', fetchImpl }),
    /CLOUDFLARE_ACCOUNT_ID is required/
  );
  assert.equal(called, false);
});

test('fails closed when zone lookup is denied or the zone belongs to another account', async () => {
  await assert.rejects(
    purgeRetiredEdgeCache({
      accountId: 'account-id',
      apiToken: 'test-token',
      fetchImpl: async () =>
        response(
          { success: false, errors: [{ code: 10000, message: 'Authentication error' }] },
          403
        ),
    }),
    /Cloudflare zone lookup failed \(HTTP 403\).*Authentication error/
  );

  let calls = 0;
  await assert.rejects(
    purgeRetiredEdgeCache({
      accountId: 'account-id',
      apiToken: 'test-token',
      fetchImpl: async () => {
        calls++;
        return zoneResponse([
          { id: 'other-zone', name: 'globaldeets.com', account: { id: 'other-account' } },
        ]);
      },
    }),
    /found 0/
  );
  assert.equal(calls, 1);
});

test('rejects ambiguous active zones in the configured account', async () => {
  let calls = 0;
  await assert.rejects(
    purgeRetiredEdgeCache({
      accountId: 'account-id',
      apiToken: 'test-token',
      fetchImpl: async () => {
        calls++;
        return zoneResponse([
          { id: 'zone-a', name: 'globaldeets.com', account: { id: 'account-id' } },
          { id: 'zone-b', name: 'globaldeets.com', account: { id: 'account-id' } },
        ]);
      },
    }),
    /found 2/
  );
  assert.equal(calls, 1, 'never attempt a purge without a unique matching zone');
});

test('fails closed on malformed Cloudflare success responses', async () => {
  await assert.rejects(
    purgeRetiredEdgeCache({
      accountId: 'account-id',
      apiToken: 'test-token',
      fetchImpl: async () => response({ success: true, result: null }),
    }),
    /malformed result/
  );

  let calls = 0;
  await assert.rejects(
    purgeRetiredEdgeCache({
      accountId: 'account-id',
      apiToken: 'test-token',
      fetchImpl: async () => {
        calls++;
        return calls === 1
          ? zoneResponse()
          : response({ success: false, errors: [{ code: 10000, message: 'Denied' }] });
      },
    }),
    /Cloudflare retired-path cache purge failed \(HTTP 200\).*Denied/
  );
  assert.equal(calls, 2);
});

test('fails when Cloudflare rejects the purge request', async () => {
  let calls = 0;
  await assert.rejects(
    purgeRetiredEdgeCache({
      accountId: 'account-id',
      apiToken: 'test-token',
      fetchImpl: async () => {
        calls++;
        return calls === 1
          ? zoneResponse()
          : response(
              {
                success: false,
                errors: [{ code: 10000, message: 'Missing Cache Purge permission' }],
              },
              403
            );
      },
    }),
    /Cloudflare retired-path cache purge failed \(HTTP 403\).*Missing Cache Purge permission/
  );
  assert.equal(calls, 2);
});

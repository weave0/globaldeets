import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { purgeRetiredEdgeCache } = require('../tools/purge-retired-edge-cache.js');
const { RETIRED_PATHS } = require('../tools/verify-boundary-retired-prod.js');

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

test('purges only the canonical production URLs in RETIRED_PATHS', async () => {
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

  assert.equal(count, RETIRED_PATHS.length);
  assert.equal(calls.length, 2);
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
    files: RETIRED_PATHS.map(path => `https://globaldeets.com${path}`),
  });
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

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { URL } from 'node:url';

const require = createRequire(import.meta.url);
const {
  inspectResponse,
  runBoundaryDiagnostics,
} = require('../tools/verify-boundary-retired-prod.js');
const { Response } = globalThis;

test('response fingerprint records redirects, exact body hash, and edge headers', async () => {
  const requests = [];
  const fingerprint = await inspectResponse(
    'https://globaldeets.com/platform-modal.js?probe=test',
    async (url, options) => {
      requests.push({ url: new URL(url), options });
      if (requests.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://cdn.example/legacy.js', 'CF-Ray': 'redirect-ray' },
        });
      }
      return new Response('retired asset', {
        status: 200,
        headers: {
          'Content-Type': 'application/javascript',
          'Content-Length': '13',
          'Cache-Control': 'public, max-age=60',
          Age: '5',
          'CF-Cache-Status': 'HIT',
          'CF-Ray': 'final-ray',
          ETag: '"legacy"',
          'X-Worker-Name': 'unexpected-worker',
        },
      });
    }
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.redirect, 'manual');
  assert.equal(requests[0].options.headers['Cache-Control'], 'no-cache, no-store, max-age=0');
  assert.equal(fingerprint.status, 200);
  assert.equal(fingerprint.finalUrl, 'https://cdn.example/legacy.js');
  assert.equal(fingerprint.redirectChain[0].status, 302);
  assert.equal(fingerprint.redirectChain[0].location, 'https://cdn.example/legacy.js');
  assert.equal(fingerprint.contentType, 'application/javascript');
  assert.equal(fingerprint.contentLengthBytes, 13);
  assert.equal(
    fingerprint.bodySha256,
    '8d64f3e3abf8b0bd6d4988d1fa77e9dcfea54a6801d1daa764550f84da62349c'
  );
  assert.equal(fingerprint.age, '5');
  assert.equal(fingerprint.cfCacheStatus, 'HIT');
  assert.equal(fingerprint.cfRay, 'final-ray');
  assert.equal(fingerprint.etag, '"legacy"');
  assert.equal(fingerprint.headers['x-worker-name'], 'unexpected-worker');
});

test('diagnostics include both retired assets and a unique negative control without changing boundary policy', async () => {
  const requested = [];
  const report = await runBoundaryDiagnostics({
    baseUrls: ['https://globaldeets.example'],
    probeId: 'fixed-probe',
    fetchImpl: async (url, options) => {
      requested.push({ url: new URL(url), options });
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    },
  });

  assert.equal(report.diagnosticOnly, true);
  assert.deepEqual(report.paths, [
    '/platform-modal.js',
    '/bi-ecosystem.css',
    '/__globaldeets_boundary_control_fixed-probe.js',
  ]);
  assert.equal(report.responses.length, 3);
  assert.equal(requested.length, 3);
  assert.equal(
    new Set(requested.map(({ url }) => url.searchParams.get('_boundary_probe'))).size,
    3
  );
  assert.ok(requested.every(({ options }) => options.headers.Pragma === 'no-cache'));
  assert.ok(report.responses.every(response => response.status === 404));

  const acceptanceRequests = [];
  const acceptanceHeaders = {
    'User-Agent': 'GlobalDeets-BoundaryVerifier/1.0',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
  const acceptanceReport = await runBoundaryDiagnostics({
    baseUrls: ['https://globaldeets.example'],
    probeId: 'acceptance-probe',
    cacheBust: false,
    redirectMode: 'follow',
    profile: 'acceptance-request-no-query',
    requestHeaders: acceptanceHeaders,
    fetchImpl: async (url, options) => {
      acceptanceRequests.push({ url: new URL(url), options });
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
    },
  });

  assert.equal(acceptanceReport.profile, 'acceptance-request-no-query');
  assert.equal(acceptanceReport.cacheBusted, false);
  assert.equal(acceptanceReport.redirectMode, 'follow');
  assert.deepEqual(acceptanceReport.requestHeaders, acceptanceHeaders);
  assert.equal(acceptanceRequests.length, 3);
  assert.ok(acceptanceRequests.every(({ url }) => url.search === ''));
  assert.ok(acceptanceRequests.every(({ options }) => !Object.hasOwn(options, 'redirect')));
  assert.deepEqual(
    acceptanceRequests.map(({ options }) => options.headers),
    [acceptanceHeaders, acceptanceHeaders, acceptanceHeaders]
  );
});

#!/usr/bin/env node

const { RETIRED_PATHS } = require('./verify-boundary-retired-prod');

const API_BASE = 'https://api.cloudflare.com/client/v4';
const SITE_ORIGIN = 'https://globaldeets.com';
const API_REQUEST_TIMEOUT_MS = 15_000;

function cloudflareFailure(operation, response, payload) {
  const details = Array.isArray(payload?.errors)
    ? payload.errors
        .map(error => [error?.code, error?.message].filter(value => value !== undefined).join(': '))
        .filter(Boolean)
        .join('; ')
    : '';
  return new Error(`${operation} failed (HTTP ${response.status})${details ? `: ${details}` : ''}`);
}

function fetchCloudflare(fetchImpl, url, options) {
  return fetchImpl(url, {
    ...options,
    signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
  });
}

async function readCloudflareResponse(response, operation) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${operation} returned invalid JSON (HTTP ${response.status})`);
  }

  if (!response.ok || payload?.success !== true) {
    throw cloudflareFailure(operation, response, payload);
  }

  return payload;
}

async function purgeRetiredEdgeCache({
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = process.env.CLOUDFLARE_API_TOKEN,
  fetchImpl = fetch,
} = {}) {
  if (!accountId?.trim()) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
  if (!apiToken?.trim()) throw new Error('CLOUDFLARE_API_TOKEN is required');

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    Accept: 'application/json',
  };
  const zoneUrl = new URL(`${API_BASE}/zones`);
  zoneUrl.searchParams.set('name', 'globaldeets.com');
  zoneUrl.searchParams.set('account.id', accountId);
  zoneUrl.searchParams.set('status', 'active');
  zoneUrl.searchParams.set('per_page', '2');

  const zonesResponse = await fetchCloudflare(fetchImpl, zoneUrl, { headers });
  const zonesPayload = await readCloudflareResponse(zonesResponse, 'Cloudflare zone lookup');
  if (!Array.isArray(zonesPayload.result)) {
    throw new Error('Cloudflare zone lookup returned a malformed result');
  }

  const matchingZones = zonesPayload.result.filter(
    zone => zone?.name === 'globaldeets.com' && zone?.account?.id === accountId
  );
  if (matchingZones.length !== 1 || typeof matchingZones[0]?.id !== 'string') {
    throw new Error(
      `Expected exactly one active Cloudflare zone named globaldeets.com in the configured account; found ${matchingZones.length}`
    );
  }

  const files = RETIRED_PATHS.map(path => new URL(path, SITE_ORIGIN).href);
  const purgeResponse = await fetchCloudflare(
    fetchImpl,
    `${API_BASE}/zones/${encodeURIComponent(matchingZones[0].id)}/purge_cache`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    }
  );
  await readCloudflareResponse(purgeResponse, 'Cloudflare retired-path cache purge');

  return files.length;
}

if (require.main === module) {
  purgeRetiredEdgeCache()
    .then(count => console.log(`Purged ${count} retired-path cache entries for globaldeets.com.`))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { purgeRetiredEdgeCache };

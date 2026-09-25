/**
 * Credential preflight (GD-034): proves every capability in config/authority-manifest.json before collection,
 * and names the exact missing permission instead of surfacing a raw Cloudflare error code later.
 * Read-only: GETs plus one bounded GraphQL query.
 */
import { readFile } from 'node:fs/promises';
import { classifyGoldEnvelope, validateInsightsEnvelope } from './audience.mjs';
import { FEED_CONTRACT_NAME } from './events.mjs';
import { defaultInsightsSource, loadGoldSource } from './gold.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const OK = new Set(['ok', 'skipped', 'unprobed', 'fallback']);

async function call(fetchImpl, url, { token, method = 'GET', body } = {}) {
  try {
    const response = await fetchImpl(url, {
      method,
      headers: { authorization: 'Bearer ' + token, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  } catch (error) {
    return { status: 0, json: null, networkError: String(error?.message || error).slice(0, 120) };
  }
}

function cloudflareVerdict({ status, json, networkError }) {
  if (networkError) return { status: 'error', detail: 'unreachable: ' + networkError };
  if (status >= 200 && status < 300 && json?.success === true) return { status: 'ok', detail: null };
  const first = json?.errors?.[0] || {};
  const code = first.code ?? first.extensions?.code ?? null;
  const detail = (code != null ? 'code ' + code + ': ' : '') + String(first.message || 'HTTP ' + status).slice(0, 160);
  const denied = status === 401 || status === 403 || [9109, 10000, 10001, 6003, 7003, 'authz'].includes(code) || /not authorized|unauthori[sz]ed|permission|access/i.test(first.message || '');
  return { status: denied ? 'denied' : 'error', detail };
}

const PROBES = {
  async 'token-verify'({ token, accountId, fetchImpl }) {
    const account = await call(fetchImpl, API + '/accounts/' + encodeURIComponent(accountId) + '/tokens/verify', { token });
    if (account.json?.success && account.json.result?.status === 'active') return { status: 'ok', detail: 'account token active' };
    const user = await call(fetchImpl, API + '/user/tokens/verify', { token });
    if (user.json?.success && user.json.result?.status === 'active') return { status: 'ok', detail: 'user token active' };
    const verdict = cloudflareVerdict(user.json ? user : account);
    return { status: verdict.status === 'ok' ? 'denied' : verdict.status, detail: 'token is not active or not valid (' + (verdict.detail || 'inactive') + ')' };
  },
  async 'zones-list'({ token, accountId, fetchImpl }) {
    return cloudflareVerdict(await call(fetchImpl, API + '/zones?per_page=5&account.id=' + encodeURIComponent(accountId), { token }));
  },
  async 'pages-list'({ token, accountId, fetchImpl }) {
    return cloudflareVerdict(await call(fetchImpl, API + '/accounts/' + encodeURIComponent(accountId) + '/pages/projects', { token }));
  },
  async 'rum-graphql'({ token, accountId, fetchImpl, now }) {
    const end = new Date(now());
    const start = new Date(end.getTime() - 3600000);
    const query = 'query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){rumPageloadEventsAdaptiveGroups(filter:{datetime_geq:$s,datetime_leq:$e},limit:1){count}}}}';
    const result = await call(fetchImpl, API + '/graphql', { token, method: 'POST', body: { query, variables: { a: accountId, s: start.toISOString(), e: end.toISOString() } } });
    if (result.networkError) return cloudflareVerdict(result);
    if (Array.isArray(result.json?.errors) && result.json.errors.length) return cloudflareVerdict(result);
    if (!Array.isArray(result.json?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups)) return { status: 'error', detail: 'GraphQL response did not include the expected RUM dataset' };
    return { status: 'ok', detail: null };
  },
  async 'd1-database'({ token, accountId, capability, fetchImpl }) {
    return cloudflareVerdict(await call(fetchImpl, API + '/accounts/' + encodeURIComponent(accountId) + '/d1/database/' + encodeURIComponent(capability.databaseId), { token }));
  },
  /**
   * Governed audience feed (GD-036). Reads the Gold and Insights documents exactly as the collector will and
   * reports the real condition, so a missing source, a missing or rejected credential, an edge challenge, an
   * outage, a corrupt document, a fixture and a schema mismatch are never reported as one thing.
   */
  async 'audience-feed'({ env, fetchImpl }) {
    const verdictFor = (loaded, label, classify) => {
      switch (loaded.failureKind) {
        case null:
          return classify(loaded.doc);
        case 'source-missing':
          return { status: 'missing', detail: label + ' source is not configured' };
        case 'credential-missing':
          return { status: 'denied', detail: label + ' source requires a credential and MISSION_CONTROL_GOLD_TOKEN is not set (HTTP ' + loaded.httpStatus + ')' };
        case 'credential-rejected':
          return { status: 'denied', detail: label + ' source rejected MISSION_CONTROL_GOLD_TOKEN (HTTP ' + loaded.httpStatus + ')' };
        default:
          return { status: 'error', detail: loaded.reason };
      }
    };
    const gold = await loadGoldSource({ source: env.GOLD_SOURCE, token: env.GOLD_SOURCE_TOKEN, fetchImpl, readFile, label: 'Canonical Gold' });
    const goldVerdict = verdictFor(gold, 'Canonical Gold', doc => {
      const problem = classifyGoldEnvelope(doc);
      return problem ? { status: 'error', detail: 'Canonical Gold is ' + problem.kind + ': ' + problem.reason } : { status: 'ok', detail: (doc.metrics || []).length + ' Gold metrics, generated ' + doc.generated_at };
    });
    if (goldVerdict.status !== 'ok') return goldVerdict;
    const insightsSource = env.INSIGHTS_SOURCE || defaultInsightsSource(env.GOLD_SOURCE);
    const insights = await loadGoldSource({ source: insightsSource, token: env.INSIGHTS_SOURCE_TOKEN || env.GOLD_SOURCE_TOKEN, fetchImpl, readFile, label: 'Traffic Insights' });
    const insightsVerdict = verdictFor(insights, 'Traffic Insights', doc => {
      const checked = validateInsightsEnvelope(doc);
      return checked.error ? { status: 'error', detail: 'Traffic Insights is ' + checked.kind + ': ' + checked.error } : { status: 'ok', detail: 'insights generated ' + doc.generated_at };
    });
    return insightsVerdict.status === 'ok' ? { status: 'ok', detail: goldVerdict.detail + '; ' + insightsVerdict.detail } : insightsVerdict;
  },
  async 'events-feed'({ env, fetchImpl }) {
    const result = await call(fetchImpl, env.EVENTS_SOURCE, { token: env.EVENTS_SOURCE_TOKEN });
    if (result.networkError) return { status: 'error', detail: 'unreachable: ' + result.networkError };
    if (result.status === 401 || result.status === 403) return { status: 'denied', detail: 'feed rejected MISSION_CONTROL_EVENTS_TOKEN (HTTP ' + result.status + ')' };
    if (result.status !== 200 || result.json?.contractName !== FEED_CONTRACT_NAME) return { status: 'error', detail: 'feed returned HTTP ' + result.status + ' without the ' + FEED_CONTRACT_NAME + ' contract' };
    return { status: 'ok', detail: (result.json.instrumentedProperties || []).length + ' instrumented properties' };
  },
};

function remedy(capability, credential, status) {
  if (capability.id === 'audience.feed.read') {
    if (status === 'error') return 'The feed answered but is not usable; see the detail. This is not a credential problem, so the next evidence run retries without changing secrets.';
    if (status === 'denied') return 'Set MISSION_CONTROL_GOLD_TOKEN to the value of MISSION_CONTROL_FEED_TOKEN in weave0/goodflippindesign (the Traffic Intelligence deploy binds it to the Pages project). No Cloudflare API token is involved.';
    return 'Set MISSION_CONTROL_GOLD_SOURCE (the evidence workflow defaults it to the Traffic Intelligence Gold URL).';
  }
  if (status === 'error') return 'Retry the preflight; this is not classified as an authorization failure. If it persists, inspect the upstream response before changing credentials.';
  if (capability.id === 'events.feed.read') return 'Set ' + capability.secrets.join(' + ') + ' in GitHub Actions secrets. ' + capability.permission + '.';
  if (status === 'missing') return 'Provide the required secret or configuration declared for this capability.';
  if (capability.permission) return 'Edit the ' + credential.secret + ' token at ' + credential.createAt + ' and add "' + capability.permission + '" on the account in ' + credential.accountSecret + '.';
  return 'Replace ' + credential.secret + ' with an active token (' + credential.createAt + ').';
}

export async function runPreflight({ manifest, env = {}, fetchImpl, now = Date.now }) {
  const { credential } = manifest;
  const token = env[credential.secret];
  const accountId = env[credential.accountSecret];
  const eventsViaFeed = Boolean(env.EVENTS_SOURCE);
  const results = [];
  for (const capability of manifest.capabilities) {
    let outcome;
    if (capability.id === 'cloudflare.d1.read' && eventsViaFeed) outcome = { status: 'skipped', detail: 'events are read through the Worker feed (native D1 binding)' };
    else if (!capability.probe) outcome = { status: 'unprobed', detail: 'write capability; proven by the deploy step' };
    else if (capability.id === 'events.feed.read' && !eventsViaFeed) outcome = { status: 'missing', detail: 'MISSION_CONTROL_EVENTS_SOURCE is not set' };
    else if (capability.id === 'events.feed.read' && !env.EVENTS_SOURCE_TOKEN) outcome = { status: 'missing', detail: 'MISSION_CONTROL_EVENTS_TOKEN is not set' };
    else if (capability.id === 'audience.feed.read' && !env.GOLD_SOURCE) outcome = { status: 'missing', detail: 'MISSION_CONTROL_GOLD_SOURCE is not set' };
    else if (capability.id === 'audience.feed.read') outcome = await PROBES[capability.probe]({ env, fetchImpl });
    else if (capability.id !== 'events.feed.read' && (!token || !accountId)) outcome = { status: 'missing', detail: [!token && credential.secret, !accountId && credential.accountSecret].filter(Boolean).join(' and ') + ' not provided' };
    else outcome = await PROBES[capability.probe]({ token, accountId, capability, env, fetchImpl, now });
    results.push({ id: capability.id, required: capability.required, permission: capability.permission, ...outcome });
  }
  // With no feed configured, a working D1 REST read keeps business events available.
  const events = results.find(item => item.id === 'events.feed.read');
  const d1 = results.find(item => item.id === 'cloudflare.d1.read');
  if (events && d1 && events.status === 'missing' && d1.status === 'ok') Object.assign(events, { status: 'fallback', detail: 'served by the D1 REST fallback' });
  if (events && d1 && events.status === 'missing') d1.required = true;

  for (const item of results) {
    if (!OK.has(item.status)) item.remedy = remedy(manifest.capabilities.find(c => c.id === item.id), credential, item.status);
  }
  const failures = results.filter(item => item.required && !OK.has(item.status));
  return { healthy: failures.length === 0, results, failures };
}

export function formatPreflight(report) {
  const lines = report.results.map(item => (OK.has(item.status) ? 'PASS ' : item.required ? 'FAIL ' : 'WARN ') + item.id + ' [' + item.status + ']' + (item.detail ? ' ' + item.detail : '') + (item.remedy ? '\n       fix: ' + item.remedy : ''));
  return lines.join('\n');
}

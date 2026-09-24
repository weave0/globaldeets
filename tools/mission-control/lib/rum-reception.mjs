/**
 * RUM reception evidence (GD-031): are browser page-load events actually arriving?
 *
 * Reads Cloudflare Web Analytics page-load counts grouped by request host for the last 24 hours. A tag in
 * the served HTML is not proof of reception; this is. It needs the Cloudflare token to carry
 * Account Analytics: Read. When it does not, the result is `unavailable` with the exact reason, and no
 * property is ever promoted to active-verified.
 *
 * Read-only: one GraphQL query.
 */
const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const WINDOW_HOURS = 24;

const QUERY = `query($account: String!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      rumPageloadEventsAdaptiveGroups(filter: { datetime_geq: $start, datetime_leq: $end }, limit: 1000, orderBy: [count_DESC]) {
        count
        dimensions { requestHost }
      }
    }
  }
}`;

export function unavailableReception(reason) {
  return { status: 'unavailable', reason, windowHours: WINDOW_HOURS, observedAt: null, byHost: {} };
}

export async function fetchRumReception({ token, accountId, fetchImpl, now }) {
  if (!token || !accountId) return unavailableReception('CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not provided.');
  const end = new Date(now());
  const start = new Date(end.getTime() - WINDOW_HOURS * 3600000);
  let body;
  try {
    const response = await fetchImpl(GRAPHQL, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { account: accountId, start: start.toISOString(), end: end.toISOString() } }),
      signal: AbortSignal.timeout(20000),
    });
    body = await response.json().catch(() => null);
    if (!response.ok && !body) return unavailableReception('Cloudflare analytics returned HTTP ' + response.status + '.');
  } catch (error) {
    return unavailableReception('Cloudflare analytics unreachable: ' + String(error?.message || error).slice(0, 100));
  }
  if (!body || typeof body !== 'object') return unavailableReception('Cloudflare analytics returned an unreadable response.');
  if (Array.isArray(body.errors) && body.errors.length) {
    const message = String(body.errors[0]?.message || 'unknown error').slice(0, 160);
    return unavailableReception('RUM analytics query was rejected: ' + message);
  }
  const groups = body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
  if (!Array.isArray(groups)) return unavailableReception('The account exposes no RUM page-load dataset to this token.');
  const byHost = {};
  for (const group of groups) {
    const host = String(group?.dimensions?.requestHost || '').toLowerCase();
    if (!host || !Number.isFinite(group.count)) continue;
    byHost[host] = (byHost[host] || 0) + group.count;
  }
  return { status: 'measured', reason: null, windowHours: WINDOW_HOURS, observedAt: end.toISOString(), byHost };
}

/**
 * Reception verdict for one property host. Absence from a successful query is a measured zero for a host
 * whose beacon is shipped, so the caller decides relevance; this only reports what the query showed.
 */
export function receptionFor(reception, host) {
  if (!reception || reception.status !== 'measured') return { state: 'unavailable', events: null, windowHours: reception?.windowHours ?? WINDOW_HOURS, observedAt: null, reason: reception?.reason || 'No reception evidence.' };
  const bare = String(host).toLowerCase();
  const events = (reception.byHost[bare] || 0) + (reception.byHost['www.' + bare] || 0);
  return { state: events > 0 ? 'received' : 'none-received', events, windowHours: reception.windowHours, observedAt: reception.observedAt, reason: null };
}

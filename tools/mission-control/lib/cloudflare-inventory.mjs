/**
 * Best-effort Cloudflare inventory refresh (zones + Pages projects/domains).
 * Returns null and a reason when the token lacks permission; the estate then carries the registry facts
 * forward and labels them by age. Read-only: only GET requests are issued.
 */
const API = 'https://api.cloudflare.com/client/v4';
const MAX_PAGES = 20;

async function getJson(url, token, fetchImpl) {
  const response = await fetchImpl(url, { headers: { authorization: 'Bearer ' + token, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    const message = body?.errors?.[0]?.message || 'HTTP ' + response.status;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

// The Pages list endpoint rejects a caller-chosen per_page, so pagination follows the server's page size.
async function listAll(path, token, fetchImpl, { perPage = null } = {}) {
  const results = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const query = (perPage ? 'per_page=' + perPage + '&' : '') + 'page=' + page;
    const body = await getJson(API + path + separator + query, token, fetchImpl);
    const batch = body.result || [];
    results.push(...batch);
    const info = body.result_info || {};
    // Completion must be proven by the server's own metadata (page count, total count, or a short/empty page).
    if (info.total_pages ? page >= info.total_pages : Number.isFinite(info.total_count) ? results.length >= info.total_count : batch.length === 0 || (info.per_page ? batch.length < info.per_page : true)) return results;
  }
  // Never report a truncated listing as a successful refresh.
  throw new Error('pagination limit of ' + MAX_PAGES + ' pages reached for ' + path.split('?')[0]);
}

export async function refreshInventory({ token, accountId, fetchImpl, now }) {
  if (!token || !accountId) return { inventory: null, reason: 'CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not provided.' };
  const notes = [];
  const observedAt = new Date(now()).toISOString();
  let zones = null;
  let pagesProjects = null;
  try {
    const list = await listAll('/zones?account.id=' + encodeURIComponent(accountId), token, fetchImpl, { perPage: 50 });
    zones = list.map(zone => ({ name: zone.name, status: zone.status }));
  } catch (error) {
    notes.push('zones: ' + error.message);
  }
  try {
    const projects = await listAll('/accounts/' + encodeURIComponent(accountId) + '/pages/projects', token, fetchImpl);
    pagesProjects = [];
    for (const project of projects) {
      const domainBody = await getJson(API + '/accounts/' + encodeURIComponent(accountId) + '/pages/projects/' + encodeURIComponent(project.name) + '/domains', token, fetchImpl);
      const production = project.canonical_deployment || project.latest_deployment || null;
      pagesProjects.push({
        name: project.name,
        domains: (domainBody.result || []).map(domain => ({ name: domain.name, status: domain.status })),
        latestProductionDeployAt: production?.created_on || null,
      });
    }
  } catch (error) {
    notes.push('pages: ' + error.message);
  }
  if (!zones && !pagesProjects) return { inventory: null, reason: 'Cloudflare token could not read inventory (' + notes.join('; ') + ').' };
  return {
    inventory: {
      observedAt,
      source: 'Cloudflare API (' + [zones ? 'zones' : null, pagesProjects ? 'pages' : null].filter(Boolean).join(' + ') + ')',
      zones,
      zonesObservedAt: zones ? observedAt : null,
      pagesProjects,
      pagesObservedAt: pagesProjects ? observedAt : null,
    },
    reason: notes.length ? 'Partial inventory refresh: ' + notes.join('; ') : null,
  };
}

/**
 * Merges a (possibly partial) refresh into the previously persisted inventory per facet, so a later zones-only
 * run never drops Pages facts that were observed earlier; each facet keeps its own observation time.
 */
export function mergeInventory(previous, refreshed) {
  if (!refreshed) return previous || null;
  const facet = (name, stamp) => {
    if (refreshed[name]) return { [name]: refreshed[name], [stamp]: refreshed[stamp] };
    if (previous?.[name]) return { [name]: previous[name], [stamp]: previous[stamp] || previous.observedAt };
    return {};
  };
  const merged = { ...facet('zones', 'zonesObservedAt'), ...facet('pagesProjects', 'pagesObservedAt') };
  const stamps = [merged.zonesObservedAt, merged.pagesObservedAt].filter(Boolean).sort();
  return {
    observedAt: stamps[stamps.length - 1] || refreshed.observedAt,
    source: 'Cloudflare API (' + [merged.zones ? 'zones' : null, merged.pagesProjects ? 'pages' : null].filter(Boolean).join(' + ') + ')',
    ...merged,
  };
}

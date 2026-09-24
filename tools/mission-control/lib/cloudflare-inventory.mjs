/**
 * Best-effort Cloudflare inventory refresh (zones + Pages projects/domains).
 * Returns null and a reason when the token lacks permission; the estate then carries the registry facts
 * forward and labels them by age. Read-only: only GET requests are issued.
 */
const API = 'https://api.cloudflare.com/client/v4';

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
  for (let page = 1; page <= 20; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const query = (perPage ? 'per_page=' + perPage + '&' : '') + 'page=' + page;
    const body = await getJson(API + path + separator + query, token, fetchImpl);
    const batch = body.result || [];
    results.push(...batch);
    const totalPages = body.result_info?.total_pages;
    if (totalPages ? page >= totalPages : batch.length === 0 || (body.result_info?.per_page ? batch.length < body.result_info.per_page : true)) break;
  }
  return results;
}

export async function refreshInventory({ token, accountId, fetchImpl, now }) {
  if (!token || !accountId) return { inventory: null, reason: 'CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not provided.' };
  const notes = [];
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
      observedAt: new Date(now()).toISOString(),
      source: 'Cloudflare API (' + [zones ? 'zones' : null, pagesProjects ? 'pages' : null].filter(Boolean).join(' + ') + ')',
      zones,
      pagesProjects,
    },
    reason: notes.length ? 'Partial inventory refresh: ' + notes.join('; ') : null,
  };
}

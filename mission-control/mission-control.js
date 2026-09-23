(() => {
  'use strict';

  const endpoint = '/api/ops/mission-control';
  const body = document.body;
  const errorPanel = document.getElementById('mc-error');

  const state = {
    gaps: [],
    sort: { key: 'severity', dir: 'asc' },
    filters: { site: 'all', category: 'all', severity: 'all', status: 'open', search: '' },
  };

  load().catch(() => failClosed());

  async function load() {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Mission Control API returned ${response.status}`);
    const data = await response.json();
    assertSafePayload(data);
    render(data);
    wireControls();
    body.dataset.missionControlReady = 'true';
  }

  function assertSafePayload(data) {
    if (!data || typeof data !== 'object') throw new Error('Mission Control payload missing');
    if (data.observatoryId !== 'mission-control')
      throw new Error('Mission Control identity mismatch');
    if (data.integrity?.valid !== true) throw new Error('Mission Control integrity invalid');
    if (
      data.rules?.compositeHealthScore !== false ||
      data.rules?.uptimeSlaGuarantee !== false ||
      data.rules?.automaticRemediation !== false
    ) {
      throw new Error('Mission Control semantic contract changed');
    }
    if (!Array.isArray(data.sites) || !Array.isArray(data.gaps))
      throw new Error('Mission Control inventories missing');
  }

  function render(data) {
    setText('integrity-status', 'Integrity validated');
    const status = document.getElementById('integrity-status');
    if (status) status.dataset.state = 'valid';
    setText('generated-at', formatDateTime(data.generatedAt));
    setText('observatory-version', data.observatoryVersion);
    setText(
      'sites-reachable',
      `${data.siteHealthSummary.sitesReachable} / ${data.siteHealthSummary.totalSites}`
    );

    renderInto('site-grid', data.sites.map(siteCard));
    renderSeverityBar(data.gapSummary);

    state.gaps = data.gaps;
    populateFilterOptions(data.gaps);
    renderTable();
  }

  function siteCard(site) {
    const probe = site.probe;
    const statusKey = !probe ? 'unknown' : probe.reachable ? 'ok' : 'down';
    const statusLabel = !probe
      ? 'Not probed'
      : probe.reachable
        ? `Online · ${probe.httpStatus}`
        : 'Unreachable';
    const el = document.createElement('div');
    el.className = 'site-card';
    el.innerHTML = `
      <div class="site-card-top">
        <span class="site-name">${escapeHtml(site.name)}</span>
        <span class="status-dot" data-status="${statusKey}">${escapeHtml(statusLabel)}</span>
      </div>
      <a class="site-domain" href="${escapeAttr(site.url)}" target="_blank" rel="noopener">${escapeHtml(site.domain)}</a>
      <span class="site-latency">${probe && probe.latencyMs != null ? `${probe.latencyMs}ms response` : 'Latency unavailable'}</span>
    `;
    return el;
  }

  function renderSeverityBar(gapSummary) {
    const order = ['critical', 'high', 'medium', 'low'];
    const total = order.reduce((sum, key) => sum + (gapSummary.bySeverity[key] || 0), 0);
    const bar = document.getElementById('severity-bar');
    if (!bar) return;
    bar.innerHTML = '';
    if (total === 0) {
      bar.innerHTML =
        '<div class="severity-bar-segment" data-severity="low" style="width:100%">No open gaps</div>';
      return;
    }
    order.forEach(sev => {
      const count = gapSummary.bySeverity[sev] || 0;
      if (count === 0) return;
      const segment = document.createElement('div');
      segment.className = 'severity-bar-segment';
      segment.dataset.severity = sev;
      segment.style.width = `${(count / total) * 100}%`;
      segment.textContent = `${count}`;
      segment.title = `${count} ${sev} severity open gap${count === 1 ? '' : 's'}`;
      bar.appendChild(segment);
    });
    setText(
      'severity-total',
      `${gapSummary.openGaps} open · ${gapSummary.resolvedGaps} resolved · ${gapSummary.totalGaps} total`
    );
  }

  function populateFilterOptions(gaps) {
    fillSelect('filter-site', uniqueSorted(gaps.map(g => g.site)));
    fillSelect('filter-category', uniqueSorted(gaps.map(g => g.category)));
  }

  function fillSelect(id, values) {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    const existing = new Set(Array.from(select.options).map(o => o.value));
    values.forEach(value => {
      if (existing.has(value)) return;
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    });
    if (Array.from(select.options).some(o => o.value === current)) select.value = current;
  }

  function wireControls() {
    document.getElementById('filter-site')?.addEventListener('change', e => {
      state.filters.site = e.target.value;
      renderTable();
    });
    document.getElementById('filter-category')?.addEventListener('change', e => {
      state.filters.category = e.target.value;
      renderTable();
    });
    document.getElementById('filter-severity')?.addEventListener('change', e => {
      state.filters.severity = e.target.value;
      renderTable();
    });
    document.getElementById('filter-status')?.addEventListener('change', e => {
      state.filters.status = e.target.value;
      renderTable();
    });
    document.getElementById('filter-search')?.addEventListener('input', e => {
      state.filters.search = e.target.value.trim().toLowerCase();
      renderTable();
    });
    document.querySelectorAll('.gap-table thead th[data-sort-key]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort.key = key;
          state.sort.dir = 'asc';
        }
        renderTable();
      });
    });
  }

  const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

  function renderTable() {
    const { site, category, severity, status, search } = state.filters;
    let rows = state.gaps.filter(gap => {
      if (site !== 'all' && gap.site !== site) return false;
      if (category !== 'all' && gap.category !== category) return false;
      if (severity !== 'all' && gap.severity !== severity) return false;
      if (status !== 'all' && gap.status !== status) return false;
      if (search) {
        const haystack =
          `${gap.title} ${gap.observedState} ${gap.nextAction} ${gap.site}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    rows = rows.slice().sort((a, b) => {
      const dirMult = state.sort.dir === 'asc' ? 1 : -1;
      const key = state.sort.key;
      if (key === 'severity')
        return dirMult * ((SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
      const av = String(a[key] || '');
      const bv = String(b[key] || '');
      return dirMult * av.localeCompare(bv);
    });

    document.querySelectorAll('.gap-table thead th[data-sort-key]').forEach(th => {
      const active = th.dataset.sortKey === state.sort.key;
      th.setAttribute(
        'aria-sort',
        active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      );
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = active ? (state.sort.dir === 'asc' ? '▲' : '▼') : '↕';
    });

    const tbody = document.getElementById('gap-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (rows.length === 0) {
      const empty = document.createElement('tr');
      empty.innerHTML = `<td colspan="5"><div class="empty-state">No gaps match the current filters.</div></td>`;
      tbody.appendChild(empty);
    } else {
      rows.forEach(gap => tbody.appendChild(gapRow(gap)));
    }

    setText('gap-count', `${rows.length} of ${state.gaps.length} gaps shown`);
  }

  function gapRow(gap) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pill" data-severity="${escapeAttr(gap.severity)}">${escapeHtml(gap.severity)}</span></td>
      <td>${escapeHtml(gap.site)}<div class="gap-detail">${escapeHtml(titleCase(gap.category))}</div></td>
      <td>
        <div class="gap-title">${escapeHtml(gap.title)}</div>
        <p class="gap-detail">${escapeHtml(gap.observedState)}</p>
        <p class="gap-next-action"><strong>Next:</strong> ${escapeHtml(gap.nextAction)}</p>
      </td>
      <td><span class="pill" data-status="${escapeAttr(gap.status)}">${escapeHtml(gap.status)}</span></td>
      <td class="gap-detail">${escapeHtml(gap.detectedAt || '—')}</td>
    `;
    return tr;
  }

  function failClosed() {
    body.dataset.missionControlReady = 'false';
    if (errorPanel) errorPanel.hidden = false;
    setText('integrity-status', 'Integrity check failed');
    const status = document.getElementById('integrity-status');
    if (status) status.dataset.state = 'invalid';
    ['site-grid', 'gap-table-body'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  }

  function renderInto(id, nodes) {
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = '';
    nodes.forEach(node => container.appendChild(node));
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort();
  }

  function titleCase(value) {
    return String(value || '').replace(
      /(^|[-\s])(\w)/g,
      (_, sep, ch) => `${sep}${ch.toUpperCase()}`
    );
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (_) {
      return iso;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      ch =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[ch]
    );
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();

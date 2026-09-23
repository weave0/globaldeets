(() => {
  'use strict';

  const dataEndpoint = '/observatory/mission-control/mission-control-data.json';
  const coverageEndpoint = '/api/intelligence/observatory/coverage';
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const state = { snapshot: null, coverage: null };

  Promise.all([json(dataEndpoint), json(coverageEndpoint).catch(() => null)])
    .then(([snapshot, coverage]) => {
      validate(snapshot);
      state.snapshot = snapshot;
      state.coverage = coverage;
      render();
      document.body.dataset.missionControlReady = 'true';
    })
    .catch(failClosed);

  function json(url) {
    return fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    });
  }

  function validate(data) {
    if (!data || data.missionControlId !== 'globaldeets-estate') throw new Error('identity');
    if (data.investorClaimsPolicy?.edgeTrafficIsHumanAudience !== false) throw new Error('traffic contract');
    if (data.investorClaimsPolicy?.missingMeasurementIsZero !== false) throw new Error('missing measurement contract');
    if (!Array.isArray(data.gaps)) throw new Error('gaps');
  }

  function render() {
    const data = state.snapshot;
    renderMetrics(data);
    renderTraffic(data.globaldeetsTraffic);
    renderEstate(data.estate);
    renderGapControls(data.gaps);
    renderGaps();
    renderCoverage(state.coverage);
    text(
      'provenance-note',
      'Snapshot ' +
        data.snapshotVersion +
        ', generated ' +
        formatDate(data.generatedAt) +
        '. Estate counts are from the connected Cloudflare account. GlobalDeets edge traffic is operational telemetry, not certified human audience. Coverage/evidence facts are read live from the governed observatory when available.'
    );
  }

  function renderMetrics(data) {
    const coverage = state.coverage;
    const dossierCount = coverage?.evidenceCoverage?.dossierCount;
    const sourceCount = coverage?.newsCoverage?.totalSources;
    const coverageGapCount = Array.isArray(coverage?.gaps) ? coverage.gaps.length : null;

    into('investor-grid', [
      metric(data.estate.activeZones, 'Active web properties', 'Cloudflare zones'),
      metric(
        data.estate.rumObservedZones + '/' + data.estate.activeZones,
        'Properties with browser observability',
        data.estate.rumCoveragePct + '% estate coverage'
      ),
      metric(
        sourceCount ?? 'Live',
        'Governed news sources',
        sourceCount == null ? 'Coverage endpoint unavailable' : 'Coverage Observatory'
      ),
      metric(
        dossierCount ?? 'Live',
        'Published evidence dossiers',
        dossierCount == null
          ? 'Coverage endpoint unavailable'
          : (coverageGapCount ?? 0) + ' governed coverage/evidence gaps currently explicit'
      ),
    ]);
  }

  function renderTraffic(traffic) {
    const contaminated = Math.min(traffic.edgeVisits, traffic.syntheticHealthVisits);
    const contaminationPct = traffic.edgeVisits ? Math.round((contaminated / traffic.edgeVisits) * 100) : 0;

    into('traffic-quality', [
      warning(
        'Do not pitch ' +
          fmt(traffic.edgeVisits) +
          ' raw edge visits as audience. ' +
          fmt(traffic.syntheticHealthVisits) +
          ' visits (' +
          contaminationPct +
          '%) are attached to ' +
          traffic.syntheticHealthPath +
          '.'
      ),
      record(
        '28-day edge requests',
        fmt(traffic.edgeRequests),
        traffic.window.start + ' → ' + traffic.window.end
      ),
      record('Raw edge visits', fmt(traffic.edgeVisits), 'Operational telemetry only'),
      record(
        'Investor-safe audience metric',
        'Not yet certified',
        'RUM-based human/bot/monitor classification is the next gate'
      ),
    ]);
  }

  function renderEstate(estate) {
    into('estate-observability', [
      record('Active zones', estate.activeZones, estate.source),
      record('RUM observed', estate.rumObservedZones + '/' + estate.activeZones, estate.rumCoveragePct + '% coverage'),
      record('Uncovered', estate.missingRumZones.length, estate.missingRumZones.join(' · ')),
    ]);
  }

  function renderGapControls(gaps) {
    const domainFilter = document.getElementById('domain-filter');
    [...new Set(gaps.map(gap => gap.domain))].sort().forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = title(value);
      domainFilter.append(option);
    });

    ['severity-filter', 'domain-filter', 'sort-order'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderGaps);
    });
  }

  function renderGaps() {
    const gaps = [...state.snapshot.gaps];
    const severity = document.getElementById('severity-filter')?.value || 'all';
    const domain = document.getElementById('domain-filter')?.value || 'all';
    const sort = document.getElementById('sort-order')?.value || 'priority';

    const filtered = gaps
      .filter(gap => (severity === 'all' || gap.severity === severity) && (domain === 'all' || gap.domain === domain))
      .sort((a, b) => {
        if (sort === 'severity') return severityRank[a.severity] - severityRank[b.severity] || a.priority - b.priority;
        if (sort === 'domain') return a.domain.localeCompare(b.domain) || a.priority - b.priority;
        return a.priority - b.priority;
      });

    into('gap-list', filtered.map(gapCard));
  }

  function renderCoverage(coverage) {
    if (!coverage) {
      into('coverage-bridge', [
        warning(
          'Governed coverage payload is temporarily unavailable. Mission Control is withholding derived coverage counts rather than inventing them.'
        ),
      ]);
      return;
    }

    into('coverage-bridge', [
      record('Live news sources', coverage.newsCoverage?.totalSources ?? 'Unavailable', 'Governed source inventory'),
      record(
        'Coverage/evidence gaps',
        Array.isArray(coverage.gaps) ? coverage.gaps.length : 'Unavailable',
        'Separate from estate/business gaps above'
      ),
      record('Evidence dossiers', coverage.evidenceCoverage?.dossierCount ?? 'Unavailable', 'Published governed evidence'),
    ]);
  }

  function metric(value, label, detail) {
    return el('article', 'metric-card', [
      el('p', 'metric-number', [fmt(value)]),
      el('p', 'metric-label', [label]),
      detail ? el('p', 'metric-detail', [detail]) : null,
    ]);
  }

  function record(label, value, detail) {
    return el('div', 'record', [
      el('div', 'record-row', [el('span', '', [label]), el('span', 'record-value', [fmt(value)])]),
      detail ? el('p', 'record-detail', [detail]) : null,
    ]);
  }

  function warning(message) {
    return el('div', 'warning', [message]);
  }

  function gapCard(gap) {
    const node = el('article', 'gap-card', [
      el('div', 'gap-header', [
        el('div', '', [
          el('p', 'eyebrow', [gap.domain]),
          el('h3', '', [gap.title]),
          el('span', 'priority', ['Priority ' + gap.priority + ' · ' + title(gap.status)]),
        ]),
        tag(title(gap.severity)),
      ]),
      el('p', '', ['Observed: ' + gap.observed]),
      el('div', 'gap-meta', [tag('Target: ' + gap.target)]),
      el('p', 'gap-action', [el('strong', '', ['Next action: ']), gap.nextAction]),
    ]);
    node.dataset.severity = gap.severity;
    return node;
  }

  function tag(value) {
    return el('span', 'tag', [value]);
  }

  function el(tagName, className, children = []) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    for (const child of children) {
      if (child == null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function into(id, nodes) {
    document.getElementById(id)?.replaceChildren(...nodes.filter(Boolean));
  }

  function text(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function title(value) {
    return String(value || '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function fmt(value) {
    return typeof value === 'number' ? new Intl.NumberFormat('en-US').format(value) : String(value ?? 'Unavailable');
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function failClosed() {
    document.body.dataset.missionControlReady = 'false';
    const error = document.getElementById('mission-control-error');
    if (error) error.hidden = false;
  }
})();
(() => {
  'use strict';

  const dataEndpoint = '/observatory/mission-control/mission-control-data.json';
  const coverageEndpoint = '/api/intelligence/observatory/coverage';
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const impactRank = { existential: 0, high: 1, medium: 2, low: 3 };
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
    if (!Array.isArray(data.gaps) || !Array.isArray(data.investmentThesis)) throw new Error('shape');
  }

  function render() {
    const data = state.snapshot;
    renderMetrics(data);
    renderThesis(data.investmentThesis);
    renderTraffic(data.globaldeetsTraffic);
    renderEstate(data.estate);
    renderRiskDistribution(data.gaps);
    renderGapControls(data.gaps);
    renderGaps();
    renderCoverage(state.coverage);
    text(
      'provenance-note',
      'Snapshot ' + data.snapshotVersion + ', generated ' + formatDate(data.generatedAt) +
      '. Estate counts are from the connected Cloudflare account and Web Analytics inventory. ' +
      'GlobalDeets edge traffic is operational telemetry, not certified human audience. ' +
      'Coverage/evidence facts are read live from the governed observatory when available.'
    );
  }

  function renderMetrics(data) {
    const coverage = state.coverage;
    const sourceCount = coverage?.newsCoverage?.totalSources;
    const dossierCount = coverage?.evidenceCoverage?.dossierCount;
    const openCritical = data.gaps.filter(gap => gap.status !== 'closed' && gap.severity === 'critical').length;

    into('investor-grid', [
      metric(data.estate.activeZones, 'Active web properties', 'Cloudflare zone inventory', 'certified'),
      metric(data.estate.rumObservedZones + '/' + data.estate.activeZones, 'Browser-observable properties', data.estate.rumCoveragePct + '% estate coverage', 'certified'),
      metric(sourceCount ?? 'Live', 'Governed news sources', sourceCount == null ? 'Live endpoint unavailable' : 'Coverage Observatory', sourceCount == null ? 'limited' : 'certified'),
      metric(dossierCount ?? 'Live', 'Published evidence dossiers', dossierCount == null ? 'Live endpoint unavailable' : 'Governed evidence layer', dossierCount == null ? 'limited' : 'certified'),
      metric(fmt(data.globaldeetsTraffic.edgeRequests), '28-day edge requests', data.globaldeetsTraffic.window.start + ' → ' + data.globaldeetsTraffic.window.end, 'operational'),
      metric(openCritical, 'Critical diagnostic gaps', openCritical ? 'Must close before strong traction claims' : 'No critical gaps open', openCritical ? 'attention' : 'certified'),
    ]);
  }

  function renderThesis(items) {
    into('investment-thesis', items.map(item => {
      return el('article', 'thesis-card', [
        el('p', 'thesis-kicker', [item.label]),
        el('h3', '', [item.title]),
        el('p', '', [item.statement]),
        el('p', 'thesis-proof', [item.proof]),
      ]);
    }));
  }

  function renderTraffic(traffic) {
    const synthetic = Math.min(traffic.edgeVisits, traffic.syntheticHealthVisits);
    const residual = Math.max(0, traffic.edgeVisits - synthetic);
    const syntheticPct = traffic.edgeVisits ? Math.round((synthetic / traffic.edgeVisits) * 100) : 0;
    const residualPct = 100 - syntheticPct;

    into('traffic-quality', [
      warning('Raw edge visits cannot be presented as audience: ' + syntheticPct + '% are attached to ' + traffic.syntheticHealthPath + '.'),
      stackedBar([
        { label: 'Known synthetic health', value: synthetic, pct: syntheticPct, className: 'bar-danger' },
        { label: 'Residual / not yet classified', value: residual, pct: residualPct, className: 'bar-muted' },
      ]),
      record('28-day edge requests', fmt(traffic.edgeRequests), traffic.window.start + ' → ' + traffic.window.end),
      record('Raw edge visits', fmt(traffic.edgeVisits), 'Operational telemetry only'),
      record('Investor-safe audience', 'Not yet certified', 'Human/bot/monitor/API/asset classification is the next measurement gate'),
    ]);
  }

  function renderEstate(estate) {
    const observedPct = estate.rumCoveragePct;
    const missingPct = Math.max(0, 100 - observedPct);
    into('estate-observability', [
      stackedBar([
        { label: 'Observed', value: estate.rumObservedZones, pct: observedPct, className: 'bar-good' },
        { label: 'Uncovered', value: estate.missingRumZones.length, pct: missingPct, className: 'bar-warn' },
      ]),
      record('Active zones', estate.activeZones, estate.source),
      record('RUM observed', estate.rumObservedZones + '/' + estate.activeZones, observedPct + '% coverage'),
      record('Uncovered', estate.missingRumZones.length, estate.missingRumZones.join(' · ')),
    ]);
  }

  function renderRiskDistribution(gaps) {
    const open = gaps.filter(gap => gap.status !== 'closed');
    const counts = ['critical', 'high', 'medium', 'low'].map(severity => ({
      severity,
      count: open.filter(gap => gap.severity === severity).length,
    }));
    const max = Math.max(1, ...counts.map(item => item.count));
    into('risk-distribution', counts.map(item => barRow(title(item.severity), item.count, (item.count / max) * 100, 'severity-' + item.severity)));
  }

  function renderGapControls(gaps) {
    const domainFilter = document.getElementById('domain-filter');
    [...new Set(gaps.map(gap => gap.domain))].sort().forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = title(value);
      domainFilter.append(option);
    });

    ['severity-filter', 'status-filter', 'domain-filter', 'sort-order'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderGaps);
    });
    document.getElementById('gap-search')?.addEventListener('input', renderGaps);
  }

  function renderGaps() {
    const gaps = [...state.snapshot.gaps];
    const severity = value('severity-filter', 'all');
    const status = value('status-filter', 'all');
    const domain = value('domain-filter', 'all');
    const sort = value('sort-order', 'priority');
    const query = value('gap-search', '').trim().toLowerCase();

    const filtered = gaps
      .filter(gap => severity === 'all' || gap.severity === severity)
      .filter(gap => status === 'all' || gap.status === status)
      .filter(gap => domain === 'all' || gap.domain === domain)
      .filter(gap => !query || [gap.title, gap.observed, gap.nextAction, gap.ownerLane, gap.domain].join(' ').toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === 'severity') return severityRank[a.severity] - severityRank[b.severity] || a.priority - b.priority;
        if (sort === 'impact') return (impactRank[a.businessImpact] ?? 9) - (impactRank[b.businessImpact] ?? 9) || a.priority - b.priority;
        if (sort === 'age') return String(a.openedAt).localeCompare(String(b.openedAt));
        if (sort === 'domain') return a.domain.localeCompare(b.domain) || a.priority - b.priority;
        return a.priority - b.priority;
      });

    const open = gaps.filter(gap => gap.status !== 'closed');
    text('queue-summary', open.length + ' open · ' + open.filter(gap => gap.severity === 'critical').length + ' critical · ' + filtered.length + ' shown');
    into('gap-list', filtered.map(gapCard));
  }

  function renderCoverage(coverage) {
    if (!coverage) {
      into('coverage-bridge', [warning('Governed coverage payload is temporarily unavailable. Derived counts are withheld rather than invented.')]);
      return;
    }
    into('coverage-bridge', [
      record('Live news sources', coverage.newsCoverage?.totalSources ?? 'Unavailable', 'Governed source inventory'),
      record('Coverage/evidence gaps', Array.isArray(coverage.gaps) ? coverage.gaps.length : 'Unavailable', 'Separate from estate/business gaps'),
      record('Evidence dossiers', coverage.evidenceCoverage?.dossierCount ?? 'Unavailable', 'Published governed evidence'),
    ]);
  }

  function metric(value, label, detail, stateName) {
    const node = el('article', 'metric-card', [
      el('p', 'metric-state', [title(stateName)]),
      el('p', 'metric-number', [fmt(value)]),
      el('p', 'metric-label', [label]),
      detail ? el('p', 'metric-detail', [detail]) : null,
    ]);
    node.dataset.state = stateName;
    return node;
  }

  function record(label, valueText, detail) {
    return el('div', 'record', [
      el('div', 'record-row', [el('span', '', [label]), el('span', 'record-value', [fmt(valueText)])]),
      detail ? el('p', 'record-detail', [detail]) : null,
    ]);
  }

  function stackedBar(parts) {
    return el('div', 'stacked-wrap', [
      el('div', 'stacked-bar', parts.map(part => {
        const segment = el('div', 'bar-segment ' + part.className, []);
        segment.style.width = Math.max(part.pct, part.value ? 3 : 0) + '%';
        segment.title = part.label + ': ' + fmt(part.value);
        return segment;
      })),
      el('div', 'bar-legend', parts.map(part => el('span', '', [part.label + ' · ' + fmt(part.value) + ' (' + Math.round(part.pct) + '%)']))),
    ]);
  }

  function barRow(label, count, pct, className) {
    const fill = el('span', 'bar-fill ' + className, []);
    fill.style.width = pct + '%';
    return el('div', 'bar-row', [
      el('div', 'bar-row-label', [el('span', '', [label]), el('strong', '', [String(count)])]),
      el('div', 'bar-track', [fill]),
    ]);
  }

  function warning(message) {
    return el('div', 'warning', [message]);
  }

  function gapCard(gap) {
    const age = daysOpen(gap.openedAt);
    const node = el('article', 'gap-card', [
      el('div', 'gap-header', [
        el('div', '', [
          el('p', 'eyebrow', [gap.domain]),
          el('h3', '', [gap.title]),
          el('span', 'priority', ['Priority ' + gap.priority + ' · ' + title(gap.status)]),
        ]),
        tag(title(gap.severity)),
      ]),
      el('div', 'gap-meta', [
        tag('Impact: ' + title(gap.businessImpact)),
        tag('Owner: ' + gap.ownerLane),
        tag(age + 'd open'),
      ]),
      el('p', '', [el('strong', '', ['Observed: ']), gap.observed]),
      el('p', '', [el('strong', '', ['Why it matters: ']), gap.businessReason]),
      el('p', 'gap-action', [el('strong', '', ['Next action: ']), gap.nextAction]),
      gap.evidence ? el('p', 'evidence-line', ['Evidence: ' + gap.evidence]) : null,
    ]);
    node.dataset.severity = gap.severity;
    node.dataset.status = gap.status;
    return node;
  }

  function tag(valueText) { return el('span', 'tag', [valueText]); }

  function el(tagName, className, children = []) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    for (const child of children) {
      if (child == null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function into(id, nodes) { document.getElementById(id)?.replaceChildren(...nodes.filter(Boolean)); }
  function text(id, valueText) { const node = document.getElementById(id); if (node) node.textContent = valueText; }
  function value(id, fallback) { return document.getElementById(id)?.value ?? fallback; }
  function title(input) { return String(input || '').replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
  function fmt(input) { return typeof input === 'number' ? new Intl.NumberFormat('en-US').format(input) : String(input ?? 'Unavailable'); }
  function daysOpen(input) { const date = new Date(input); return Number.isNaN(date.getTime()) ? '?' : Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000)); }
  function formatDate(input) { const date = new Date(input); return Number.isNaN(date.getTime()) ? String(input) : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); }

  function failClosed() {
    document.body.dataset.missionControlReady = 'false';
    const error = document.getElementById('mission-control-error');
    if (error) error.hidden = false;
  }
})();
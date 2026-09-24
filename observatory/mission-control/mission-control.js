(() => {
  'use strict';

  const summaryEndpoint = '/observatory/mission-control/mission-control-data.json';
  const coverageEndpoint = '/api/intelligence/observatory/coverage';
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const impactRank = { existential: 0, high: 1, medium: 2, low: 3 };
  const escalationRank = { 'investor-blocking': 0, high: 1, medium: 2, low: 3, none: 4 };
  const state = { summary: null, history: null, estateHealth: null, diagnostics: null, coverage: null };

  json(summaryEndpoint)
    .then(summary => {
      validateSummary(summary);
      return Promise.all([
        Promise.resolve(summary),
        json(summary.dataPlane.history),
        json(summary.dataPlane.estateHealth),
        json(summary.dataPlane.diagnostics),
        json(coverageEndpoint).catch(() => null),
      ]);
    })
    .then(([summary, history, estateHealth, diagnostics, coverage]) => {
      validateContracts(history, estateHealth, diagnostics);
      state.summary = summary;
      state.history = history;
      state.estateHealth = estateHealth;
      state.diagnostics = diagnostics;
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

  function validateSummary(data) {
    if (!data || data.missionControlId !== 'globaldeets-estate') throw new Error('identity');
    if (data.investorClaimsPolicy?.edgeTrafficIsHumanAudience !== false) throw new Error('traffic contract');
    if (data.investorClaimsPolicy?.missingMeasurementIsZero !== false) throw new Error('missing measurement contract');
    if (!data.dataPlane?.history || !data.dataPlane?.estateHealth || !data.dataPlane?.diagnostics) throw new Error('data plane');
    if (!Array.isArray(data.investmentThesis)) throw new Error('thesis shape');
  }

  function validateContracts(history, estateHealth, diagnostics) {
    if (history?.contractName !== 'globaldeets-mission-control-history') throw new Error('history contract');
    if (estateHealth?.contractName !== 'globaldeets-estate-health') throw new Error('estate contract');
    if (diagnostics?.contractName !== 'globaldeets-diagnostics-queue') throw new Error('diagnostics contract');
    if (!Array.isArray(history.snapshots) || !Array.isArray(estateHealth.properties) || !Array.isArray(diagnostics.items)) throw new Error('contract shape');
    if (estateHealth.properties.length !== estateHealth.propertyCount) throw new Error('property count');
  }

  function render() {
    const data = state.summary;
    const gaps = state.diagnostics.items;
    renderMetrics(data, gaps);
    renderThesis(data.investmentThesis);
    renderHistory();
    renderTraffic(data.globaldeetsTraffic);
    renderEstate(data.estate);
    renderEstateControls();
    renderEstateTable();
    renderRiskDistribution(gaps);
    renderGapControls(gaps);
    renderGaps();
    renderCoverage(state.coverage);
    text(
      'provenance-note',
      'Snapshot ' + data.snapshotVersion + ', generated ' + formatDate(data.generatedAt) +
        '. Zone, RUM, and mapped Pages deploy facts are from the connected Cloudflare account. ' +
        'Availability and critical-path state remain unknown until probes are connected. ' +
        'GlobalDeets edge traffic is operational telemetry, not certified human audience.'
    );
  }

  function renderMetrics(data, gaps) {
    const coverage = state.coverage;
    const sourceCount = coverage?.newsCoverage?.totalSources;
    const dossierCount = coverage?.evidenceCoverage?.dossierCount;
    const openCritical = gaps.filter(gap => gap.status !== 'closed' && gap.severity === 'critical').length;

    into('investor-grid', [
      metric(data.estate.activeZones, 'Active web properties', 'Cloudflare zone inventory', 'certified'),
      metric(data.estate.rumObservedZones + '/' + data.estate.activeZones, 'Browser-observable properties', data.estate.rumCoveragePct + '% estate coverage', 'certified'),
      metric(sourceCount ?? 'Live', 'Governed news sources', sourceCount == null ? 'Live endpoint unavailable' : 'Coverage Observatory', sourceCount == null ? 'limited' : 'certified'),
      metric(dossierCount ?? 'Live', 'Published evidence dossiers', dossierCount == null ? 'Live endpoint unavailable' : 'Governed evidence layer', dossierCount == null ? 'limited' : 'certified'),
      metric(fmt(data.globaldeetsTraffic.edgeRequests), '28-day edge requests', data.globaldeetsTraffic.window.start + ' → ' + data.globaldeetsTraffic.window.end, 'operational'),
      metric(openCritical, 'Critical diagnostic gaps', openCritical ? 'Blocks audience traction claims' : 'No critical gaps open', openCritical ? 'attention' : 'certified'),
    ]);
  }

  function renderThesis(items) {
    into('investment-thesis', items.map(item => el('article', 'thesis-card', [
      el('p', 'thesis-kicker', [item.label]),
      el('h3', '', [item.title]),
      el('p', '', [item.statement]),
      el('p', 'thesis-proof', [item.proof]),
    ])));
  }

  function renderHistory() {
    const days = Number(value('trend-range', '28'));
    const snapshots = [...state.history.snapshots].sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)));
    const latestMs = Math.max(...snapshots.map(item => Date.parse(item.observedAt)).filter(Number.isFinite));
    const cutoff = latestMs - days * 86400000;
    const inRange = snapshots.filter(item => Date.parse(item.observedAt) >= cutoff);

    const estatePoints = inRange
      .filter(item => typeof item.estate?.rumCoveragePct === 'number' && item.estate.evidenceState === 'measured')
      .map(item => ({ at: item.observedAt, value: item.estate.rumCoveragePct }));

    const operationalPoints = inRange
      .filter(item => typeof item.globaldeetsOperational?.edgeRequests === 'number' && item.globaldeetsOperational.evidenceState === 'measured')
      .map(item => ({ at: item.observedAt, value: item.globaldeetsOperational.edgeRequests }));

    const audiencePoints = inRange
      .filter(item => typeof item.certifiedAudience?.value === 'number' && item.certifiedAudience.evidenceState === 'measured')
      .map(item => ({ at: item.observedAt, value: item.certifiedAudience.value }));

    text('history-window-note', days + '-day view · ' + inRange.length + ' dated snapshot' + (inRange.length === 1 ? '' : 's') + ' retained');
    into('history-estate', [trendVisual(estatePoints, valueText => Math.round(valueText) + '%', 'RUM estate coverage')]);
    into('history-operational', [trendVisual(operationalPoints, fmt, 'Edge requests')]);
    into('history-audience', audiencePoints.length
      ? [trendVisual(audiencePoints, fmt, 'Certified audience')]
      : [warning('Certified audience history is unavailable. No GA4/RUM-quality human-audience series has passed the evidence gate yet.')]);

    const measuredOps = operationalPoints.length;
    text('history-operational-note', measuredOps < 2
      ? measuredOps + ' comparable measured snapshot' + (measuredOps === 1 ? '' : 's') + ' — no trend delta calculated.'
      : measuredOps + ' comparable measured snapshots.');
    text('history-estate-note', estatePoints.length < 2
      ? estatePoints.length + ' measured snapshot' + (estatePoints.length === 1 ? '' : 's') + ' — no trend delta calculated.'
      : estatePoints.length + ' measured snapshots.');
  }

  function trendVisual(points, formatter, label) {
    if (!points.length) return warning('No measured observations are available in this window.');
    if (points.length === 1) {
      return el('div', 'single-point', [
        el('p', 'metric-number', [formatter(points[0].value)]),
        el('p', 'record-detail', [label + ' · observed ' + formatDate(points[0].at)]),
      ]);
    }

    const width = 520;
    const height = 180;
    const padX = 24;
    const padY = 28;
    const values = points.map(point => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const coords = points.map((point, index) => {
      const x = padX + (index / (points.length - 1)) * (width - padX * 2);
      const ratio = span ? (point.value - min) / span : 0.5;
      const y = height - padY - ratio * (height - padY * 2);
      return { ...point, x, y };
    });

    const svg = svgEl('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': label + ' trend' });
    svg.classList.add('trend-svg');
    svg.append(svgEl('path', {
      d: coords.map((point, index) => (index ? 'L' : 'M') + ' ' + point.x.toFixed(1) + ' ' + point.y.toFixed(1)).join(' '),
      class: 'trend-line',
    }));
    coords.forEach(point => {
      const circle = svgEl('circle', { cx: point.x, cy: point.y, r: 5, class: 'trend-point' });
      circle.append(svgEl('title', {}, [formatter(point.value) + ' · ' + formatDate(point.at)]));
      svg.append(circle);
    });

    return el('div', 'trend-visual', [
      svg,
      el('div', 'trend-caption', [
        el('span', '', [formatDate(points[0].at)]),
        el('strong', '', [formatter(points[points.length - 1].value)]),
        el('span', '', [formatDate(points[points.length - 1].at)]),
      ]),
    ]);
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
      record('Availability-probed', state.estateHealth.summary.availabilityKnownZones + '/' + estate.activeZones, 'Unknown is not treated as healthy'),
    ]);
  }

  function renderEstateControls() {
    ['property-observability-filter', 'property-diagnostic-filter', 'property-sort'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderEstateTable);
    });
    document.getElementById('property-search')?.addEventListener('input', renderEstateTable);
  }

  function renderEstateTable() {
    const properties = [...state.estateHealth.properties];
    const query = value('property-search', '').trim().toLowerCase();
    const observability = value('property-observability-filter', 'all');
    const diagnostic = value('property-diagnostic-filter', 'all');
    const sort = value('property-sort', 'emphasis');

    const filtered = properties
      .filter(item => observability === 'all' || item.observability.state === observability)
      .filter(item => diagnostic === 'all' || item.diagnosticState === diagnostic)
      .filter(item => !query || [item.propertyId, item.displayName, item.deployment.project, item.diagnosticState].join(' ').toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === 'property') return a.propertyId.localeCompare(b.propertyId);
        if (sort === 'observability') return a.observability.state.localeCompare(b.observability.state) || a.emphasisRank - b.emphasisRank;
        if (sort === 'deploy') return compareNullableDates(b.deployment.latestProductionDeployAt, a.deployment.latestProductionDeployAt) || a.emphasisRank - b.emphasisRank;
        if (sort === 'activity') return compareNullableDates(b.lastMeaningfulActivity.at, a.lastMeaningfulActivity.at) || a.emphasisRank - b.emphasisRank;
        return a.emphasisRank - b.emphasisRank;
      });

    text('estate-table-summary', properties.length + ' active zones · ' + state.estateHealth.summary.rumObservedZones + ' browser-observed · ' + state.estateHealth.summary.availabilityKnownZones + ' availability-probed · ' + filtered.length + ' shown');

    const body = document.getElementById('estate-table-body');
    if (!body) return;
    body.replaceChildren(...filtered.map(propertyRow));
  }

  function propertyRow(item) {
    const row = document.createElement('tr');
    if (item.emphasisRank <= 3) row.dataset.prominent = 'true';

    const propertyCell = document.createElement('td');
    const name = el('strong', '', [item.displayName]);
    propertyCell.append(name);
    if (item.propertyId !== item.displayName) propertyCell.append(el('span', 'cell-sub', [item.propertyId]));
    if (item.emphasisRank === 1) propertyCell.append(tag('GlobalDeets first'));
    if (item.propertyId === 'culturesherpa.org') propertyCell.append(tag('Culture Sherpa prominent'));

    row.append(
      propertyCell,
      cellState(item.observability.state, item.observability.rum === 'on' ? 'RUM on' : 'RUM off'),
      cellState(item.availability.state, 'No production probe connected'),
      cellState(item.criticalPath.state, 'No critical-path contract connected'),
      deploymentCell(item.deployment),
      activityCell(item.lastMeaningfulActivity),
      cellState(item.diagnosticState, item.observability.state === 'unobserved' ? 'Needs observability decision' : 'Health evidence incomplete')
    );
    return row;
  }

  function deploymentCell(deployment) {
    const cell = document.createElement('td');
    if (deployment.latestProductionDeployAt) {
      cell.append(el('strong', '', [relativeDate(deployment.latestProductionDeployAt)]));
      cell.append(el('span', 'cell-sub', [(deployment.project || 'Cloudflare Pages') + ' · ' + formatDate(deployment.latestProductionDeployAt)]));
      return cell;
    }
    if (deployment.servingDomainState === 'no_active_domain') {
      cell.append(el('strong', '', ['Not serving via mapped Pages domain']));
      cell.append(el('span', 'cell-sub', [deployment.note || 'Deploy freshness withheld']));
      return cell;
    }
    cell.append(el('strong', '', ['Unknown']));
    cell.append(el('span', 'cell-sub', [deployment.note || 'No deploy provider evidence']));
    return cell;
  }

  function activityCell(activity) {
    const cell = document.createElement('td');
    cell.append(el('strong', '', [activity.at ? relativeDate(activity.at) : 'Unknown']));
    cell.append(el('span', 'cell-sub', [activity.at ? title(activity.kind) : activity.reason || 'No evidence']));
    return cell;
  }

  function cellState(stateName, detail) {
    const cell = document.createElement('td');
    cell.append(el('span', 'state-pill state-' + String(stateName).replace(/[^a-z0-9-]/gi, '-').toLowerCase(), [title(stateName)]));
    if (detail) cell.append(el('span', 'cell-sub', [detail]));
    return cell;
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
    [...new Set(gaps.map(gap => gap.domain))].sort().forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = title(item);
      domainFilter.append(option);
    });

    ['severity-filter', 'status-filter', 'domain-filter', 'escalation-filter', 'sort-order'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderGaps);
    });
    document.getElementById('gap-search')?.addEventListener('input', renderGaps);
  }

  function renderGaps() {
    const gaps = [...state.diagnostics.items];
    const severity = value('severity-filter', 'all');
    const status = value('status-filter', 'all');
    const domain = value('domain-filter', 'all');
    const escalation = value('escalation-filter', 'all');
    const sort = value('sort-order', 'priority');
    const query = value('gap-search', '').trim().toLowerCase();

    const filtered = gaps
      .filter(gap => severity === 'all' || gap.severity === severity)
      .filter(gap => status === 'all' || gap.status === status)
      .filter(gap => domain === 'all' || gap.domain === domain)
      .filter(gap => escalation === 'all' || gap.escalation.level === escalation)
      .filter(gap => {
        if (!query) return true;
        const evidence = (gap.evidence || []).map(item => item.ref).join(' ');
        return [gap.title, gap.observed, gap.nextAction, gap.ownerLane, gap.domain, gap.escalation.escalateWhen, evidence]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (sort === 'severity') return severityRank[a.severity] - severityRank[b.severity] || a.priority - b.priority;
        if (sort === 'impact') return (impactRank[a.businessImpact] ?? 9) - (impactRank[b.businessImpact] ?? 9) || a.priority - b.priority;
        if (sort === 'age') return b.ageDays - a.ageDays || a.priority - b.priority;
        if (sort === 'domain') return a.domain.localeCompare(b.domain) || a.priority - b.priority;
        if (sort === 'escalation') return (escalationRank[a.escalation.level] ?? 9) - (escalationRank[b.escalation.level] ?? 9) || a.priority - b.priority;
        return a.priority - b.priority;
      });

    const open = gaps.filter(gap => !['closed', 'accepted-risk'].includes(gap.status));
    text('queue-summary', open.length + ' actionable · ' + open.filter(gap => gap.severity === 'critical').length + ' critical · ' + filtered.length + ' shown');
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

  function metric(valueText, label, detail, stateName) {
    const node = el('article', 'metric-card', [
      el('p', 'metric-state', [title(stateName)]),
      el('p', 'metric-number', [fmt(valueText)]),
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
    const evidenceText = (gap.evidence || []).map(item => item.ref + ' [' + item.state + ']').join(' · ');
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
        tag(gap.ageDays + 'd open'),
        tag('Escalation: ' + title(gap.escalation.level)),
      ]),
      el('p', '', [el('strong', '', ['Observed: ']), gap.observed]),
      el('p', '', [el('strong', '', ['Why it matters: ']), gap.businessReason]),
      el('p', 'gap-action', [el('strong', '', ['Next action: ']), gap.nextAction]),
      el('p', 'escalation-line', [el('strong', '', ['Escalate when: ']), gap.escalation.escalateWhen]),
      evidenceText ? el('p', 'evidence-line', ['Evidence: ' + evidenceText]) : null,
    ]);
    node.dataset.severity = gap.severity;
    node.dataset.status = gap.status;
    return node;
  }

  function tag(valueText) {
    return el('span', 'tag', [valueText]);
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

  function svgEl(tagName, attributes = {}, children = []) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tagName);
    Object.entries(attributes).forEach(([key, attributeValue]) => node.setAttribute(key, String(attributeValue)));
    for (const child of children) node.append(document.createTextNode(String(child)));
    return node;
  }

  function into(id, nodes) {
    document.getElementById(id)?.replaceChildren(...nodes.filter(Boolean));
  }

  function text(id, valueText) {
    const node = document.getElementById(id);
    if (node) node.textContent = valueText;
  }

  function value(id, fallback) {
    return document.getElementById(id)?.value ?? fallback;
  }

  function title(input) {
    return String(input || '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function fmt(input) {
    return typeof input === 'number' ? new Intl.NumberFormat('en-US').format(input) : String(input ?? 'Unavailable');
  }

  function formatDate(input) {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? String(input) : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function relativeDate(input) {
    const time = Date.parse(input);
    if (!Number.isFinite(time)) return 'Unknown';
    const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    return days + ' days ago';
  }

  function compareNullableDates(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return Date.parse(a) - Date.parse(b);
  }

  function failClosed() {
    document.body.dataset.missionControlReady = 'false';
    const error = document.getElementById('mission-control-error');
    if (error) error.hidden = false;
  }

  document.getElementById('trend-range')?.addEventListener('change', renderHistory);
})();

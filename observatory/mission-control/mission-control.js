(() => {
  'use strict';

  const semantics = window.MissionControlSemantics;
  const summaryEndpoint = '/observatory/mission-control/mission-control-data.json';
  const coverageEndpoint = '/api/intelligence/observatory/coverage';
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const impactRank = { existential: 0, high: 1, medium: 2, low: 3 };
  const escalationRank = { 'investor-blocking': 0, page: 1, high: 2, medium: 3, low: 4, none: 5 };
  const state = { summary: null, history: null, estateHealth: null, diagnostics: null, coverage: null, now: Date.now() };

  if (!semantics) {
    failClosed();
  } else {
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
        state.now = Date.now();
        render();
        document.body.dataset.missionControlReady = 'true';
      })
      .catch(failClosed);
  }

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

  // ── Freshness-aware evidence evaluation (re-run at render time; static JSON ages after publish) ──

  function policy() {
    return state.estateHealth.freshnessPolicy || semantics.FRESHNESS_POLICY;
  }

  function probeFreshness() {
    const probe = state.estateHealth.evidence?.probe;
    return probe?.observedAt ? semantics.evaluateFreshness(probe.observedAt, policy().probe, state.now) : { state: 'unknown', ageHours: null };
  }

  function historyFreshness() {
    const scheduled = state.history.snapshots.filter(item => item.collector?.kind === 'scheduled');
    if (!scheduled.length) return { state: 'unknown', ageHours: null, observedAt: null };
    const observedAt = scheduled[scheduled.length - 1].observedAt;
    return { ...semantics.evaluateFreshness(observedAt, policy().history, state.now), observedAt };
  }

  function inventoryFreshness() {
    const inventory = state.estateHealth.evidence?.inventory;
    return inventory?.asOf ? semantics.evaluateFreshness(inventory.asOf, policy().inventory, state.now) : { state: 'unknown', ageHours: null };
  }

  function evaluate(item) {
    const freshness = item.availability.observedAt ? semantics.evaluateFreshness(item.availability.observedAt, policy().probe, state.now) : { state: 'unknown', ageHours: null };
    const effective = semantics.effectiveAvailability(item.availability, freshness);
    const health = semantics.classifyHealth({ availability: item.availability, criticalPath: item.criticalPath, freshness });
    return { freshness, effective, health };
  }

  function evaluatedProperties() {
    return state.estateHealth.properties.map(item => ({ item, ...evaluate(item) }));
  }

  function isProbed(row) {
    return ['available', 'degraded', 'unavailable', 'no-service-published'].includes(row.effective.state) && !row.item.availability.blocked;
  }

  function render() {
    const data = state.summary;
    const gaps = allDiagnostics();
    renderMetrics(data, gaps);
    renderEvidenceStatus();
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
    text('provenance-note', provenanceText(data));
  }

  function provenanceText(data) {
    const probe = state.estateHealth.evidence?.probe;
    const probeText = probe?.observedAt
      ? 'Availability and critical-path state come from scheduled production probes (latest valid run ' + formatDate(probe.observedAt) + ', vantage ' + (probe.vantage || 'unknown') + ', ' + probeFreshness().state + ').'
      : 'No valid production probe run has been collected yet; availability and critical-path state are unknown.';
    return 'Snapshot ' + data.snapshotVersion + ', generated ' + formatDate(data.generatedAt) + '. ' + probeText +
      ' Zone, RUM, and Pages deploy facts are Cloudflare inventory read ' + formatDate(state.estateHealth.evidence?.inventory?.asOf) + '. ' +
      'A successful deploy or an HTTP response is not treated as health; only the explicit health contract can mark a property verified. ' +
      'GlobalDeets edge traffic is operational telemetry, not certified human audience.';
  }

  /** Server-derived queue plus render-time staleness findings the static file could not know at publish time. */
  function allDiagnostics() {
    const items = [...state.diagnostics.items];
    const ids = new Set(items.map(item => item.id));
    const probe = state.estateHealth.evidence?.probe;
    const fresh = probeFreshness();
    if (probe?.observedAt && ['stale', 'expired'].includes(fresh.state) && !ids.has('evidence:probe-stale')) {
      const expired = fresh.state === 'expired';
      items.push(derivedAtRender({
        id: 'evidence:probe-stale',
        severity: expired ? 'high' : 'medium',
        title: 'Production probe evidence is ' + fresh.state,
        observed: 'Latest valid probe run is ' + fresh.ageHours + ' hours old at page load; the scheduled collector or deploy may be failing.' + (expired ? ' Availability is shown as unknown.' : ''),
        nextAction: 'Inspect the mission-control-evidence workflow runs. Last valid evidence is preserved and never rewritten.',
        level: expired ? 'high' : 'medium',
        ref: probe.runId,
        state: fresh.state,
      }));
    }
    const historyFresh = historyFreshness();
    if (['stale', 'expired'].includes(historyFresh.state) && !ids.has('evidence:history-stale')) {
      items.push(derivedAtRender({
        id: 'evidence:history-stale',
        severity: 'medium',
        domain: 'measurement',
        title: 'Historical snapshots are ' + historyFresh.state,
        observed: 'Newest scheduled snapshot is ' + historyFresh.ageHours + ' hours old at page load. Missing days remain visible gaps.',
        nextAction: 'Inspect the scheduled collector.',
        level: 'medium',
        ref: historyFresh.observedAt,
        state: historyFresh.state,
      }));
    }
    return items;
  }

  function derivedAtRender(spec) {
    return {
      id: spec.id,
      priority: 999,
      severity: spec.severity,
      domain: spec.domain || 'reliability',
      status: 'open',
      businessImpact: 'medium',
      ownerLane: 'Platform',
      ageDays: 0,
      title: spec.title,
      observed: spec.observed,
      businessReason: 'Aged evidence cannot support a current health claim.',
      evidence: [{ type: 'evidence-age', ref: spec.ref || 'unknown', state: spec.state }],
      nextAction: spec.nextAction,
      source: 'client-derived',
      escalation: { level: spec.level, class: 'stale-evidence', blocksInvestorClaim: false, escalateWhen: 'Evidence stays stale.', targetLane: 'Platform' },
    };
  }

  function renderMetrics(data, gaps) {
    const coverage = state.coverage;
    const sourceCount = coverage?.newsCoverage?.totalSources;
    const dossierCount = coverage?.evidenceCoverage?.dossierCount;
    const openCritical = gaps.filter(gap => !['closed', 'accepted-risk'].includes(gap.status) && gap.severity === 'critical').length;
    const rows = evaluatedProperties();
    const probed = rows.filter(isProbed);
    const available = rows.filter(row => row.effective.state === 'available').length;
    const outages = rows.filter(row => row.health === 'outage').length;
    const verified = rows.filter(row => row.health === 'verified-healthy').length;
    const evidenceUsable = probed.length > 0;
    const traffic = data.globaldeetsTraffic;

    into('investor-grid', [
      metric(data.estate.activeZones, 'Active web properties', 'Cloudflare zone inventory', 'certified'),
      metric(data.estate.rumObservedZones + '/' + data.estate.activeZones, 'Browser-observable properties', data.estate.rumCoveragePct + '% estate coverage', 'certified'),
      metric(evidenceUsable ? available + '/' + probed.length : 'Unknown', 'Reachable now', evidenceUsable ? 'Fresh production probes · not a health claim' : 'No fresh probe evidence', evidenceUsable ? 'operational' : 'limited'),
      metric(evidenceUsable ? verified : 'Unknown', 'Verified healthy', 'Fresh availability + authoritative critical path', evidenceUsable ? 'certified' : 'limited'),
      metric(evidenceUsable ? outages : 'Unknown', 'Confirmed outages', outages ? 'See operating queue' : evidenceUsable ? 'None confirmed' : 'No fresh probe evidence', outages ? 'attention' : evidenceUsable ? 'certified' : 'limited'),
      metric(sourceCount ?? 'Live', 'Governed news sources', sourceCount == null ? 'Live endpoint unavailable' : 'Coverage Observatory', sourceCount == null ? 'limited' : 'certified'),
      metric(dossierCount ?? 'Live', 'Published evidence dossiers', dossierCount == null ? 'Live endpoint unavailable' : 'Governed evidence layer', dossierCount == null ? 'limited' : 'certified'),
      traffic?.window
        ? metric(fmt(traffic.edgeRequests), traffic.window.days + '-day edge requests', traffic.window.start + ' → ' + traffic.window.end, 'operational')
        : metric('Unavailable', 'Edge requests', 'No comparable observation retained', 'limited'),
      metric(openCritical, 'Critical diagnostic gaps', openCritical ? 'Blocks audience traction claims' : 'No critical gaps open', openCritical ? 'attention' : 'certified'),
    ]);
  }

  function renderEvidenceStatus() {
    const probe = state.estateHealth.evidence?.probe;
    const fresh = probeFreshness();
    const historyFresh = historyFreshness();
    const inventoryFresh = inventoryFreshness();
    const line = (label, freshness, detail) => {
      const node = el('div', 'record', [
        el('div', 'record-row', [el('span', '', [label]), el('span', 'record-value', [title(freshness.state)])]),
        el('p', 'record-detail', [detail]),
      ]);
      node.dataset.freshness = freshness.state;
      return node;
    };
    into('evidence-status', [
      line('Production probes', fresh, probe?.observedAt
        ? 'Run ' + probe.runId + ' · observed ' + formatDate(probe.observedAt) + ' · ' + ageText(fresh.ageHours) + ' · vantage ' + (probe.vantage || 'unknown') + (probe.vantageCount === 1 ? ' (single vantage)' : '')
        : 'No valid probe run collected yet'),
      line('Historical snapshots', historyFresh, historyFresh.observedAt ? 'Newest scheduled snapshot ' + formatDate(historyFresh.observedAt) + ' · ' + ageText(historyFresh.ageHours) : 'No scheduled snapshot yet — only the seeded GD-029 observations exist'),
      line('Cloudflare inventory', inventoryFresh, inventoryDetail()),
    ]);
    const attempt = probe?.latestAttempt;
    if (attempt && attempt.validity && attempt.validity !== 'valid') {
      document.getElementById('evidence-status')?.append(warning('The latest probe attempt (' + attempt.runId + ') was invalid and discarded; the last valid run is shown and will age visibly.'));
    }
  }

  function inventoryDetail() {
    const inventory = state.estateHealth.evidence?.inventory;
    const facets = inventory?.facets || {};
    const read = [facets.zones ? 'zone status' : null, facets.pages ? 'Pages deploy facts' : null].filter(Boolean);
    const carried = [facets.zones ? null : 'zone status', facets.pages ? null : 'Pages deploy facts', facets.rum ? null : 'RUM settings'].filter(Boolean);
    return (read.length ? 'Refreshed from Cloudflare: ' + read.join(' + ') + ' (oldest ' + formatDate(inventory?.asOf) + ')' : 'Nothing refreshed by the collector yet') +
      (carried.length ? ' · carried forward from the ' + formatDate(inventory?.baselineAsOf || inventory?.asOf) + ' read: ' + carried.join(', ') : '');
  }

  function ageText(hours) {
    if (hours == null) return 'age unknown';
    if (hours < 1) return 'under an hour old';
    if (hours < 48) return Math.round(hours) + 'h old';
    return Math.round(hours / 24) + 'd old';
  }

  function renderThesis(items) {
    into('investment-thesis', items.map(item => el('article', 'thesis-card', [
      el('p', 'thesis-kicker', [item.label]),
      el('h3', '', [item.title]),
      el('p', '', [item.statement]),
      el('p', 'thesis-proof', [item.proof]),
    ])));
  }

  function series(snapshots, pick) {
    return snapshots
      .map(item => pick(item))
      .filter(point => point && Number.isFinite(point.value))
      .map(point => ({ at: point.at, value: point.value, key: point.key }));
  }

  function renderHistory() {
    const days = Number(value('trend-range', '28'));
    const cutoff = state.now - days * 86400000;
    const snapshots = [...state.history.snapshots]
      .sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)))
      .filter(item => Date.parse(item.observedAt) >= cutoff && Date.parse(item.observedAt) <= state.now);

    const estatePoints = series(snapshots, item =>
      item.estate?.evidenceState === 'measured' && typeof item.estate.rumCoveragePct === 'number'
        ? { at: item.observedAt, value: item.estate.rumCoveragePct, key: item.estate.comparabilityKey || 'estate-rum|v1' }
        : null);
    const availabilityPoints = series(snapshots, item =>
      item.availability?.evidenceState === 'measured' && typeof item.availability.availableRatioPct === 'number'
        ? { at: item.observedAt, value: item.availability.availableRatioPct, key: item.availability.comparabilityKey }
        : null);
    const operationalPoints = series(snapshots, item =>
      item.globaldeetsOperational?.evidenceState === 'measured' && typeof item.globaldeetsOperational.edgeRequests === 'number'
        ? { at: item.observedAt, value: item.globaldeetsOperational.edgeRequests, key: item.globaldeetsOperational.comparabilityKey || 'legacy-cloudflare-edge-28d' }
        : null);
    const audiencePoints = series(snapshots, item =>
      item.certifiedAudience?.evidenceState === 'measured' && item.certifiedAudience.certified === true && typeof item.certifiedAudience.value === 'number'
        ? { at: item.observedAt, value: item.certifiedAudience.value, key: item.certifiedAudience.comparabilityKey || 'certified-audience' }
        : null);

    const coverage = semantics.windowCoverage(state.history.snapshots, days, state.now);
    text('history-window-note', days + '-day view · ' + snapshots.length + ' dated snapshot' + (snapshots.length === 1 ? '' : 's') + ' retained · ' +
      coverage.observedDays + ' of ' + coverage.expectedDays + ' days observed (' + coverage.missingDays + ' missing day' + (coverage.missingDays === 1 ? '' : 's') + ' shown as gaps, never zeros)');

    into('history-estate', [trendVisual(estatePoints, valueText => Math.round(valueText) + '%', 'RUM estate coverage')]);
    into('history-availability', [trendVisual(availabilityPoints, valueText => valueText.toFixed(1) + '%', 'Reachable share of probed service zones')]);
    into('history-operational', [trendVisual(operationalPoints, fmt, 'Edge requests')]);
    into('history-audience', audiencePoints.length
      ? [trendVisual(audiencePoints, fmt, 'Certified audience')]
      : [warning('Certified audience history is unavailable. No GA4/RUM-quality human-audience series has passed the evidence gate yet.')]);

    trendNote('history-estate-note', estatePoints, 'measured snapshot');
    trendNote('history-availability-note', availabilityPoints, 'measured probe snapshot');
    trendNote('history-operational-note', operationalPoints, 'comparable measured snapshot');
  }

  function trendNote(id, points, noun) {
    const summary = semantics.trendSummary(points);
    const count = points.length;
    if (!summary.delta) {
      if (summary.reason === 'no-measured-observations') {
        text(id, 'No measured observations in this window.');
      } else if (summary.segments.length > 1) {
        text(id, count + ' ' + noun + 's in ' + summary.segments.length + ' non-comparable segments — no trend delta calculated.');
      } else {
        text(id, count + ' ' + noun + (count === 1 ? '' : 's') + ' — no trend delta calculated.');
      }
      return;
    }
    const delta = summary.delta;
    const sign = delta.absolute > 0 ? '+' : '';
    text(id, summary.comparablePoints + ' comparable ' + noun + 's · change ' + sign + fmt(Math.round(delta.absolute * 10) / 10) + (delta.pct == null ? '' : ' (' + sign + delta.pct.toFixed(1) + '%)') +
      (summary.segments.length > 1 ? ' · latest comparable segment only' : ''));
  }

  function trendVisual(points, formatter, label) {
    if (!points.length) return warning('No measured observations are available in this window.');
    const summary = semantics.trendSummary(points);
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
    const times = points.map(point => Date.parse(point.at));
    const minTime = Math.min(...times);
    const spanTime = Math.max(...times) - minTime || 1;
    const values = points.map(point => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const place = point => {
      const x = padX + ((Date.parse(point.at) - minTime) / spanTime) * (width - padX * 2);
      const ratio = span ? (point.value - min) / span : 0.5;
      return { ...point, x, y: height - padY - ratio * (height - padY * 2) };
    };

    const svg = svgEl('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': label + ' trend' });
    svg.classList.add('trend-svg');
    // One path per comparable segment: gaps and definition changes break the line instead of bridging it.
    summary.segments.forEach(segment => {
      const coords = segment.points.map(place);
      if (coords.length > 1) {
        svg.append(svgEl('path', { d: coords.map((point, index) => (index ? 'L' : 'M') + ' ' + point.x.toFixed(1) + ' ' + point.y.toFixed(1)).join(' '), class: 'trend-line' }));
      }
      coords.forEach(point => {
        const circle = svgEl('circle', { cx: point.x, cy: point.y, r: 5, class: 'trend-point' });
        circle.append(svgEl('title', {}, [formatter(point.value) + ' · ' + formatDate(point.at)]));
        svg.append(circle);
      });
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
    if (!traffic?.window || typeof traffic.edgeVisits !== 'number') {
      into('traffic-quality', [
        warning('No comparable edge-traffic observation is retained. Nothing is inferred, and raw edge traffic is never presented as audience.'),
        record('Investor-safe audience', 'Not yet certified', 'Human/bot/monitor/API/asset/probe classification is the next measurement gate'),
      ]);
      return;
    }
    const known = typeof traffic.syntheticHealthVisits === 'number';
    const synthetic = known ? Math.min(traffic.edgeVisits, traffic.syntheticHealthVisits) : 0;
    const residual = Math.max(0, traffic.edgeVisits - synthetic);
    const syntheticPct = traffic.edgeVisits ? Math.round((synthetic / traffic.edgeVisits) * 100) : 0;
    const residualPct = 100 - syntheticPct;

    into('traffic-quality', [
      known
        ? warning('Raw edge visits cannot be presented as audience: ' + syntheticPct + '% are attached to ' + (traffic.syntheticHealthPath || 'a synthetic health path') + '.')
        : warning('Raw edge visits cannot be presented as audience: synthetic-versus-organic composition was not reported by the source.'),
      known ? stackedBar([
        { label: 'Known synthetic health', value: synthetic, pct: syntheticPct, className: 'bar-danger' },
        { label: 'Residual / not yet classified', value: residual, pct: residualPct, className: 'bar-muted' },
      ]) : null,
      record(traffic.window.days + '-day edge requests', fmt(traffic.edgeRequests), traffic.window.start + ' → ' + traffic.window.end),
      record('Raw edge visits', fmt(traffic.edgeVisits), 'Operational telemetry only'),
      record('Investor-safe audience', 'Not yet certified', 'Human/bot/monitor/API/asset/probe classification is the next measurement gate'),
    ]);
  }

  function renderEstate(estate) {
    const observedPct = estate.rumCoveragePct;
    const missingPct = Math.max(0, 100 - observedPct);
    const probed = evaluatedProperties().filter(isProbed).length;
    into('estate-observability', [
      stackedBar([
        { label: 'Observed', value: estate.rumObservedZones, pct: observedPct, className: 'bar-good' },
        { label: 'Uncovered', value: estate.missingRumZones.length, pct: missingPct, className: 'bar-warn' },
      ]),
      record('Active zones', estate.activeZones, estate.source),
      record('RUM observed', estate.rumObservedZones + '/' + estate.activeZones, observedPct + '% coverage'),
      record('Availability-probed', probed + '/' + estate.activeZones, probed ? 'Fresh production probes; unknown, blocked, and expired are excluded' : 'Unknown is not treated as healthy'),
    ]);
  }

  function renderEstateControls() {
    ['property-observability-filter', 'property-diagnostic-filter', 'property-availability-filter', 'property-sort'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderEstateTable);
    });
    document.getElementById('property-search')?.addEventListener('input', renderEstateTable);
  }

  const healthRank = {
    outage: 0,
    'critical-path-failed': 1,
    degraded: 2,
    'probe-blocked': 3,
    'contract-drift': 4,
    'evidence-expired': 5,
    'evidence-stale': 6,
    'health-evidence-incomplete': 7,
    'no-service-published': 8,
    'reachable-unverified': 9,
    'verified-healthy': 10,
  };

  function renderEstateTable() {
    const rows = evaluatedProperties();
    const query = value('property-search', '').trim().toLowerCase();
    const observability = value('property-observability-filter', 'all');
    const diagnostic = value('property-diagnostic-filter', 'all');
    const availabilityFilter = value('property-availability-filter', 'all');
    const sort = value('property-sort', 'emphasis');

    const filtered = rows
      .filter(row => observability === 'all' || row.item.observability.state === observability)
      .filter(row => diagnostic === 'all' || row.health === diagnostic)
      .filter(row => availabilityFilter === 'all' || row.effective.state === availabilityFilter)
      .filter(row => !query || [row.item.propertyId, row.item.displayName, row.item.deployment.project, row.health].join(' ').toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === 'property') return a.item.propertyId.localeCompare(b.item.propertyId);
        if (sort === 'observability') return a.item.observability.state.localeCompare(b.item.observability.state) || a.item.emphasisRank - b.item.emphasisRank;
        if (sort === 'health') return (healthRank[a.health] ?? 99) - (healthRank[b.health] ?? 99) || a.item.emphasisRank - b.item.emphasisRank;
        if (sort === 'deploy') return compareNullableDates(b.item.deployment.latestProductionDeployAt, a.item.deployment.latestProductionDeployAt) || a.item.emphasisRank - b.item.emphasisRank;
        if (sort === 'activity') return compareNullableDates(b.item.lastMeaningfulActivity.at, a.item.lastMeaningfulActivity.at) || a.item.emphasisRank - b.item.emphasisRank;
        return a.item.emphasisRank - b.item.emphasisRank;
      });

    text('estate-table-summary', rows.length + ' active zones · ' + state.estateHealth.summary.rumObservedZones + ' browser-observed · ' + rows.filter(isProbed).length + ' availability-probed · ' +
      rows.filter(row => row.health === 'verified-healthy').length + ' verified healthy · ' + filtered.length + ' shown');

    const body = document.getElementById('estate-table-body');
    if (!body) return;
    body.replaceChildren(...filtered.map(propertyRow));
  }

  function propertyRow(row) {
    const { item, effective, health, freshness } = row;
    const tr = document.createElement('tr');
    if (item.emphasisRank <= 3) tr.dataset.prominent = 'true';
    tr.dataset.health = health;
    tr.dataset.availability = effective.state;

    const propertyCell = document.createElement('td');
    propertyCell.append(el('strong', '', [item.displayName]));
    if (item.propertyId !== item.displayName) propertyCell.append(el('span', 'cell-sub', [item.propertyId]));
    if (item.emphasisRank === 1) propertyCell.append(tag('GlobalDeets first'));
    if (item.propertyId === 'culturesherpa.org') propertyCell.append(tag('Culture Sherpa prominent'));
    if (item.investorCritical) propertyCell.append(tag('Investor-critical'));

    tr.append(
      propertyCell,
      cellState(item.observability.state, item.observability.rum === 'on' ? 'RUM on' : 'RUM off'),
      availabilityCell(item, effective, freshness),
      criticalPathCell(item, freshness),
      deploymentCell(item.deployment),
      activityCell(item.lastMeaningfulActivity),
      cellState(health, healthDetail(item, health))
    );
    return tr;
  }

  function availabilityCell(item, effective, freshness) {
    const availability = item.availability;
    const label = availability.blocked && !effective.expired ? 'probe-blocked' : effective.state;
    let detail;
    if (effective.expired) {
      detail = 'Evidence expired (' + ageText(freshness.ageHours) + ')' + (effective.lastKnownState ? ' · last known: ' + title(effective.lastKnownState) : '');
    } else if (!availability.observedAt) {
      detail = availability.reason || 'No probe evidence';
    } else {
      const http = availability.evidence?.http;
      const pieces = [];
      if (http?.status) pieces.push('HTTP ' + http.status);
      else if (availability.failureClass) pieces.push(title(availability.failureClass));
      if (http?.durationMs != null && http.status) pieces.push(http.durationMs + ' ms');
      pieces.push(ageText(freshness.ageHours));
      if (effective.stale) pieces.push('stale');
      if (availability.confidence === 'single-observation') pieces.push('unconfirmed');
      detail = pieces.join(' · ');
    }
    const cell = cellState(label, detail);
    const recent = availability.recent;
    if (recent?.conclusiveRuns) {
      cell.append(el('span', 'cell-sub', ['7d: ' + Math.round(recent.availabilityRatio * 1000) / 10 + '% of ' + recent.conclusiveRuns + ' runs']));
    }
    return cell;
  }

  function criticalPathCell(item, freshness) {
    const critical = item.criticalPath;
    const stateLabel = freshness.state === 'expired' ? 'unknown' : critical.state;
    const level = critical.level ? title(critical.level) + ' contract' : '';
    let detail;
    if (freshness.state === 'expired') detail = 'Evidence expired';
    else if (critical.state === 'unknown') detail = critical.reason || 'No critical-path contract';
    else if (critical.state === 'pass') detail = level + ' · ' + critical.checks.length + ' check' + (critical.checks.length === 1 ? '' : 's') + ' passed';
    else detail = level + ' · ' + (critical.reason || 'check failed');
    return cellState(stateLabel, detail);
  }

  function healthDetail(item, health) {
    const availability = item.availability;
    if (['outage', 'degraded', 'probe-blocked', 'no-service-published'].includes(health) && availability.nextAction) return availability.nextAction;
    if (health === 'critical-path-failed' || health === 'contract-drift') return item.criticalPath.reason || 'Critical-path check needs review';
    if (health === 'reachable-unverified') return 'Reachable; no authoritative critical-path contract proves it works';
    if (health === 'verified-healthy') return 'Fresh availability + authoritative critical path';
    if (health === 'evidence-stale') return 'Evidence past its freshness window';
    if (health === 'evidence-expired') return 'Evidence expired; shown as unknown';
    return item.observability.state === 'unobserved' ? 'Needs observability decision' : 'Health evidence incomplete';
  }

  function deploymentCell(deployment) {
    const cell = document.createElement('td');
    if (deployment.latestProductionDeployAt) {
      cell.append(el('strong', '', [relativeDate(deployment.latestProductionDeployAt)]));
      cell.append(el('span', 'cell-sub', [(deployment.project || 'Cloudflare Pages') + ' · ' + formatDate(deployment.latestProductionDeployAt) + ' · deploy is not availability']));
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
    const open = gaps.filter(gap => !['closed', 'accepted-risk'].includes(gap.status));
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
    const classFilter = document.getElementById('class-filter');
    (state.diagnostics.agentContract?.escalationClasses || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = title(item);
      classFilter?.append(option);
    });

    ['severity-filter', 'status-filter', 'domain-filter', 'escalation-filter', 'class-filter', 'sort-order'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderGaps);
    });
    document.getElementById('gap-search')?.addEventListener('input', renderGaps);
  }

  function renderGaps() {
    const gaps = allDiagnostics();
    const severity = value('severity-filter', 'all');
    const status = value('status-filter', 'all');
    const domain = value('domain-filter', 'all');
    const escalation = value('escalation-filter', 'all');
    const escalationClass = value('class-filter', 'all');
    const sort = value('sort-order', 'priority');
    const query = value('gap-search', '').trim().toLowerCase();

    const filtered = gaps
      .filter(gap => severity === 'all' || gap.severity === severity)
      .filter(gap => status === 'all' || gap.status === status)
      .filter(gap => domain === 'all' || gap.domain === domain)
      .filter(gap => escalation === 'all' || gap.escalation.level === escalation)
      .filter(gap => escalationClass === 'all' || gap.escalation.class === escalationClass)
      .filter(gap => {
        if (!query) return true;
        const evidence = (gap.evidence || []).map(item => item.ref).join(' ');
        return [gap.title, gap.observed, gap.nextAction, gap.ownerLane, gap.domain, gap.escalation.escalateWhen, (gap.subjects || []).join(' '), gap.subject || '', evidence]
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
    const subjects = gap.subjects?.length ? gap.subjects.join(', ') : gap.subject || '';
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
        gap.escalation.class && gap.escalation.class !== 'none' ? tag('Class: ' + title(gap.escalation.class)) : null,
        gap.source ? tag(gap.source === 'manual' ? 'Hand-authored' : title(gap.source)) : null,
      ]),
      el('p', '', [el('strong', '', ['Observed: ']), gap.observed]),
      el('p', '', [el('strong', '', ['Why it matters: ']), gap.businessReason]),
      el('p', 'gap-action', [el('strong', '', ['Next action: ']), gap.nextAction]),
      el('p', 'escalation-line', [el('strong', '', ['Escalate when: ']), gap.escalation.escalateWhen]),
      subjects ? el('p', 'evidence-line', ['Subjects: ' + subjects]) : null,
      evidenceText ? el('p', 'evidence-line', ['Evidence: ' + evidenceText]) : null,
    ]);
    node.dataset.severity = gap.severity;
    node.dataset.status = gap.status;
    node.dataset.class = gap.escalation.class || 'none';
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
    const days = Math.max(0, Math.floor((state.now - time) / 86400000));
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

  document.getElementById('trend-range')?.addEventListener('change', () => {
    if (state.history) renderHistory();
  });
})();

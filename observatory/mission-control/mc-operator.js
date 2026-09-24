/**
 * Operator view (GD-031): "What should I work on next, and why?" plus property-level evidence.
 * The queue is ranked by the governed, explainable priority score; this view only filters, sorts and discloses.
 */
(() => {
  'use strict';

  const model = window.MissionControlModel;
  const charts = window.MissionControlCharts;
  const exec = window.MissionControlExecutive;
  const { el } = charts;

  const SEV_TONE = { critical: 'bad', high: 'bad', medium: 'watch', low: 'info', info: 'muted' };
  const ACT_TONE = { 'actionable-now': 'good', 'blocked-on-authority': 'watch', 'decision-needed': 'info', monitor: 'muted', closed: 'muted' };

  const defaults = () => ({ search: '', severity: 'all', category: 'all', actionability: 'all', status: 'open', confidence: 'all', freshness: 'all', subject: 'all', sort: 'priority' });
  const propDefaults = () => ({ search: '', status: 'all', category: 'all', lifecycle: 'all', instrumentation: 'all', sort: 'emphasis' });

  function select(id, label, options, value, onChange) {
    const node = el('select', '', options.map(([optionValue, optionLabel]) => el('option', '', [optionLabel], { value: optionValue })), { id, 'aria-label': label });
    node.value = value;
    node.addEventListener('change', () => onChange(node.value));
    return el('label', 'field', [el('span', '', [label]), node]);
  }

  function search(id, label, value, onInput, placeholder) {
    const node = el('input', '', [], { id, type: 'search', placeholder: placeholder || 'Search', value, 'aria-label': label });
    node.addEventListener('input', () => onInput(node.value));
    return el('label', 'field grow', [el('span', '', [label]), node]);
  }

  // ── Work queue ───────────────────────────────────────────────────────────────────────────────
  function findingCard(item, nextId, ctx, ui) {
    const open = item.id === nextId;
    const nameOf = id => ctx.estate.properties.find(row => row.propertyId === id)?.profile.name || id;
    const closed = ['closed', 'accepted-risk'].includes(item.status);
    const state = closed ? 'closed' : item.actionability.state;
    const subjects = item.subjects.length
      ? el('p', 'subjects', item.subjects.slice(0, 6).map(id => {
          const button = el('button', 'chip chip-button', [nameOf(id)], { type: 'button', 'aria-label': 'Filter to ' + nameOf(id) });
          button.addEventListener('click', () => ctx.setQueueFilter({ subject: id }));
          return button;
        }).concat(item.subjects.length > 6 ? [el('span', 'chip is-muted', ['+' + (item.subjects.length - 6) + ' more'])] : []))
      : null;
    const detail = el('details', 'finding-detail', [
      el('summary', '', ['Why it matters, the evidence and how it was ranked']),
      el('div', 'detail-grid', [
        el('div', '', [
          el('h5', '', ['Why it matters']), el('p', '', [item.businessReason]),
          el('h5', '', ['Next action']), el('p', '', [item.nextAction]),
          item.actionability.blockedBy ? el('p', 'blocked-by', [el('strong', '', ['Blocked by: ']), item.actionability.blockedBy]) : null,
          el('h5', '', ['Escalate when']), el('p', '', [item.escalation.escalateWhen]),
        ]),
        el('div', '', [
          el('h5', '', ['Evidence']),
          el('ul', 'plain', item.evidence.map(entry => el('li', '', [el('code', '', [entry.type]), ' ' + entry.ref + ' · ' + entry.state]))),
          el('h5', '', ['Freshness and confidence']),
          el('p', '', [item.freshness.basis + ': ' + item.freshness.state + (item.freshness.observedAt ? ' (' + model.formatDate(item.freshness.observedAt) + ')' : '') + ' · confidence ' + item.confidence]),
          el('h5', '', ['Why rank ' + item.priority + ' (score ' + item.priorityScore + ')']),
          el('table', 'score-table', [el('tbody', '', item.priorityBreakdown.map(part => el('tr', '', [el('th', '', [part.factor], { scope: 'row' }), el('td', 'num', [(part.points > 0 ? '+' : '') + part.points]), el('td', '', [part.why])])))]),
        ]),
      ]),
    ]);
    if (open) detail.open = true;
    const card = el('article', 'finding sev-' + item.severity + (closed ? ' is-closed' : ''), [
      el('header', '', [
        el('span', 'rank', ['#' + item.priority], { 'aria-label': 'Priority ' + item.priority }),
        el('h4', '', [item.title]),
      ]),
      el('p', 'finding-chips', [
        exec.pill(SEV_TONE[item.severity], item.severity[0].toUpperCase() + item.severity.slice(1)),
        exec.pill(ACT_TONE[state], model.ACTIONABILITY_LABELS[state]),
        el('span', 'chip', [model.CATEGORY_LABELS[item.category] || item.category]),
        el('span', 'chip', ['Confidence: ' + item.confidence]),
        el('span', 'chip', ['Evidence: ' + item.freshness.state]),
        item.ageDays ? el('span', 'chip', [item.ageDays + 'd open']) : null,
      ]),
      subjects,
      el('p', 'observed', [item.observed]),
      el('p', 'next', [el('span', 'label', ['Next: ']), item.nextAction]),
      detail,
    ], { id: 'finding-' + item.id.replace(/[^a-z0-9]+/gi, '-') });
    void ui;
    return card;
  }

  function renderQueue(ctx, ui) {
    const items = ctx.diagnostics.items;
    const facets = model.facets(items);
    const filtered = model.sortFindings(model.filterFindings(items, ui), ui.sort);
    const next = items.find(item => item.id === ctx.diagnostics.summary.nextUp);
    const list = el('div', 'queue', [], { 'aria-live': 'polite' });
    if (!filtered.length) list.append(el('p', 'empty-detail', ['No item matches these filters. ', (() => {
      const reset = el('button', 'link-button', ['Reset filters'], { type: 'button' });
      reset.addEventListener('click', () => ctx.setQueueFilter(defaults(), true));
      return reset;
    })()]));
    for (const item of filtered) list.append(findingCard(item, next && ui.status !== 'closed' ? next.id : null, ctx, ui));

    const opt = (all, entries, labelFor) => [['all', all], ...entries.map(([key, count]) => [key, labelFor(key) + ' (' + count + ')'])];
    const controls = el('div', 'filters no-print', [
      search('queue-search', 'Search work', ui.search, value => ctx.setQueueFilter({ search: value }), 'Property, topic or keyword'),
      select('queue-status', 'Show', [['open', 'Open work'], ['closed', 'Closed'], ['all', 'Everything']], ui.status, value => ctx.setQueueFilter({ status: value })),
      select('queue-actionability', 'Can I act on it?', opt('All', facets.actionability, key => model.ACTIONABILITY_LABELS[key] || key), ui.actionability, value => ctx.setQueueFilter({ actionability: value })),
      select('queue-severity', 'Severity', opt('All', facets.severity, key => key[0].toUpperCase() + key.slice(1)), ui.severity, value => ctx.setQueueFilter({ severity: value })),
      select('queue-category', 'Category', opt('All', facets.category, key => model.CATEGORY_LABELS[key] || key), ui.category, value => ctx.setQueueFilter({ category: value })),
      select('queue-subject', 'Property', opt('All', facets.subject.map(([key, count]) => [key, count]), key => ctx.estate.properties.find(row => row.propertyId === key)?.profile.name || key), ui.subject, value => ctx.setQueueFilter({ subject: value })),
      select('queue-confidence', 'Confidence', opt('All', facets.confidence, key => key[0].toUpperCase() + key.slice(1)), ui.confidence, value => ctx.setQueueFilter({ confidence: value })),
      select('queue-freshness', 'Evidence age', opt('All', facets.freshness, key => key[0].toUpperCase() + key.slice(1)), ui.freshness, value => ctx.setQueueFilter({ freshness: value })),
      select('queue-sort', 'Sort by', [['priority', 'Priority (recommended)'], ['severity', 'Severity'], ['age', 'Oldest first'], ['category', 'Category']], ui.sort, value => ctx.setQueueFilter({ sort: value })),
    ]);
    const summary = ctx.diagnostics.summary;
    const head = el('div', 'section-head', [
      el('p', 'eyebrow', ['Work queue']),
      el('h2', '', ['What should I work on next, and why?']),
      el('p', 'lede', [summary.open + ' open items: ' + summary.actionableNow + ' can be worked now, ' + summary.decisionNeeded + ' need a decision, ' + summary.blockedOnAuthority + ' are blocked on authority we don’t have. Ranking is a published, explainable score.']),
    ]);
    const nextCard = next
      ? el('article', 'card next-up', [
          el('p', 'eyebrow', ['Work on this first']),
          el('h3', '', [next.title]),
          el('p', '', [next.businessReason]),
          el('p', 'next', [el('span', 'label', ['Do: ']), next.nextAction]),
          el('p', 'muted', ['Ranked #' + next.priority + ' overall (score ' + next.priorityScore + '); it is the highest-ranked item that can be worked on right now.']),
        ])
      : el('article', 'card next-up', [el('p', 'eyebrow', ['Work on this first']), el('h3', '', ['Nothing is actionable right now']), el('p', '', ['Every open item is waiting on a decision, monitoring, or authority we don’t have.'])]);
    return el('section', 'block', [head, nextCard, controls, el('p', 'result-count', ['Showing ' + filtered.length + ' of ' + items.length + ' items']), list]);
  }

  // ── Properties ───────────────────────────────────────────────────────────────────────────────
  const CP_LABEL = { authoritative: 'Owner-declared', 'baseline-only': 'Homepage only', 'needs-owner-declaration': 'Not declared', 'not-applicable': 'Not applicable' };

  function propertyRow(entry, ctx) {
    const row = entry.row;
    const contract = row.criticalPath.contract;
    const audience = ctx.audience.properties.find(item => item.propertyId === row.propertyId);
    const events = ctx.events.properties.find(item => item.propertyId === row.propertyId);
    const traffic = model.describeReading(audience.requests[28], ctx.audience.source.freshness, { compact: true });
    const vantages = row.availability.vantages || [];
    const checks = row.criticalPath.checks || [];
    const cell = (label, children, className) => el('td', className || '', children, { 'data-label': label });
    const detail = el('details', 'row-detail', [
      el('summary', '', ['Evidence']),
      el('ul', 'plain', [
        el('li', '', [row.availability.reason]),
        row.availability.evidence?.http ? el('li', '', ['HTTP ' + (row.availability.evidence.http.status ?? 'none') + ' · DNS ' + (row.availability.evidence.dns?.state || 'n/a') + ' · TLS ' + (row.availability.evidence.tls?.state || 'n/a') + (row.availability.evidence.tls?.daysRemaining != null ? ' (' + row.availability.evidence.tls.daysRemaining + ' days left)' : '')]) : null,
        ...vantages.map(item => el('li', '', ['Vantage ' + item.vantage + ': ' + item.state + (item.blocked ? ' (blocked)' : '') + (item.httpStatus ? ' · HTTP ' + item.httpStatus : '')])),
        ...checks.map(check => el('li', check.pass ? '' : 'is-fail', [(check.pass ? '✓ ' : '✕ ') + check.id + ' ' + check.path + ' · ' + check.detail])),
        contract.basis ? el('li', '', ['Critical path basis: ' + contract.basis]) : null,
        el('li', '', ['Telemetry: ' + row.observability.reason]),
        row.observability.discrepancy ? el('li', '', ['Cloudflare RUM setting is on, but no browser tag is served.']) : null,
        el('li', '', [row.profile.expectation.note]),
      ]),
    ]);
    return el('tr', 'prop-row tone-row-' + entry.status.tone, [
      el('th', '', [el('strong', '', [row.profile.name]), el('span', 'cell-sub', [row.propertyId]), el('span', 'cell-sub', [row.profile.purpose || 'Purpose not declared']), detail], { scope: 'row', 'data-label': 'Property' }),
      cell('Status', [exec.pill(entry.status.meta.tone, entry.status.meta.label), el('span', 'cell-sub', [entry.health.replace(/-/g, ' ') + ' · ' + model.ageText(entry.freshness.ageHours)])]),
      cell('Critical path', [el('strong', '', [CP_LABEL[contract.status] || contract.status]), el('span', 'cell-sub', [contract.checkCount ? contract.checkCount + ' check' + (contract.checkCount === 1 ? '' : 's') + ' · ' + row.criticalPath.state : 'no contract'])]),
      cell('Telemetry', [el('strong', '', [model.INSTRUMENTATION_LABELS[row.observability.state]]), el('span', 'cell-sub', [row.observability.providers.map(provider => provider.measurementId || provider.id).join(', ') || 'CF RUM setting: ' + row.observability.rum + ' (carried forward)'])]),
      cell('Witnesses', [el('strong', '', [(row.availability.agreement || 'single-vantage').replace(/-/g, ' ')]), el('span', 'cell-sub', [vantages.filter(item => item.conclusive).length + ' of ' + vantages.length + ' vantages conclusive'])]),
      cell('Traffic, 28d', [el('strong', traffic.hasValue ? '' : 'is-muted', [traffic.text]), el('span', 'cell-sub', [traffic.hasValue ? 'edge requests' : ''])], 'num'),
      cell('Outcomes', [el('strong', '', [events.instrumentation.state === 'instrumented' ? 'Reporting' : events.instrumentation.state === 'not-connected' ? 'Not connected' : events.instrumentation.state === 'not-applicable' ? 'Not applicable' : 'Not instrumented']), el('span', 'cell-sub', [events.primaryOutcome ? events.primaryOutcome.label : 'no declared outcome'])]),
    ]);
  }

  function renderProperties(ctx, ui) {
    const rows = ctx.estate.properties.map(row => ({ row, ...(() => { const s = model.effectiveStatus(row, ctx.now, ctx.policy); return { status: { key: s.key, tone: s.tone, meta: s.meta }, health: s.health, freshness: s.freshness }; })() }));
    const filtered = model.sortProperties(model.filterProperties(rows, ui), ui.sort);
    const cats = [...new Set(ctx.estate.properties.map(row => row.profile.category || 'unclassified'))];
    const controls = el('div', 'filters no-print', [
      search('prop-search', 'Find a property', ui.search, value => ctx.setPropertyFilter({ search: value }), 'Name, domain or purpose'),
      select('prop-status', 'Status', [['all', 'All'], ...model.STATUS_ORDER.map(key => [key, window.MissionControlSemantics.OPERATING_STATUS[key].label])], ui.status, value => ctx.setPropertyFilter({ status: value })),
      select('prop-category', 'Category', [['all', 'All'], ...cats.map(key => [key, window.MissionControlSemantics.PORTFOLIO_CATEGORIES[key] || key])], ui.category, value => ctx.setPropertyFilter({ category: value })),
      select('prop-lifecycle', 'Declared status', [['all', 'All'], ...window.MissionControlSemantics.LIFECYCLE_STATES.map(key => [key, key.replace(/-/g, ' ')])], ui.lifecycle, value => ctx.setPropertyFilter({ lifecycle: value })),
      select('prop-instrumentation', 'Telemetry', [['all', 'All'], ...Object.entries(model.INSTRUMENTATION_LABELS)], ui.instrumentation, value => ctx.setPropertyFilter({ instrumentation: value })),
      select('prop-sort', 'Sort by', [['emphasis', 'Strategic emphasis'], ['status', 'Needs attention first'], ['tier', 'Strategic tier'], ['name', 'Name']], ui.sort, value => ctx.setPropertyFilter({ sort: value })),
    ]);
    const table = el('table', 'prop-table', [
      el('caption', 'sr-only', ['Every property with its status and evidence']),
      el('thead', '', [el('tr', '', ['Property', 'Status', 'Critical path', 'Telemetry', 'Witnesses', 'Traffic, 28d', 'Outcomes'].map(label => el('th', '', [label], { scope: 'col' })))]),
      el('tbody', '', filtered.map(entry => propertyRow(entry, ctx))),
    ]);
    return el('section', 'block', [
      el('div', 'section-head', [el('p', 'eyebrow', ['Properties']), el('h2', '', ['Every property, with the evidence behind its status']), el('p', 'lede', [filtered.length + ' of ' + rows.length + ' shown. An inactive property that is expected to be inactive is not an outage; blocked is not down; reachable is not healthy.'])]),
      controls,
      el('div', 'table-scroll', [table]),
    ]);
  }

  // ── Evidence health + history ────────────────────────────────────────────────────────────────
  function historyPoints(history, pick) {
    const points = [];
    for (const snapshot of history.snapshots) {
      const value = pick(snapshot);
      if (typeof value === 'number' && Number.isFinite(value)) points.push({ date: snapshot.observedAt.slice(0, 10), value });
    }
    return points;
  }

  function renderEvidenceHealth(ctx) {
    const probe = ctx.estate.evidence.probe;
    const rec = ctx.executive.evidence.classes;
    const tone = { live: 'good', aging: 'watch', absent: 'muted' };
    const availabilityPoints = historyPoints(ctx.history, snapshot => (snapshot.availability?.evidenceState === 'measured' ? snapshot.availability.availableRatioPct : null));
    const verifiedPoints = historyPoints(ctx.history, snapshot => (snapshot.availability?.evidenceState === 'measured' ? snapshot.availability.verifiedHealthyZones : null));
    const chartOrEmpty = (points, title, unit) => (points.length >= 2 ? charts.lineChart(points, { unit, ariaLabel: title }) : el('div', 'empty-state is-compact', [exec.pill('muted', 'Not enough comparable history'), el('p', 'empty-detail', [points.length + ' dated observation' + (points.length === 1 ? '' : 's') + ' so far; a trend needs at least two, and gaps are never interpolated.'])]));
    return el('section', 'block', [
      el('div', 'section-head', [el('p', 'eyebrow', ['Evidence health']), el('h2', '', ['Is the evidence itself healthy?']), el('p', 'lede', ['Probe run ' + (probe.runId || 'none') + ' observed ' + (probe.observedAt ? model.formatDate(probe.observedAt) + ' (' + model.ageText(model.freshnessAt(probe.observedAt, ctx.policy.probe, ctx.now).ageHours) + ')' : 'never') + ' from ' + probe.vantageCount + ' vantage' + (probe.vantageCount === 1 ? '' : 's') + '.'])]),
      el('div', 'grid two', [
        el('article', 'card', [el('h3', '', ['Evidence classes']), el('ul', 'evidence-list', rec.map(entry => el('li', '', [exec.pill(tone[entry.state], entry.state === 'live' ? 'Live' : entry.state === 'aging' ? 'Aging' : 'Not live'), el('strong', '', [entry.label]), el('span', 'muted', [entry.asOf ? model.formatDate(entry.asOf) + ' · ' + entry.detail : entry.detail])])))]),
        el('article', 'card', [el('h3', '', ['Vantages']), el('ul', 'evidence-list', probe.vantages.length ? probe.vantages.map(vantage => el('li', '', [exec.pill(vantage.freshness.state === 'fresh' ? 'good' : 'watch', vantage.role), el('strong', '', [vantage.id]), el('span', 'muted', [(vantage.network || 'network not recorded') + ' · ' + model.formatDate(vantage.observedAt)])])) : [el('li', '', [exec.pill('muted', 'None'), el('span', 'muted', ['No valid probe run has been collected.'])])])]),
        el('article', 'card chart-card', [el('h3', '', ['Reachable share of serving properties']), el('p', 'chart-question', ['Percent of conclusively probed properties that responded, per daily snapshot.']), chartOrEmpty(availabilityPoints, 'Reachable share', '% reachable')]),
        el('article', 'card chart-card', [el('h3', '', ['Verified-healthy properties']), el('p', 'chart-question', ['How many properties pass an authoritative critical-path check, per daily snapshot.']), chartOrEmpty(verifiedPoints, 'Verified healthy properties', 'properties')]),
      ]),
      el('p', 'links no-print', [el('a', '', ['Raw probe evidence'], { href: '/observatory/mission-control/probes.json' }), ' · ', el('a', '', ['History'], { href: '/observatory/mission-control/history.json' }), ' · ', el('a', '', ['Diagnostics'], { href: '/observatory/mission-control/diagnostics.json' })]),
    ]);
  }

  function render(root, ctx, state) {
    const rebuild = () => {
      root.replaceChildren(renderQueue(ctx, state.queue), renderProperties(ctx, state.properties), renderEvidenceHealth(ctx));
    };
    ctx.setQueueFilter = (patch, replace) => {
      state.queue = replace ? { ...defaults(), ...patch } : { ...state.queue, ...patch };
      const focus = document.activeElement && document.activeElement.id;
      rebuild();
      const again = focus && document.getElementById(focus);
      if (again) {
        again.focus();
        if (again.type === 'search') again.setSelectionRange(again.value.length, again.value.length);
      }
    };
    ctx.setPropertyFilter = patch => {
      state.properties = { ...state.properties, ...patch };
      const focus = document.activeElement && document.activeElement.id;
      rebuild();
      const again = focus && document.getElementById(focus);
      if (again) {
        again.focus();
        if (again.type === 'search') again.setSelectionRange(again.value.length, again.value.length);
      }
    };
    rebuild();
  }

  window.MissionControlOperator = { render, defaults, propDefaults };
})();

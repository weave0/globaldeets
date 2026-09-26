/**
 * Executive / investor view (GD-031). Renders the governed executive summary: executive meaning first,
 * evidence detail on demand. Renders facts; never derives them.
 */
(() => {
  'use strict';

  const model = window.MissionControlModel;
  const semantics = window.MissionControlSemantics;
  const charts = window.MissionControlCharts;
  const { el } = charts;

  const TONE_GLYPH = { good: '✓', info: '●', watch: '!', bad: '✕', muted: '○', inactive: '–', neutral: '·', unknown: '?', blocked: '○', healthy: '✓', reachable: '●', failing: '✕' };
  const SOURCE_LABELS = {
    'owner-brand-registry': "the owner's brand registry",
    'owner-north-star': "the owner's ecosystem strategy",
    'owner-repository': "the owner's repository description",
    'observed-homepage': "the site's own homepage",
    'observed-behaviour': 'observed behaviour',
  };
  const LIFECYCLE = { active: 'Active', incubating: 'Incubating', experimental: 'Experimental', dormant: 'Dormant', 'intentionally-unpublished': 'Intentionally unpublished', deprecated: 'Deprecated', alias: 'Alias', unknown: 'Status not declared' };
  const OUTCOME_ICON = { lead: '✉', signup: '＋', engagement: '◎', purchase: '$', cta: '↗', application: '☰', download: '↓', visit: '·', 'primary-outcome': '★' };

  function pill(tone, label, extraClass) {
    return el('span', 'pill tone-' + tone + (extraClass ? ' ' + extraClass : ''), [el('span', 'pill-glyph', [TONE_GLYPH[tone] || '·'], { 'aria-hidden': 'true' }), label]);
  }

  function sectionHead(kicker, title, lede) {
    return el('div', 'section-head', [el('p', 'eyebrow', [kicker]), el('h2', '', [title]), lede ? el('p', 'lede', [lede]) : null]);
  }

  function chartCard(chart, body, extraClass) {
    const footer = chart.evidenceState === 'empty' ? null : el('p', 'chart-meta', ['As of ' + (/^\d{4}-\d{2}-\d{2}$/.test(chart.asOf) ? model.formatDay(chart.asOf) : model.formatDate(chart.asOf)) + ' · ' + chart.provenance + (chart.caption ? ' · ' + chart.caption : '')]);
    return el('article', 'card chart-card ' + (extraClass || ''), [
      el('header', '', [el('h3', '', [chart.title]), el('p', 'chart-question', [chart.question]), chart.evidenceState === 'partial' ? pill('watch', 'Partial') : null]),
      body,
      footer,
    ]);
  }

  function emptyState(chart, compact) {
    const empty = chart.empty || { title: 'Not measured yet', detail: 'No evidence.' };
    return el('div', 'empty-state' + (compact ? ' is-compact' : ''), [
      el('p', 'empty-title', [pill('muted', empty.title)]),
      compact ? null : el('p', 'empty-detail', [empty.detail]),
      !compact && empty.unblockedBy ? el('p', 'empty-unblock', [el('strong', '', ['What unblocks it: ']), empty.unblockedBy]) : null,
    ]);
  }

  function requirementBox(requirement, lead) {
    if (!requirement) return null;
    return el('div', 'requirement', [
      el('p', 'requirement-lead', [lead]),
      el('dl', '', [
        el('dt', '', ['Missing authority']), el('dd', '', [requirement.what]),
        requirement.where ? el('dt', '', ['Where']) : null, requirement.where ? el('dd', '', [requirement.where]) : null,
        el('dt', '', ['Repository secrets']), el('dd', '', [requirement.secrets.join(', ')]),
        el('dt', '', ['Owner']), el('dd', '', [requirement.owner]),
      ]),
    ]);
  }

  // ── Hero ─────────────────────────────────────────────────────────────────────────────────────
  function kpi(label, value, sub, tone, extra) {
    return el('div', 'kpi tone-edge-' + (tone || 'neutral'), [el('p', 'kpi-label', [label]), el('p', 'kpi-value', [value]), el('p', 'kpi-sub', [sub]), extra || null]);
  }

  function trendChip(reading, days) {
    const described = model.describeReading(reading, null, { percent: true, signed: true });
    if (!described.hasValue) return el('span', 'chip is-muted', ['No comparable ' + days + '-day trend']);
    return el('span', 'chip ' + (reading.value >= 0 ? 'is-up' : 'is-down'), [(reading.value >= 0 ? '▲ ' : '▼ ') + described.text + ' vs prior ' + days + 'd' + (described.kind === 'partial' ? ' (partial)' : '')]);
  }

  function renderHero(ctx) {
    const { executive, audience, events, estate, expired } = ctx;
    const snap = executive.snapshot;
    const declared = estate.propertyCount - executive.snapshot.lifecycle.unknown;
    const audienceUsable = ['measured', 'partial'].includes(audience.source.status) && audience.source.freshness.state !== 'expired';
    const requests = audience.estate.requests[28];
    const kpis = [
      kpi('Web properties', String(snap.properties), declared + ' with an owner-declared status', 'neutral'),
      expired
        ? kpi('Responding now', 'Unknown', estate.evidence.probe.validity === 'none' ? 'No probe evidence collected yet' : 'Probe evidence has expired', 'muted')
        : kpi('Responding now', snap.responding + ' / ' + snap.servingExpected, snap.verifiedHealthy + ' verified healthy end-to-end' + (snap.attention ? ' · ' + snap.attention + ' need attention' : ''), snap.attention ? 'bad' : snap.responding ? 'good' : 'muted'),
      audienceUsable
        ? kpi('Edge traffic, 28 days', model.formatCompact(requests.value), 'requests, not people' + (requests.evidenceState === 'partial' ? ' · lower bound' : ''), 'info', trendChip(audience.estate.trend[28], 28))
        : kpi('Edge traffic, 28 days', 'Not measured', audience.source.status === 'awaiting-authorized-source' ? 'Awaiting an authorized source' : 'Source unavailable', 'muted'),
      events.coverage.instrumented
        ? kpi('Business outcomes', events.coverage.instrumented + ' / ' + events.coverage.propertiesApplicable, 'properties reporting outcomes', 'info')
        : kpi('Business outcomes', 'Not connected', events.coverage.withDeclaredOutcome + ' declare an outcome; none reports one', 'muted'),
      kpi('Evidence live', executive.evidence.liveClasses + ' / ' + executive.evidence.totalClasses, 'evidence classes fully current', executive.evidence.liveClasses >= 4 ? 'good' : 'watch'),
    ];
    return el('section', 'hero', [
      el('div', 'hero-copy', [
        el('p', 'eyebrow', ['Good Flippin Design · web estate']),
        el('h2', 'hero-title', ['What we run, what works, and what we know']),
        el('ul', 'headline', executive.headline.statements.map(statement => el('li', 'tone-' + statement.tone, [el('span', 'headline-glyph', [TONE_GLYPH[statement.tone] || '·'], { 'aria-hidden': 'true' }), el('span', '', [statement.text])]))),
      ]),
      el('div', 'kpis', kpis, { role: 'list', 'aria-label': 'Key figures' }),
    ]);
  }

  // ── Portfolio ────────────────────────────────────────────────────────────────────────────────
  function renderTile(tile, ctx) {
    const row = ctx.estate.properties.find(item => item.propertyId === tile.propertyId);
    const status = model.effectiveStatus(row, ctx.now, ctx.policy);
    const meta = status.meta;
    const detailLines = [];
    if (tile.expectation.note) detailLines.push(el('li', '', [tile.expectation.note]));
    if (tile.purposeSource) detailLines.push(el('li', '', ['Purpose taken from ' + (SOURCE_LABELS[tile.purposeSource] || tile.purposeSource) + '.']));
    if (tile.earningPath) detailLines.push(el('li', '', ['Owner-declared earning path: ' + tile.earningPath + '.']));
    detailLines.push(el('li', '', ['Health: ' + status.health.replace(/-/g, ' ') + ' · ' + row.availability.reason]));
    return el('article', 'tile', [
      el('header', '', [el('h4', '', [tile.name]), el('p', 'domain', [tile.propertyId])]),
      pill(meta.tone === 'good' ? 'good' : meta.tone, meta.label),
      tile.purpose ? el('p', 'tile-purpose', [tile.purpose]) : el('p', 'tile-purpose is-unknown', ['Purpose not declared.']),
      el('p', 'tile-chips', [
        el('span', 'chip', [LIFECYCLE[tile.lifecycle] + (tile.lifecycle === 'alias' && tile.aliasOf ? ' of ' + tile.aliasOf : '')]),
        tile.strategicTier ? el('span', 'chip is-strong', ['Tier ' + tile.strategicTier]) : null,
        tile.investorCritical ? el('span', 'chip is-strong', ['Investor-critical']) : null,
        tile.primaryOutcome ? el('span', 'chip', [(OUTCOME_ICON[tile.primaryOutcome.type] || '·') + ' ' + tile.primaryOutcome.label]) : null,
        tile.sharePct != null ? el('span', 'chip', [model.formatPct(tile.sharePct) + ' of traffic']) : null,
      ]),
      el('details', 'tile-detail', [el('summary', '', ['Why this status']), el('ul', '', detailLines)]),
    ]);
  }

  function renderPortfolio(ctx) {
    const groups = ctx.executive.portfolio.groups;
    return el('section', 'block', [
      sectionHead('What we operate', 'The estate, grouped by what each property is for', 'Purpose and status come from the owner’s own declarations where they exist. Where nothing is declared, it says so instead of guessing.'),
      el('div', 'portfolio', groups.map(group => el('div', 'group', [
        el('h3', 'group-title', [group.label, el('span', 'count', [String(group.tiles.length)])]),
        el('div', 'tiles', group.tiles.map(tile => renderTile(tile, ctx))),
      ]))),
    ]);
  }

  // ── Health + maturity ────────────────────────────────────────────────────────────────────────
  function renderWorking(ctx) {
    const chart = ctx.executive.charts.operationalComposition;
    const composition = chart.evidenceState === 'empty' ? emptyState(chart) : charts.segmentBar(chart.data, { ariaLabel: chart.title });
    return el('section', 'block', [
      sectionHead('Is it working?', 'Operating state and how much of it we can verify', 'Responding is not the same as healthy. Every property below is judged against an explicit health contract from fresh production probes.'),
      el('div', 'grid two', [
        chartCard(chart, composition),
        el('article', 'card', [
          el('header', '', [el('h3', '', ['How well is the estate measured?']), el('p', 'chart-question', ['Each bar is a question an investor would ask, and how much of the estate we can answer it for.'])]),
          el('ul', 'coverage', ctx.executive.maturity.map(row => charts.coverageRow(row))),
        ]),
      ]),
    ]);
  }

  // ── Audience ─────────────────────────────────────────────────────────────────────────────────
  function windowCard(card, freshness) {
    const request = model.describeReading(card.requests, freshness, { compact: true });
    return el('div', 'window-card', [
      el('p', 'window-label', [card.days + ' days']),
      el('p', 'window-value' + (request.hasValue ? '' : ' is-muted'), [request.text]),
      el('p', 'window-sub', [request.hasValue ? 'edge requests' + (request.note ? ' · ' + request.note : '') : request.note || 'no reading']),
      trendChip(card.trend, card.days),
    ]);
  }

  function renderAudience(ctx) {
    const { executive, audience } = ctx;
    const section = executive.audience;
    const charts4 = executive.charts;
    const usable = ['measured', 'partial'].includes(section.status) && section.freshness.state !== 'expired';
    const statusPill = usable ? pill(section.status === 'partial' ? 'watch' : 'good', section.statusLabel) : pill('muted', section.statusLabel);
    const children = [sectionHead('Is anyone using it?', 'Usage, growth and contribution', 'Cloudflare counts requests, not people, and no connected source separates humans from automated traffic. These figures are shown as edge requests and never as an audience.')];
    children.push(el('div', 'status-line', [statusPill, section.asOf ? el('span', 'muted', ['Governed data from ' + model.formatDate(section.asOf) + ' · ' + model.ageText(model.freshnessAt(section.asOf, ctx.policy.audience, ctx.now).ageHours)]) : el('span', 'muted', ['No governed reading yet'])]));

    if (!usable) {
      children.push(el('div', 'empty-hero', [
        el('h3', '', ['Usage isn’t measured yet, and nothing here is estimated']),
        el('p', '', [section.reason]),
        el('p', '', ['The reader for Canonical Gold 1.2 and Traffic Insights is built and tested. As soon as it can read a real (non-fixture) document, this section fills with 7/28/90-day traffic, trends, each property’s contribution and concentration. Nothing is shown as zero in the meantime.']),
        requirementBox(section.requirement, 'To turn this on:'),
      ]));
      children.push(el('div', 'grid four', ['trajectory', 'contribution', 'movers', 'composition'].map(key => el('article', 'card chart-card is-empty', [el('h3', '', [charts4[key].title]), el('p', 'chart-question', [charts4[key].question]), emptyState(charts4[key], true)]))));
      return el('section', 'block', children);
    }
    const freshness = audience.source.freshness;
    children.push(el('div', 'windows', ctx.executive.audienceCards.map(card => windowCard(card, freshness))));
    const c = charts4;
    children.push(el('div', 'grid two', [
      chartCard(c.trajectory, c.trajectory.evidenceState === 'empty' ? emptyState(c.trajectory) : charts.lineChart(c.trajectory.data.points, { unit: 'requests per day', ariaLabel: c.trajectory.title })),
      chartCard(c.contribution, c.contribution.evidenceState === 'empty' ? emptyState(c.contribution) : charts.barList(c.contribution.data.bars, { unit: 'requests', ariaLabel: c.contribution.title })),
      chartCard(c.movers, c.movers.evidenceState === 'empty' ? emptyState(c.movers) : charts.divergingBars([...c.movers.data.growing, ...c.movers.data.declining], { ariaLabel: c.movers.title })),
      chartCard(c.composition, el('div', 'composition-note', [
        el('div', 'segbar', [el('span', 'seg tone-muted', ['100% unclassified'], { style: 'flex:1 1 0' })], { role: 'img', 'aria-label': 'All measured traffic is unclassified' }),
        el('ul', 'support-list', Object.entries(c.composition.data.support).map(([key, value]) => el('li', '', [pill(value === 'unsupported' ? 'muted' : 'info', value === 'unsupported' ? 'Not supported' : 'All measured traffic'), ' ', key.replace(/-/g, ' ')]))),
      ])),
    ]));
    if (audience.estate.concentration) {
      const conc = audience.estate.concentration;
      children.push(el('p', 'callout', ['Concentration: the top property carries ' + model.formatPct(conc.top1SharePct) + ' of measured 28-day edge requests and the top three carry ' + model.formatPct(conc.top3SharePct) + ' (' + conc.level + ').']));
    }
    return el('section', 'block', children);
  }

  // ── Business ─────────────────────────────────────────────────────────────────────────────────
  function renderBusiness(ctx) {
    const b = ctx.executive.business;
    const children = [sectionHead('What is it producing?', 'Business outcomes', 'Leads, sign-ups, purchases and downloads are what turn attention into value. Zero conversions and no instrumentation are different things and are kept apart.')];
    children.push(el('div', 'status-line', [pill(b.status === 'measured' ? 'good' : 'muted', b.statusLabel), el('span', 'muted', [b.coverage.instrumented + ' of ' + b.coverage.propertiesApplicable + ' properties report outcomes'])]));
    if (b.status !== 'measured') {
      children.push(el('div', 'empty-hero is-compact', [el('p', '', [b.reason]), requirementBox(b.requirement, 'To turn this on:')]));
    }
    const declared = el('article', 'card', [
      el('header', '', [el('h3', '', ['What each property says success is']), el('p', 'chart-question', ['Declared by the owner; not measured.'])]),
      b.declaredOutcomes.length
        ? el('ul', 'outcome-list', b.declaredOutcomes.map(outcome => el('li', '', [el('strong', '', [(OUTCOME_ICON[outcome.type] || '·') + ' ' + outcome.label]), el('span', 'muted', [' — ' + outcome.properties.map(property => property.name + ' (' + property.label + ')').join('; ')])])))
        : el('p', 'muted', ['No property has declared a primary outcome.']),
    ]);
    const ready = el('article', 'card', [
      el('header', '', [el('h3', '', ['Ready to connect']), el('p', 'chart-question', ['Event-producing routes already exist in source; only the reporting feed is missing.'])]),
      b.connectableProducers.length
        ? el('ul', 'outcome-list', b.connectableProducers.map(producer => el('li', '', [el('strong', '', [producer.name]), el('span', 'muted', [' — ' + producer.types.join(', ')])])))
        : el('p', 'muted', ['None identified.']),
    ]);
    const funnel = b.funnel;
    children.push(el('div', 'grid three', [
      chartCard(funnel, funnel.evidenceState === 'empty' ? emptyState(funnel) : charts.barList(funnel.data.stages.map(stage => ({ name: stage.label, value: stage.reading.value })), { unit: 'events', ariaLabel: funnel.title })),
      declared,
      ready,
    ]));
    return el('section', 'block', children);
  }

  // ── Knowledge matrix ─────────────────────────────────────────────────────────────────────────
  function renderKnowledge(ctx) {
    return el('section', 'block', [
      sectionHead('What we know, and what we don’t', 'Evidence coverage for every property', 'A filled dot is a measured fact. An empty circle is an honest unknown. A dash means the question doesn’t apply.'),
      charts.knowledgeMatrix(ctx.executive.knowledgeMatrix),
    ]);
  }

  // ── Decision cockpit ─────────────────────────────────────────────────────────────────────────
  // Mirrors agentContract.terminalStatuses (diagnostics.mjs) and the operator/model views.
  const TERMINAL = new Set(['closed', 'accepted-risk']);
  const SEVERITY_TONE = { critical: 'bad', high: 'bad', medium: 'watch', low: 'info' };

  function decisionItem(item, rank) {
    const subjects = item.subjects || [];
    const investorBlocked = Boolean(item.escalation?.blocksInvestorClaim);
    return el('article', 'decision-item sev-' + item.severity, [
      el('div', 'decision-rank', ['#' + rank], { 'aria-label': 'Priority ' + rank }),
      el('div', 'decision-main', [
        el('div', 'decision-heading', [
          el('h3', '', [item.title]),
          pill(SEVERITY_TONE[item.severity] || 'neutral', item.severity.charAt(0).toUpperCase() + item.severity.slice(1)),
        ]),
        el('p', 'decision-why', [item.businessReason || item.observed || '']),
        el('div', 'decision-meta', [
          el('span', 'chip', ['Business impact: ' + (item.businessImpact || 'unknown')]),
          item.actionability?.state ? el('span', 'chip', [model.ACTIONABILITY_LABELS[item.actionability.state] || item.actionability.state]) : null,
          investorBlocked ? el('span', 'chip is-strong', ['Blocks investor claim']) : null,
          subjects.length ? el('span', 'chip', [subjects.length + ' ' + (subjects.length === 1 ? 'property' : 'properties')]) : null,
        ]),
        item.nextAction ? el('p', 'decision-action', [el('span', 'label', ['Next: ']), item.nextAction]) : null,
        item.actionability?.blockedBy ? el('p', 'decision-blocker', [el('span', 'label', ['Blocked by: ']), item.actionability.blockedBy]) : null,
        el('a', 'inline-link no-print', ['Open evidence & score →'], { href: '#operator?find=' + encodeURIComponent(item.id) }),
      ]),
    ]);
  }

  function renderDecisionCockpit(ctx) {
    const all = ctx.diagnostics.items || [];
    const open = all.filter(item => !TERMINAL.has(item.status));
    const ranked = open.slice(0, 4);
    const investorBlockers = open.filter(item => item.escalation?.blocksInvestorClaim);
    const counts = ctx.diagnostics.summary || {};
    const supportedWins = ctx.executive.findings.wins.length;

    return el('section', 'block decision-cockpit', [
      sectionHead('What deserves attention now', 'Decision cockpit', 'The existing diagnostics queue already scores severity, business impact, actionability and evidence confidence. This view turns that ranking into an executive work surface without inventing a second score.'),
      el('div', 'decision-stats', [
        kpi('Actionable now', String(counts.actionableNow || 0), 'items that can be worked immediately', (counts.actionableNow || 0) ? 'info' : 'neutral'),
        kpi('Decisions needed', String(counts.decisionNeeded || 0), 'owner or product decisions, not outages', (counts.decisionNeeded || 0) ? 'watch' : 'neutral'),
        kpi('Blocked on authority', String(counts.blockedOnAuthority || 0), 'waiting on access or external authority', (counts.blockedOnAuthority || 0) ? 'watch' : 'neutral'),
        kpi('Investor-claim blockers', String(investorBlockers.length), investorBlockers.length ? 'claims that should stay out of diligence material for now' : 'no open diagnostic explicitly blocks a claim', investorBlockers.length ? 'bad' : 'good'),
      ]),
      el('div', 'decision-layout', [
        el('div', 'decision-priority', [
          el('div', 'decision-subhead', [el('h3', '', ['Highest-priority work']), el('p', 'muted', ['Ranked by the governed diagnostics plane.'])]),
          ranked.length ? el('div', 'decision-list', ranked.map((item, index) => decisionItem(item, index + 1))) : el('p', 'muted', ['No open diagnostic items.']),
        ]),
        el('aside', 'card claim-readiness', [
          el('h3', '', ['Investor-readiness ledger']),
          el('p', 'chart-question', ['A claim is either supported by current evidence or explicitly held back.']),
          el('div', 'claim-row', [el('strong', '', [String(supportedWins)]), el('span', '', ['evidence-backed wins currently safe to discuss'])]),
          el('div', 'claim-row', [el('strong', '', [String(investorBlockers.length)]), el('span', '', ['open items explicitly blocking an investor claim'])]),
          investorBlockers.length
            ? el('ul', 'claim-blockers', investorBlockers.slice(0, 4).map(item => el('li', '', [el('strong', '', [item.title]), el('span', 'muted', [item.escalation?.escalateWhen ? ' — ' + item.escalation.escalateWhen : ''])])))
            : el('p', 'muted', ['No current diagnostic is marked as an investor-claim blocker.']),
          el('p', 'claim-note', ['This is a disclosure guardrail, not a valuation or investment recommendation.']),
        ]),
      ]),
    ]);
  }

  // ── Wins / opportunities / risks / unknowns ─────────────────────────────────────────────────
  function findingList(items, kind) {
    if (!items.length) return el('p', 'muted', [kind === 'wins' ? 'Nothing the evidence supports claiming yet.' : 'None.']);
    return el('ul', 'finding-list', items.slice(0, 3).map(item => el('li', '', [
      el('strong', '', [item.title]),
      el('p', '', [item.why || item.detail || '']),
      item.actionability ? el('span', 'chip', [model.ACTIONABILITY_LABELS[item.actionability] || item.actionability]) : null,
      item.id && item.id.includes(':') && !item.id.startsWith('win:') ? el('a', 'inline-link no-print', ['Open in queue →'], { href: '#operator?find=' + encodeURIComponent(item.id) }) : null,
    ])));
  }

  function renderFindings(ctx) {
    const f = ctx.executive.findings;
    return el('section', 'block', [
      sectionHead('Wins, opportunities, risks', 'What is going well, what could be, and what to watch', 'Each item is derived from evidence and states why it matters and what to do. Unknowns are listed on their own and never called failures.'),
      el('div', 'grid four findings', [
        el('article', 'card tone-card-good', [el('h3', '', ['Wins']), findingList(f.wins, 'wins')]),
        el('article', 'card tone-card-info', [el('h3', '', ['Opportunities']), findingList([...f.opportunities, ...f.gaps.filter(gap => !f.opportunities.some(item => item.id === gap.id))].slice(0, 5), 'opportunities')]),
        el('article', 'card tone-card-bad', [el('h3', '', ['Risks']), findingList(f.risks, 'risks')]),
        el('article', 'card tone-card-muted', [el('h3', '', ['Unknowns']), el('ul', 'finding-list', ctx.executive.unknowns.slice(0, 4).map(item => el('li', '', [el('strong', '', [item.title]), el('p', '', [item.detail]), el('p', 'finding-action', [el('span', 'label', ['Closed by: ']), item.closedBy])])))]),
      ]),
    ]);
  }

  // ── Evidence and method ──────────────────────────────────────────────────────────────────────
  function renderEvidence(ctx) {
    const classes = ctx.executive.evidence.classes;
    const stateTone = { live: 'good', aging: 'watch', absent: 'muted' };
    return el('section', 'block evidence-block', [
      sectionHead('Provenance', 'How current is this, and where does it come from?'),
      el('div', 'grid two', [
        el('article', 'card', [el('h3', '', ['Evidence classes']), el('ul', 'evidence-list', classes.map(entry => el('li', '', [pill(stateTone[entry.state], entry.state === 'live' ? 'Live' : entry.state === 'aging' ? 'Aging' : 'Not live'), el('strong', '', [entry.label]), el('span', 'muted', [entry.asOf ? model.formatDate(entry.asOf) + ' · ' + entry.detail : entry.detail])])))]),
        el('article', 'card method', [
          el('h3', '', ['How to read this page']),
          el('ul', '', [
            el('li', '', ['Unknown is never shown as zero, and reachable is never shown as healthy.']),
            el('li', '', ['Edge requests count requests, including automated traffic. They are not people.']),
            el('li', '', ['Stale or expired evidence is labelled and never presented as current.']),
            el('li', '', ['Fixtures and demo numbers are never production facts; where a source is missing, this page says which and why.']),
            el('li', '', ['Owner-declared facts, observed facts and unknowns are kept apart on every property.']),
          ]),
          el('p', 'links no-print', [el('a', '', ['Executive JSON'], { href: '/observatory/mission-control/executive.json' }), ' · ', el('a', '', ['Estate health'], { href: '/observatory/mission-control/estate-health.json' }), ' · ', el('a', '', ['Audience'], { href: '/observatory/mission-control/audience.json' }), ' · ', el('a', '', ['Business events'], { href: '/observatory/mission-control/business-events.json' }), ' · ', el('a', '', ['Diagnostics'], { href: '/observatory/mission-control/diagnostics.json' })]),
        ]),
      ]),
    ]);
  }

  function render(root, ctx) {
    // Executive meaning first: state of the estate, usage, outcomes, attention; the property-by-property detail after.
    root.replaceChildren(renderHero(ctx), renderDecisionCockpit(ctx), renderWorking(ctx), renderAudience(ctx), renderBusiness(ctx), renderFindings(ctx), renderPortfolio(ctx), renderKnowledge(ctx), renderEvidence(ctx));
  }

  window.MissionControlExecutive = { render, pill, sectionHead, emptyState, TONE_GLYPH, semantics };
})();

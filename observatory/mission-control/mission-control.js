(() => {
  'use strict';

  const semantics = window.MissionControlSemantics;
  const model = window.MissionControlModel;
  const charts = window.MissionControlCharts;
  const executiveView = window.MissionControlExecutive;
  const operatorView = window.MissionControlOperator;
  const summaryEndpoint = '/observatory/mission-control/mission-control-data.json';

  const state = { ctx: null, view: 'executive', queue: null, properties: null };
  const byId = id => document.getElementById(id);

  if (!semantics || !model || !charts || !executiveView || !operatorView) failClosed(['scripts']);
  else load().then(start).catch(error => failClosed([String(error && error.message ? error.message : error)]));

  function json(url) {
    return fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(url.split('/').pop() + ' returned HTTP ' + response.status);
      return response.json();
    });
  }

  async function load() {
    const summary = await json(summaryEndpoint);
    const plane = summary.dataPlane || {};
    const [history, estate, diagnostics, audience, events, executive] = await Promise.all([plane.history, plane.estateHealth, plane.diagnostics, plane.audience, plane.businessEvents, plane.executive].map(url => json(url)));
    return { summary, history, estate, diagnostics, audience, events, executive };
  }

  function failClosed(errors) {
    const panel = byId('mission-control-error');
    if (panel) {
      panel.hidden = false;
      panel.replaceChildren(charts ? charts.el('p', '', ['Mission Control data could not be validated and has been withheld. Nothing is shown rather than something wrong.']) : document.createTextNode('Mission Control data could not be validated and has been withheld.'), ...(errors.slice(0, 4).map(message => document.createTextNode(message)).map(node => { const p = document.createElement('p'); p.className = 'error-detail'; p.append(node); return p; })));
    }
    const loading = byId('loading');
    if (loading) loading.hidden = true;
    document.body.dataset.missionControlReady = 'error';
  }

  function start(bundle) {
    const errors = model.validateBundle(bundle);
    if (errors.length) return failClosed(errors);
    const now = Date.now();
    const policy = bundle.estate.freshnessPolicy || semantics.FRESHNESS_POLICY;
    const probe = bundle.estate.evidence.probe;
    const probeFreshness = model.freshnessAt(probe.observedAt, policy.probe, now);
    const expired = probe.validity === 'none' || probeFreshness.state === 'expired' || probeFreshness.state === 'unknown';

    // Published evidence ages: when the probe evidence has expired, health claims are withdrawn at render time.
    const executive = JSON.parse(JSON.stringify(bundle.executive));
    if (expired) {
      const chart = executive.charts.operationalComposition;
      chart.evidenceState = 'empty';
      chart.data = null;
      chart.empty = { title: probe.validity === 'none' ? 'No probe evidence' : 'Evidence expired', detail: probe.validity === 'none' ? 'No valid production probe run has been collected, so the estate state is unknown.' : 'The latest production probes are ' + model.ageText(probeFreshness.ageHours) + ', older than the ' + policy.probe.expiredAfterHours + '-hour limit. Operating states are withdrawn until the collector recovers.', unblockedBy: 'The next successful scheduled collection.' };
      const health = executive.headline.statements.find(item => item.id === 'health');
      if (health) {
        health.tone = 'unknown';
        health.text = probe.validity === 'none' ? 'No valid production probe evidence exists, so nothing can be said about whether the estate is up.' : 'Production probe evidence expired ' + model.ageText(probeFreshness.ageHours) + '; the estate state is shown as unknown until the collector recovers.';
      }
    }

    state.ctx = { ...bundle, executive, now, policy, expired, probeFreshness };
    state.queue = operatorView.defaults();
    state.properties = operatorView.propDefaults();
    wireControls();
    banner();
    route();
    window.addEventListener('hashchange', route);
    byId('loading').hidden = true;
    document.body.dataset.missionControlReady = 'true';
  }

  function banner() {
    const { estate, probeFreshness, expired } = state.ctx;
    const node = byId('evidence-banner');
    const probe = estate.evidence.probe;
    const attempt = probe.latestAttempt;
    const messages = [];
    if (probe.validity === 'none') messages.push(['info', 'This is the committed baseline: no production probe has been collected into this build yet, so health is unknown, not good.']);
    else if (expired) messages.push(['bad', 'Production probe evidence is ' + model.ageText(probeFreshness.ageHours) + ' and has expired. Operating states are withdrawn rather than shown as current.']);
    else if (probeFreshness.state === 'stale') messages.push(['watch', 'Production probe evidence is ' + model.ageText(probeFreshness.ageHours) + ' (stale). Figures may not reflect the last few hours.']);
    if (attempt && attempt.validity && attempt.validity !== 'valid') messages.push(['watch', 'The latest probe attempt was invalid and discarded; the last valid run is shown and will age visibly.']);
    node.hidden = !messages.length;
    node.replaceChildren(...messages.map(([tone, text]) => charts.el('p', 'banner tone-banner-' + tone, [text])));
    byId('as-of').textContent = probe.observedAt ? 'Evidence as of ' + model.formatDate(probe.observedAt) + ' · ' + model.ageText(probeFreshness.ageHours) : 'No probe evidence collected yet';
  }

  function parseHash() {
    const [view, query] = (location.hash || '#executive').slice(1).split('?');
    return { view: view === 'operator' ? 'operator' : 'executive', params: new URLSearchParams(query || '') };
  }

  function route() {
    const { view, params } = parseHash();
    const find = params.get('find');
    if (find) state.queue = { ...operatorView.defaults(), search: find, status: 'all' };
    setView(view, Boolean(find));
    if (find) {
      const target = document.getElementById('finding-' + find.replace(/[^a-z0-9]+/gi, '-'));
      if (target) target.scrollIntoView({ block: 'start' });
    }
  }

  function setView(view, forceRender) {
    const previous = state.view;
    state.view = view;
    document.body.dataset.view = view;
    for (const name of ['executive', 'operator']) {
      const tab = byId('tab-' + name);
      tab.setAttribute('aria-selected', String(name === view));
      tab.tabIndex = name === view ? 0 : -1;
      byId('view-' + name).hidden = name !== view;
    }
    const root = byId('view-' + view);
    if (!root.childElementCount || previous !== view || forceRender) {
      if (view === 'executive') executiveView.render(root, state.ctx);
      else operatorView.render(root, state.ctx, state);
    }
  }

  function wireControls() {
    for (const name of ['executive', 'operator']) {
      byId('tab-' + name).addEventListener('click', () => {
        location.hash = name;
      });
    }
    byId('tabs').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const next = state.view === 'executive' ? 'operator' : 'executive';
      location.hash = next;
      byId('tab-' + next).focus();
    });
    byId('print-view').addEventListener('click', () => {
      for (const node of document.querySelectorAll('details')) node.open = true;
      window.print();
    });
    byId('copy-summary').addEventListener('click', async () => {
      const text = model.buildShareText(state.ctx.executive, { now: Date.now(), probeFreshness: model.freshnessAt(state.ctx.estate.evidence.probe.observedAt, state.ctx.policy.probe, Date.now()) });
      const status = byId('copy-status');
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = 'Summary copied to the clipboard.';
      } catch (_error) {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.append(area);
        area.select();
        const ok = document.execCommand && document.execCommand('copy');
        area.remove();
        status.textContent = ok ? 'Summary copied to the clipboard.' : 'Copy is blocked here; the summary is in the Executive view text.';
      }
      setTimeout(() => {
        status.textContent = '';
      }, 4000);
    });
  }
})();

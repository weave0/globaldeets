/* GD-049 source-backed coverage explorer. Country is publisher origin, never event location. */
(() => {
  'use strict';
  const root = document.getElementById('coverage-explorer');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const regions = ['global','africa','americas','asia','europe','middle-east','pacific'];
  const labels = {'global':'All publishers','africa':'Africa','americas':'Americas','asia':'Asia','europe':'Europe','middle-east':'Middle East','pacific':'Pacific'};
  const countryName = code => {
    try { return new Intl.DisplayNames(['en'], {type:'region'}).of(code) || code; }
    catch { return code; }
  };
  const state = {
    region:'global', country:null, coverage:null, sources:null, health:null,
    healthState:'pending', stories:null, registryState:'loading', requestVersion:0,
    storiesController:null,
  };
  const TIMEOUT_MS = 12_000;
  const HEALTH_STALE_MS = 24 * 60 * 60 * 1000;
  const status = $('#coverage-status'), list = $('#coverage-sources'), map = $('#coverage-map'),
    report = $('#coverage-reports'), metrics = $('#coverage-metrics'), heading = $('#coverage-selection'),
    summary = $('#coverage-summary'), feed = $('#coverage-feed-link'), gap = $('#coverage-gaps');
  const safeHref = url => {
    try { const x = new URL(url); return x.protocol === 'https:' ? x.href : null; } catch { return null; }
  };
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  async function json(url, signal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, {once:true});
    try {
      if (signal?.aborted) controller.abort();
      const response = await fetch(url, {headers:{Accept:'application/json'}, signal:controller.signal});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  function validTime(value) {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : null;
  }
  function healthMessage(observation) {
    if (state.healthState === 'pending') return 'Checking feed health separately…';
    if (state.healthState !== 'ready') return 'Feed health unavailable; this is not evidence of a source outage.';
    if (!observation) return 'No observation for this source in the latest health snapshot.';
    const checkedTime = validTime(observation.lastFetchStartedAt || state.health?.generatedAt);
    if (observation.lastError) {
      return 'Latest feed probe failed' + (checkedTime ? ' (' + new Date(checkedTime).toLocaleString() + ')' : '') +
        '. Last successful observation is not established by this probe.';
    }
    const successTime = validTime(observation.lastFetchSucceededAt);
    if (!successTime) return 'Latest probe result lacks a confirmed successful fetch.';
    const stale = Date.now() - successTime > HEALTH_STALE_MS;
    return (stale ? 'Stale successful feed observation: ' : 'Last successful feed check: ') +
      new Date(successTime).toLocaleString() +
      (stale ? ' (older than 24 hours; current health unknown).' : '.');
  }
  function link(text, href, cls) {
    const valid = safeHref(href);
    if (!valid) return el('span', text, cls);
    const a = el('a',text,cls);
    a.href = valid;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function renderSelection(region, country) {
    if (state.registryState !== 'ready') return;
    state.region = regions.includes(region) ? region : 'global';
    state.country = country || null;
    root.querySelectorAll('[data-coverage-region]').forEach(b => {
      const chosen = b.dataset.coverageRegion === state.region && !state.country;
      b.setAttribute('aria-pressed',String(chosen));
    });
    if (state.country) root.querySelectorAll('[data-coverage-region]').forEach(b => b.setAttribute('aria-pressed','false'));
    render();
  }
  root.querySelectorAll('[data-coverage-region]').forEach(b => b.addEventListener('click',() => select(b.dataset.coverageRegion,null)));
  $('#coverage-reset').addEventListener('click',() => select('global',null));
  function sourcesForSelection() {
    const all = state.sources?.sources || [];
    const byId = new Set(state.coverage?.regions?.find(r => r.region === state.region)?.sourceIds || []);
    if (state.country) return all.filter(s => s.primaryCountry === state.country);
    if (state.region === 'global') return all;
    return all.filter(s => byId.has(s.sourceId));
  }
  function renderMap() {
    const origins = new Set((state.sources?.sources || []).map(s => s.primaryCountry).filter(Boolean));
    map.querySelectorAll('path[id]').forEach(path => {
      const code = path.id.toUpperCase();
      const monitored = origins.has(code);
      path.classList.toggle('is-covered',monitored);
      path.classList.toggle('is-selected',code === state.country);
      path.setAttribute('aria-label',countryName(code) + (monitored ? ': monitored publisher origin' : ': no publisher origin in registry'));
      path.setAttribute('role','button');
      path.setAttribute('tabindex',monitored ? '0' : '-1');
      let title = path.querySelector('title');
      if (!title) { title = document.createElementNS('http://www.w3.org/2000/svg','title');path.prepend(title); }
      title.textContent = countryName(code) + (monitored ? ' — source details' : ' — no monitored publisher origin');
    });
  }
  function render() {
    if (state.registryState !== 'ready') return;
    const subset = sourcesForSelection();
    const country = state.country ? countryName(state.country) : null;
    heading.textContent = country ? country + ' — publisher origins' : labels[state.region] + ' — publisher feeds';
    const selectedIds = new Set(subset.map(s => s.sourceId));
    const languages = [...new Set(subset.flatMap(s => s.sourceLanguages || []))].sort();
    const countries = new Set(subset.map(s => s.primaryCountry).filter(Boolean));
    metrics.replaceChildren();
    for (const [number,label] of [[subset.length,'Monitored feeds'],[countries.size,'Publisher-origin countries'],[languages.length,'Source languages']]) {
      const cell = el('div',null,'coverage-metric');
      cell.append(el('strong',String(number)),el('span',label));
      metrics.append(cell);
    }
    summary.textContent = country ? 'Selected country denotes registered publisher origin only; it does not locate news events.' : 'Feed regions are routing groups, not the locations of news events. Global publishers are listed under All publishers.';
    feed.href = 'news.html?region=' + encodeURIComponent(state.region);
    feed.textContent = country ? 'Browse full news feed (not filtered to this country) →' : 'Open ' + labels[state.region].toLowerCase() + ' news feed →';
    list.replaceChildren();
    if (!subset.length) list.append(el('p','No monitored publisher origins or feeds match this selection. This does not mean journalism is absent here.','coverage-empty'));
    const healthyById = new Map((state.health?.sourceHealth || []).map(s => [s.sourceId,s]));
    for (const source of subset) {
      const card = el('article',null,'coverage-source');
      card.append(el('h4',source.name));
      const language = (source.sourceLanguages || []).join(', ').toUpperCase() || 'unrecorded';
      card.append(el('p','Publisher country: ' + (source.primaryCountry ? countryName(source.primaryCountry) : 'Unknown') + ' · Language: ' + language + ' · Scope: ' + (source.geographicScope || 'unknown')));
      const reviewDate = source.reviewedAt || state.sources.reviewedAt;
      card.append(el('p', 'Publisher provenance reviewed: ' + (reviewDate || 'date unavailable'), 'coverage-review-date'));
      const observation = healthyById.get(source.sourceId);
      card.append(el('p', healthMessage(observation), 'coverage-health'));
      const href = source.evidenceUrls?.map(safeHref).find(Boolean);
      if (href) card.append(link('Source provenance ↗',href,'coverage-evidence-link'));
      list.append(card);
    }
    const regionGaps = state.coverage?.gaps?.filter(g => g.region === state.region || (state.region === 'global' && !state.country && g.region == null)) || [];
    gap.replaceChildren();
    if (regionGaps.length) {
      gap.append(el('h4','Recorded source-portfolio gaps'));
      regionGaps.forEach(g => gap.append(el('p',g.detail || g.id)));
    } else gap.append(el('p','No region-specific policy gap is recorded in the current inventory. This does not establish complete coverage.'));
    report.replaceChildren();
    if (!state.stories) {
      report.append(el('p','Reporting is unavailable or has not been checked. Configured feeds are not proof of current articles.'));
    } else {
      const items = state.stories.items.filter(item => {
        const id = item.sourceId;
        return selectedIds.has(id);
      }).slice(0,6);
      if (!items.length) report.append(el('p','No reports from the selected publisher inputs appear in the current feed sample. This is not a worldwide news absence.'));
      for (const item of items) {
        const article = el('article',null,'coverage-report');
        article.append(link(item.headline || 'Open original report',item.sourceUrl,'coverage-report-link'));
        article.append(el('small',item.source + (item.published ? ' · Published ' + new Date(item.published).toLocaleDateString() : '')));
        report.append(article);
      }
    }
    renderMap();
    status.textContent = 'Showing ' + subset.length + ' monitored publisher inputs for ' + (country || labels[state.region]) + '.';
  }
  async function updateStories() {
    // Only the newest selection can commit report data; canceled or delayed replies
    // cannot replace a reader's current country/region choice.
    const version = ++state.requestVersion;
    state.storiesController?.abort();
    const controller = new AbortController();
    state.storiesController = controller;
    state.stories = null;
    render();
    try {
      const data = await json('/api/news?region=' +
        encodeURIComponent(state.country ? 'global' : state.region) + '&limit=100&offset=0', controller.signal);
      if (version !== state.requestVersion || state.registryState !== 'ready') return;
      if (data.sourceFingerprint === state.sources.sourceFingerprint && Array.isArray(data.items)) {
        state.stories = data;
      }
      // A mismatched or unidentified feed snapshot cannot be joined to this source registry.
    } catch {
      // The explicit unavailable state survives network errors and aborts.
    } finally {
      if (version === state.requestVersion) {
        state.storiesController = null;
        render();
      }
    }
  }
  function select(region,country) {
    if (state.registryState !== 'ready') return;
    renderSelection(region,country);
    updateStories();
  }
  async function loadHealth() {
    try {
      const health = await json('/api/news/health');
      if (state.registryState !== 'ready') return;
      if (health?.sourceFingerprint !== state.sources.sourceFingerprint ||
          !Array.isArray(health.sourceHealth)) throw new Error('inconsistent health snapshot');
      state.health = health;
      state.healthState = 'ready';
    } catch {
      state.health = null;
      state.healthState = 'unavailable';
    }
    render();
  }
  async function loadMap() {
    try {
      const response = await fetch('/assets/world-coverage.svg');
      if (!response.ok) throw new Error('map unavailable');
      const xml = new window.DOMParser().parseFromString(await response.text(),'image/svg+xml');
      const svg = xml.documentElement;
      if (svg.localName !== 'svg' || !svg.querySelector('path')) throw new Error('invalid map');
      const imported = document.importNode(svg,true);
      imported.setAttribute('aria-label','World map showing publisher origin countries, not news event locations');
      imported.setAttribute('role','group');
      map.replaceChildren(imported);
      map.addEventListener('click',e => {
        const path = e.target.closest('path[id].is-covered');
        if (path && map.contains(path)) select('global',path.id.toUpperCase());
      });
      map.addEventListener('keydown',e => {
        const path = e.target.closest('path[id].is-covered');
        if (path && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          select('global',path.id.toUpperCase());
        }
      });
    } catch {
      map.replaceChildren(el('p','Map artwork unavailable. Use the region and publisher controls below.','coverage-empty'));
    }
    renderMap();
  }
  function showRegistryUnavailable() {
    state.registryState = 'error';
    ++state.requestVersion;
    state.storiesController?.abort();
    root.querySelectorAll('[data-coverage-region], #coverage-reset').forEach(b => { b.disabled = true; });
    status.textContent = 'Coverage registry unavailable. No coverage claims can be verified.';
    map.replaceChildren(el('p','Map data unavailable. Visit the Coverage & Evidence Observatory for source documentation.','coverage-empty'));
    list.replaceChildren(el('p','Publisher details unavailable.','coverage-empty'));
    report.replaceChildren();
    metrics.replaceChildren();
    gap.replaceChildren();
  }
  async function boot() {
    try {
      const [coverage,sources] = await Promise.all([json('/api/news/coverage'),json('/api/news/sources')]);
      if (!coverage?.sourceFingerprint || coverage.sourceFingerprint !== sources?.sourceFingerprint ||
          sources.validation?.valid !== true || !Array.isArray(sources.sources) ||
          !Array.isArray(coverage.regions) || !Array.isArray(coverage.gaps)) {
        throw new Error('inconsistent source registries');
      }
      state.coverage = coverage;
      state.sources = sources;
      state.registryState = 'ready';
      render();
      // Health is optional observational metadata, never a dependency of map or reports.
      loadHealth();
      loadMap();
      updateStories();
    } catch {
      showRegistryUnavailable();
    }
  }
  boot();
})();

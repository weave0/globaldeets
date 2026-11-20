/* GD-050: Client-side, source-first publisher relationship inspection.
   All labels and links come from the validated canonical /api/news/sources registry.
   A shared operator label is NOT proof of equity ownership or independent corroboration. */
(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const status = byId('sn-status');
  if (!status) return;

  const search = byId('sn-search');
  const region = byId('sn-region');
  const clear = byId('sn-clear');
  const roster = byId('sn-publishers');
  const inspector = byId('sn-inspector');
  const count = byId('sn-count');
  const operatorsCount = byId('sn-operator-count');
  const countriesCount = byId('sn-country-count');
  const visibleCount = byId('sn-visible-count');
  const review = byId('sn-review');
  const TIMEOUT_MS = 12000;
  const state = { sources: null, selectedId: null, reviewedAt: null, relationships: null };

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  function countryName(code) {
    if (!code || !/^[A-Z]{2}$/.test(code)) return 'Not recorded';
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; }
    catch { return code; }
  }

  function evidenceLink(href, label) {
    try {
      const url = new URL(href);
      if (url.protocol !== 'https:') return null;
      const link = element('a', label);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    } catch { return null; }
  }

  function validRecords(data) {
    if (!data || typeof data !== 'object' || !data.sourceFingerprint ||
        data.validation?.valid !== true || !Array.isArray(data.sources) ||
        !Number.isInteger(data.totalSources) || data.totalSources !== data.sources.length ||
        data.sources.length === 0) return false;
    const seen = new Set();
    for (const source of data.sources) {
      if (!source || typeof source.sourceId !== 'string' ||
          !/^[a-z0-9-]+$/.test(source.sourceId) ||
          seen.has(source.sourceId) ||
          typeof source.name !== 'string' || !source.name.trim() ||
          !Array.isArray(source.evidenceUrls) ||
          (source.ownershipOperator != null && typeof source.ownershipOperator !== 'string') ||
          (source.primaryCountry != null &&
           (typeof source.primaryCountry !== 'string' || !/^[A-Z]{2}$/.test(source.primaryCountry)))) {
        return false;
      }
      seen.add(source.sourceId);
    }
    return true;
  }

  function operatorName(source) {
    const value = source.ownershipOperator;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  function operatorMatches(source) {
    const operator = operatorName(source);
    if (!operator) return [];
    // Exact label grouping is a navigation aid, never a corporate family determination.
    return state.sources.filter(candidate => candidate.sourceId !== source.sourceId &&
      operatorName(candidate) === operator);
  }


  function validRelationships(data, sourceFingerprint) {
    if (!data || data.schemaVersion !== 1 || data.sourceFingerprint !== sourceFingerprint ||
        data.validation?.valid !== true || !Array.isArray(data.entities) ||
        !Array.isArray(data.edges)) return false;
    const ids = new Set(data.entities.map(item => item.id));
    const sourceIds = new Set(state.sources.map(item => item.sourceId));
    if (ids.size !== data.entities.length) return false;
    const edges = new Set();
    for (const edge of data.edges) {
      if (!edge || typeof edge.id !== 'string' || edges.has(edge.id) ||
          !ids.has(edge.toEntityId) ||
          ((!!edge.fromSourceId) === (!!edge.fromEntityId)) ||
          (edge.fromSourceId && !sourceIds.has(edge.fromSourceId)) ||
          (edge.fromEntityId && !ids.has(edge.fromEntityId)) ||
          !['published-by', 'owned-by', 'operated-by', 'part-of-group', 'part-of-network'].includes(edge.relation) ||
          typeof edge.summary !== 'string' || !edge.summary.trim() ||
          !/^\\d{4}-\\d{2}-\\d{2}$/.test(edge.reviewedAt || '') ||
          !Array.isArray(edge.evidence) || !edge.evidence.length ||
          !edge.evidence.every(ref => ref && typeof ref.title === 'string' && ref.title.trim() &&
            typeof ref.url === 'string' && !!evidenceLink(ref.url, ref.title))) return false;
      edges.add(edge.id);
    }
    return true;
  }

  function renderVerifiedLinks(source) {
    const box = element('section', null, 'sn-reviewed-links');
    box.append(element('h4', 'Reviewed organizational relationships'));
    const graph = state.relationships;
    if (!graph) {
      box.append(element('p', 'Verified relationship evidence is unavailable. No ownership chain is asserted.'));
      return box;
    }
    const entityById = new Map(graph.entities.map(item => [item.id, item]));
    const entries = graph.edges.filter(edge => edge.fromSourceId === source.sourceId);
    if (!entries.length) {
      box.append(element('p', 'No independently reviewed relationship edge is recorded for this publisher. This is a research gap, not evidence of independent ownership.'));
      return box;
    }
    const list = element('ol', null, 'sn-edge-list');
    const visited = new Set();
    function addEdge(edge, depth) {
      if (visited.has(edge.id) || depth > 8) return;
      visited.add(edge.id);
      const entity = entityById.get(edge.toEntityId);
      if (!entity) return;
      const li = element('li', null, 'sn-edge');
      const heading = element('strong', edge.relation.replaceAll('-', ' ') + ': ' + entity.name);
      li.append(heading, element('p', edge.summary));
      li.append(element('small', 'Relationship reviewed ' + edge.reviewedAt));
      const refs = element('ul', null, 'sn-edge-evidence');
      for (const ref of edge.evidence) {
        const link = evidenceLink(ref.url, ref.title);
        if (!link) continue;
        const item = element('li');
        item.append(link);
        refs.append(item);
      }
      li.append(refs);
      list.append(li);
      for (const next of graph.edges.filter(candidate => candidate.fromEntityId === entity.id)) {
        addEdge(next, depth + 1);
      }
    }
    for (const edge of entries) addEdge(edge, 0);
    box.append(list);
    box.append(element('p', 'Arrows describe only the documented relationship. Missing links, control percentages, reporting influence and ultimate beneficial ownership remain unknown.', 'sn-footnote'));
    return box;
  }

  async function loadRelationships(sourceFingerprint) {
    // This API is live-only: the service worker does not cache authority responses.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch('/api/news/relationships', {
        headers: { Accept: 'application/json' }, signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!validRelationships(data, sourceFingerprint)) return;
      state.relationships = data;
    } catch {
      // Registry still works; missing evidence must be presented explicitly.
    } finally {
      clearTimeout(timeout);
      renderInspector();
    }
  }

  function selection() {
    const term = search.value.trim().toLocaleLowerCase('en');
    const selectedRegion = region.value;
    return state.sources.filter(source => {
      const regionMatches = selectedRegion === 'all' || source.region === selectedRegion;
      const text = [
        source.name, source.organizationName, operatorName(source),
        source.primaryCountry, countryName(source.primaryCountry), source.sourceClass,
      ].filter(Boolean).join(' ').toLocaleLowerCase('en');
      return regionMatches && (!term || text.includes(term));
    });
  }

  function detailLine(label, value) {
    const row = element('div', null, 'sn-detail-row');
    row.append(element('dt', label), element('dd', value || 'Not recorded'));
    return row;
  }

  function renderInspector() {
    inspector.replaceChildren();
    const source = state.sources?.find(item => item.sourceId === state.selectedId);
    if (!source) {
      inspector.append(element('h3', 'Choose a publisher'), element('p', 'Select a publisher to inspect its recorded operating organization and provenance.'));
      return;
    }
    inspector.append(element('p', 'Publisher record', 'sn-eyebrow'), element('h3', source.name));
    const info = element('dl', null, 'sn-details');
    const name = operatorName(source);
    info.append(
      detailLine('Publishing organization', source.organizationName),
      detailLine('Recorded operator label', name || 'Unresolved'),
      detailLine('Publisher-origin country', countryName(source.primaryCountry)),
      detailLine('Feed-routing region', source.region),
      detailLine('Editorial scope', source.geographicScope || 'Unknown'),
      detailLine('Source language(s)', Array.isArray(source.sourceLanguages) ?
        source.sourceLanguages.join(', ').toUpperCase() || 'Unrecorded' : 'Unrecorded'),
      detailLine('Source record reviewed', source.reviewedAt || state.reviewedAt || 'Date unavailable')
    );
    inspector.append(info);
    const relationship = element('section', null, 'sn-relationship');
    relationship.append(element('h4', 'Other monitored publishers sharing this operator label'));
    const matches = operatorMatches(source);
    if (!name) {
      relationship.append(element('p', 'Operator identity is not recorded. No relationship is inferred.'));
    } else if (!matches.length) {
      relationship.append(element('p', 'No other publisher in the current monitored portfolio has this exact operator label. This does not establish independent ownership.'));
    } else {
      const list = element('ul');
      for (const match of matches) {
        const item = element('li');
        const button = element('button', match.name, 'sn-inline-select');
        button.type = 'button';
        button.addEventListener('click', () => choose(match.sourceId, true));
        item.append(button);
        list.append(item);
      }
      relationship.append(list);
    }
    inspector.append(relationship);
    inspector.append(renderVerifiedLinks(source));

    const evidence = element('section', null, 'sn-evidence');
    evidence.append(element('h4', 'Review the underlying source references'));
    const list = element('ul');
    let linkCount = 0;
    for (const href of source.evidenceUrls) {
      const link = evidenceLink(href, 'Publisher or organization reference');
      if (!link) continue;
      const item = element('li');
      item.append(link);
      list.append(item);
      linkCount++;
    }
    if (linkCount) evidence.append(list);
    else evidence.append(element('p', 'No safe public evidence link is available in this record.'));
    evidence.append(element('p', 'These reviewed source references support the recorded provenance metadata; they do not automatically prove a complete ownership chain, newsroom independence, or article-level sourcing.', 'sn-footnote'));
    inspector.append(evidence);
    const next = element('div', null, 'sn-inspector-next');
    const observatory = element('a', 'Coverage and evidence methodology');
    observatory.href = '/observatory/coverage/';
    next.append(observatory);
    inspector.append(next);
  }

  function choose(sourceId, scroll) {
    if (!state.sources?.some(source => source.sourceId === sourceId)) return;
    state.selectedId = sourceId;
    renderRoster();
    renderInspector();
    if (scroll) inspector.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  function renderRoster() {
    if (!state.sources) return;
    const found = selection();
    visibleCount.textContent = found.length + ' shown';
    roster.replaceChildren();
    if (!found.length) {
      roster.append(element('p', 'No publishers match these filters. This does not mean reporting is absent from a region.', 'sn-placeholder'));
      return;
    }
    const list = element('ul', null, 'sn-publisher-list');
    for (const source of found) {
      const item = element('li');
      const button = element('button', null, 'sn-publisher-btn');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(source.sourceId === state.selectedId));
      button.append(element('strong', source.name));
      button.append(element('span', operatorName(source) || 'Operator unresolved', 'sn-publisher-operator'));
      button.append(element('small', countryName(source.primaryCountry) + ' · ' +
        (source.geographicScope || 'Scope unrecorded')));
      button.addEventListener('click', () => choose(source.sourceId, false));
      item.append(button);
      list.append(item);
    }
    roster.append(list);
  }

  function onFilter() {
    renderRoster();
    if (state.selectedId && !selection().some(item => item.sourceId === state.selectedId)) {
      state.selectedId = null;
      renderInspector();
    }
  }

  function failed() {
    state.sources = null;
    [search, region, clear].forEach(control => { control.disabled = true; });
    status.textContent = 'The governed source registry is unavailable or inconsistent. Publisher relationships cannot be verified right now.';
    roster.replaceChildren(element('p', 'Source details are unavailable. Try again later or consult the Coverage & Evidence Observatory.', 'sn-placeholder'));
    inspector.replaceChildren(element('h3', 'No verified relationship data'), element('p', 'The explorer does not publish cached guesses when its source registry fails validation.'));
    visibleCount.textContent = 'unavailable';
    count.textContent = '—';
    operatorsCount.textContent = '—';
    countriesCount.textContent = '—';
    review.textContent = 'No source or ownership conclusions can be drawn from an unavailable response.';
  }

  async function boot() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch('/api/news/sources', {
        headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      if (!response.ok) throw new Error('Source API unavailable');
      const data = await response.json();
      if (!validRecords(data)) throw new Error('Registry validation failed');
      state.sources = data.sources.slice().sort((a, b) => a.name.localeCompare(b.name));
      state.reviewedAt = data.reviewedAt || null;
      [search, region, clear].forEach(control => { control.disabled = false; });
      count.textContent = String(state.sources.length);
      operatorsCount.textContent = String(new Set(state.sources.map(operatorName).filter(Boolean)).size);
      countriesCount.textContent = String(new Set(state.sources.map(source => source.primaryCountry).filter(Boolean)).size);
      review.textContent = 'Source registry reviewed ' + (state.reviewedAt || 'date unavailable') +
        '. Operator counts reflect distinct labels in this monitored portfolio, not verified ultimate ownership groups.';
      status.textContent = 'Reviewed source registry loaded. Select any publisher to inspect its recorded source relationships.';
      search.addEventListener('input', onFilter);
      region.addEventListener('change', onFilter);
      clear.addEventListener('click', () => { search.value = ''; region.value = 'all'; onFilter(); search.focus(); });
      const requestedSourceId = new URL(window.location.href).searchParams.get('source');
      if (requestedSourceId && state.sources.some(source => source.sourceId === requestedSourceId)) {
        state.selectedId = requestedSourceId;
      }
      renderRoster();
      renderInspector();
      loadRelationships(data.sourceFingerprint);
    } catch {
      failed();
    } finally {
      clearTimeout(timeout);
    }
  }
  boot();
})();

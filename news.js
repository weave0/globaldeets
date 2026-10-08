/**
 * GlobalDeets — News Feed Page Renderer
 * Fetches /api/news and renders region-filtered news cards.
 * Governed provenance, admission, coverage and health hydrate independently so
 * observability failures never block the core source-linked news experience.
 */
(function () {
  'use strict';

  const REGIONS = ['global', 'americas', 'europe', 'asia', 'middle-east', 'pacific', 'africa'];
  const REGION_LABELS = {
    global: 'All Regions',
    americas: 'Americas',
    europe: 'Europe',
    asia: 'Asia',
    'middle-east': 'Middle East',
    pacific: 'Pacific',
    africa: 'Africa',
  };
  // Exact URL membership only. A headline is not clustered into a story by resemblance.
  const STORY_CONTEXT_BY_URL = {
    'https://www.latimes.com/environment/story/2026-08-20/judge-allows-controversial-oil-company-continue-pumping':
      '/story/santa-ynez-pipeline/',
  };

  const RIGHTS_LABELS = {
    'verified-public-use': 'Bounded reuse reviewed',
    'permission-required': 'Publisher permission required',
    'contract-required': 'Licensed/contract path required',
    unknown: 'Reuse rights unresolved',
    prohibited: 'Reuse prohibited',
  };

  let currentRegion = initialRegion();
  let currentOffset = 0;
  const PAGE_SIZE = 24;
  // The core feed gets longer than optional trust panels: a slow panel must never hold the feed.
  const FEED_TIMEOUT_MS = 15_000;
  const TRUST_TIMEOUT_MS = 8_000;
  const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'https://globaldeets.com'
    : '';
  let allItems = [];
  let searchTerm = '';
  let sourceById = new Map();
  let admissionById = new Map();
  let coverageData = null;
  let healthData = null;
  // GD-038 (F4): every feed request carries its own generation and region. A response is applied
  // only if it is still the newest request, so a slow earlier region can never overwrite a later
  // selection. Region resets abort the superseded request; "load more" never runs concurrently.
  let feedGeneration = 0;
  let feedController = null;
  let appendInFlight = false;
  let feedState = 'loading'; // 'loading' | 'ready' | 'error'
  let feedErrorKind = null;
  let feedRetrievedAt = null;
  let feedOfflineCopyAt = null;
  // functions/api/news.js caches the assembled feed for CACHE_TTL_SECONDS (900s).
  const SERVER_CACHE_MAX_MINUTES = 15;
  // Coverage context shows "unavailable" only after both of its inputs have actually settled.
  const coverageSettled = { coverage: false, admission: false };

  function init() {
    installReaderBridgeStyles();
    prepareTrustSurface();
    renderTabs();
    bindSearch();
    loadNews(true);
    hydrateTrustSurface();
    document.getElementById('load-more-btn')?.addEventListener('click', () => loadNews(false));
  }

  function initialRegion() {
    try {
      const requested = new URLSearchParams(location.search).get('region');
      return REGIONS.includes(requested) ? requested : 'global';
    } catch {
      return 'global';
    }
  }

  function syncRegionToUrl() {
    try {
      const url = new URL(location.href);
      if (currentRegion === 'global') url.searchParams.delete('region');
      else url.searchParams.set('region', currentRegion);
      history.replaceState(history.state, '', url);
    } catch {
      // Shareable URLs are a convenience; the feed works without them.
    }
  }

  function installReaderBridgeStyles() {
    if (document.querySelector('link[data-gd022-reader-bridge]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/news-reader-bridge.css';
    link.dataset.gd022ReaderBridge = 'true';
    document.head.appendChild(link);
  }

  function bindSearch() {
    const input = document.getElementById('news-search');
    if (!input) return;
    input.addEventListener('input', () => {
      searchTerm = input.value.trim().toLowerCase();
      renderVisibleCards();
      updateStatus();
    });
  }

  // The trust bar and coverage panel are static markup inside the "Sources & coverage"
  // disclosure (GD-038 F3), so the raw HTML is meaningful before hydration and stories come first.
  function prepareTrustSurface() {
    const subtitle = document.querySelector('.news-page-subtitle');
    if (subtitle) {
      subtitle.textContent =
        'Live source-linked headlines across seven routing regions. Publisher links stay primary; source provenance, reuse limits, freshness and coverage gaps are inspectable.';
    }
  }

  class FeedRequestError extends Error {
    constructor(kind, message) {
      super(message);
      this.kind = kind; // 'timeout' | 'offline' | 'upstream' | 'aborted'
    }
  }

  async function fetchJson(path, { timeoutMs = TRUST_TIMEOUT_MS, signal } = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new FeedRequestError('upstream', `${path}: HTTP ${response.status}`);
      const data = await response.json();
      // The service worker marks API responses it replays from cache while offline.
      const offlineCopy = response.headers.get('X-GlobalDeets-Offline-Copy');
      if (offlineCopy && data && typeof data === 'object') {
        Object.defineProperty(data, 'offlineCopyAt', { value: offlineCopy, enumerable: false });
      }
      return data;
    } catch (error) {
      if (error instanceof FeedRequestError) throw error;
      if (timedOut) throw new FeedRequestError('timeout', `${path}: no response in ${timeoutMs}ms`);
      if (signal?.aborted) throw new FeedRequestError('aborted', `${path}: superseded`);
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new FeedRequestError('offline', `${path}: browser is offline`);
      }
      throw new FeedRequestError('upstream', `${path}: ${error?.message || 'network error'}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  // GD-038 (F5): each trust panel resolves on its own deadline and renders as soon as it lands.
  // A hung endpoint degrades only its own panel; it never delays the others or the core feed.
  function hydrateTrustSurface() {
    return Promise.allSettled([
      settle(fetchJson('/api/news/sources'), applySources),
      settle(fetchJson('/api/news/admission'), applyAdmission),
      settle(fetchJson('/api/news/coverage'), applyCoverage),
      settle(fetchJson('/api/news/health'), applyHealth),
    ]);
  }

  function settle(promise, apply) {
    return promise.then(
      value => apply({ status: 'fulfilled', value }),
      reason => apply({ status: 'rejected', reason })
    );
  }

  function applySources(sourcesResult) {
    if (sourcesResult.status === 'fulfilled') {
      const sourceData = sourcesResult.value;
      const sources = Array.isArray(sourceData.sources) ? sourceData.sources : [];
      sourceById = new Map(sources.map(source => [source.sourceId, source]));
      const count = document.getElementById('news-source-count');
      if (count) {
        count.textContent = `${sourceData.totalSources ?? sources.length} source endpoints in the live contract`;
      }
      const sourceNote = document.querySelector('.news-source-inventory .news-sources-note');
      if (sourceNote) {
        const names = sources.map(source => source.name).filter(Boolean);
        sourceNote.textContent = names.length
          ? `Sources: ${names.join(' · ')}`
          : 'Source inventory available in the Observatory.';
      }
    } else {
      const count = document.getElementById('news-source-count');
      if (count) count.textContent = 'Source inventory temporarily unavailable';
      console.warn('GlobalDeets source inventory unavailable:', sourcesResult.reason);
    }
    renderVisibleCards();
  }

  function applyAdmission(admissionResult) {
    if (admissionResult.status === 'fulfilled') {
      const admissionData = admissionResult.value;
      const admissions = Array.isArray(admissionData.liveAdmissions) ? admissionData.liveAdmissions : [];
      admissionById = new Map(admissions.map(entry => [entry.sourceId, entry]));
      window.__globalDeetsAdmissionSummary = admissionData.summary || null;
    } else {
      console.warn('GlobalDeets source admission unavailable:', admissionResult.reason);
    }
    coverageSettled.admission = true;
    renderCoverageContext();
    renderVisibleCards();
  }

  function applyCoverage(coverageResult) {
    if (coverageResult.status === 'fulfilled') {
      coverageData = coverageResult.value;
    } else {
      console.warn('GlobalDeets coverage context unavailable:', coverageResult.reason);
    }
    coverageSettled.coverage = true;
    renderCoverageContext();
  }

  function applyHealth(healthResult) {
    if (healthResult.status === 'fulfilled') {
      healthData = healthResult.value;
      const healthNode = document.getElementById('news-health-status');
      if (healthNode) {
        const healthy = Number.isFinite(healthData.healthySources) ? healthData.healthySources : '—';
        const total = Number.isFinite(healthData.totalSources) ? healthData.totalSources : '—';
        healthNode.textContent = `${healthy}/${total} endpoints healthy · checked ${formatSnapshotTime(healthData.generatedAt)}`;
      }
      renderAlerts();
    } else {
      const healthNode = document.getElementById('news-health-status');
      if (healthNode) healthNode.textContent = 'Health snapshot temporarily unavailable';
      console.warn('GlobalDeets health snapshot unavailable:', healthResult.reason);
    }
  }

  function renderCoverageContext() {
    const summary = document.getElementById('news-context-summary');
    const gaps = document.getElementById('news-context-gaps');
    if (!summary || !gaps) return;

    const admissionSummary = window.__globalDeetsAdmissionSummary;
    if (!coverageData && !admissionSummary) {
      if (!coverageSettled.coverage || !coverageSettled.admission) return;
      summary.textContent =
        'Coverage context is temporarily unavailable. Headlines and original publisher links remain available.';
      gaps.replaceChildren();
      return;
    }

    const region =
      currentRegion === 'global'
        ? null
        : Array.isArray(coverageData?.regions)
          ? coverageData.regions.find(item => item.region === currentRegion)
          : null;
    const pieces = [];
    if (region) {
      pieces.push(`${region.sourceCount ?? '—'} source endpoints route into ${REGION_LABELS[currentRegion]}`);
      if (Number.isFinite(region.languageCount)) {
        pieces.push(
          `${region.languageCount} source language${region.languageCount === 1 ? '' : 's'} represented`
        );
      }
    } else if (Number.isFinite(coverageData?.totalSources)) {
      pieces.push(`${coverageData.totalSources} live source endpoints across the portfolio`);
    }
    if (Number.isFinite(admissionSummary?.reviewedSources)) {
      pieces.push(`${admissionSummary.reviewedSources} rights records reviewed`);
    }
    if (Array.isArray(admissionSummary?.unknownRightsSourceIds)) {
      pieces.push(
        `${admissionSummary.unknownRightsSourceIds.length} reviewed rights state${admissionSummary.unknownRightsSourceIds.length === 1 ? '' : 's'} still unresolved`
      );
    }
    summary.textContent = pieces.length
      ? pieces.join(' · ')
      : 'Governed source and coverage records are available.';

    const relevant = relevantCoverageGaps(coverageData?.gaps);
    gaps.replaceChildren(
      ...relevant.map(gap => {
        const item = document.createElement('div');
        item.className = 'news-context-gap';
        item.dataset.severity = gap.severity || 'info';
        const label = gap.detail || gap.type || gap.id || 'Coverage limitation';
        item.innerHTML = `<span class="news-context-gap-label">${escapeHtml(label)}</span>${gap.nextAction ? `<span class="news-context-gap-action">${escapeHtml(gap.nextAction)}</span>` : ''}`;
        return item;
      })
    );
  }

  function relevantCoverageGaps(value) {
    const gaps = Array.isArray(value) ? value : [];
    const regional =
      currentRegion === 'global'
        ? gaps
        : gaps.filter(
            gap => !gap.region || gap.region === currentRegion || gap.routingRegion === currentRegion
          );
    return regional
      .filter(gap => gap && (gap.severity === 'high' || gap.severity === 'medium'))
      .slice(0, 3);
  }

  function formatSnapshotTime(iso) {
    if (!iso) return 'time unavailable';
    const date = new Date(iso);
    const ageMs = Date.now() - date.getTime();
    if (Number.isNaN(ageMs)) return 'time unavailable';
    if (ageMs < 60_000) return 'just now';
    if (ageMs < 3_600_000) return `${Math.max(1, Math.round(ageMs / 60_000))}m ago`;
    if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function renderTabs() {
    const tabBar = document.getElementById('region-tabs');
    if (!tabBar) return;
    tabBar.innerHTML = REGIONS.map(
      r => `
      <button type="button" class="region-tab${r === currentRegion ? ' active' : ''}" data-region="${r}" aria-pressed="${r === currentRegion}">${REGION_LABELS[r]}</button>`
    ).join('');
    // A deep-linked region may sit off-screen in the phone's single scrolling row.
    tabBar.querySelector('.region-tab.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    tabBar.addEventListener('click', e => {
      const btn = e.target.closest('.region-tab');
      if (!btn || btn.classList.contains('active')) return;
      currentRegion = btn.dataset.region;
      searchTerm = '';
      const searchInput = document.getElementById('news-search');
      if (searchInput) searchInput.value = '';
      tabBar.querySelectorAll('.region-tab').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      syncRegionToUrl();
      renderCoverageContext();
      loadNews(true);
    });
  }

  function loadNews(reset) {
    const grid = document.getElementById('news-grid');
    const loadBtn = document.getElementById('load-more-btn');

    if (reset) {
      // A new selection supersedes everything in flight, including an unfinished "load more".
      feedController?.abort();
      currentOffset = 0;
      allItems = [];
      appendInFlight = false;
      feedState = 'loading';
      if (grid) {
        grid.setAttribute('aria-busy', 'true');
        grid.innerHTML = '<div class="news-skeleton"></div>'.repeat(6);
      }
      if (loadBtn) loadBtn.classList.add('js-hidden');
      setLoadMoreNote('');
      updateStatus();
      renderAlerts();
    } else {
      if (appendInFlight || feedState !== 'ready') return;
      appendInFlight = true;
      setLoadMoreNote('');
    }

    const generation = ++feedGeneration;
    const request = { region: currentRegion, offset: currentOffset, reset };
    const controller = new AbortController();
    feedController = controller;
    if (loadBtn) loadBtn.disabled = true;

    const path = `/api/news?region=${encodeURIComponent(request.region)}&limit=${PAGE_SIZE}&offset=${request.offset}`;
    fetchJson(path, { timeoutMs: FEED_TIMEOUT_MS, signal: controller.signal })
      .then(data => {
        if (generation !== feedGeneration || request.region !== currentRegion) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        allItems = request.reset ? items : [...allItems, ...items];
        currentOffset = request.offset + items.length;
        feedState = 'ready';
        window.__globalDeetsNewsTotal = data.total;
        window.__globalDeetsNewsCached = data.cached;
        window.__globalDeetsNewsAdmissionFingerprint = data.admissionFingerprint;
        window.__globalDeetsNewsDisplayPolicyVersion = data.displayPolicyVersion;
        window.__globalDeetsNewsRegion = request.region;
        feedRetrievedAt = new Date();
        feedOfflineCopyAt = data.offlineCopyAt || null;
        renderVisibleCards();
        updateStatus();
        renderAlerts();
        if (loadBtn) {
          loadBtn.disabled = false;
          const total = Number.isFinite(data.total) ? data.total : null;
          const exhausted = total != null ? currentOffset >= total : items.length < PAGE_SIZE;
          loadBtn.classList.toggle('js-hidden', exhausted);
        }
      })
      .catch(error => {
        if (generation !== feedGeneration || error?.kind === 'aborted') return;
        console.error('News fetch failed:', error);
        if (loadBtn) loadBtn.disabled = false;
        if (request.reset) {
          feedState = 'error';
          feedErrorKind = error?.kind || 'upstream';
          renderVisibleCards();
          updateStatus();
        } else {
          setLoadMoreNote(
            `${failureMessage(error?.kind)} The stories already shown are unchanged.`
          );
        }
      })
      .finally(() => {
        if (generation !== feedGeneration) return;
        if (!request.reset) appendInFlight = false;
        grid?.removeAttribute('aria-busy');
      });
  }

  function failureMessage(kind) {
    if (kind === 'offline') return 'You appear to be offline, so new stories could not be loaded.';
    if (kind === 'timeout') return 'The news service did not respond in time.';
    return 'The news service returned an error.';
  }

  function setLoadMoreNote(text) {
    let note = document.getElementById('load-more-note');
    if (!note && text) {
      const loadBtn = document.getElementById('load-more-btn');
      if (!loadBtn) return;
      note = document.createElement('p');
      note.id = 'load-more-note';
      note.className = 'news-load-more-note';
      note.setAttribute('role', 'status');
      loadBtn.insertAdjacentElement('afterend', note);
    }
    if (note) note.textContent = text;
  }

  function renderErrorState(grid) {
    const wrapper = document.createElement('div');
    wrapper.className = 'news-error';
    wrapper.dataset.failure = feedErrorKind;
    wrapper.setAttribute('role', 'alert');
    const message = document.createElement('p');
    message.textContent = `${failureMessage(feedErrorKind)} No stories are shown for ${REGION_LABELS[currentRegion]} right now. This is a loading problem, not a sign that nothing is happening.`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => loadNews(true));
    wrapper.append(message, retry);
    grid.replaceChildren(wrapper);
  }

  function renderEmptyState(grid) {
    const empty = document.createElement('div');
    empty.className = 'news-empty';
    const message = document.createElement('p');
    if (searchTerm && allItems.length) {
      empty.dataset.state = 'no-matches';
      message.textContent = `None of the ${allItems.length} loaded stories match “${searchTerm}”. The filter only searches stories already loaded on this page.`;
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = 'Clear filter';
      clear.addEventListener('click', () => {
        searchTerm = '';
        const input = document.getElementById('news-search');
        if (input) input.value = '';
        renderVisibleCards();
        updateStatus();
        input?.focus();
      });
      empty.append(message, clear);
    } else {
      empty.dataset.state = 'empty';
      message.textContent = `Our current sources have no recent stories routed to ${REGION_LABELS[currentRegion]}. That reflects our source coverage, not a lack of events.`;
      empty.append(message);
    }
    grid.replaceChildren(empty);
  }

  function renderCards(grid, items, reset) {
    if (!grid) return;
    if (feedState === 'loading') return;
    if (feedState === 'error') {
      renderErrorState(grid);
      return;
    }
    if (reset) grid.innerHTML = '';
    if (!items.length && reset) {
      renderEmptyState(grid);
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(buildCard(item)));
    grid.appendChild(fragment);
  }

  // Card order (GD-038 F3): headline → publisher and publication time → permitted supporting
  // text → the publisher action. Labels appear only when they change how the card should be read.
  function buildCard(item) {
    const card = document.createElement('article');
    card.className = 'news-card';
    const pubTime = formatTime(item.published);
    const dateAttr = item.published ? ` datetime="${escapeAttr(item.published)}"` : '';
    const headlineLinkOnly = item.displayMode === 'headline-link';
    const provenance = sourceById.get(item.sourceId) || null;
    const admission = admissionById.get(item.sourceId) || null;
    const href = safeHref(item.sourceUrl);
    const source = item.source || 'the publisher';
    const headline = escapeHtml(item.headline || 'Untitled story');
    const originalLang = escapeHtml(String(item.originalLang || '').toUpperCase());

    const flags = [];
    if (headlineLinkOnly) {
      flags.push(
        '<span class="news-source-badge news-source-badge--restricted">Headline only</span>'
      );
    } else if (item.translated) {
      flags.push(
        `<span class="news-mt-badge">Machine-translated from ${originalLang || 'another language'}</span>`
      );
    } else if (item.originalLang && item.originalLang !== 'en') {
      flags.push(
        `<span class="news-mt-badge news-mt-badge--failed">Original language: ${originalLang}; not translated</span>`
      );
    }
    const summaryHtml =
      typeof item.summary === 'string' && item.summary.trim()
        ? `<p class="news-summary">${escapeHtml(item.summary)}</p>`
        : '';
    const regionLabel = item.region === 'global' ? 'Global' : REGION_LABELS[item.region];

    card.innerHTML = `
      <h2 class="news-headline">${
        href
          ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${headline}</a>`
          : headline
      }</h2>
      <p class="news-card-meta">
        <span class="news-source-name">${escapeHtml(item.source || 'Unnamed source')}</span>
        ${pubTime ? `<time class="news-time"${dateAttr}>${pubTime}</time>` : ''}
        ${regionLabel ? `<span class="news-region-tag">Feed: ${escapeHtml(regionLabel)}</span>` : ''}
      </p>
      ${flags.length ? `<p class="news-card-flags">${flags.join('')}</p>` : ''}
      ${summaryHtml}
      <div class="news-card-actions">
        ${
          href
            ? `<a class="news-read-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">Read at ${escapeHtml(source)} →<span class="visually-hidden"> (opens in a new tab)</span></a>`
            : '<span class="news-read-unavailable">Publisher link unavailable</span>'
        }
        ${
          href && STORY_CONTEXT_BY_URL[href]
            ? `<a class="news-context-link" href="${escapeAttr(STORY_CONTEXT_BY_URL[href])}">Context &amp; sources</a>`
            : ''
        }
      </div>
      ${buildSourceContext(item, provenance, admission)}`;
    return card;
  }

  function safeHref(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
      return null;
    }
  }

  function buildSourceContext(item, provenance, admission) {
    if (!provenance && !admission) return '';
    const status = admission?.allowedUseStatus || item.allowedUseStatus || 'unknown';
    const explanation = rightsExplanation(status, item.displayMode);
    const facts = [];
    if (provenance?.sourceClass) {
      facts.push(`<span><strong>Source type:</strong> ${escapeHtml(humanize(provenance.sourceClass))}</span>`);
    }
    if (provenance?.evidenceRole) {
      facts.push(`<span><strong>Role:</strong> ${escapeHtml(humanize(provenance.evidenceRole))}</span>`);
    }
    if (provenance?.geographicScope) {
      facts.push(
        `<span><strong>Reviewed scope:</strong> ${escapeHtml(humanize(provenance.geographicScope))}</span>`
      );
    }
    if (provenance?.ownershipOperator) {
      facts.push(`<span><strong>Operator:</strong> ${escapeHtml(provenance.ownershipOperator)}</span>`);
    }
    if (admission?.reviewedAt) {
      facts.push(`<span><strong>Rights review:</strong> ${escapeHtml(admission.reviewedAt)}</span>`);
    }
    return `
      <details class="news-source-context">
        <summary>Source context</summary>
        <div class="news-source-context-body">
          <p class="news-rights-state"><strong>${escapeHtml(RIGHTS_LABELS[status] || humanize(status))}.</strong> ${escapeHtml(explanation)}</p>
          ${facts.length ? `<div class="news-source-facts">${facts.join('')}</div>` : ''}
          <p class="news-source-context-caveat">These records describe provenance, source role, scope, and reuse permission. They are not a truth score, quality score, bias rating, or claim that this story occurred within the publisher's reviewed scope.</p>
          <a href="/observatory/coverage/">Inspect portfolio evidence and gaps →</a>
        </div>
      </details>`;
  }

  function rightsExplanation(status, displayMode) {
    if (status === 'verified-public-use' && displayMode === 'current-use') {
      return 'The reviewed source record supports GlobalDeets’ bounded headline, metadata, and excerpt treatment. This says nothing about whether the story is true or important.';
    }
    if (status === 'permission-required') {
      return 'Published terms indicate richer reuse requires publisher permission, so GlobalDeets withholds the publisher summary and keeps the original headline/link available.';
    }
    if (status === 'contract-required') {
      return 'The reviewed access path requires licensing, subscription, or a contract for richer reuse, so GlobalDeets keeps this card to the headline and original publisher link.';
    }
    if (status === 'prohibited') {
      return 'The reviewed source-use record does not permit this content treatment.';
    }
    return 'GlobalDeets has not established a sufficiently clear reuse permission for richer display, so the card fails closed to the headline and original publisher link.';
  }

  function renderVisibleCards() {
    const grid = document.getElementById('news-grid');
    if (!grid) return;
    renderCards(grid, getVisibleItems(), true);
  }

  function getVisibleItems() {
    if (!searchTerm) return allItems;
    return allItems.filter(item =>
      [item.headline, item.summary, item.source, item.region]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchTerm)
    );
  }

  function updateStatus() {
    const status = document.getElementById('news-status');
    if (!status) return;
    if (feedState === 'loading') {
      status.textContent = `Loading ${REGION_LABELS[currentRegion]}…`;
      return;
    }
    if (feedState === 'error') {
      status.textContent = `${REGION_LABELS[currentRegion]} stories unavailable`;
      return;
    }
    const total = window.__globalDeetsNewsTotal ?? '?';
    const visibleItems = getVisibleItems();
    const searchNote = searchTerm ? ` · ${visibleItems.length} matching filter` : '';
    status.textContent = `${allItems.length} of ${total} stories${searchNote}`;
    updateFreshness();
  }

  // Publication time lives on each card; this line states only when this page retrieved the feed
  // and how old the server's copy can be. It never claims the stories themselves are current.
  function updateFreshness() {
    const node = document.getElementById('news-freshness');
    if (!node) return;
    if (feedState !== 'ready' || !feedRetrievedAt) {
      node.textContent = '';
      return;
    }
    if (feedOfflineCopyAt) {
      node.textContent = 'saved copy';
      return;
    }
    const retrieved = feedRetrievedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    node.textContent = window.__globalDeetsNewsCached
      ? `retrieved ${retrieved} · server copy up to ${SERVER_CACHE_MAX_MINUTES} min old`
      : `retrieved ${retrieved}`;
  }

  // Consequential conditions stay visible outside the "Sources & coverage" disclosure.
  function renderAlerts() {
    const container = document.getElementById('news-alerts');
    if (!container) return;
    const alerts = [];
    if (feedState === 'ready' && feedOfflineCopyAt) {
      const saved = new Date(feedOfflineCopyAt);
      const when = Number.isNaN(saved.getTime())
        ? 'earlier'
        : `at ${saved.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      alerts.push([
        'offline',
        `You appear to be offline. These stories were saved ${when} and may be out of date.`,
      ]);
    }
    const healthy = healthData?.healthySources;
    const totalSources = healthData?.totalSources;
    if (Number.isFinite(healthy) && Number.isFinite(totalSources) && healthy < totalSources) {
      const failing = totalSources - healthy;
      alerts.push([
        'partial',
        `${failing} of ${totalSources} sources failed their most recent check, so some stories may be missing.`,
      ]);
    }
    container.replaceChildren(
      ...alerts.map(([kind, text]) => {
        const item = document.createElement('p');
        item.className = 'news-alert';
        item.dataset.alert = kind;
        item.textContent = text;
        return item;
      })
    );
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function humanize(value) {
    return String(value || '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      if (isNaN(diff)) return '';
      if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
      if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

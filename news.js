/**
 * GlobalDeets — News Feed Page Renderer
 * Fetches /api/news and renders region-filtered news cards.
 * Consumer trust signals are hydrated independently so observability failures
 * never block the core source-linked news experience.
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

  let currentRegion = 'global';
  let currentOffset = 0;
  const PAGE_SIZE = 24;
  const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'https://globaldeets.com'
    : '';
  let allItems = [];
  let loading = false;
  let searchTerm = '';

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  function init() {
    prepareTrustSurface();
    renderTabs();
    bindSearch();
    loadNews(true);
    hydrateTrustSurface();

    document.getElementById('load-more-btn')?.addEventListener('click', () => loadNews(false));
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

  // -------------------------------------------------------------------------
  // Consumer trust / observability surface
  // -------------------------------------------------------------------------
  function prepareTrustSurface() {
    const subtitle = document.querySelector('.news-page-subtitle');
    if (subtitle) {
      subtitle.textContent =
        'Live source-linked headlines across seven routing regions. Original publisher links stay visible; freshness, provenance, and coverage gaps are inspectable.';
    }

    const tagline = document.querySelector('.logo .tagline');
    if (tagline) tagline.textContent = 'World News · Source-Linked · Coverage Visible';

    const sourceNote = document.querySelector('.news-sources-note');
    if (sourceNote) sourceNote.textContent = 'Source inventory loading…';

    if (!document.getElementById('news-trust-bar')) {
      const tools = document.querySelector('.news-tools');
      if (tools) {
        const trustBar = document.createElement('div');
        trustBar.id = 'news-trust-bar';
        trustBar.className = 'news-status-bar';
        trustBar.setAttribute('aria-label', 'Source coverage and freshness');

        const sourceCount = document.createElement('span');
        sourceCount.id = 'news-source-count';
        sourceCount.textContent = 'Source contract loading…';

        const health = document.createElement('span');
        health.id = 'news-health-status';
        health.setAttribute('aria-live', 'polite');
        health.textContent = 'Health snapshot loading…';

        const links = document.createElement('span');
        links.className = 'news-sources-note';

        const observatoryLink = document.createElement('a');
        observatoryLink.href = '/observatory/coverage/';
        observatoryLink.textContent = 'Coverage & Evidence Observatory →';

        const separator = document.createTextNode(' · ');

        const dossierLink = document.createElement('a');
        dossierLink.href = '/dossiers/santa-ynez-pipeline/';
        dossierLink.textContent = 'Evidence dossier';

        links.append(observatoryLink, separator, dossierLink);
        trustBar.append(sourceCount, health, links);
        tools.insertAdjacentElement('afterend', trustBar);
      }
    }
  }

  async function fetchJson(path) {
    const response = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  async function hydrateTrustSurface() {
    const [sourcesResult, healthResult] = await Promise.allSettled([
      fetchJson('/api/news/sources'),
      fetchJson('/api/news/health'),
    ]);

    const sourceCount = document.getElementById('news-source-count');
    const sourceNote = document.querySelector('.news-sources-note:not(#news-trust-bar .news-sources-note)');

    if (sourcesResult.status === 'fulfilled') {
      const sourceData = sourcesResult.value;
      const sources = Array.isArray(sourceData.sources) ? sourceData.sources : [];
      if (sourceCount) {
        sourceCount.textContent = `${sourceData.totalSources ?? sources.length} source endpoints in the live contract`;
      }
      if (sourceNote) {
        const names = sources.map(source => source.name).filter(Boolean);
        sourceNote.textContent = names.length
          ? `Sources: ${names.join(' · ')}`
          : 'Source inventory is available in the Coverage & Evidence Observatory.';
      }
    } else {
      if (sourceCount) sourceCount.textContent = 'Source inventory temporarily unavailable';
      if (sourceNote) {
        sourceNote.textContent = 'Source inventory is available in the Coverage & Evidence Observatory.';
      }
      console.warn('GlobalDeets source inventory unavailable:', sourcesResult.reason);
    }

    const healthNode = document.getElementById('news-health-status');
    if (healthResult.status === 'fulfilled') {
      const health = healthResult.value;
      if (healthNode) {
        const healthy = Number.isFinite(health.healthySources) ? health.healthySources : '—';
        const total = Number.isFinite(health.totalSources) ? health.totalSources : '—';
        healthNode.textContent = `${healthy}/${total} endpoints healthy · checked ${formatSnapshotTime(health.generatedAt)}`;
      }
    } else {
      if (healthNode) healthNode.textContent = 'Health snapshot temporarily unavailable';
      console.warn('GlobalDeets health snapshot unavailable:', healthResult.reason);
    }
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

  // -------------------------------------------------------------------------
  // Region tabs
  // -------------------------------------------------------------------------
  function renderTabs() {
    const tabBar = document.getElementById('region-tabs');
    if (!tabBar) return;

    tabBar.innerHTML = REGIONS.map(
      r => `
      <button class="region-tab${r === currentRegion ? ' active' : ''}" data-region="${r}">
        ${REGION_LABELS[r]}
      </button>`
    ).join('');

    tabBar.addEventListener('click', e => {
      const btn = e.target.closest('.region-tab');
      if (!btn || btn.classList.contains('active')) return;

      currentRegion = btn.dataset.region;
      currentOffset = 0;
      allItems = [];
      searchTerm = '';
      const searchInput = document.getElementById('news-search');
      if (searchInput) searchInput.value = '';

      tabBar.querySelectorAll('.region-tab').forEach(b => b.classList.toggle('active', b === btn));

      loadNews(true);
    });
  }

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------
  function loadNews(reset) {
    if (loading) return;
    loading = true;

    const grid = document.getElementById('news-grid');
    const loadBtn = document.getElementById('load-more-btn');

    if (reset && grid) {
      grid.innerHTML = '<div class="news-skeleton"></div>'.repeat(6);
    }
    if (loadBtn) loadBtn.disabled = true;

    const url = `${API_BASE}/api/news?region=${encodeURIComponent(currentRegion)}&limit=${PAGE_SIZE}&offset=${currentOffset}`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        const items = data.items || [];
        allItems = reset ? items : [...allItems, ...items];
        currentOffset += items.length;
        window.__globalDeetsNewsTotal = data.total;
        window.__globalDeetsNewsCached = data.cached;
        window.__globalDeetsNewsAdmissionFingerprint = data.admissionFingerprint;
        window.__globalDeetsNewsDisplayPolicyVersion = data.displayPolicyVersion;

        renderVisibleCards();
        updateStatus();

        if (loadBtn) {
          loadBtn.disabled = false;
          loadBtn.classList.toggle('js-hidden', items.length < PAGE_SIZE);
        }
      })
      .catch(err => {
        if (grid && reset) {
          grid.innerHTML = `
            <div class="news-error">
              <p>Unable to load news feed. The worker may be warming up.</p>
              <button onclick="location.reload()">Retry</button>
            </div>`;
        }
        if (loadBtn) loadBtn.disabled = false;
        console.error('News fetch failed:', err);
      })
      .finally(() => {
        loading = false;
      });
  }

  // -------------------------------------------------------------------------
  // Render cards
  // -------------------------------------------------------------------------
  function renderCards(grid, items, reset) {
    if (!grid) return;

    if (reset) grid.innerHTML = '';

    if (!items.length && reset) {
      grid.innerHTML = '<p class="news-empty">No stories found for this region yet.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'news-card';

      const pubTime = formatTime(item.published);
      const dateAttr = item.published ? ` datetime="${escapeAttr(item.published)}"` : '';
      const headlineLinkOnly = item.displayMode === 'headline-link';

      const mtBadge = !headlineLinkOnly && item.translated
        ? `<span class="news-mt-badge" title="Machine translated from ${escapeAttr(item.originalLang || 'original language')} · Cloudflare AI (m2m100)">MT</span>`
        : !headlineLinkOnly && item.originalLang && item.originalLang !== 'en' && !item.translated
          ? `<span class="news-mt-badge news-mt-badge--failed" title="Originally in ${escapeAttr(item.originalLang)}; translation unavailable">⚠ ${escapeAttr(item.originalLang?.toUpperCase())}</span>`
          : '';
      const policyBadge = headlineLinkOnly
        ? '<span class="news-source-badge" title="Source admission currently permits headline and publisher link display only">Headline/link only</span>'
        : '';
      const summaryHtml = typeof item.summary === 'string' && item.summary.trim()
        ? `<p class="news-summary">${escapeHtml(item.summary)}</p>`
        : '';

      card.innerHTML = `
        <div class="news-card-header">
          <span class="news-source-badge">${escapeHtml(item.source || '')}</span>
          ${policyBadge}
          ${mtBadge}
          <time class="news-time"${dateAttr}>${pubTime}</time>
        </div>
        <h2 class="news-headline">
          <a href="${escapeAttr(item.sourceUrl || '#')}"
             target="_blank"
             rel="noopener noreferrer">
            ${escapeHtml(item.headline || '')}
          </a>
        </h2>
        ${summaryHtml}
        <div class="news-card-footer">
          <span class="news-region-tag">${escapeHtml(REGION_LABELS[item.region] || item.region || '')}</span>
          <a class="news-read-link"
             href="${escapeAttr(item.sourceUrl || '#')}"
             target="_blank"
             rel="noopener noreferrer">
            Read at ${escapeHtml(item.source || 'source')} →
          </a>
        </div>`;

      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
  }

  function renderVisibleCards() {
    const grid = document.getElementById('news-grid');
    if (!grid) return;

    const visibleItems = getVisibleItems();
    renderCards(grid, visibleItems, true);
  }

  function getVisibleItems() {
    if (!searchTerm) return allItems;

    return allItems.filter(item => {
      const haystack = [item.headline, item.summary, item.source, item.region]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(searchTerm);
    });
  }

  function updateStatus() {
    const status = document.getElementById('news-status');
    if (!status) return;

    const total = window.__globalDeetsNewsTotal ?? '?';
    const cachedNote = window.__globalDeetsNewsCached ? ' · cached' : '';
    const visibleItems = getVisibleItems();
    const searchNote = searchTerm ? ` · ${visibleItems.length} matching search` : '';
    status.textContent = `${allItems.length} of ${total} stories${cachedNote}${searchNote}`;
  }

  // -------------------------------------------------------------------------
  // Utils
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', init);
})();

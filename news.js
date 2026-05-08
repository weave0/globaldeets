/**
 * GlobalDeets — News Feed Page Renderer
 * Fetches /api/news and renders region-filtered news cards
 */
(function () {
  'use strict';

  const REGIONS = ['global', 'americas', 'europe', 'asia', 'middle-east', 'pacific'];

  const REGION_LABELS = {
    global: 'All Regions',
    americas: 'Americas',
    europe: 'Europe',
    asia: 'Asia',
    'middle-east': 'Middle East',
    pacific: 'Pacific',
  };

  let currentRegion = 'global';
  let currentOffset = 0;
  const PAGE_SIZE = 24;
  let allItems = [];
  let loading = false;

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  function init() {
    renderTabs();
    loadNews(true);

    document.getElementById('load-more-btn')?.addEventListener('click', () => loadNews(false));
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
    const status = document.getElementById('news-status');

    if (reset && grid) {
      grid.innerHTML = '<div class="news-skeleton"></div>'.repeat(6);
    }
    if (loadBtn) loadBtn.disabled = true;

    const url = `/api/news?region=${encodeURIComponent(currentRegion)}&limit=${PAGE_SIZE}&offset=${currentOffset}`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        const items = data.items || [];
        allItems = reset ? items : [...allItems, ...items];
        currentOffset += items.length;

        renderCards(grid, items, reset);

        if (status) {
          const cachedNote = data.cached ? ' · cached' : '';
          status.textContent = `${allItems.length} of ${data.total ?? '?'} stories${cachedNote}`;
        }

        if (loadBtn) {
          loadBtn.disabled = false;
          loadBtn.style.display = items.length < PAGE_SIZE ? 'none' : 'block';
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

      card.innerHTML = `
        <div class="news-card-header">
          <span class="news-source-badge">${escapeHtml(item.source || '')}</span>
          <time class="news-time"${dateAttr}>${pubTime}</time>
        </div>
        <h2 class="news-headline">
          <a href="${escapeAttr(item.sourceUrl || '#')}"
             target="_blank"
             rel="noopener noreferrer">
            ${escapeHtml(item.headline || '')}
          </a>
        </h2>
        <p class="news-summary">${escapeHtml(item.summary || '')}</p>
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

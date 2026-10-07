/**
 * GlobalDeets — World Desk reader modules (GD-038)
 *
 * Renders GlobalDeets-native reader surfaces from the governed /api/news feed:
 *   - #desk-latest     homepage "Latest reporting" list
 *   - #timeline-items  timeline.html: stories grouped by publication day
 *   - #browse-regions  categories.html: browse by feed region and source
 *
 * Contract: the publisher link is always the primary action, routing region is never presented
 * as story location, ordering is newest-first (never "most important"), and every failure state
 * says what failed instead of implying that nothing is happening.
 */
(function () {
  'use strict';

  const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'https://globaldeets.com'
    : '';
  const TIMEOUT_MS = 12_000;
  const REGIONS = ['global', 'americas', 'europe', 'asia', 'middle-east', 'pacific', 'africa'];
  const REGION_LABELS = {
    global: 'All regions',
    americas: 'Americas',
    europe: 'Europe',
    asia: 'Asia',
    'middle-east': 'Middle East',
    pacific: 'Pacific',
    africa: 'Africa',
  };

  async function fetchJson(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      const data = await response.json();
      const offlineCopy = response.headers.get('X-GlobalDeets-Offline-Copy');
      if (offlineCopy && data && typeof data === 'object') {
        Object.defineProperty(data, 'offlineCopyAt', { value: offlineCopy, enumerable: false });
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
      return null;
    }
  }

  function relativeTime(iso) {
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    if (!iso || Number.isNaN(diff)) return 'time not given';
    if (diff < 0) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function humanize(value) {
    return String(value || '')
      .replace(/[-_]/g, ' ')
      .replace(/^\w/, letter => letter.toUpperCase());
  }

  function clockTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  /** One story row. The headline links to the publisher; nothing here is republished. */
  function storyItem(item, { timeStyle = 'relative' } = {}) {
    const href = safeUrl(item.sourceUrl);
    const source = item.source || 'Unnamed source';
    const headline = item.headline || 'Untitled story';
    const headlineNode = href
      ? el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, headline)
      : el('span', {}, headline);

    const meta = el('p', { className: 'desk-story-meta' });
    meta.append(el('span', { className: 'desk-story-source' }, source));
    if (item.published) {
      const date = new Date(item.published);
      const label = timeStyle === 'clock' && !Number.isNaN(date.getTime())
        ? clockTime(date)
        : relativeTime(item.published);
      meta.append(el('time', { datetime: item.published }, label));
    }
    if (item.region && REGION_LABELS[item.region]) {
      const feedLabel = item.region === 'global' ? 'Global' : REGION_LABELS[item.region];
      meta.append(el('span', { className: 'desk-story-region' }, `Feed: ${feedLabel}`));
    }
    if (item.translated) {
      meta.append(
        el(
          'span',
          { className: 'desk-story-flag' },
          `Machine-translated from ${String(item.originalLang || 'another language').toUpperCase()}`
        )
      );
    } else if (item.displayMode === 'headline-link') {
      meta.append(el('span', { className: 'desk-story-flag' }, 'Headline only'));
    }

    const row = el('li', { className: 'desk-story' }, el('h4', { className: 'desk-story-headline' }, headlineNode), meta);
    if (href) {
      row.append(
        el(
          'a',
          { className: 'desk-story-read', href, target: '_blank', rel: 'noopener noreferrer' },
          `Read at ${source}`,
          el('span', { className: 'visually-hidden' }, ` (opens ${source} in a new tab)`)
        )
      );
    }
    return row;
  }

  function failureNode(message, retry) {
    const node = el('div', { className: 'desk-state desk-state--error', role: 'alert' }, el('p', {}, message));
    if (retry) {
      const button = el('button', { type: 'button', className: 'desk-retry' }, 'Try again');
      button.addEventListener('click', retry);
      node.append(button);
    }
    return node;
  }

  function freshnessText(data, fetchedAt) {
    if (data?.offlineCopyAt) {
      const saved = new Date(data.offlineCopyAt);
      const when = Number.isNaN(saved.getTime()) ? 'earlier' : `at ${clockTime(saved)}`;
      return `You appear to be offline. Showing stories saved ${when}; they may be out of date.`;
    }
    return `Checked ${clockTime(fetchedAt)} · ${data?.total ?? 'unknown'} stories from our current sources`;
  }

  // ---------------------------------------------------------------------------
  // Homepage: Latest reporting
  // ---------------------------------------------------------------------------
  async function renderLatest(list) {
    const status = document.getElementById('desk-updated');
    const limit = Number(list.dataset.limit) || 8;
    list.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'Loading latest reporting…';
    try {
      const data = await fetchJson(`/api/news?region=global&limit=${limit}&offset=0`);
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        list.replaceChildren(
          el(
            'li',
            { className: 'desk-state' },
            'Our current sources have no recent stories. That reflects source coverage, not a quiet world.'
          )
        );
      } else {
        list.replaceChildren(...items.map(item => storyItem(item)));
      }
      if (status) status.textContent = freshnessText(data, new Date());
      document.body.dataset.deskLatest = 'ready';
    } catch (error) {
      console.warn('GlobalDeets latest reporting unavailable:', error);
      list.replaceChildren(
        el(
          'li',
          {},
          failureNode(
            'Latest reporting could not be loaded right now. Publisher sites are unaffected.',
            () => renderLatest(list)
          )
        )
      );
      if (status) status.textContent = 'Latest reporting unavailable';
      document.body.dataset.deskLatest = 'error';
    } finally {
      list.removeAttribute('aria-busy');
    }
  }

  function renderDateline() {
    const node = document.getElementById('desk-date');
    if (!node) return;
    const now = new Date();
    // Both the machine-readable and visible date use the reader's local calendar date.
    node.setAttribute('datetime', dayKey(now));
    node.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // ---------------------------------------------------------------------------
  // timeline.html: publication-time view
  // ---------------------------------------------------------------------------
  function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  // Calendar arithmetic in the reader's local time zone. Subtracting 24h is wrong on the days
  // daylight-saving time starts or ends (23h / 25h local days).
  function previousLocalDay(date) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    copy.setDate(copy.getDate() - 1);
    return copy;
  }

  function dayLabel(date) {
    const now = new Date();
    const today = dayKey(now);
    const yesterday = dayKey(previousLocalDay(now));
    const key = dayKey(date);
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  async function renderTimeline(container) {
    const status = document.getElementById('timeline-status');
    const region = new URLSearchParams(location.search).get('region');
    const selected = REGIONS.includes(region) ? region : 'global';
    container.setAttribute('aria-busy', 'true');
    try {
      const data = await fetchJson(`/api/news?region=${encodeURIComponent(selected)}&limit=100&offset=0`);
      const items = (Array.isArray(data?.items) ? data.items : []).filter(item => item.published);
      const undated = (data?.items?.length || 0) - items.length;
      items.sort((a, b) => new Date(b.published) - new Date(a.published));

      const groups = new Map();
      for (const item of items) {
        const date = new Date(item.published);
        if (Number.isNaN(date.getTime())) continue;
        const key = dayKey(date);
        if (!groups.has(key)) groups.set(key, { date, items: [] });
        groups.get(key).items.push(item);
      }

      if (!groups.size) {
        container.replaceChildren(
          el('p', { className: 'desk-state' }, 'Our current sources have no dated stories to place on the timeline right now.')
        );
      } else {
        container.replaceChildren(
          ...[...groups.entries()].map(([key, group]) =>
            el(
              'section',
              { className: 'timeline-item', 'aria-labelledby': `day-${key}` },
              el('h2', { className: 'timeline-day', id: `day-${key}` }, dayLabel(group.date)),
              el(
                'ol',
                { className: 'desk-stories' },
                ...group.items.map(item => storyItem(item, { timeStyle: 'clock' }))
              )
            )
          )
        );
      }
      if (status) {
        const notes = [freshnessText(data, new Date())];
        if (undated > 0) notes.push(`${undated} undated ${undated === 1 ? 'story' : 'stories'} left off`);
        status.textContent = notes.join(' · ');
      }
      document.body.dataset.timeline = 'ready';
    } catch (error) {
      console.warn('GlobalDeets timeline unavailable:', error);
      container.replaceChildren(
        failureNode('The reporting timeline could not be loaded right now.', () => renderTimeline(container))
      );
      if (status) status.textContent = 'Timeline unavailable';
      document.body.dataset.timeline = 'error';
    } finally {
      container.removeAttribute('aria-busy');
    }
  }

  // ---------------------------------------------------------------------------
  // categories.html: browse by feed region and source
  // ---------------------------------------------------------------------------
  async function renderBrowse(container) {
    const sourceList = document.getElementById('browse-sources');
    const [coverage, sources] = await Promise.allSettled([
      fetchJson('/api/news/coverage'),
      fetchJson('/api/news/sources'),
    ]);

    const regionStats = new Map(
      (coverage.status === 'fulfilled' && Array.isArray(coverage.value?.regions)
        ? coverage.value.regions
        : []
      ).map(region => [region.region, region])
    );
    for (const card of container.querySelectorAll('[data-region]')) {
      const stats = regionStats.get(card.dataset.region);
      const count = card.querySelector('.browse-region-count');
      if (count && Number.isFinite(stats?.sourceCount)) {
        count.textContent = `${stats.sourceCount} source endpoint${stats.sourceCount === 1 ? '' : 's'} route here`;
      }
    }

    if (!sourceList) return;
    if (sources.status !== 'fulfilled') {
      sourceList.replaceChildren(
        el('li', {}, failureNode('The source list could not be loaded right now.', () => renderBrowse(container)))
      );
      return;
    }
    const entries = (Array.isArray(sources.value?.sources) ? sources.value.sources : [])
      .filter(source => source?.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    sourceList.replaceChildren(
      ...entries.map(source => {
        const about = safeUrl(Array.isArray(source.evidenceUrls) ? source.evidenceUrls[0] : null);
        const languages = Array.isArray(source.sourceLanguages) ? source.sourceLanguages : [];
        const facts = [
          source.organizationName && source.organizationName !== source.name ? source.organizationName : null,
          source.primaryCountry ? `Publisher based in ${source.primaryCountry}` : null,
          languages.length ? `Language: ${languages.map(lang => String(lang).toUpperCase()).join(', ')}` : null,
          source.sourceClass ? humanize(source.sourceClass) : null,
        ].filter(Boolean);
        return el(
          'li',
          { className: 'browse-source' },
          el('span', { className: 'browse-source-name' }, source.name),
          facts.length ? el('span', { className: 'browse-source-facts' }, facts.join(' · ')) : null,
          about
            ? el(
                'a',
                { className: 'browse-source-about', href: about, target: '_blank', rel: 'noopener noreferrer' },
                `About ${source.name}`,
                el('span', { className: 'visually-hidden' }, ' (publisher page, opens in a new tab)')
              )
            : null
        );
      })
    );
    document.body.dataset.browse = 'ready';
  }

  function init() {
    renderDateline();
    const latest = document.getElementById('desk-latest');
    if (latest) renderLatest(latest);
    const timeline = document.getElementById('timeline-items');
    if (timeline) renderTimeline(timeline);
    const browse = document.getElementById('browse-regions');
    if (browse) renderBrowse(browse);
  }

  window.GlobalDeetsDesk = { storyItem, REGION_LABELS };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* GD-054: live-only, exact article-pair evidence shared by both public readers. */
(() => {
  'use strict';
  const TYPES = new Set(['wire-attributed-version', 'declared-republication']);
  const HOSTS = Object.freeze({
    ap: ['apnews.com'], guardian: ['www.theguardian.com'],
    calmatters: ['calmatters.org'], 'minnesota-reformer': ['minnesotareformer.com'],
  });
  const NAMES = { ap: 'Associated Press', guardian: 'The Guardian',
    calmatters: 'CalMatters', 'minnesota-reformer': 'Minnesota Reformer' };
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }
  function endpoint(value) {
    if (!value || !Object.hasOwn(HOSTS, value.sourceId) || typeof value.url !== 'string' ||
        value.url.length > 2048) return false;
    try {
      const url = new URL(value.url);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
        !url.hash && url.pathname !== '/' && url.href === value.url && HOSTS[value.sourceId].includes(url.hostname);
    } catch { return false; }
  }
  function valid(data) {
    if (!data || data.schemaVersion !== 1 || data.scope !== 'reviewed-article-pairs-only' ||
        !text(data.sourceFingerprint, 120) || data.validation?.valid !== true ||
        !Array.isArray(data.records) || data.records.length > 1000) return false;
    const ids = new Set(), targets = new Set(), origins = new Set();
    for (const entry of data.records) {
      if (!entry || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id || '') || ids.has(entry.id) ||
          !TYPES.has(entry.relation) || !['active', 'withdrawn'].includes(entry.status) ||
          !text(entry.title, 180) || !text(entry.evidenceSummary, 600) ||
          !date(entry.publishedOn) || !date(entry.reviewedAt) || entry.reviewedAt < entry.publishedOn ||
          !endpoint(entry.origin) || !endpoint(entry.republication) ||
          entry.origin.sourceId === entry.republication.sourceId || entry.origin.url === entry.republication.url) return false;
      ids.add(entry.id);
      if (entry.status === 'withdrawn') {
        if (!date(entry.withdrawnAt) || entry.withdrawnAt < entry.reviewedAt || !text(entry.withdrawalReason, 600)) return false;
      } else {
        if (entry.withdrawnAt != null || entry.withdrawalReason != null || targets.has(entry.republication.url)) return false;
        origins.add(entry.origin.url);
        targets.add(entry.republication.url);
      }
    }
    return ![...origins].some(url => targets.has(url));
  }
  async function load() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/news/syndication', {
        cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' },
      });
      if (!response.ok || response.headers.has('X-GlobalDeets-Offline-Copy')) return null;
      const data = await response.json();
      return navigator.onLine !== false && valid(data) ? data : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  }
  function matches(data, item) {
    if (!data || !item) return [];
    return data.records.filter(entry => entry.status === 'active' &&
      [entry.origin, entry.republication].some(side => side.sourceId === item.sourceId && side.url === item.sourceUrl));
  }
  function node(tag, value, className) {
    const el = document.createElement(tag);
    if (value != null) el.textContent = value;
    if (className) el.className = className;
    return el;
  }
  function link(side, label) {
    const a = node('a', label + ': ' + NAMES[side.sourceId] + ' (opens in new tab)');
    a.href = side.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function renderRecord(entry) {
    const box = node('div', null, 'gd-distribution-record');
    box.dataset.recordId = entry.id;
    const withdrawn = entry.status === 'withdrawn';
    box.append(node('strong', (withdrawn ? 'Withdrawn record — ' : '') + entry.title));
    if (withdrawn) {
      box.append(node('p', 'Withdrawn ' + entry.withdrawnAt + ': ' + entry.withdrawalReason));
      return box;
    }
    box.append(node('p', entry.relation === 'wire-attributed-version' ? 'Wire-attributed version' : 'Publisher-declared republication'));
    const list = node('ul');
    for (const [side, label] of [[entry.origin, 'Attributed source report'], [entry.republication, 'Published version']]) {
      const li = node('li');
      li.append(link(side, label));
      list.append(li);
    }
    box.append(list, node('p', entry.evidenceSummary),
      node('small', 'Published ' + entry.publishedOn + ' · Evidence reviewed ' + entry.reviewedAt));
    return box;
  }
  const caveat = 'These records describe only the linked articles, not editorial coordination, independent corroboration, ownership, or permission for GlobalDeets to reuse content.';
  function renderArticle(data, item) {
    const records = matches(data, item);
    if (!records.length) return null;
    const details = node('details', null, 'news-origin-context news-distribution-context');
    details.append(node('summary', 'Documented article distribution'));
    const body = node('div', null, 'news-origin-context-body');
    for (const entry of records) body.append(renderRecord(entry));
    body.append(node('p', caveat, 'news-origin-caveat'));
    details.append(body);
    return details;
  }
  function renderPublisher(data, sourceId) {
    const section = node('section', null, 'sn-reviewed-links sn-distribution');
    section.append(node('h4', 'Documented article distribution'));
    if (!data) {
      section.append(node('p', 'Current distribution evidence is unavailable. No article distribution relationship is asserted.'));
      return section;
    }
    const entries = data.records.filter(entry => [entry.origin.sourceId, entry.republication.sourceId].includes(sourceId));
    if (!entries.length) {
      section.append(node('p', 'No reviewed article pairs are recorded for this publisher. This is not evidence that it has no distribution relationships.'));
    } else {
      for (const entry of entries) section.append(renderRecord(entry));
    }
    section.append(node('p', caveat, 'sn-footnote'));
    return section;
  }
  window.GDDistribution = { load, matches, renderArticle, renderPublisher };
})();

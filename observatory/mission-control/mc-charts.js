/**
 * Mission Control charts (GD-031): small, dependency-free SVG/HTML builders.
 *
 * Every builder draws only what the governed contracts hand it, states its unit, and returns a node with its own
 * accessible name and a "view as table" alternative. Colors come from CSS variables (dark default, print override);
 * meaning is never carried by color alone (labels, counts and glyphs accompany every mark).
 */
(() => {
  'use strict';

  const model = window.MissionControlModel;
  const SVG = 'http://www.w3.org/2000/svg';

  function el(tag, className, children, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [key, value] of Object.entries(attrs || {})) if (value != null) node.setAttribute(key, value);
    for (const child of [].concat(children == null ? [] : children)) if (child !== null && child !== undefined && child !== false) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  }

  function svg(tag, attrs, children) {
    const node = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
    for (const child of [].concat(children == null ? [] : children)) if (child !== null && child !== undefined && child !== false) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  }

  // ── Tooltip (event delegation; keyboard focus works too) ─────────────────────────────────────
  let tip = null;
  function ensureTip() {
    if (!tip) {
      tip = el('div', 'mc-tooltip', [], { role: 'tooltip', hidden: '' });
      document.body.append(tip);
    }
    return tip;
  }
  function showTip(target, x, y) {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    const node = ensureTip();
    node.textContent = text;
    node.hidden = false;
    const box = node.getBoundingClientRect();
    node.style.left = Math.max(8, Math.min(window.innerWidth - box.width - 8, x + 12)) + 'px';
    node.style.top = Math.max(8, y - box.height - 12 < 8 ? y + 18 : y - box.height - 12) + 'px';
  }
  function hideTip() {
    if (tip) tip.hidden = true;
  }
  document.addEventListener('pointerover', event => {
    const target = event.target.closest && event.target.closest('[data-tip]');
    if (target) showTip(target, event.clientX, event.clientY);
  });
  document.addEventListener('pointermove', event => {
    if (tip && !tip.hidden) {
      const target = event.target.closest && event.target.closest('[data-tip]');
      if (target) showTip(target, event.clientX, event.clientY);
    }
  });
  document.addEventListener('pointerout', event => {
    if (event.target.closest && event.target.closest('[data-tip]')) hideTip();
  });
  document.addEventListener('focusin', event => {
    const target = event.target.closest && event.target.closest('[data-tip]');
    if (target) {
      const box = target.getBoundingClientRect();
      showTip(target, box.left + box.width / 2, box.top);
    }
  });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideTip();
  });

  // ── Table alternative ────────────────────────────────────────────────────────────────────────
  function tableView(caption, headers, rows) {
    const table = el('table', 'mc-table-alt');
    table.append(el('caption', 'sr-only', [caption]));
    table.append(el('thead', '', [el('tr', '', headers.map(header => el('th', '', [header], { scope: 'col' })))]));
    table.append(el('tbody', '', rows.map(row => el('tr', '', row.map((cell, index) => el(index ? 'td' : 'th', '', [cell], index ? null : { scope: 'row' }))))));
    return el('details', 'chart-table', [el('summary', '', ['View as table']), el('div', 'chart-table-scroll', [table])]);
  }

  // ── Segment bar: a whole split into named parts ──────────────────────────────────────────────
  function segmentBar(data, options) {
    const opts = options || {};
    const total = data.total || data.segments.reduce((sum, item) => sum + item.count, 0);
    const track = el('div', 'segbar', [], { role: 'img', 'aria-label': opts.ariaLabel || 'Composition' });
    for (const segment of data.segments) {
      if (!segment.count) continue;
      track.append(el('span', 'seg tone-' + segment.tone, [segment.count > 1 || total < 12 ? String(segment.count) : ''], { style: 'flex:' + segment.count + ' 1 0', 'data-tip': segment.label + ': ' + segment.count + ' of ' + total + (segment.properties && segment.properties.length ? ' (' + segment.properties.slice(0, 8).join(', ') + (segment.properties.length > 8 ? ', …' : '') + ')' : ''), tabindex: '0' }));
    }
    const legend = el('ul', 'seg-legend');
    for (const segment of data.segments) {
      const names = segment.count && segment.count <= 12 ? (segment.properties || []).join(', ') : '';
      legend.append(el('li', segment.count ? '' : 'is-zero', [el('span', 'swatch tone-' + segment.tone, [], { 'aria-hidden': 'true' }), el('span', 'seg-label', [segment.label]), el('strong', '', [String(segment.count)]), names ? el('span', 'seg-props', [names]) : null]));
    }
    const wrap = el('div', 'segment-chart', [track, legend]);
    wrap.append(tableView(opts.ariaLabel || 'Composition', ['Segment', 'Count', 'Properties'], data.segments.map(segment => [segment.label, String(segment.count), (segment.properties || []).join(', ') || 'none'])));
    return wrap;
  }

  // ── Horizontal bars: magnitude by property ───────────────────────────────────────────────────
  function barList(bars, options) {
    const opts = options || {};
    const limit = opts.limit || 10;
    const shown = bars.slice(0, limit);
    const rest = bars.slice(limit);
    const max = Math.max(1, ...bars.map(bar => bar.value));
    const list = el('ol', 'barlist', [], { 'aria-label': opts.ariaLabel || 'Contribution by property' });
    for (const bar of shown) {
      const width = Math.max(bar.value > 0 ? 0.8 : 0, (bar.value / max) * 100);
      list.append(el('li', 'bar-row', [
        el('span', 'bar-name', [bar.name]),
        el('span', 'bar-track', [el('span', 'bar-fill', [], { style: 'width:' + width + '%' })], { 'data-tip': bar.name + ': ' + model.formatNumber(bar.value) + ' ' + (opts.unit || '') + (bar.sharePct != null ? ' (' + bar.sharePct + '%)' : ''), tabindex: '0' }),
        el('span', 'bar-value', [model.formatCompact(bar.value), bar.sharePct != null ? el('small', '', [' ' + model.formatPct(bar.sharePct)]) : '']),
      ]));
    }
    if (rest.length) {
      const sum = rest.reduce((total, bar) => total + bar.value, 0);
      list.append(el('li', 'bar-row is-rest', [el('span', 'bar-name', ['Other ' + rest.length + ' properties']), el('span', 'bar-track', [el('span', 'bar-fill', [], { style: 'width:' + (sum / max) * 100 + '%' })]), el('span', 'bar-value', [model.formatCompact(sum)])]));
    }
    const wrap = el('div', 'bars-chart', [list]);
    wrap.append(tableView(opts.ariaLabel || 'Contribution by property', ['Property', opts.unit || 'Value', 'Share'], bars.map(bar => [bar.name, model.formatNumber(bar.value), bar.sharePct != null ? model.formatPct(bar.sharePct) : 'n/a'])));
    return wrap;
  }

  // ── Diverging bars: change, signed ───────────────────────────────────────────────────────────
  function divergingBars(entries, options) {
    const opts = options || {};
    const max = Math.max(1, ...entries.map(entry => Math.abs(entry.pct)));
    const list = el('ol', 'divlist', [], { 'aria-label': opts.ariaLabel || 'Change by property' });
    for (const entry of entries) {
      const width = (Math.abs(entry.pct) / max) * 50;
      const positive = entry.pct >= 0;
      list.append(el('li', 'div-row', [
        el('span', 'bar-name', [entry.name]),
        el('span', 'div-track', [el('span', 'div-fill ' + (positive ? 'is-up' : 'is-down'), [], { style: 'width:' + width + '%;' + (positive ? 'left:50%' : 'right:50%') })], { 'data-tip': entry.name + ': ' + model.formatPct(entry.pct, true) + ' (' + (entry.absoluteDelta > 0 ? '+' : '') + model.formatNumber(entry.absoluteDelta) + ' requests)', tabindex: '0' }),
        el('span', 'bar-value', [(positive ? '▲ ' : '▼ ') + model.formatPct(entry.pct, true)]),
      ]));
    }
    const wrap = el('div', 'bars-chart', [list]);
    wrap.append(tableView(opts.ariaLabel || 'Change by property', ['Property', 'Change', 'Requests'], entries.map(entry => [entry.name, model.formatPct(entry.pct, true), (entry.absoluteDelta > 0 ? '+' : '') + model.formatNumber(entry.absoluteDelta)])));
    return wrap;
  }

  // ── Line chart: gaps are gaps ───────────────────────────────────────────────────────────────
  function lineChart(points, options) {
    const opts = options || {};
    const W = 640;
    const H = 220;
    const pad = { left: 52, right: 14, top: 14, bottom: 30 };
    const dayMs = 86400000;
    const times = points.map(point => Date.parse(point.date));
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const values = points.map(point => point.value);
    const minV = Math.min(0, ...values);
    const maxV = Math.max(1, ...values) * 1.08;
    const x = t => pad.left + ((t - minT) / Math.max(1, maxT - minT)) * (W - pad.left - pad.right);
    const y = v => H - pad.bottom - ((v - minV) / (maxV - minV)) * (H - pad.top - pad.bottom);
    const root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'linechart', role: 'img', 'aria-label': opts.ariaLabel || 'Trend' });
    for (let index = 0; index <= 3; index += 1) {
      const value = minV + ((maxV - minV) * index) / 3;
      const py = y(value);
      root.append(svg('line', { x1: pad.left, x2: W - pad.right, y1: py, y2: py, class: 'grid' }));
      root.append(svg('text', { x: pad.left - 8, y: py + 4, class: 'axis', 'text-anchor': 'end' }, [model.formatCompact(Math.round(value))]));
    }
    const ticks = Math.min(5, points.length);
    for (let index = 0; index < ticks; index += 1) {
      const point = points[Math.round((index * (points.length - 1)) / Math.max(1, ticks - 1))];
      root.append(svg('text', { x: x(Date.parse(point.date)), y: H - 8, class: 'axis', 'text-anchor': index === 0 ? 'start' : index === ticks - 1 ? 'end' : 'middle' }, [model.formatDay(point.date)]));
    }
    // Segments break at gaps (a missing day is never bridged).
    const segments = [];
    let current = [];
    points.forEach((point, index) => {
      if (index && Date.parse(point.date) - Date.parse(points[index - 1].date) > 1.5 * dayMs) {
        segments.push(current);
        current = [];
      }
      current.push(point);
    });
    segments.push(current);
    for (const segment of segments) {
      if (segment.length > 1) root.append(svg('path', { d: segment.map((point, index) => (index ? 'L' : 'M') + x(Date.parse(point.date)).toFixed(1) + ' ' + y(point.value).toFixed(1)).join(' '), class: 'line' }));
    }
    for (const point of points) {
      root.append(svg('circle', { cx: x(Date.parse(point.date)).toFixed(1), cy: y(point.value).toFixed(1), r: 4, class: 'dot', tabindex: '0', 'data-tip': model.formatDay(point.date) + ': ' + model.formatNumber(point.value) + ' ' + (opts.unit || ''), 'aria-label': model.formatDay(point.date) + ' ' + model.formatNumber(point.value) }));
    }
    const wrap = el('div', 'line-chart', [root]);
    wrap.append(tableView(opts.ariaLabel || 'Trend', ['Date', opts.unit || 'Value'], points.map(point => [point.date, model.formatNumber(point.value)])));
    return wrap;
  }

  // ── Coverage row ─────────────────────────────────────────────────────────────────────────────
  function coverageRow(row) {
    const pct = row.pct == null ? 0 : row.pct;
    const label = row.denominator ? row.numerator + ' of ' + row.denominator : 'n/a';
    return el('li', 'coverage-row is-' + row.state, [
      el('div', 'coverage-head', [el('span', 'coverage-label', [row.label]), el('strong', '', [label + (row.pct != null ? ' · ' + model.formatPct(row.pct) : '')])]),
      el('div', 'coverage-track', [el('span', 'coverage-fill', [], { style: 'width:' + pct + '%' })], { role: 'img', 'aria-label': row.label + ': ' + label }),
      el('p', 'coverage-q', [row.decision]),
    ], { 'data-tip': row.detail });
  }

  // ── Knowledge matrix ─────────────────────────────────────────────────────────────────────────
  const GLYPH = { known: '●', partial: '◐', unknown: '○', na: '–', issue: '▲' };
  const STATE_NAME = { known: 'Known', partial: 'Partly known', unknown: 'Unknown', na: 'Not applicable', issue: 'Needs attention' };
  function knowledgeMatrix(matrix) {
    const table = el('table', 'matrix');
    table.append(el('caption', 'sr-only', ['What is known about each property']));
    table.append(el('thead', '', [el('tr', '', [el('th', '', ['Property'], { scope: 'col' }), ...matrix.columns.map(column => el('th', '', [column.label], { scope: 'col' }))])]));
    const body = el('tbody');
    for (const row of matrix.rows) {
      body.append(el('tr', '', [el('th', '', [row.name], { scope: 'row' }), ...row.cells.map(cell => el('td', 'cell-' + cell.state, [el('span', 'glyph', [GLYPH[cell.state]], { 'aria-hidden': 'true' }), el('span', 'sr-only', [STATE_NAME[cell.state] + ': ' + cell.label])], { 'data-tip': row.name + ' · ' + cell.label, tabindex: '0' }))]));
    }
    table.append(body);
    const legend = el('ul', 'matrix-legend', Object.keys(GLYPH).map(key => el('li', 'cell-' + key, [el('span', 'glyph', [GLYPH[key]], { 'aria-hidden': 'true' }), ' ' + STATE_NAME[key]])));
    return el('div', 'matrix-wrap', [el('div', 'matrix-scroll', [table]), legend]);
  }

  window.MissionControlCharts = { el, svg, segmentBar, barList, divergingBars, lineChart, coverageRow, knowledgeMatrix, tableView, GLYPH };
})();

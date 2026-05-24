#!/usr/bin/env node
/**
 * GlobalDeets Production Health Check
 * Usage:  node health-prod.js [--json] [--base=https://globaldeets.com]
 *
 * Exits 0 = all green, 1 = one or more failures.
 */

const BASE = (() => {
  const arg = process.argv.find(a => a.startsWith('--base='));
  return arg ? arg.slice(7).replace(/\/$/, '') : 'https://globaldeets.com';
})();

const JSON_OUT = process.argv.includes('--json');

// ── Routes to probe ──────────────────────────────────────────────────────────
const ROUTES = [
  { path: '/',               label: 'Home',              expect: 200, type: 'text/html' },
  { path: '/news.html',      label: 'News',              expect: 200, type: 'text/html' },
  { path: '/globe.html',     label: 'Globe',             expect: 200, type: 'text/html' },
  { path: '/about.html',     label: 'About',             expect: 200, type: 'text/html' },
  { path: '/spheres.html',   label: 'Spheres',           expect: 200, type: 'text/html' },
  { path: '/knowledge.html', label: 'Knowledge',         expect: 200, type: 'text/html' },
  { path: '/worldmap.html',  label: 'World Map',         expect: 200, type: 'text/html' },
  { path: '/timeline.html',  label: 'Timeline',          expect: 200, type: 'text/html' },
  { path: '/categories.html',label: 'Categories',        expect: 200, type: 'text/html' },
  { path: '/contact.html',   label: 'Contact',           expect: 200, type: 'text/html' },
  { path: '/donate.html',    label: 'Donate',            expect: 200, type: 'text/html' },
  { path: '/manifest.json',  label: 'PWA Manifest',      expect: 200, type: 'application/json' },
  { path: '/sitemap.xml',    label: 'Sitemap',           expect: 200, type: 'application/xml' },
  { path: '/robots.txt',     label: 'Robots.txt',        expect: 200, type: 'text/plain' },
  { path: '/offline.html',   label: 'Offline fallback',  expect: 200, type: 'text/html' },
  // API
  {
    path: '/api/news?region=global&limit=5',
    label: 'API /news global',
    expect: 200,
    type: 'application/json',
    apiChecks: { hasTotal: true, minItems: 1 },
  },
  {
    path: '/api/news?region=africa&limit=5',
    label: 'API /news africa',
    expect: 200,
    type: 'application/json',
    apiChecks: { hasTotal: true, minItems: 0 },
  },
  {
    path: '/api/news?region=europe&limit=5',
    label: 'API /news europe (Ukraine)',
    expect: 200,
    type: 'application/json',
    apiChecks: { hasTotal: true, minItems: 0 },
  },
];

// ── Security headers that must be present ────────────────────────────────────
const REQUIRED_HEADERS = [
  'x-frame-options',
  'x-content-type-options',
  'strict-transport-security',
  'referrer-policy',
  'content-security-policy',
];

// ── Colours (skip when not a TTY) ────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const C = {
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:    s => isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function pass(label) { return { label, ok: true }; }
function fail(label, reason) { return { label, ok: false, reason }; }

async function probeRoute(route) {
  const url = `${BASE}${route.path}`;
  const results = [];
  let status, headers, body;

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'GlobalDeets-HealthCheck/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    status  = res.status;
    headers = res.headers;
    body    = await res.text();
  } catch (err) {
    return [fail(`${route.label} — fetch`, err.message)];
  }

  // Status code
  if (status === route.expect) {
    results.push(pass(`${route.label} — HTTP ${status}`));
  } else {
    results.push(fail(`${route.label} — HTTP ${status}`, `expected ${route.expect}`));
  }

  // Content-Type
  const ct = headers.get('content-type') || '';
  if (ct.includes(route.type)) {
    results.push(pass(`${route.label} — content-type`));
  } else {
    results.push(fail(`${route.label} — content-type`, `got "${ct}", expected "${route.type}"`));
  }

  // API-specific checks
  if (route.apiChecks && ct.includes('application/json')) {
    try {
      const json = JSON.parse(body);
      if (route.apiChecks.hasTotal) {
        typeof json.total === 'number'
          ? results.push(pass(`${route.label} — json.total present (${json.total})`))
          : results.push(fail(`${route.label} — json.total`, 'field missing'));
      }
      if (route.apiChecks.minItems > 0) {
        const count = Array.isArray(json.items) ? json.items.length : 0;
        count >= route.apiChecks.minItems
          ? results.push(pass(`${route.label} — items ≥ ${route.apiChecks.minItems} (got ${count})`))
          : results.push(fail(`${route.label} — items`, `got ${count}, need ≥ ${route.apiChecks.minItems}`));
      }
    } catch (e) {
      results.push(fail(`${route.label} — JSON parse`, e.message));
    }
  }

  return results;
}

async function probeHeaders() {
  const url = BASE;
  let headers;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GlobalDeets-HealthCheck/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    headers = res.headers;
  } catch (err) {
    return [fail('Security headers fetch', err.message)];
  }

  return REQUIRED_HEADERS.map(h =>
    headers.has(h)
      ? pass(`Security header: ${h}`)
      : fail(`Security header: ${h}`, 'missing')
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const start = Date.now();

  if (!JSON_OUT) {
    console.log(C.bold(`\nGlobalDeets Production Health Check`));
    console.log(C.dim(`Target: ${BASE}\n`));
  }

  // Run all probes concurrently
  const [headerResults, ...routeResults] = await Promise.all([
    probeHeaders(),
    ...ROUTES.map(r => probeRoute(r)),
  ]);

  const all = [...headerResults, ...routeResults.flat()];
  const passed = all.filter(r => r.ok);
  const failed = all.filter(r => !r.ok);

  if (!JSON_OUT) {
    const WIDTH = 60;
    for (const r of all) {
      const icon   = r.ok ? C.green('✓') : C.red('✗');
      const label  = r.ok ? C.green(r.label) : C.red(r.label);
      const reason = r.ok ? '' : C.dim(` → ${r.reason}`);
      console.log(`  ${icon}  ${label}${reason}`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log('\n' + '─'.repeat(WIDTH));
    console.log(
      `  ${C.bold('Results:')}  ` +
      C.green(`${passed.length} passed`) + `  ` +
      (failed.length ? C.red(`${failed.length} failed`) : C.dim('0 failed')) +
      C.dim(`  (${elapsed}s)`)
    );

    if (failed.length) {
      console.log(C.red(`\n  ⚠  ${failed.length} check(s) failed — see above.\n`));
    } else {
      console.log(C.green(`\n  All checks passed.\n`));
    }
  } else {
    const report = {
      ts:     new Date().toISOString(),
      base:   BASE,
      passed: passed.length,
      failed: failed.length,
      checks: all.map(r => ({ ok: r.ok, label: r.label, reason: r.reason || null })),
    };
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(failed.length ? 1 : 0);
})();

#!/usr/bin/env node
/**
 * GlobalDeets Production Health Check
 * Usage:  node health-prod.js [--json] [--base=https://globaldeets.com]
 *         [--expected-commit=<sha>] [--deploy-meta-max-age-hours=720]
 *         [--skip-security-headers] [--skip-active-copy] [--metadata-only]
 *
 * Exits 0 = all green, 1 = one or more failures.
 */

const { execFileSync } = require('child_process');

function getArgValue(name) {
  const arg = process.argv.find(a => a.startsWith(name));
  return arg ? arg.slice(name.length) : null;
}

function git(args, fallback = null) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

const BASE = (getArgValue('--base=') || 'https://globaldeets.com').replace(/\/$/, '');

const JSON_OUT = process.argv.includes('--json');
const SKIP_SECURITY_HEADERS = process.argv.includes('--skip-security-headers');
const SKIP_ACTIVE_COPY = process.argv.includes('--skip-active-copy');
const METADATA_ONLY = process.argv.includes('--metadata-only');
const EXPECTED_COMMIT =
  getArgValue('--expected-commit=') ||
  process.env.EXPECTED_COMMIT ||
  process.env.CF_PAGES_COMMIT_SHA ||
  git(['rev-parse', 'HEAD']);
const DEPLOY_META_MAX_AGE_HOURS = Number(
  getArgValue('--deploy-meta-max-age-hours=') || process.env.DEPLOY_META_MAX_AGE_HOURS || 720
);

// ── Routes to probe ──────────────────────────────────────────────────────────
const ROUTES = [
  { path: '/', label: 'Home', expect: 200, type: 'text/html' },
  { path: '/news.html', label: 'News', expect: 200, type: 'text/html' },
  { path: '/globe.html', label: 'Globe', expect: 200, type: 'text/html' },
  { path: '/about.html', label: 'About', expect: 200, type: 'text/html' },
  { path: '/spheres.html', label: 'Spheres', expect: 200, type: 'text/html' },
  { path: '/knowledge.html', label: 'Knowledge', expect: 200, type: 'text/html' },
  { path: '/worldmap.html', label: 'World Map', expect: 200, type: 'text/html' },
  { path: '/timeline.html', label: 'Timeline', expect: 200, type: 'text/html' },
  { path: '/categories.html', label: 'Categories', expect: 200, type: 'text/html' },
  { path: '/contact.html', label: 'Contact', expect: 200, type: 'text/html' },
  { path: '/donate.html', label: 'Donate', expect: 200, type: 'text/html' },
  { path: '/manifest.json', label: 'PWA Manifest', expect: 200, type: 'application/json' },
  {
    path: '/deploy-meta.json',
    label: 'Deploy metadata',
    expect: 200,
    type: 'application/json',
    apiChecks: { deployMetadata: true },
  },
  {
    path: '/api/deploy',
    label: 'API /deploy metadata',
    expect: 200,
    type: 'application/json',
    apiChecks: { deployMetadata: true },
  },
  { path: '/sitemap.xml', label: 'Sitemap', expect: 200, type: 'application/xml' },
  { path: '/robots.txt', label: 'Robots.txt', expect: 200, type: 'text/plain' },
  { path: '/offline.html', label: 'Offline fallback', expect: 200, type: 'text/html' },
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
  {
    path: '/api/news/health',
    label: 'API /news health',
    expect: 200,
    type: 'application/json',
    apiChecks: { hasSourceHealth: true },
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

const FORBIDDEN_ACTIVE_COPY = [
  { label: 'legacy Data Platform Showcase copy', pattern: /Data Platform Showcase/i },
  { label: 'legacy AI Animate spelling', pattern: /AI Animate/i },
  { label: 'legacy Good Vibes shorthand', pattern: /\bGood Vibes\b/i },
  { label: 'legacy CultureSherpa spelling', pattern: /CultureSherpa/ },
  { label: 'portfolio-era structured data', pattern: /CreativeWork Portfolio|Premium Portfolio/i },
];

// ── Colours (skip when not a TTY) ────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const C = {
  green: s => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  red: s => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: s => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  bold: s => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  dim: s => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function pass(label) {
  return { label, ok: true };
}
function fail(label, reason) {
  return { label, ok: false, reason };
}

function validateDeployMetadata(json, label) {
  const results = [];
  const requiredStringFields = [
    'app',
    'environment',
    'branch',
    'commit',
    'shortCommit',
    'generatedAt',
  ];

  for (const field of requiredStringFields) {
    if (typeof json[field] === 'string' && json[field].trim()) {
      results.push(pass(`${label} — ${field} present`));
    } else {
      results.push(fail(`${label} — ${field}`, 'field missing'));
    }
  }

  if (typeof json.app === 'string') {
    json.app === 'GlobalDeets'
      ? results.push(pass(`${label} — app name`))
      : results.push(fail(`${label} — app name`, `got "${json.app}"`));
  }

  if (typeof json.commit === 'string' && json.commit.trim()) {
    const commit = json.commit.trim();
    if (/^[a-f0-9]{7,40}$/i.test(commit) && commit !== 'unknown') {
      results.push(pass(`${label} — commit SHA (${json.shortCommit || commit.slice(0, 12)})`));
    } else {
      results.push(fail(`${label} — commit SHA`, `invalid value "${commit}"`));
    }

    if (EXPECTED_COMMIT && EXPECTED_COMMIT !== 'unknown') {
      const expected = EXPECTED_COMMIT.trim();
      if (commit.startsWith(expected) || expected.startsWith(commit)) {
        results.push(pass(`${label} — commit matches expected ${expected.slice(0, 12)}`));
      } else {
        results.push(
          fail(
            `${label} — commit matches expected`,
            `got ${commit.slice(0, 12)}, expected ${expected.slice(0, 12)}`
          )
        );
      }
    }
  }

  if (typeof json.shortCommit === 'string' && typeof json.commit === 'string') {
    json.commit.startsWith(json.shortCommit)
      ? results.push(pass(`${label} — shortCommit matches commit`))
      : results.push(fail(`${label} — shortCommit`, 'does not match commit prefix'));
  }

  if (typeof json.generatedAt === 'string' && json.generatedAt.trim()) {
    const generatedAtMs = Date.parse(json.generatedAt);
    if (Number.isNaN(generatedAtMs)) {
      results.push(fail(`${label} — generatedAt`, `invalid timestamp "${json.generatedAt}"`));
    } else {
      const ageHours = (Date.now() - generatedAtMs) / 3_600_000;
      const maxAgeHours = Number.isFinite(DEPLOY_META_MAX_AGE_HOURS)
        ? DEPLOY_META_MAX_AGE_HOURS
        : 720;

      results.push(pass(`${label} — generatedAt parseable`));

      if (ageHours < -0.1) {
        results.push(fail(`${label} — generatedAt freshness`, 'timestamp is in the future'));
      } else if (ageHours <= maxAgeHours) {
        results.push(pass(`${label} — generatedAt fresh (${ageHours.toFixed(1)}h old)`));
      } else {
        results.push(
          fail(`${label} — generatedAt fresh`, `${ageHours.toFixed(1)}h old, max ${maxAgeHours}h`)
        );
      }
    }
  }

  return results;
}

async function probeRoute(route) {
  const url = `${BASE}${route.path}`;
  const results = [];
  let status, headers, body;

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'GlobalDeets-HealthCheck/1.0',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: AbortSignal.timeout(12_000),
    });
    status = res.status;
    headers = res.headers;
    body = await res.text();
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
      if (route.apiChecks.deployMetadata) {
        results.push(...validateDeployMetadata(json, route.label));
      }
      if (route.apiChecks.hasSourceHealth) {
        Array.isArray(json.sourceHealth)
          ? results.push(
              pass(`${route.label} — sourceHealth present (${json.sourceHealth.length})`)
            )
          : results.push(fail(`${route.label} — sourceHealth`, 'field missing'));
      }
      if (route.apiChecks.minItems > 0) {
        const count = Array.isArray(json.items) ? json.items.length : 0;
        count >= route.apiChecks.minItems
          ? results.push(
              pass(`${route.label} — items ≥ ${route.apiChecks.minItems} (got ${count})`)
            )
          : results.push(
              fail(`${route.label} — items`, `got ${count}, need ≥ ${route.apiChecks.minItems}`)
            );
      }
    } catch (e) {
      results.push(fail(`${route.label} — JSON parse`, e.message));
    }
  }

  if (!SKIP_ACTIVE_COPY && route.type === 'text/html' && ct.includes('text/html')) {
    for (const rule of FORBIDDEN_ACTIVE_COPY) {
      if (rule.pattern.test(body)) {
        results.push(fail(`${route.label} — active copy`, `contains ${rule.label}`));
      }
    }
  }

  return results;
}

async function probeHeaders() {
  const url = BASE;
  let headers;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GlobalDeets-HealthCheck/1.0',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: AbortSignal.timeout(12_000),
    });
    headers = res.headers;
  } catch (err) {
    return [fail('Security headers fetch', err.message)];
  }

  return REQUIRED_HEADERS.map(h =>
    headers.has(h) ? pass(`Security header: ${h}`) : fail(`Security header: ${h}`, 'missing')
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
  const routesToProbe = METADATA_ONLY
    ? ROUTES.filter(route => route.path === '/deploy-meta.json')
    : ROUTES;
  const headerProbe =
    SKIP_SECURITY_HEADERS || METADATA_ONLY
      ? Promise.resolve([pass('Security headers skipped')])
      : probeHeaders();

  const [headerResults, ...routeResults] = await Promise.all([
    headerProbe,
    ...routesToProbe.map(r => probeRoute(r)),
  ]);

  const all = [...headerResults, ...routeResults.flat()];
  const passed = all.filter(r => r.ok);
  const failed = all.filter(r => !r.ok);

  if (!JSON_OUT) {
    const WIDTH = 60;
    for (const r of all) {
      const icon = r.ok ? C.green('✓') : C.red('✗');
      const label = r.ok ? C.green(r.label) : C.red(r.label);
      const reason = r.ok ? '' : C.dim(` → ${r.reason}`);
      console.log(`  ${icon}  ${label}${reason}`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log('\n' + '─'.repeat(WIDTH));
    console.log(
      `  ${C.bold('Results:')}  ` +
        C.green(`${passed.length} passed`) +
        `  ` +
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
      ts: new Date().toISOString(),
      base: BASE,
      passed: passed.length,
      failed: failed.length,
      checks: all.map(r => ({ ok: r.ok, label: r.label, reason: r.reason || null })),
    };
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(failed.length ? 1 : 0);
})();

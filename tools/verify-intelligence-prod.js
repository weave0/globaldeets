#!/usr/bin/env node

function getArgValue(name) {
  const arg = process.argv.find(value => value.startsWith(name));
  return arg ? arg.slice(name.length) : null;
}

const BASE = (getArgValue('--base=') || 'https://globaldeets.com').replace(/\/$/, '');
const TIMEOUT_MS = 12_000;

async function fetchJson(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      'User-Agent': 'GlobalDeets-IntelligenceVerifier/1.0',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status !== 200) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`${path} returned unexpected content-type ${contentType}`);
  }

  return response.json();
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const [coverage, sources] = await Promise.all([
    fetchJson('/api/news/coverage'),
    fetchJson('/api/news/sources'),
  ]);

  requireCondition(typeof coverage.sourceFingerprint === 'string', 'coverage fingerprint missing');
  requireCondition(typeof sources.sourceFingerprint === 'string', 'sources fingerprint missing');
  requireCondition(
    coverage.sourceFingerprint === sources.sourceFingerprint,
    'coverage and source provenance fingerprints disagree'
  );
  requireCondition(coverage.provenance?.valid === true, 'coverage provenance validation failed');
  requireCondition(sources.validation?.valid === true, 'source registry validation failed');
  requireCondition(Number.isInteger(coverage.totalSources), 'coverage totalSources missing');
  requireCondition(Number.isInteger(sources.totalSources), 'sources totalSources missing');
  requireCondition(Array.isArray(sources.sources), 'sources array missing');
  requireCondition(Array.isArray(coverage.gaps), 'coverage gaps array missing');
  requireCondition(
    coverage.totalSources === sources.totalSources && sources.totalSources === sources.sources.length,
    'source counts disagree across intelligence APIs'
  );
  requireCondition(
    sources.sources.every(source =>
      Array.isArray(source.evidenceUrls) && source.evidenceUrls.length > 0
    ),
    'one or more source provenance records lack evidence URLs'
  );

  console.log(
    `Intelligence APIs certified: ${sources.totalSources} sources, ${coverage.gaps.length} active coverage gaps, fingerprint ${coverage.sourceFingerprint}`
  );
})().catch(error => {
  console.error(`Intelligence API verification failed: ${error.message}`);
  process.exit(1);
});

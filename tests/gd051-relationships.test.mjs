import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Cloudflare Functions are ESM; the test root intentionally remains CommonJS.
const root = mkdtempSync(join(tmpdir(), 'gd051-'));
const dir = join(root, 'functions');
writeFileSync(join(root, 'package.json'), '{"type":"module"}');
for (const file of ['api/news.js', 'lib/story-membership.js', 'lib/news-source-provenance.js',
                    'lib/source-ownership-evidence.js', 'api/news/relationships.js']) {
  const dest = join(dir, file);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(fileURLToPath(new URL('../functions/' + file, import.meta.url)), dest);
}
writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
copyFileSync(
  fileURLToPath(new URL('../functions/lib/article-origin-trace.js', import.meta.url)),
  join(dir, 'lib', 'article-origin-trace.js')
);

const model = await import(pathToFileURL(join(dir, 'lib/source-ownership-evidence.js')).href);
const api = await import(pathToFileURL(join(dir, 'api/news/relationships.js')).href);

test('reviewed graph is validated and served through the public boundary', async () => {
  assert.deepEqual(model.validateOwnershipEvidence(), { valid: true, errors: [] });
  const response = await api.onRequestGet();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.validation.valid, true);
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.monitoredSources, 21);
  assert.equal(data.edges.length, 6);
  assert.ok(data.edges.every(edge => edge.evidence.every(ref => ref.url.startsWith('https://'))));
  assert.ok(!data.edges.some(edge => /bias|coordination|influence score/i.test(edge.summary)));
});

test('unknown sources, duplicate IDs and unsupported evidence fail validation', () => {
  const base = model.OWNERSHIP_EDGES;
  assert.equal(model.validateOwnershipEvidence(undefined, undefined, [...base,
    { ...base[0], id: 'invented-source', fromSourceId: 'invented' }
  ]).valid, false);
  assert.equal(model.validateOwnershipEvidence(undefined, undefined, [...base, base[0]]).valid, false);
  assert.equal(model.validateOwnershipEvidence(undefined, undefined, [
    { ...base[0], evidence: [{ title: 'bad', url: 'javascript:alert(1)' }] }, ...base.slice(1),
  ]).valid, false);
});

test('cyclic entity graph is rejected', () => {
  const edges = [...model.OWNERSHIP_EDGES, {
    id: 'cycle-test',
    fromEntityId: 'scott-trust-limited',
    toEntityId: 'guardian-news-media',
    relation: 'owned-by',
    summary: 'Deliberately invalid cycle.',
    reviewedAt: '2026-11-19',
    evidence: [{ title: 'Example only', url: 'https://example.org/' }],
  }];
  assert.ok(model.validateOwnershipEvidence(undefined, undefined, edges).errors.includes('cyclic-entity-relationships'));
});

test('unreviewed research publisher never acquires an edge', () => {
  assert.equal(model.OWNERSHIP_EDGES.some(edge => edge.fromSourceId === 'agencia-brasil'), false);
  assert.equal(model.OWNERSHIP_EDGES.some(edge => !edge.reviewedAt || !edge.evidence.length), false);
});

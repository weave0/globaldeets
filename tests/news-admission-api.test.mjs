import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = mkdtempSync(join(tmpdir(), 'globaldeets-admission-api-'));
const functions = join(root, 'functions');
const files = [
  ['../functions/api/news.js', join(functions, 'api', 'news.js')],
  ['../functions/lib/news-source-admission.js', join(functions, 'lib', 'news-source-admission.js')],
  ['../functions/api/news/admission.js', join(functions, 'api', 'news', 'admission.js')],
];
for (const [, target] of files) mkdirSync(dirname(target), { recursive: true });
writeFileSync(join(functions, 'package.json'), '{"type":"module"}\n');
for (const [source, target] of files) copyFileSync(fileURLToPath(new URL(source, import.meta.url)), target);

const news = await import(pathToFileURL(join(functions, 'api', 'news.js')).href);
const api = await import(pathToFileURL(join(functions, 'api', 'news', 'admission.js')).href);

test('/api/news/admission exposes live review debt, research candidates, and fail-closed rules', async () => {
  const response = await api.onRequestGet({
    request: new Request('https://globaldeets.com/api/news/admission', {
      headers: { Origin: 'https://globaldeets.com' },
    }),
  });
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.sourceFingerprint, news.SOURCE_FINGERPRINT);
  assert.match(json.admissionFingerprint, /^[0-9a-f]{8}$/);
  assert.equal(json.validation.valid, true);
  assert.equal(json.summary.totalLiveSources, 19);
  assert.equal(json.summary.reviewedSources, 2);
  assert.equal(json.summary.legacyUnreviewedSources, 17);
  assert.deepEqual(json.summary.remediationSourceIds, ['ap', 'guardian']);
  assert.equal(json.liveAdmissions.length, 19);
  assert.equal(json.researchCandidates.length, 2);
  assert.equal(json.rules.newSourcesRequireReviewedAdmission, true);
  assert.equal(json.rules.itemRestrictionsOverrideSourcePermission, true);
  assert.equal(json.rules.endpointAuthorityIsUsagePermission, false);
  assert.equal(json.rules.feedHealthIsUsagePermission, false);
  assert.equal(json.rules.admissionMetadataChangesNewsCacheIdentity, false);
});

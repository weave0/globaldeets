import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { applyAdmissionPolicy, translateNonEnglish } from '../functions/api/news.js';
import { onRequestPost } from '../functions/api/intelligence/story-measurement.js';
import { evaluationStoryKeys } from '../functions/lib/story-evaluation-fixtures.js';
import { listMaintainedStories, projectMaintainedStory } from '../functions/lib/story-intelligence.js';
import {
  canonicalArticleUrl,
  listApprovedArticleMemberships,
  storyContextForArticleUrl,
  withStoryMembership,
} from '../functions/lib/story-membership.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');
const LATIMES =
  'https://www.latimes.com/environment/story/2026-08-20/judge-allows-controversial-oil-company-continue-pumping';

function item(overrides = {}) {
  return {
    id: 'item-1',
    headline: 'A governed headline',
    summary: 'A publisher summary that admission may remove.',
    source: 'Los Angeles Times',
    sourceUrl: LATIMES,
    published: '2026-08-20T12:00:00.000Z',
    region: 'americas',
    lang: 'en',
    translated: false,
    originalLang: 'en',
    ...overrides,
  };
}

test('approved membership is the Los Angeles Times article and no other public story', () => {
  const memberships = listApprovedArticleMemberships();
  const maintained = listMaintainedStories();
  assert.equal(memberships.length, 1);
  assert.equal(maintained.length, 1);
  assert.equal(memberships[0].articleUrl, LATIMES);
  assert.equal(memberships[0].storyKey, 'santa-ynez-pipeline');
  assert.equal(memberships[0].storyId, 'story:santa-ynez-pipeline');
  assert.equal(memberships[0].href, '/story/santa-ynez-pipeline/');
  assert.equal(memberships[0].membershipVersion, '2026-10-08.1');
  assert.ok(maintained.some(story => story.storyKey === memberships[0].storyKey));
  for (const key of evaluationStoryKeys()) {
    assert.equal(memberships.some(entry => entry.storyKey === key), false);
    assert.equal(storyContextForArticleUrl(`https://example.com/fixture/${key}`), null);
  }
});

test('membership matches the dossier reporting origin and does not invent language', () => {
  const [entry] = listApprovedArticleMemberships();
  const view = projectMaintainedStory(entry.storyKey);
  assert.equal(view.fixture, false);
  assert.equal(view.graphValid, true);
  assert.equal(view.reviewedAt, entry.reviewedAt);
  assert.equal(view.rules.truthScore, false);
  const origin = view.reporting.origins.find(item => canonicalArticleUrl(item.url) === entry.articleUrl);
  assert.ok(origin, 'approved article is a reporting origin');
  assert.equal(origin.translation, null);
  assert.equal(JSON.stringify(storyContextForArticleUrl(entry.articleUrl)).includes('originalHeadline'), false);
  assert.equal(JSON.stringify(storyContextForArticleUrl(entry.articleUrl)).includes('translated'), false);
});

test('only the exact approved article URL receives story context', async () => {
  const approved = storyContextForArticleUrl(LATIMES);
  assert.equal(approved.href, '/story/santa-ynez-pipeline/');
  assert.equal(storyContextForArticleUrl(`${LATIMES}#section`).href, approved.href);
  for (const url of [
    `${LATIMES}/`,
    `${LATIMES}?utm_source=gd`,
    LATIMES.replace('https://', 'http://'),
    'https://www.latimes.com/environment/story/2026-08-21/a-different-story',
    'https://example.com/other-pipeline',
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://user:pass@www.latimes.com/environment/story/2026-08-20/judge-allows-controversial-oil-company-continue-pumping',
    '',
    null,
  ]) {
    assert.equal(storyContextForArticleUrl(url), null, String(url));
  }

  const forged = item({
    story: { href: 'javascript:alert(1)', storyKey: 'santa-ynez-pipeline', storyId: 'story:santa-ynez-pipeline' },
    originalHeadline: '<img src=x onerror=alert(1)>',
    translated: false,
  });
  const near = item({
    id: 'near',
    source: 'Fixture Wire',
    sourceUrl: 'https://example.com/other-pipeline',
    story: { href: '/story/santa-ynez-pipeline/', storyKey: 'santa-ynez-pipeline' },
  });
  const { items } = await applyAdmissionPolicy([forged, near, item({ id: 'copy' })]);
  assert.equal(items.length, 3);
  assert.equal(items.filter(entry => entry.story).length, 2);
  assert.deepEqual(items[0].story, approved);
  assert.equal(items[0].originalHeadline, undefined);
  assert.equal(items[1].story, undefined);
  assert.equal(items[2].story.storyId, approved.storyId);
  assert.notEqual(items[0].id, items[2].id);
});

test('original headline is passed only after a real translation', async () => {
  const kept = await applyAdmissionPolicy([
    item({
      source: 'Minnesota Reformer',
      sourceUrl: 'https://minnesotareformer.com/example',
      region: 'americas',
      lang: 'ja',
      originalLang: 'ja',
      translated: true,
      headline: 'Translated headline',
      originalHeadline: '原文の見出し',
    }),
  ]);
  assert.equal(kept.items[0].displayMode, 'current-use');
  assert.equal(kept.items[0].translated, true);
  assert.equal(kept.items[0].originalHeadline, '原文の見出し');
  assert.equal(kept.items[0].originalLang, 'ja');
  assert.equal(kept.items[0].story, undefined);

  const stripped = await applyAdmissionPolicy([
    item({
      source: 'NHK',
      sourceUrl: 'https://www3.nhk.or.jp/news/example',
      region: 'asia',
      lang: 'ja',
      originalLang: 'ja',
      translated: true,
      originalHeadline: 'should not survive headline-only display',
    }),
  ]);
  assert.equal(stripped.items[0].displayMode, 'headline-link');
  assert.equal(stripped.items[0].translated, false);
  assert.equal(stripped.items[0].originalHeadline, undefined);

  let calls = 0;
  const translated = [
    item({
      source: 'Minnesota Reformer',
      sourceUrl: 'https://minnesotareformer.com/translate',
      region: 'americas',
      lang: 'ja',
      originalLang: 'ja',
      translated: false,
      headline: '元の見出し',
      summary: null,
      displayMode: 'current-use',
      sourceId: 'minnesota-reformer',
    }),
  ];
  await translateNonEnglish(translated, {
    AI: {
      async run() {
        calls += 1;
        return { translated_text: 'Translated from the source' };
      },
    },
  }, new Map([['minnesota-reformer', { permittedUse: ['translated-headline-summary'] }]]));
  assert.equal(calls, 1);
  assert.equal(translated[0].translated, true);
  assert.equal(translated[0].originalHeadline, '元の見出し');
  assert.equal(translated[0].headline, 'Translated from the source');
});

test('a supplied story object cannot survive without the approved URL', () => {
  const poisoned = withStoryMembership({
    sourceUrl: 'javascript:alert(1)',
    story: { href: '/story/santa-ynez-pipeline/', storyKey: 'santa-ynez-pipeline' },
    originalHeadline: 'invented',
  });
  assert.equal(poisoned.story, undefined);
  assert.equal(poisoned.originalHeadline, 'invented');
});

test('story measurement accepts only a maintained story and logs no article payload', async t => {
  const logs = [];
  const original = console.log;
  console.log = value => logs.push(String(value));
  t.after(() => {
    console.log = original;
  });

  const accepted = await onRequestPost({
    request: new Request('https://globaldeets.com/api/intelligence/story-measurement', {
      method: 'POST',
      headers: { Origin: 'https://globaldeets.com', 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        event: 'story-context-opened',
        storyKey: 'santa-ynez-pipeline',
        articleUrl: LATIMES,
        headline: 'must not be logged',
        clientId: 'secret-token',
      }),
    }),
  });
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get('set-cookie'), null);
  assert.match(logs[0], /story-context-opened/);
  assert.match(logs[0], /santa-ynez-pipeline/);
  assert.equal(logs[0].includes(LATIMES), false);
  assert.equal(logs[0].includes('secret-token'), false);
  assert.equal(logs[0].includes('must not be logged'), false);

  const fixture = await onRequestPost({
    request: new Request('http://127.0.0.1:5500/api/intelligence/story-measurement', {
      method: 'POST',
      body: JSON.stringify({ event: 'story-opened', storyKey: 'evaluation-conflict' }),
    }),
  });
  assert.equal(fixture.status, 400);

  const foreign = await onRequestPost({
    request: new Request('https://globaldeets.com/api/intelligence/story-measurement', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
      body: JSON.stringify({ event: 'story-opened', storyKey: 'santa-ynez-pipeline' }),
    }),
  });
  assert.equal(foreign.status, 403);
});

test('the public story is indexed once and the clients do not keep a URL map', () => {
  const page = read('story/santa-ynez-pipeline/index.html');
  const sitemap = read('sitemap.xml');
  const robots = read('robots.txt');
  const fixture = read('tests/fixtures/story-states/index.html');
  assert.match(page, /rel="canonical" href="https:\/\/globaldeets.com\/story\/santa-ynez-pipeline\/"/);
  assert.equal(page.includes('noindex'), false);
  assert.equal(page.includes('googletagmanager'), false);
  assert.equal(sitemap.split('https://globaldeets.com/story/santa-ynez-pipeline/').length - 1, 1);
  assert.equal(sitemap.includes('evaluation-'), false);
  assert.equal(sitemap.includes('/tests/'), false);
  assert.match(robots, /Disallow: \/tests\//);
  assert.equal(robots.includes('Disallow: /story'), false);
  assert.match(fixture, /noindex/i);
  for (const file of ['news.js', 'world-desk.js']) {
    const source = read(file);
    assert.equal(source.includes('latimes.com'), false, file);
    assert.equal(source.includes('STORY_CONTEXT_BY_URL'), false, file);
    assert.match(source, /storyContextHref/);
    assert.match(source, /\/story\/\$\{key\}\//);
  }
});

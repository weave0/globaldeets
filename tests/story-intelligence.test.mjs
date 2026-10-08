import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { onRequestGet, storyKeyFrom } from '../functions/api/intelligence/stories/[[storyKey]].js';
import { createClaim, createClaimRelation } from '../functions/lib/claim-evidence-model.js';
import { createEntity, createEvent } from '../functions/lib/intelligence-model.js';
import { getSantaYnezDossier } from '../functions/lib/santa-ynez-dossier.js';
import {
  assessExplicitMemberships,
  independentCorroboration,
  listMaintainedStories,
  matchReportingUrl,
  projectMaintainedStory,
  projectStoryFromDossier,
  reportingOrigins,
} from '../functions/lib/story-intelligence.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');
const request = { headers: { get: () => null }, url: 'http://localhost/api/intelligence/stories' };

function scoreProblems(value, path = '') {
  const problems = [];
  if (!value || typeof value !== 'object') return problems;
  for (const [key, child] of Object.entries(value)) {
    const here = `${path}${key}`;
    if (/misinformation|publisherQuality|percentConfident/i.test(key)) problems.push(here);
    if (['truthScore', 'confidenceScore', 'biasScore', 'reliabilityScore'].includes(key) && child !== false) {
      problems.push(`${here}:${child}`);
    }
    if (typeof child === 'number' && /score|confidence|percent/i.test(key)) problems.push(here);
    problems.push(...scoreProblems(child, `${here}.`));
  }
  return problems;
}

test('the maintained Santa Ynez story projects the dossier without a new identity or a summary', () => {
  const view = projectMaintainedStory('santa-ynez-pipeline');

  assert.equal(view.storyId, 'story:santa-ynez-pipeline');
  assert.equal(view.href, '/story/santa-ynez-pipeline/');
  assert.equal(view.dossierId, 'santa-ynez-pipeline');
  assert.equal(view.graphValid, true);
  assert.equal(view.identityMismatch, false);
  assert.equal(view.understanding.proseSummary, null);
  assert.equal(view.rules.proseSummary, false);
  assert.equal(view.rules.truthScore, false);
  assert.equal(view.rules.editorialVerdict, false);
  assert.deepEqual(scoreProblems(view), []);
  assert.equal(view.grouping.isEventIdentity, false);
  assert.equal(view.grouping.distinctEventCount, 7);
  assert.equal(view.grouping.eventsAreDistinct, true);
  assert.ok(view.grouping.eventIds.every(id => id !== view.storyId));
  assert.equal(new Set(view.grouping.eventIds).size, 7);
  assert.ok(view.cases.singleSource.length > 0);
  assert.ok(view.cases.multiSource.length > 0);
  assert.ok(view.cases.conflicting.length > 0);
  assert.ok(view.cases.corrected.length > 0);
  assert.ok(view.cases.limitedEvidence.length > 0);
  assert.equal(view.corroboration.rejected.length, 0);
  assert.equal(view.reporting.distinctUrls, 1);
  assert.equal(view.reporting.origins[0].name, 'Los Angeles Times');
  assert.equal(view.reporting.origins[0].independent, true);
  assert.equal(view.corrections[0].originalArtifactRetained, false);
  assert.match(view.corrections[0].description, /mistakenly reprinted/);
  assert.match(view.unresolved.intro, /We do not know yet/);
  assert.ok(view.unresolved.items.some(item => item.kind === 'coverage-gap'));
  assert.ok(view.unattachedSources.includes('source:ca-doj:2026-07-20'));
});

test('publication time is not treated as event time when the dates differ', () => {
  const view = projectMaintainedStory('santa-ynez-pipeline');
  const report = view.chronology.find(item => item.date === '2026-08-20');
  const challenge = view.chronology.find(item => item.date === '2026-03-23');

  assert.equal(report.time.kind, 'timeline-differs-from-event-start');
  assert.equal(report.time.eventStartedAt, '2026-08-19');
  assert.match(report.time.note, /not the event start/);
  assert.equal(challenge.time.kind, 'timeline-differs-from-event-start');
  assert.equal(challenge.time.eventStartedAt, '2026-03-13');
  assert.equal(view.chronology[0].date <= view.chronology.at(-1).date, true);
});

test('places come only from place records, never from a publisher location', () => {
  const view = projectMaintainedStory('santa-ynez-pipeline');
  assert.deepEqual(
    view.places.map(place => place.name).sort(),
    ['California', 'Santa Barbara County', 'United States of America']
  );
  assert.ok(view.places.every(place => place.placePage === null));
  assert.equal(view.places.some(place => place.basis === 'event-place'), true);

  const poisoned = projectStoryFromDossier(
    { storyKey: 'santa-ynez-pipeline', dossierId: 'santa-ynez-pipeline' },
    {
      ...getSantaYnezDossier(),
      publisherHeadquarters: { name: 'Los Angeles', latitude: 34.05, longitude: -118.25 },
      feedRegion: 'americas',
    }
  );
  assert.deepEqual(
    poisoned.places.map(place => place.name).sort(),
    ['California', 'Santa Barbara County', 'United States of America']
  );
  assert.equal(JSON.stringify(poisoned.places).includes('Los Angeles'), false);
  assert.equal(JSON.stringify(poisoned.places).includes('34.05'), false);
});

test('same-origin repetition and syndicated URLs are not independent corroboration', () => {
  const org = createEntity({
    identityKey: 'story-eval:agency',
    displayName: 'Example Agency',
    type: 'organization',
    evidenceRefs: ['https://example.com/agency'],
  });
  const event = createEvent({
    eventKey: 'story-eval:notice',
    title: 'Example notice',
    eventType: 'notice',
    status: 'developing',
    startedAt: '2026-01-01',
    entityIds: [org.id],
    placeEntityIds: [],
    evidenceRefs: ['https://example.com/release'],
  });
  const first = createClaim({
    claimKey: 'wording-a',
    proposition: 'The agency said the notice was issued.',
    type: 'official-position',
    state: 'single-source',
    originSourceId: 'source:agency',
    originRef: 'https://example.com/release',
    eventIds: [event.id],
    assertedAt: '2026-01-01',
  });
  const repeat = createClaim({
    claimKey: 'wording-b',
    proposition: 'The agency repeated that the notice was issued.',
    type: 'official-position',
    state: 'single-source',
    originSourceId: 'source:agency',
    originRef: 'https://example.com/release',
    eventIds: [event.id],
    assertedAt: '2026-01-02',
  });
  const relation = createClaimRelation({
    claimId: first.id,
    relatedClaimId: repeat.id,
    relation: 'corroborates',
  });
  const sources = [
    { id: 'source:agency', name: 'Example Agency', sourceClass: 'institutional-statement', evidenceRole: 'official-position', url: 'https://example.com/release' },
    { id: 'wire-a', name: 'Wire A', sourceClass: 'independent-reporting', evidenceRole: 'reporting', url: 'https://example.com/reprint' },
    { id: 'wire-b', name: 'Wire B', sourceClass: 'independent-reporting', evidenceRole: 'reporting', url: 'https://example.com/reprint' },
  ];
  const view = projectStoryFromDossier(
    { storyKey: 'eval-same-origin', dossierId: 'eval-same-origin' },
    {
      dossierId: 'eval-same-origin',
      title: 'Evaluation: same origin',
      status: 'developing',
      sources,
      entities: [org],
      events: [event],
      claims: [first, repeat],
      evidence: [],
      claimRelations: [relation],
      evidenceRelations: [],
      timeline: [],
      corrections: [],
      unknowns: ['Whether anyone independent confirmed the notice is not in this evaluation record.'],
      validation: { valid: false },
    }
  );

  assert.equal(view.cases.multiSource.length, 0);
  assert.equal(view.corroboration.rejected[0].reason, 'same-origin');
  assert.equal(view.reporting.distinctUrls, 1);
  assert.equal(view.reporting.origins[0].syndicated, true);
  assert.equal(view.reporting.origins[0].independent, false);
  assert.match(view.reporting.origins[0].note, /Not counted as a separate report/);
  assert.equal(reportingOrigins(sources).syndicatedGroups.length, 1);
  assert.deepEqual(independentCorroboration([relation], [first, repeat]).rejected.map(item => item.reason), ['same-origin']);
});

test('similar titles stay split, and a membership without an event is refused', () => {
  const shared = {
    eventType: 'notice',
    status: 'developing',
    evidenceRefs: ['https://example.com/event'],
  };
  const alpha = createEvent({ ...shared, eventKey: 'eval:alpha', title: 'Shared headline' });
  const beta = createEvent({ ...shared, eventKey: 'eval:beta', title: 'Shared headline' });
  const rewritten = createEvent({ ...shared, eventKey: 'eval:alpha', title: 'Shared headline, rewritten' });

  assert.equal(alpha.id, rewritten.id);
  assert.notEqual(alpha.id, beta.id);

  const both = assessExplicitMemberships(
    [alpha, beta],
    [
      { id: 'member-a', eventIds: [alpha.id] },
      { id: 'member-b', eventIds: [beta.id] },
    ]
  );
  assert.equal(both.distinctEventCount, 2);
  assert.equal(both.groupingIsEventIdentity, false);

  const loose = assessExplicitMemberships([alpha, beta], [{ id: 'loose', eventIds: [] }]);
  assert.equal(loose.distinctEventCount, 0);
  assert.deepEqual(loose.refused, [{ id: 'loose', reason: 'missing-explicit-event' }]);
});

test('an exact reporting URL resolves to the story and a different URL does not', () => {
  const view = projectMaintainedStory('santa-ynez-pipeline');
  const hit = matchReportingUrl(view, view.reporting.origins[0].url);
  assert.equal(hit.href, '/story/santa-ynez-pipeline/');
  assert.equal(matchReportingUrl(view, 'https://example.com/unrelated'), null);
});

test('the story API serves the maintained record and refuses unknown keys', async () => {
  const index = await onRequestGet({ request, params: {} });
  assert.equal(index.status, 200);
  const indexBody = await index.json();
  assert.equal(indexBody.stories.length, 1);
  assert.equal(indexBody.stories[0].storyId, 'story:santa-ynez-pipeline');
  assert.match(indexBody.note, /not an event identity/);

  const story = await onRequestGet({ request, params: { storyKey: 'santa-ynez-pipeline' } });
  assert.equal(story.status, 200);
  const body = await story.json();
  assert.equal(body.storyId, 'story:santa-ynez-pipeline');
  assert.equal(body.rules.truthScore, false);
  assert.equal(body.understanding.proseSummary, null);

  const missing = await onRequestGet({ request, params: { storyKey: 'not-a-story' } });
  assert.equal(missing.status, 404);
  const odd = await onRequestGet({ request, params: { storyKey: '../santa-ynez-pipeline' } });
  assert.equal(odd.status, 404);
  assert.equal(storyKeyFrom({ storyKey: ['a', 'b'] }), '');
  assert.deepEqual(
    listMaintainedStories().map(item => item.storyKey),
    ['santa-ynez-pipeline']
  );
});

test('the shipped story.json and page match the projection, including every original link', () => {
  const view = projectMaintainedStory('santa-ynez-pipeline');
  const shipped = JSON.parse(read('story/santa-ynez-pipeline/story.json'));
  assert.deepEqual(shipped, view);

  const page = read('story/santa-ynez-pipeline/index.html');
  assert.match(page, new RegExp(`<h1[^>]*>${escapeRegExp(view.title)}</h1>`));
  assert.ok(page.includes(view.statusLabel));
  assert.ok(page.includes('data-story-key="santa-ynez-pipeline"'));
  assert.ok(page.includes('2026-09-03'));
  for (const place of view.places) assert.ok(page.includes(place.name), place.name);
  for (const link of view.sourceLinks) {
    assert.ok(page.includes(link.url), link.url);
    assert.ok(page.includes(link.linkLabel), link.linkLabel);
  }
  assert.equal(page.includes('truth score'), false);
  assert.equal(page.includes('Canonical entities'), false);
});

test('headline context links are exact maintained URLs, not a clustering guess', () => {
  const view = projectMaintainedStory('santa-ynez-pipeline');
  for (const file of ['news.js', 'world-desk.js']) {
    const source = read(file);
    assert.ok(source.includes(view.reporting.origins[0].url), file);
    assert.ok(source.includes(view.href), file);
    assert.match(source, /exact URL/i);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

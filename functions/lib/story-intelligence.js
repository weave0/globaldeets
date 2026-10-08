// R2 Story Intelligence.
//
// A story is a curated reader projection of records that already exist.
// It is not a second identity system, not an event merge, and not a summary model.
//
// Implementation map for this slice:
// 1. Already structured: entities, events, claims, evidence, relations, timeline,
//    corrections, unknowns, places, and the Santa Ynez dossier.
// 2. Safe to show: those fields, original URLs, evidence state, and named gaps.
// 3. Missing: a general headline-clustering pipeline and place pages (R3).
// 4. Presentation: one maintained story page over the Santa Ynez dossier.
// 5. New API: GET /api/intelligence/stories and /api/intelligence/stories/:storyKey,
//    both derived from the dossier. The page also ships story.json so it still reads
//    when that API is down.
// 6. Stays unknown: anything absent from the dossier. Unknown is rendered as unknown.
//    No truth, bias, reliability, or confidence score is computed.

import { getSantaYnezDossier } from './santa-ynez-dossier.js';

export const STORY_MODEL_VERSION = '2026-10-08.1';

const STORY_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const DOSSIER_LOADERS = Object.freeze({
  'santa-ynez-pipeline': getSantaYnezDossier,
});

const STORY_DEFINITIONS = Object.freeze([
  Object.freeze({
    storyKey: 'santa-ynez-pipeline',
    dossierId: 'santa-ynez-pipeline',
  }),
]);

const STATUS_LABELS = Object.freeze({
  developing: 'Developing record',
  confirmed: 'Confirmed record',
  closed: 'Closed record',
  disputed: 'Disputed record',
});

const VOICE_LABELS = Object.freeze({
  'publisher-reported': 'Publisher reported',
  'official-position': 'Official position',
  'stated-in-linked-document': 'Stated in a linked document',
  'reviewed-evidence-corroborated': 'Reviewed evidence record: corroborated',
  'not-yet-resolved': 'Not yet resolved',
  'single-source': 'Single source',
  unreviewed: 'Unreviewed',
  superseded: 'Superseded',
  withdrawn: 'Withdrawn',
});

const DOCUMENT_LABELS = Object.freeze({
  'court-filing': 'Court filing',
  judgment: 'Court judgment',
  'government-release': 'Government release',
  'regulator-release': 'Regulator release',
  'election-record': 'Election record',
  'sanctions-notice': 'Sanctions notice',
  'central-bank-release': 'Central-bank release',
  'statistical-release': 'Statistical release',
  'multilateral-publication': 'Multilateral publication',
  'corporate-filing': 'Corporate filing',
  dataset: 'Dataset',
  'official-record': 'Official record',
  'other-primary': 'Other primary document',
});

const ENTITY_TYPE_LABELS = Object.freeze({
  person: 'Person',
  organization: 'Organization',
  'government-public-body': 'Public body',
  company: 'Company',
  place: 'Place',
  'multilateral-body': 'Multilateral body',
});

const PRIMARY_ROLES = new Set(['primary-evidence', 'primary-disclosure']);

export function makeStableStoryId(storyKey) {
  if (!STORY_KEY.test(storyKey || '')) throw new TypeError('storyKey must be a lowercase slug');
  return `story:${storyKey}`;
}

export function listMaintainedStories() {
  return STORY_DEFINITIONS.map(definition => {
    const view = projectMaintainedStory(definition.storyKey);
    return {
      storyId: view.storyId,
      storyKey: view.storyKey,
      href: view.href,
      title: view.title,
      status: view.status,
      statusLabel: view.statusLabel,
      dossierId: view.dossierId,
      reviewedAt: view.reviewedAt,
      latestUpdate: view.latestUpdate?.date ?? null,
    };
  });
}

export function projectMaintainedStory(storyKey) {
  const definition = STORY_DEFINITIONS.find(item => item.storyKey === storyKey);
  if (!definition) return null;
  const load = DOSSIER_LOADERS[definition.dossierId];
  if (!load) throw new TypeError(`no dossier loader for ${definition.dossierId}`);
  return projectStoryFromDossier(definition, load());
}

export function projectStoryFromDossier(definition, dossier) {
  const storyKey = definition?.storyKey;
  if (!STORY_KEY.test(storyKey || '')) throw new TypeError('storyKey must be a lowercase slug');
  const sources = array(dossier?.sources);
  const entities = array(dossier?.entities);
  const events = array(dossier?.events);
  const claims = array(dossier?.claims);
  const evidence = array(dossier?.evidence);
  const claimRelations = array(dossier?.claimRelations);
  const evidenceRelations = array(dossier?.evidenceRelations);
  const timeline = array(dossier?.timeline);
  const corrections = array(dossier?.corrections);
  const unknowns = array(dossier?.unknowns).filter(item => typeof item === 'string');

  const entityById = new Map(entities.filter(item => item?.id).map(item => [item.id, item]));
  const eventById = new Map(events.filter(item => item?.id).map(item => [item.id, item]));
  const evidenceById = new Map(evidence.filter(item => item?.id).map(item => [item.id, item]));
  const sourceById = new Map(sources.filter(item => item?.id).map(item => [item.id, item]));

  const corroboration = independentCorroboration(claimRelations, claims);
  const sourceEventIds = new Map(sources.map(source => [source.id, new Set()]));
  for (const claim of claims) addIds(sourceEventIds.get(claim.originSourceId), claim.eventIds);
  for (const item of evidence) {
    for (const source of sources) {
      if (source.url && (source.url === item.canonicalRef || array(item.provenanceRefs).includes(source.url))) {
        addIds(sourceEventIds.get(source.id), item.eventIds);
      }
    }
  }

  const memberships = sources.map(source => ({
    id: source.id,
    eventIds: [...(sourceEventIds.get(source.id) || [])].sort(),
  }));
  const membership = assessExplicitMemberships(events, memberships);
  const eventIds = unique(events.map(event => event.id));

  const claimViews = claims.map(claim =>
    presentClaim(claim, {
      sourceById,
      evidenceById,
      entityById,
      evidenceRelations,
      corroboration,
    })
  );
  const claimViewById = new Map(claimViews.map(claim => [claim.id, claim]));
  const usedInConflict = new Set();
  const conflicting = [];
  for (const relation of claimRelations) {
    if (relation?.relation !== 'contradicts') continue;
    const left = claimViewById.get(relation.claimId);
    const right = claimViewById.get(relation.relatedClaimId);
    if (left) usedInConflict.add(left.id);
    if (right) usedInConflict.add(right.id);
    conflicting.push({
      relationId: relation.id,
      relation: 'contradicts',
      resolution: 'not-resolved',
      note: 'These claims contradict each other in the maintained record. GlobalDeets does not pick a winner.',
      left: left || null,
      right: right || null,
      evidenceIds: unique(relation.evidenceIds),
    });
  }

  const corroborated = claimViews
    .filter(claim => claim.state === 'corroborated' && !usedInConflict.has(claim.id))
    .sort(byAsserted);
  const supersededClaims = claimViews.filter(claim => claim.state === 'superseded' || claim.state === 'withdrawn').sort(byAsserted);
  const other = claimViews
    .filter(claim => !usedInConflict.has(claim.id) && claim.state !== 'corroborated' && claim.state !== 'superseded' && claim.state !== 'withdrawn')
    .sort(byAsserted);

  const presentedEvents = events.map(event => presentEvent(event)).sort((a, b) => compareText(a.startedAt, b.startedAt) || compareText(a.id, b.id));
  const chronology = timeline
    .map(item => presentTimelineItem(item, { eventById, evidenceById, claimViewById, sourceById, entityById, corrections }))
    .sort((a, b) => compareText(a.date, b.date) || compareText(a.id, b.id));

  const reporting = presentReporting(sources, sourceEventIds, eventById);
  const statements = sources
    .filter(source => !isReporting(source) && !isPrimaryRecord(source))
    .map(source => presentSource(source, sourceEventIds, eventById))
    .sort(byName);
  const evidenceViews = evidence
    .map(item => presentEvidence(item, { entityById, evidence }))
    .sort((a, b) => compareText(a.publishedAt, b.publishedAt) || compareText(a.id, b.id));

  const places = collectStoryPlaces(dossier, entityById, events);
  const placeGaps = presentedEvents
    .filter(event => event.placeEntityIds.length === 0)
    .map(event => ({
      kind: 'unclear-location',
      basis: 'event',
      eventId: event.id,
      text: `Event location is not in the record for “${event.title}”.`,
    }));

  const unresolvedItems = [];
  for (const text of unknowns) unresolvedItems.push({ kind: 'unknown', basis: ['dossier'], text });
  for (const event of events) {
    for (const text of array(event.unknowns)) {
      unresolvedItems.push({ kind: 'unknown', basis: ['event'], eventId: event.id, text });
    }
  }
  for (const correction of corrections) {
    for (const text of array(correction.unknowns)) {
      unresolvedItems.push({ kind: 'unknown', basis: ['correction'], correctionId: correction.id, text });
    }
  }
  const unresolved = dedupeUnknowns(unresolvedItems);
  if (reporting.origins.length < 2) {
    unresolved.push({
      kind: 'coverage-gap',
      basis: ['source-inventory'],
      text:
        reporting.origins.length === 0
          ? 'No independent news report is linked in this maintained record. That is a coverage gap in the record, not a claim that nobody reported it.'
          : 'Independent reporting in this maintained record is a single publisher. No second news report is linked. That is a gap in this record, not a claim that other reporting does not exist.',
    });
  }
  unresolved.push(...placeGaps);

  const presentedCorrections = corrections.map(correction =>
    presentCorrection(correction, { entityById, evidenceById })
  );

  const unattachedSources = statements.filter(source => source.eventIds.length === 0).map(source => source.sourceId);

  return {
    modelVersion: STORY_MODEL_VERSION,
    storyId: makeStableStoryId(storyKey),
    storyKey,
    href: `/story/${storyKey}/`,
    dossierId: definition.dossierId,
    dossierVersion: textOrNull(dossier?.dossierVersion),
    identityMismatch: textOrNull(dossier?.dossierId) !== definition.dossierId,
    graphValid: dossier?.validation?.valid === true && corroboration.rejected.length === 0,
    title: textOrNull(dossier?.title) || 'Untitled maintained record',
    dek: textOrNull(dossier?.dek),
    status: textOrNull(dossier?.status),
    statusLabel: STATUS_LABELS[dossier?.status] || 'Status not recorded',
    reviewedAt: textOrNull(dossier?.reviewedAt),
    grouping: {
      isEventIdentity: false,
      note: 'This page groups explicitly related events from one maintained dossier. Membership does not merge those events, and the story id is not an event id.',
      eventIds,
      distinctEventCount: eventIds.length,
      eventCount: events.length,
      eventsAreDistinct: eventIds.length === events.length,
    },
    places,
    placeNote:
      'Places come from place records cited by this dossier. Publisher headquarters, feed region, language, and routing region are not used as the event location.',
    latestUpdate: latestUpdate(chronology),
    understanding: {
      proseSummary: null,
      reason: 'No unattributed summary is generated. The current view is the structured claims and evidence states below.',
      sort: 'Grouped by the record’s evidence state, then by the date the claim was asserted. Not ranked by importance.',
      conflicting,
      corroborated,
      other,
    },
    chronology,
    chronologyNote:
      'Ordered by the dossier timeline date. A timeline date is not treated as the real-world event order when it differs from the event start.',
    reporting,
    statements,
    evidence: evidenceViews,
    unresolved: {
      intro: 'We do not know yet. What follows is unresolved in this maintained record. Nothing here is filled in by inference.',
      items: unresolved,
    },
    corrections: presentedCorrections,
    supersededClaims,
    events: presentedEvents,
    entities: entities
      .filter(entity => entity?.type && entity.type !== 'place')
      .map(entity => ({
        id: entity.id,
        name: entity.displayName,
        type: entity.type,
        typeLabel: ENTITY_TYPE_LABELS[entity.type] || entity.type,
        identityKey: entity.identityKey,
      }))
      .sort(byName),
    sourceLinks: sources
      .map(source => ({
        sourceId: source.id,
        name: source.name,
        url: safeHttpUrl(source.url),
        evidenceRole: source.evidenceRole,
        sourceClass: source.sourceClass,
        linkLabel: isReporting(source) ? `Read at ${source.name}` : `Open at ${source.name}`,
      }))
      .filter(source => source.url)
      .sort((a, b) => compareText(a.linkLabel, b.linkLabel) || compareText(a.url, b.url)),
    unattachedSources,
    corroboration,
    articleMembership: membership,
    cases: {
      singleSource: claimViews.filter(claim => claim.state === 'single-source').map(claim => claim.id).sort(),
      multiSource: unique(corroboration.accepted.flatMap(item => [item.claimId, item.relatedClaimId])),
      conflicting: conflicting.map(item => item.relationId).sort(),
      corrected: presentedCorrections.map(item => item.id).sort(),
      limitedEvidence: unresolved.filter(item => item.kind === 'unknown').map(item => item.text).sort(),
    },
    rules: {
      truthScore: false,
      editorialVerdict: false,
      biasScore: false,
      reliabilityScore: false,
      confidenceScore: false,
      proseSummary: false,
      groupingIsNotIdentity: true,
      sameSourceIsNotCorroboration: true,
      displayPermissionsUnchanged: true,
    },
    readingNotes: [
      'Publisher reported, stated in a linked document, and corroborated through reviewed evidence are different labels.',
      'Corroborated is an evidence state, not a truth score and not a finding that a claim is true.',
      'A story groups maintained records. It does not merge events that keep their own ids.',
      'The same document cited twice is one origin, not independent corroboration.',
      'Unknown stays unknown. Corrections stay on the record.',
    ],
  };
}

export function independentCorroboration(claimRelations, claims) {
  const claimById = new Map(array(claims).filter(item => item?.id).map(item => [item.id, item]));
  const accepted = [];
  const rejected = [];
  for (const relation of array(claimRelations)) {
    if (relation?.relation !== 'corroborates') continue;
    const left = claimById.get(relation.claimId);
    const right = claimById.get(relation.relatedClaimId);
    if (!left || !right) {
      rejected.push({ relationId: relation.id || null, reason: 'missing-claim' });
      continue;
    }
    if (left.originSourceId === right.originSourceId) {
      rejected.push({ relationId: relation.id || null, reason: 'same-origin', originSourceId: left.originSourceId });
      continue;
    }
    accepted.push({
      relationId: relation.id,
      claimId: left.id,
      relatedClaimId: right.id,
      originSourceIds: [left.originSourceId, right.originSourceId].sort(),
    });
  }
  return { accepted, rejected };
}

export function assessExplicitMemberships(events, memberships) {
  const eventById = new Map(array(events).filter(event => event?.id).map(event => [event.id, event]));
  const attached = [];
  const refused = [];
  for (const membership of array(memberships)) {
    const ids = array(membership?.eventIds).filter(id => typeof id === 'string' && id);
    if (!ids.length) {
      refused.push({ id: membership?.id || null, reason: 'missing-explicit-event' });
      continue;
    }
    const missing = ids.filter(id => !eventById.has(id));
    if (missing.length) {
      refused.push({ id: membership?.id || null, reason: 'unknown-event', eventIds: missing.sort() });
      continue;
    }
    attached.push({ id: membership.id, eventIds: unique(ids) });
  }
  const eventIds = unique(attached.flatMap(item => item.eventIds));
  return {
    attached,
    refused,
    eventIds,
    distinctEventCount: eventIds.length,
    groupingIsEventIdentity: false,
  };
}

export function reportingOrigins(sources) {
  const reporting = array(sources).filter(isReporting);
  const byUrl = new Map();
  for (const source of reporting) {
    const url = source.url || '';
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(source.id);
  }
  return {
    records: reporting.length,
    distinctUrls: [...byUrl.keys()].filter(Boolean).length,
    syndicatedGroups: [...byUrl.values()].filter(ids => ids.length > 1),
  };
}

export function matchReportingUrl(view, url) {
  const hit = array(view?.reporting?.origins).find(item => item.url === url);
  if (!hit) return null;
  return { storyId: view.storyId, href: view.href, sourceId: hit.sourceIds[0], url: hit.url };
}

function presentClaim(claim, context) {
  const source = context.sourceById.get(claim.originSourceId) || null;
  const documents = context.evidenceRelations
    .filter(relation => relation?.claimId === claim.id)
    .map(relation => {
      const item = context.evidenceById.get(relation.evidenceId);
      if (!item) return null;
      const issuer = context.entityById.get(item.issuerEntityId);
      return {
        evidenceId: item.id,
        relation: relation.relation,
        documentType: item.documentType,
        documentTypeLabel: DOCUMENT_LABELS[item.documentType] || item.documentType,
        issuerName: issuer?.displayName || null,
        url: safeHttpUrl(item.canonicalRef),
        publishedAt: item.publishedAt || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => compareText(a.evidenceId, b.evidenceId));

  const voices = [];
  if (isReporting(source)) voices.push('publisher-reported');
  if (claim.type === 'official-position') voices.push('official-position');
  if (documents.some(item => item.relation === 'supports' || item.relation === 'contradicts')) {
    voices.push('stated-in-linked-document');
  }
  if (claim.state === 'corroborated') voices.push('reviewed-evidence-corroborated');
  if (claim.state === 'disputed' || claim.state === 'contradicted') voices.push('not-yet-resolved');
  if (claim.state === 'single-source') voices.push('single-source');
  if (claim.state === 'unreviewed') voices.push('unreviewed');
  if (claim.state === 'superseded') voices.push('superseded');
  if (claim.state === 'withdrawn') voices.push('withdrawn');

  const distinctOrigins = context.corroboration.accepted
    .filter(item => item.claimId === claim.id || item.relatedClaimId === claim.id)
    .flatMap(item => item.originSourceIds)
    .filter(id => id !== claim.originSourceId);

  return {
    id: claim.id,
    claimKey: claim.claimKey,
    proposition: claim.proposition,
    type: claim.type,
    state: claim.state,
    stateNote:
      claim.state === 'corroborated'
        ? 'The record marks this corroborated. That is an evidence state, not a truth score.'
        : null,
    assertedAt: claim.assertedAt || null,
    voices,
    voiceLabels: voices.map(voice => VOICE_LABELS[voice] || voice),
    origin: source
      ? {
          sourceId: source.id,
          name: source.name,
          url: safeHttpUrl(source.url),
          sourceClass: source.sourceClass,
          evidenceRole: source.evidenceRole,
        }
      : { sourceId: claim.originSourceId, name: null, url: safeHttpUrl(claim.originRef), sourceClass: null, evidenceRole: null },
    sourceWording: claim.sourceWording || null,
    sourceWordingLabel: claim.sourceWording
      ? 'Wording retained with this claim. Not a republished article excerpt.'
      : null,
    documents,
    eventIds: unique(claim.eventIds),
    distinctCorroboratingOrigins: unique(distinctOrigins),
  };
}

function presentEvent(event) {
  return {
    id: event.id,
    eventKey: event.eventKey,
    title: event.title,
    eventType: event.eventType,
    status: event.status,
    statusLabel: STATUS_LABELS[event.status] || 'Status not recorded',
    startedAt: event.startedAt || null,
    observedAt: event.observedAt || null,
    endedAt: event.endedAt || null,
    placeEntityIds: unique(event.placeEntityIds),
    unknowns: array(event.unknowns).filter(item => typeof item === 'string'),
    anchor: eventAnchor(event.eventKey),
  };
}

function presentTimelineItem(item, context) {
  const event = context.eventById.get(item.eventId) || null;
  const presented = event ? presentEvent(event) : null;
  const documents = array(item.evidenceIds)
    .map(id => context.evidenceById.get(id))
    .filter(Boolean)
    .map(evidence => ({
      id: evidence.id,
      documentType: evidence.documentType,
      documentTypeLabel: DOCUMENT_LABELS[evidence.documentType] || evidence.documentType,
      url: safeHttpUrl(evidence.canonicalRef),
      publishedAt: evidence.publishedAt || null,
      issuerName: context.entityById.get(evidence.issuerEntityId)?.displayName || null,
    }));
  const claims = array(item.claimIds).map(id => context.claimViewById.get(id)).filter(Boolean);
  const publicationDates = unique(
    [...documents.map(document => document.publishedAt), ...claims.map(claim => claim.assertedAt)].filter(Boolean)
  );
  const correctionIds = context.corrections
    .filter(correction => array(correction.eventIds).includes(item.eventId) && correction.observedAt === item.date)
    .map(correction => correction.id);
  return {
    id: item.id,
    date: item.date || null,
    label: item.label,
    event: presented,
    time: timeRelation(item.date, event),
    publicationDates,
    documents,
    claims,
    correctionIds,
  };
}

function timeRelation(timelineDate, event) {
  const started = event?.startedAt || null;
  const observed = event?.observedAt || null;
  if (!timelineDate) {
    return { kind: 'timeline-date-missing', timelineDate: null, eventStartedAt: started, eventObservedAt: observed, note: 'This update has no timeline date.' };
  }
  if (!started) {
    return {
      kind: 'event-start-not-recorded',
      timelineDate,
      eventStartedAt: null,
      eventObservedAt: observed,
      note: 'The record does not include an event start, so this date is only the timeline date.',
    };
  }
  if (timelineDate === started) {
    return {
      kind: 'timeline-matches-event-start',
      timelineDate,
      eventStartedAt: started,
      eventObservedAt: observed,
      note: `Timeline date matches the recorded event start (${started}).`,
    };
  }
  return {
    kind: 'timeline-differs-from-event-start',
    timelineDate,
    eventStartedAt: started,
    eventObservedAt: observed,
    note: `Timeline date ${timelineDate} is not the event start ${started}. This update is ordered by the record date, not by treating publication order as the order events occurred.`,
  };
}

function presentReporting(sources, sourceEventIds, eventById) {
  const grouped = new Map();
  for (const source of sources.filter(isReporting)) {
    const url = safeHttpUrl(source.url) || '';
    if (!grouped.has(url)) grouped.set(url, []);
    grouped.get(url).push(source);
  }
  const origins = [...grouped.entries()]
    .map(([url, group]) => {
      const eventIds = unique(group.flatMap(source => [...(sourceEventIds.get(source.id) || [])]));
      return {
        url: url || null,
        sourceIds: group.map(source => source.id).sort(),
        name: group[0].name,
        names: unique(group.map(source => source.name)),
        syndicated: group.length > 1,
        independent: group.length === 1,
        note: group.length > 1 ? 'Same document URL. Not counted as a separate report or as corroboration.' : null,
        eventIds,
        eventTitles: eventIds.map(id => eventById.get(id)?.title).filter(Boolean),
        linkLabel: `Read at ${group[0].name}`,
      };
    })
    .sort(byName);
  return {
    note:
      origins.length === 1
        ? 'One publisher report is in this maintained record. Institutional releases are listed separately and are not additional publishers.'
        : 'Each publisher below keeps its own name. Same-URL copies are not extra publishers.',
    origins,
    distinctUrls: origins.filter(item => item.url).length,
  };
}

function presentSource(source, sourceEventIds, eventById) {
  const eventIds = [...(sourceEventIds.get(source.id) || [])].sort();
  return {
    sourceId: source.id,
    name: source.name,
    url: safeHttpUrl(source.url),
    sourceClass: source.sourceClass,
    evidenceRole: source.evidenceRole,
    eventIds,
    eventTitles: eventIds.map(id => eventById.get(id)?.title).filter(Boolean),
    linkLabel: `Open at ${source.name}`,
    note: eventIds.length
      ? null
      : 'This source is listed in the maintained record, and no claim or evidence item cites it. What it says is not in this record.',
  };
}

function presentEvidence(item, context) {
  const issuer = context.entityById.get(item.issuerEntityId);
  const supersededBy = context.evidence
    .filter(other => array(other.supersedesEvidenceIds).includes(item.id))
    .map(other => other.id)
    .sort();
  return {
    id: item.id,
    documentType: item.documentType,
    documentTypeLabel: DOCUMENT_LABELS[item.documentType] || item.documentType,
    voice: 'primary-document',
    voiceLabel: 'Primary document in the evidence record',
    issuerId: item.issuerEntityId,
    issuerName: issuer?.displayName || null,
    url: safeHttpUrl(item.canonicalRef),
    publishedAt: item.publishedAt || null,
    effectiveAt: item.effectiveAt || null,
    eventIds: unique(item.eventIds),
    supersedes: unique(item.supersedesEvidenceIds),
    supersededBy,
    provenanceRefs: array(item.provenanceRefs).filter(ref => typeof ref === 'string'),
  };
}

function presentCorrection(correction, context) {
  const issuer = context.entityById.get(correction.issuerEntityId);
  return {
    id: correction.id,
    status: correction.status,
    observedAt: correction.observedAt || null,
    issuerName: issuer?.displayName || null,
    issuerEntityId: correction.issuerEntityId,
    description: correction.description,
    url: safeHttpUrl(correction.correctedRef),
    originalArtifactRetained: correction.originalArtifactRetained === true,
    historyNote:
      correction.originalArtifactRetained === true
        ? 'The earlier artifact is retained in this record.'
        : 'The earlier artifact is not retained in this record. The correction does not erase that gap.',
    unknowns: array(correction.unknowns).filter(item => typeof item === 'string'),
    eventIds: unique(correction.eventIds),
    evidenceIds: unique(correction.evidenceIds),
    claimIds: unique(correction.claimIds),
  };
}

function collectStoryPlaces(dossier, entityById, events) {
  const ids = unique([
    ...array(dossier?.geography?.placeEntityIds),
    ...array(events).flatMap(event => array(event.placeEntityIds)),
  ]);
  const onEvents = new Set(array(events).flatMap(event => array(event.placeEntityIds)));
  return ids
    .map(id => {
      const entity = entityById.get(id);
      if (!entity || entity.type !== 'place') return null;
      const parentId = entity.attributes?.parentPlaceEntityId || null;
      const parent = parentId ? entityById.get(parentId) : null;
      const country = entity.countryEntityId ? entityById.get(entity.countryEntityId) : null;
      return {
        entityId: entity.id,
        name: entity.displayName,
        identityKey: entity.identityKey,
        standardIds: entity.standardIds || null,
        basis: onEvents.has(entity.id) ? 'event-place' : 'dossier-geography',
        parentPlaceName: parent?.type === 'place' ? parent.displayName : null,
        countryName: country?.type === 'place' ? country.displayName : null,
        placePage: null,
      };
    })
    .filter(Boolean)
    .sort(byName);
}

function latestUpdate(chronology) {
  const dated = chronology.filter(item => ISO_DATE.test(item.date || ''));
  if (!dated.length) {
    return {
      date: null,
      timeKind: null,
      note: 'No timeline date is recorded.',
      items: [],
    };
  }
  const date = dated.map(item => item.date).sort().at(-1);
  const items = dated
    .filter(item => item.date === date)
    .map(item => ({
      id: item.id,
      label: item.label,
      eventId: item.event?.id || null,
      eventStartedAt: item.event?.startedAt || null,
    }));
  return {
    date,
    timeKind: 'timeline-date',
    note: 'Latest timeline date in the maintained record. It is the date of a recorded update, not a claim that every event happened then.',
    items,
  };
}

function dedupeUnknowns(items) {
  const byText = new Map();
  for (const item of items) {
    if (!item.text) continue;
    const existing = byText.get(item.text);
    if (!existing) {
      byText.set(item.text, {
        kind: item.kind,
        basis: unique(item.basis),
        text: item.text,
        eventId: item.eventId || null,
        correctionId: item.correctionId || null,
      });
      continue;
    }
    existing.basis = unique([...existing.basis, ...item.basis]);
    if (!existing.eventId && item.eventId) existing.eventId = item.eventId;
    if (!existing.correctionId && item.correctionId) existing.correctionId = item.correctionId;
  }
  return [...byText.values()].sort((a, b) => compareText(a.text, b.text));
}

function eventAnchor(eventKey) {
  const slug = String(eventKey || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `event-${slug}` : null;
}

function isReporting(source) {
  return Boolean(source && (source.evidenceRole === 'reporting' || source.sourceClass === 'independent-reporting'));
}

function isPrimaryRecord(source) {
  return Boolean(source && (PRIMARY_ROLES.has(source.evidenceRole) || ['court-record', 'regulatory-record', 'corporate-filing'].includes(source.sourceClass)));
}

function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function byAsserted(a, b) {
  return compareText(a.assertedAt, b.assertedAt) || compareText(a.id, b.id);
}

function byName(a, b) {
  return compareText(a.name, b.name) || compareText(a.url || a.id || a.sourceId, b.url || b.id || b.sourceId);
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function addIds(set, ids) {
  if (!set) return;
  for (const id of array(ids)) if (typeof id === 'string' && id) set.add(id);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(array(values).filter(value => typeof value === 'string' && value))].sort();
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

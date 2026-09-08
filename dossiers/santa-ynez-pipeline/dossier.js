const DOSSIER_API = '/api/intelligence/dossiers/santa-ynez-pipeline';

const app = document.getElementById('dossier-app');
const statusLine = document.getElementById('dossier-status');
const errorPanel = document.getElementById('dossier-error');

loadDossier();

async function loadDossier() {
  try {
    const response = await fetch(DOSSIER_API, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`Evidence API returned HTTP ${response.status}`);
    const dossier = await response.json();
    if (dossier?.validation?.valid !== true || dossier?.integrity?.valid !== true) {
      throw new Error('Evidence graph failed integrity validation');
    }
    if (dossier.dossierId !== 'santa-ynez-pipeline') {
      throw new Error('Unexpected dossier identity');
    }

    renderDossier(dossier);
    document.body.dataset.dossierReady = 'true';
    app.setAttribute('aria-busy', 'false');
    statusLine.textContent = `Integrity validated · ${dossier.claims.length} attributed claims · ${dossier.evidence.length} evidence records`;
  } catch (error) {
    document.body.dataset.dossierError = 'true';
    app.setAttribute('aria-busy', 'false');
    errorPanel.hidden = false;
    errorPanel.textContent = `This dossier is unavailable because GlobalDeets could not verify a consistent evidence graph. ${errorMessage(error)}`;
    statusLine.textContent = 'Evidence graph withheld';
    document.getElementById('integrity-label').textContent = 'Integrity check failed';
    document.getElementById('reviewed-label').textContent = 'Inconsistent intelligence is not published';
  }
}

function renderDossier(dossier) {
  const sourceById = new Map(dossier.sources.map(source => [source.id, source]));
  const entityById = new Map(dossier.entities.map(entity => [entity.id, entity]));
  const eventById = new Map(dossier.events.map(event => [event.id, event]));
  const claimById = new Map(dossier.claims.map(claim => [claim.id, claim]));
  const evidenceById = new Map(dossier.evidence.map(evidence => [evidence.id, evidence]));

  document.getElementById('integrity-label').textContent = 'Graph integrity validated';
  document.getElementById('reviewed-label').textContent = `Reviewed ${formatDate(dossier.reviewedAt)} · version ${dossier.dossierVersion}`;
  setText('stat-entities', dossier.entities.length);
  setText('stat-events', dossier.events.length);
  setText('stat-claims', dossier.claims.length);
  setText('stat-evidence', dossier.evidence.length);

  renderClaimCards(
    'established-claims',
    dossier.claims.filter(claim => claim.type === 'fact-assertion' && claim.state === 'corroborated'),
    sourceById
  );

  renderConflicts(dossier.claimRelations, claimById, sourceById);

  renderClaimCards(
    'attributed-claims',
    dossier.claims.filter(
      claim => claim.state === 'single-source' || claim.type === 'official-position'
    ),
    sourceById
  );

  renderCorrections(dossier.corrections, entityById, evidenceById);
  renderTimeline(dossier.timeline, eventById, claimById, evidenceById);
  renderEvidence(dossier.evidence, entityById);
  renderSources(dossier.sources);
  renderUnknowns(dossier.unknowns);
}

function renderClaimCards(containerId, claims, sourceById) {
  const container = document.getElementById(containerId);
  container.replaceChildren(
    ...claims.map(claim => {
      const source = sourceById.get(claim.originSourceId);
      const card = element('article', 'claim-card');
      const meta = element('div', 'claim-meta');
      meta.append(
        pill(humanize(claim.state)),
        pill(humanize(claim.type))
      );
      card.append(
        meta,
        element('p', null, claim.proposition),
        element('p', 'claim-source', `Origin: ${source?.name || claim.originSourceId}`)
      );
      if (source?.url) card.append(recordLink(source.url, 'Open origin record'));
      return card;
    })
  );
}

function renderConflicts(relations, claimById, sourceById) {
  const container = document.getElementById('conflict-list');
  const conflicts = relations.filter(relation => relation.relation === 'contradicts');
  container.replaceChildren(
    ...conflicts.map(relation => {
      const leftClaim = claimById.get(relation.claimId);
      const rightClaim = claimById.get(relation.relatedClaimId);
      const card = element('article', 'conflict-card');
      card.append(
        conflictSide(leftClaim, sourceById),
        element('div', 'conflict-divider', 'conflicts with'),
        conflictSide(rightClaim, sourceById)
      );
      return card;
    })
  );
}

function conflictSide(claim, sourceById) {
  const side = element('div', 'conflict-side');
  if (!claim) {
    side.append(element('p', null, 'Referenced claim unavailable.'));
    return side;
  }
  const source = sourceById.get(claim.originSourceId);
  side.append(
    element('div', 'claim-meta', source?.name || claim.originSourceId),
    element('p', null, claim.proposition)
  );
  if (source?.url) side.append(recordLink(source.url, 'Open attributed source'));
  return side;
}

function renderCorrections(corrections, entityById, evidenceById) {
  const container = document.getElementById('correction-list');
  container.replaceChildren(
    ...corrections.map(correction => {
      const card = element('article', 'correction-card');
      const issuer = entityById.get(correction.issuerEntityId);
      const evidence = correction.evidenceIds.map(id => evidenceById.get(id)).filter(Boolean);
      card.append(
        element('div', 'claim-meta', `${formatDate(correction.observedAt)} · ${issuer?.displayName || 'Attributed issuer'}`),
        element('strong', null, 'Correction retained in the provenance graph'),
        element('p', null, correction.description),
        element(
          'p',
          'claim-source',
          correction.originalArtifactRetained
            ? 'The original corrected artifact is retained.'
            : 'The original mistaken artifact is not retained in this snapshot; that absence remains explicit.'
        )
      );
      if (evidence[0]?.canonicalRef) card.append(recordLink(evidence[0].canonicalRef, 'Open corrected record'));
      return card;
    })
  );
}

function renderTimeline(timeline, eventById, claimById, evidenceById) {
  const container = document.getElementById('timeline-list');
  container.replaceChildren(
    ...timeline.map(item => {
      const event = eventById.get(item.eventId);
      const claims = item.claimIds.map(id => claimById.get(id)).filter(Boolean);
      const evidence = item.evidenceIds.map(id => evidenceById.get(id)).filter(Boolean);
      const row = element('li', 'timeline-item');
      const copy = element('div', 'timeline-copy');
      copy.append(
        element('div', 'timeline-meta', `${humanize(event?.eventType || 'event')} · ${humanize(event?.status || 'recorded')}`),
        element('h3', null, item.label)
      );
      if (claims.length) copy.append(element('p', null, claims.map(claim => claim.proposition).join(' ')));
      if (evidence.length) {
        const refs = element('div', 'timeline-meta');
        refs.append(...evidence.map(record => pill(humanize(record.documentType))));
        copy.append(refs);
      }
      row.append(element('time', 'timeline-date', formatDate(item.date)), copy);
      return row;
    })
  );
}

function renderEvidence(evidence, entityById) {
  const container = document.getElementById('evidence-list');
  container.replaceChildren(
    ...evidence.map(record => {
      const issuer = entityById.get(record.issuerEntityId);
      const card = element('article', 'evidence-card');
      const meta = element('div', 'evidence-meta');
      meta.append(pill(humanize(record.documentType)), pill(formatDate(record.publishedAt)));
      card.append(
        meta,
        element('h3', null, issuer?.displayName || 'Primary record'),
        element('p', 'evidence-issuer', record.evidenceKey),
        recordLink(record.canonicalRef, 'Open source record')
      );
      return card;
    })
  );
}

function renderSources(sources) {
  const container = document.getElementById('source-list');
  container.replaceChildren(
    ...sources.map(source => {
      const row = element('div', 'source-row');
      row.append(
        element('strong', null, source.name),
        element('span', null, `${humanize(source.sourceClass)} · ${humanize(source.evidenceRole)}`),
        recordLink(source.url, 'Open')
      );
      return row;
    })
  );
}

function renderUnknowns(unknowns) {
  const container = document.getElementById('unknown-list');
  container.replaceChildren(...unknowns.map(unknown => element('li', null, unknown)));
}

function pill(text) {
  return element('span', 'pill', text);
}

function recordLink(url, label) {
  const link = element('a', 'record-link', `${label} ↗`);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function setText(id, value) {
  document.getElementById(id).textContent = String(value);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function humanize(value) {
  return String(value || '').replace(/-/g, ' ');
}

function formatDate(value) {
  if (!value) return 'date unavailable';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

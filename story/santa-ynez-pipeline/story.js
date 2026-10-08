/**
 * Renders a maintained story from the shipped record (story.json).
 * A live API copy is used only when it keeps the same story id and the
 * no-summary, no-truth-score rules. Original links in the page stay either way.
 */
(function () {
  'use strict';

  const key = document.body.dataset.storyKey;
  const body = document.getElementById('story-body');
  const fallback = document.getElementById('story-fallback');
  const status = document.getElementById('story-load-status');
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  load();

  async function load() {
    let shipped;
    try {
      const response = await fetch('./story.json', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('shipped record unavailable');
      shipped = await response.json();
      if (!acceptable(shipped)) throw new Error('shipped record rejected');
    } catch {
      if (status) {
        status.textContent = 'The detailed record could not be loaded. Original links below remain available.';
      }
      return;
    }
    render(shipped);
    if (fallback) fallback.hidden = true;
    if (status) status.textContent = 'Showing the reviewed record shipped with this page.';
    document.body.dataset.storyReady = 'true';
    refresh(shipped);
  }

  async function refresh(shipped) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`/api/intelligence/stories/${encodeURIComponent(key)}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return;
      const live = await response.json();
      if (!acceptable(live) || live.storyId !== shipped.storyId) {
        if (status) {
          status.textContent =
            'A newer copy was rejected because it broke the story rules. Showing the reviewed record shipped with this page.';
        }
        return;
      }
      if (live.dossierVersion === shipped.dossierVersion && live.reviewedAt === shipped.reviewedAt) return;
      render(live);
      if (status) status.textContent = 'Showing the maintained record from the story API.';
    } catch {
      /* The shipped record is already on the page. */
    } finally {
      clearTimeout(timer);
    }
  }

  function acceptable(view) {
    return Boolean(
      view &&
        view.storyKey === key &&
        view.rules &&
        view.rules.truthScore === false &&
        view.rules.editorialVerdict === false &&
        view.rules.proseSummary === false &&
        view.understanding &&
        view.understanding.proseSummary == null &&
        view.grouping &&
        view.grouping.isEventIdentity === false
    );
  }

  function render(view) {
    body.innerHTML = [
      understanding(view),
      chronology(view),
      reporting(view),
      statements(view),
      evidence(view),
      unresolved(view),
      corrections(view),
      context(view),
      notes(view),
    ].join('');
  }

  function understanding(view) {
    const block = view.understanding;
    const conflict = (block.conflicting || [])
      .map(pair => {
        return `<article class="story-claim">
          <p class="story-voices">Not yet resolved</p>
          <h3>Conflicting accounts</h3>
          ${claimBody(pair.left)}
          ${claimBody(pair.right)}
          <p class="story-note">${esc(pair.note || '')}</p>
        </article>`;
      })
      .join('');
    return section(
      'understanding-heading',
      'Latest understanding',
      `<p class="story-note">${esc(block.reason || '')}</p>
       <p class="story-note">${esc(block.sort || '')}</p>
       ${conflict}
       ${claimGroup('Reviewed evidence record', block.corroborated)}
       ${claimGroup('Other attributed claims', block.other)}`
    );
  }

  function claimGroup(title, claims) {
    if (!claims || !claims.length) return '';
    return `<h3>${esc(title)}</h3>${claims.map(claimCard).join('')}`;
  }

  function claimCard(claim) {
    if (!claim) return '';
    return `<article class="story-claim" data-claim-id="${esc(claim.id)}">
      ${claimBody(claim)}
    </article>`;
  }

  function claimBody(claim) {
    if (!claim) return '<p class="story-note">The related claim is not in this record.</p>';
    const origin = claim.origin || {};
    const when = claim.assertedAt ? ` · asserted ${formatDate(claim.assertedAt)}` : '';
    const wording = claim.sourceWording
      ? `<p class="story-note"><strong>${esc(claim.sourceWordingLabel || 'Retained wording.')}</strong> ${esc(claim.sourceWording)}</p>`
      : '';
    const state = claim.stateNote ? `<p class="story-note">${esc(claim.stateNote)}</p>` : '';
    const docs = (claim.documents || [])
      .map(document =>
        externalLink(document.url, `Open the ${document.documentTypeLabel || 'document'}${document.issuerName ? ` from ${document.issuerName}` : ''}`)
      )
      .join('');
    const publisher =
      origin.evidenceRole === 'reporting'
        ? externalLink(origin.url, `Read at ${origin.name || 'the publisher'}`)
        : externalLink(origin.url, `Open at ${origin.name || 'the source'}`);
    return `<p class="story-voices">${esc((claim.voiceLabels || []).join(' · ') || 'Attributed claim')}</p>
      <p class="story-proposition">${esc(claim.proposition || '')}</p>
      <p class="story-meta"><strong>${esc(origin.name || 'Source not named')}</strong>${esc(when)}</p>
      ${wording}${state}
      <p>${publisher}${docs}</p>`;
  }

  function chronology(view) {
    const items = (view.chronology || [])
      .map(item => {
        const event = item.event;
        const differs = item.time && item.time.kind === 'timeline-differs-from-event-start';
        const eventLink = event
          ? `<a href="#${esc(event.anchor)}">${esc(event.title)}</a>`
          : 'Event not in this record';
        const links = []
          .concat((item.documents || []).map(document => externalLink(document.url, `Open the ${document.documentTypeLabel || 'document'}`)))
          .concat(
            (item.claims || [])
              .filter(claim => claim.origin && claim.origin.evidenceRole === 'reporting')
              .map(claim => externalLink(claim.origin.url, claim.origin.name ? `Read at ${claim.origin.name}` : 'Read at the publisher'))
          )
          .join('');
        return `<li>
          <p class="story-meta"><time datetime="${esc(item.date || '')}">${esc(formatDate(item.date))}</time> · timeline date</p>
          <p class="${differs ? 'story-time-differs' : 'story-note'}">${esc(item.time ? item.time.note : '')}</p>
          <h3>${esc(item.label || '')}</h3>
          <p class="story-meta">Event: ${eventLink}${event ? ` · ${esc(event.statusLabel || '')}` : ''}${item.correctionIds && item.correctionIds.length ? ' · correction recorded' : ''}</p>
          <p>${links}</p>
        </li>`;
      })
      .join('');
    return section(
      'chronology-heading',
      'Chronology',
      `<p class="story-note">${esc(view.chronologyNote || '')}</p><ol class="story-chrono">${items}</ol>`
    );
  }

  function reporting(view) {
    const block = view.reporting || { origins: [] };
    const items = (block.origins || [])
      .map(origin => {
        return `<article class="story-source">
          <h3>${esc(origin.name || 'Unnamed publisher')}</h3>
          <p class="story-note">${origin.syndicated ? esc(origin.note || '') : 'Publisher reported. The original headline is not copied into this record.'}</p>
          <p class="story-meta">${esc((origin.eventTitles || []).join('; ') || 'No event is attached.')}</p>
          <p>${externalLink(origin.url, origin.linkLabel || `Read at ${origin.name || 'the publisher'}`)}</p>
        </article>`;
      })
      .join('');
    return section('reporting-heading', 'Reporting', `<p class="story-note">${esc(block.note || '')}</p>${items}`);
  }

  function statements(view) {
    const items = (view.statements || [])
      .map(source => {
        return `<article class="story-source">
          <h3>${esc(source.name || 'Unnamed source')}</h3>
          <p class="story-meta">${esc(source.evidenceRole || 'role not recorded')}${source.eventTitles && source.eventTitles.length ? ` · ${esc(source.eventTitles.join('; '))}` : ''}</p>
          ${source.note ? `<p class="story-note">${esc(source.note)}</p>` : ''}
          <p>${externalLink(source.url, source.linkLabel || `Open at ${source.name || 'the source'}`)}</p>
        </article>`;
      })
      .join('');
    if (!items) return '';
    return section(
      'statements-heading',
      'Official statements',
      `<p class="story-note">Institutional statements are not news reports and are not extra publishers.</p>${items}`
    );
  }

  function evidence(view) {
    const items = (view.evidence || [])
      .map(item => {
        const history =
          item.supersedes && item.supersedes.length
            ? `<p class="story-note">Supersedes an earlier evidence record. Both remain in the record.</p>`
            : '';
        return `<article class="story-evidence">
          <p class="story-voices">${esc(item.voiceLabel || 'Primary document')}</p>
          <h3>${esc(item.documentTypeLabel || item.documentType || 'Document')}</h3>
          <p class="story-meta"><strong>${esc(item.issuerName || 'Issuer not named')}</strong>${item.publishedAt ? ` · published ${esc(formatDate(item.publishedAt))}` : ''}</p>
          ${history}
          <p>${externalLink(item.url, `Open the document${item.issuerName ? ` from ${item.issuerName}` : ''}`)}</p>
        </article>`;
      })
      .join('');
    return section(
      'evidence-heading',
      'Evidence',
      `<p class="story-note">These are primary documents in the evidence record. They are distinct from publisher reporting above.</p>${items}`
    );
  }

  function unresolved(view) {
    const block = view.unresolved || { items: [] };
    const items = (block.items || []).map(item => `<li>${esc(item.text || '')}</li>`).join('');
    return section(
      'unresolved-heading',
      'What remains unresolved',
      `<p class="story-note">${esc(block.intro || '')}</p><ul class="story-unknowns">${items}</ul>`
    );
  }

  function corrections(view) {
    const items = (view.corrections || [])
      .map(item => {
        const gaps = (item.unknowns || []).map(text => `<li>${esc(text)}</li>`).join('');
        return `<article class="story-correction">
          <p class="story-voices">${esc(item.status || 'correction')} · ${esc(formatDate(item.observedAt))}</p>
          <p class="story-meta"><strong>${esc(item.issuerName || 'Issuer not named')}</strong></p>
          <p class="story-proposition">${esc(item.description || '')}</p>
          <p class="story-note">${esc(item.historyNote || '')}</p>
          ${gaps ? `<ul class="story-unknowns">${gaps}</ul>` : ''}
          <p>${externalLink(item.url, 'Open the corrected release')}</p>
        </article>`;
      })
      .join('');
    const superseded = (view.supersededClaims || [])
      .map(claim => `<article class="story-claim"><p class="story-voices">Superseded</p><p class="story-proposition">${esc(claim.proposition || '')}</p></article>`)
      .join('');
    const empty = items || superseded ? '' : '<p class="story-note">No correction is recorded in this maintained story.</p>';
    return section(
      'corrections-heading',
      'Corrections and record history',
      `<p class="story-note">A change stays visible. This page does not replace an earlier state silently.</p>${empty}${items}${superseded}`
    );
  }

  function context(view) {
    const places = (view.places || [])
      .map(place => {
        const basis = place.basis === 'event-place' ? 'Named on an event in this record.' : 'Named in the dossier geography, not as an event pin by itself.';
        const parent = place.parentPlaceName ? ` Parent recorded: ${place.parentPlaceName}.` : '';
        const country = place.countryName ? ` Country/area recorded: ${place.countryName}.` : '';
        const page = place.placePage ? '' : ' No place page is published for this record yet.';
        return `<li><strong>${esc(place.name)}</strong> — ${esc(basis + parent + country + page)}</li>`;
      })
      .join('');
    const events = (view.events || [])
      .map(event => {
        const start = event.startedAt ? `Event start ${formatDate(event.startedAt)}` : 'Event start not recorded';
        const observed =
          event.observedAt && event.observedAt !== event.startedAt ? `; observed ${formatDate(event.observedAt)}` : '';
        return `<li id="${esc(event.anchor)}"><strong>${esc(event.title)}</strong> — ${esc(event.statusLabel || '')}. ${esc(start + observed)}.</li>`;
      })
      .join('');
    const entities = (view.entities || [])
      .map(entity => `<li><strong>${esc(entity.name)}</strong> — ${esc(entity.typeLabel || entity.type || '')}</li>`)
      .join('');
    return section(
      'context-heading',
      'Places and entities',
      `<p class="story-note">${esc(view.placeNote || '')}</p>
       <p class="story-note">${esc(view.grouping ? view.grouping.note : '')}</p>
       <ul class="story-place-list">${places}</ul>
       <h3>Distinct events in this story</h3>
       <ul class="story-entity-list">${events}</ul>
       <h3>Other entities named in the record</h3>
       <ul class="story-entity-list">${entities}</ul>`
    );
  }

  function notes(view) {
    const items = (view.readingNotes || []).map(note => `<li>${esc(note)}</li>`).join('');
    return section(
      'notes-heading',
      'How to read this',
      `<ul class="story-notes">${items}</ul>
       <p><a class="story-context-link" href="/dossiers/santa-ynez-pipeline/">Open the evidence graph</a>
       <a class="story-context-link" href="/">Back to the World Desk</a></p>`
    );
  }

  function section(id, title, inner) {
    return `<section class="story-section" aria-labelledby="${id}"><h2 id="${id}">${esc(title)}</h2>${inner}</section>`;
  }

  function externalLink(url, label) {
    if (!url) return '<span class="story-missing-link">Link not recorded</span>';
    return `<a class="story-read-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
  }

  function formatDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!match) return iso ? String(iso) : 'Date not recorded';
    const month = MONTHS[Number(match[2]) - 1];
    if (!month) return iso;
    return `${month} ${Number(match[3])}, ${match[1]}`;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();

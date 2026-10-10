/**
 * Renders a maintained story from the shipped record (story.json).
 * A live API copy is used only when it keeps the same story id and the
 * no-summary, no-truth-score rules. Original links in the page stay either way.
 * Evaluation fixtures use the same renderer and are not public stories.
 */
(function () {
  'use strict';

  const fixturePage = document.body.dataset.storyFixture === 'true';
  const key = document.body.dataset.storyKey;
  const body = document.getElementById('story-body');
  const fallback = document.getElementById('story-fallback');
  const status = document.getElementById('story-load-status');
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!fixturePage) recordStoryMeasurement('story-opened', key);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !(event.target instanceof window.Element)) return;
    const details = event.target.closest('details.story-disclosure[open]');
    if (!details) return;
    event.preventDefault();
    details.open = false;
    details.querySelector('summary')?.focus();
  });

  load();

  async function load() {
    const slowTimer = setTimeout(() => {
      setStatus('Loading the detailed record. Original links above remain available.');
    }, 300);
    let shipped;
    try {
      const response = await fetch('./story.json', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('shipped record unavailable');
      shipped = await response.json();
      if (!acceptable(shipped)) throw new Error('shipped record rejected');
    } catch {
      clearTimeout(slowTimer);
      setStatus('The detailed record could not be loaded. Original links below remain available.');
      if (body) body.setAttribute('aria-busy', 'false');
      return;
    }
    clearTimeout(slowTimer);
    render(shipped);
    if (fallback) fallback.hidden = true;
    setStatus('Detailed record loaded.');
    document.body.dataset.storyReady = 'true';
    if (!fixturePage) refresh(shipped);
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
        setStatus('A newer copy was rejected because it broke the story rules. Showing the reviewed record.');
        return;
      }
      if (live.dossierVersion === shipped.dossierVersion && live.reviewedAt === shipped.reviewedAt) return;
      render(live);
      setStatus('Updated from the maintained record.');
    } catch {
      /* The shipped record is already on the page. A failed refresh does not remove it. */
    } finally {
      clearTimeout(timer);
    }
  }

  function acceptable(view) {
    const rulesOk = Boolean(
      view &&
        view.rules &&
        view.rules.truthScore === false &&
        view.rules.editorialVerdict === false &&
        view.rules.proseSummary === false &&
        view.understanding &&
        view.understanding.proseSummary == null &&
        view.grouping &&
        view.grouping.isEventIdentity === false
    );
    if (!rulesOk) return false;
    if (fixturePage) return view.fixture === true;
    return view.storyKey === key && view.fixture !== true;
  }

  function render(view) {
    applyFixtureIdentity(view);
    showFreshness(view);
    body.innerHTML = [
      localNavigation(),
      recordAtGlance(view),
      understanding(view),
      chronology(view),
      reporting(view),
      publisherComparison(view),
      statements(view),
      evidence(view),
      unresolved(view),
      corrections(view),
      context(view),
      notes(view),
    ].join('');
    body.setAttribute('aria-busy', 'false');
    // Save only a successfully validated and actually rendered public record
    // version. No account, activity history or passive tracking is introduced.
    if (!fixturePage && typeof view.dossierVersion === 'string' &&
        /^\d{4}-\d{2}-\d{2}\.\d{1,4}$/.test(view.dossierVersion)) {
      document.body.dataset.storyVersion = view.dossierVersion;
      document.dispatchEvent(new window.Event('globaldeets:reviewed-story-rendered'));
    }
  }

  function applyFixtureIdentity(view) {
    if (!fixturePage) return;
    const title = document.getElementById('story-title');
    if (title) title.textContent = view.title || 'Untitled maintained record';
    const kicker = document.getElementById('story-kicker');
    if (kicker) kicker.textContent = view.statusLabel || 'Status not recorded';
    const places = document.getElementById('story-places');
    if (places) {
      const names = (view.places || []).map(place => place.name).filter(Boolean);
      places.textContent = names.length
        ? `Places named in this record: ${names.join(', ')}. These are record places, not a publisher’s location.`
        : 'No event location is recorded. This page does not infer one from a publisher, a feed region, or a language.';
    }
    const latest = document.getElementById('story-latest');
    if (latest) {
      latest.textContent = view.latestUpdate?.date
        ? `Latest record date: ${formatDate(view.latestUpdate.date)}`
        : view.latestUpdate?.note || 'No record date is recorded. This page does not invent one.';
    }
    const lead = document.getElementById('story-lead');
    if (lead) {
      const origin = (view.reporting?.origins || []).find(item => item.url) || view.reporting?.origins?.[0];
      lead.innerHTML = origin
        ? externalLink(origin.url, origin.linkLabel || `Read at ${origin.name || 'the publisher'}`)
        : '<span class="story-missing-link">No publisher link is recorded.</span>';
    }
    const dek = document.getElementById('story-dek');
    if (dek) dek.textContent = view.dek ? `Maintained record description: ${view.dek}` : '';
    if (view.title) document.title = `${view.title} | GlobalDeets`;
  }


  function localNavigation() {
    const links = [
      ['Latest understanding', 'understanding-heading'],
      ['Chronology', 'chronology-heading'],
      ['Publisher comparison', 'comparison-heading'],
      ['Evidence', 'evidence-heading'],
      ['Corrections', 'corrections-heading'],
      ['Unresolved', 'unresolved-heading'],
    ];
    return '<nav class="story-local-nav" aria-label="Story sections">' +
      links.map(([label, id]) => '<a href="#' + id + '">' + esc(label) + '</a>').join('') + '</nav>';
  }

  function recordAtGlance(view) {
    const distinct = Number.isInteger(view.reporting?.distinctUrls) ? view.reporting.distinctUrls : 0;
    const evidenceCount = Array.isArray(view.evidence) ? view.evidence.length : 0;
    const corrections = Array.isArray(view.corrections) ? view.corrections.length : 0;
    const unknowns = Array.isArray(view.unresolved?.items) ? view.unresolved.items.length : 0;
    const reviewed = view.reviewedAt ? 'Reviewed ' + formatDate(view.reviewedAt) + '.' : 'Review date not recorded.';
    return section('glance-heading', 'Record at a glance',
      '<p class="story-note">' + esc(reviewed) +
      ' These counts describe only this maintained evidence record, not the whole news cycle or a live verdict.</p>' +
      '<ul class="story-quick-facts">' + [
        [distinct, 'Distinct reporting URLs'],
        [evidenceCount, 'Evidence records'],
        [corrections, 'Recorded corrections'],
        [unknowns, 'Unresolved items'],
      ].map(([count, label]) =>
        '<li><strong>' + count + '</strong>' + esc(label) + '</li>').join('') + '</ul>' +
      '<p class="story-note">The review date, source links, corrections and unresolved questions are kept visible. This page does not claim continuous monitoring or independent corroboration.</p>');
  }

  function publisherComparison(view) {
    const origins = (view.reporting?.origins || []).filter(origin => origin && origin.url);
    const distinct = Number.isInteger(view.reporting?.distinctUrls)
      ? view.reporting.distinctUrls
      : new Set(origins.map(origin => origin.url)).size;
    // One-to-one source/URL attribution does NOT prove an independent editorial
    // viewpoint. Require two separately named publishers and nonduplicated URLs
    // before presenting side-by-side reporting origins. Ownership is not inferred.
    const publishers = new Map();
    for (const origin of origins) {
      if (origin.independent !== true || origin.syndicated) continue;
      const name = typeof origin.name === 'string' ? origin.name.trim() : '';
      if (!name) continue;
      const id = name.normalize('NFKC').toLowerCase();
      if (!publishers.has(id)) publishers.set(id, { name, origins: [] });
      publishers.get(id).origins.push(origin);
    }
    const sufficient = publishers.size >= 2;
    const note = sufficient
      ? 'Different named publishers with separate original reporting URLs are shown here. Shared ownership or editorial independence has not been verified; their accounts are not scored for reliability, bias, importance or truth, and agreement is not automatically corroboration.'
      : 'A meaningful side-by-side publisher comparison is not available: fewer than two distinct named publishers with separate, nonduplicated reporting URLs are documented. Official statements and syndicated copies are not extra publishers.';
    const rows = sufficient
      ? '<ul class="story-compare-list">' +
          [...publishers.values()].map(group => {
            const events = [...new Set(group.origins.flatMap(origin => origin.eventTitles || []))];
            const links = group.origins.map(origin =>
              '<p>' + externalLink(origin.url, origin.linkLabel || 'Read the original report') + '</p>'
            ).join('');
            return '<li><strong>' + esc(group.name) + '</strong>' +
              '<p class="story-note">' + esc(events.join('; ') || 'No event attribution recorded.') + '</p>' +
              links + '</li>';
          }).join('') +
        '</ul>'
      : '<p class="story-compare-note">' + esc(note) + '</p>';
    return section('comparison-heading', 'Publisher comparison',
      '<p class="story-note">' + distinct + ' distinct reporting URL' +
      (distinct === 1 ? '' : 's') + ' in this reviewed record. ' +
      (sufficient ? esc(note) : 'Publisher variety on the live feed does not imply corroboration here.') + '</p>' +
      rows);
  }

  function understanding(view) {
    const block = view.understanding;
    const conflict = (block.conflicting || [])
      .map(pair => {
        return `<article class="story-claim" data-claim-state="contradicted">
          <p class="story-voices">Not yet resolved</p>
          <h3>Conflicting accounts</h3>
          ${claimBody(pair.left)}
          ${claimBody(pair.right)}
          <p class="story-note">${esc(pair.note || 'These accounts disagree. This page does not pick a winner.')}</p>
        </article>`;
      })
      .join('');
    const other = block.other || [];
    const single = other.filter(claim => claim.state === 'single-source');
    const rest = other.filter(claim => claim.state !== 'single-source');
    const corroborated = block.corroborated || [];
    const agreement = corroborated.length
      ? ''
      : '<p class="story-note">No claim in this record is marked corroborated. A single source is not shown as agreement between publishers.</p>';
    return section(
      'understanding-heading',
      'Latest understanding',
      `<p class="story-note">${esc(block.reason || '')}</p>
       <p class="story-note">${esc(block.sort || '')}</p>
       ${agreement}
       ${conflict}
       ${claimGroup('Reviewed evidence record', corroborated, 'Corroborated here means distinct origins in the evidence record. It is not a truth score.')}
       ${claimGroup('Single source, not corroboration', single, 'One source stated this. That is not agreement from a second origin.')}
       ${claimGroup('Other attributed claims', rest)}`
    );
  }

  function claimGroup(title, claims, note) {
    if (!claims || !claims.length) return '';
    const noteHtml = note ? `<p class="story-note">${esc(note)}</p>` : '';
    return `<h3>${esc(title)}</h3>${noteHtml}${claims.map(claimCard).join('')}`;
  }

  function claimCard(claim) {
    if (!claim) return '';
    return `<article class="story-claim" data-claim-id="${esc(claim.id)}" data-claim-state="${esc(claim.state || '')}">
      ${claimBody(claim)}
    </article>`;
  }

  function claimBody(claim) {
    if (!claim) return '<p class="story-note">The related claim is not in this record.</p>';
    const origin = claim.origin || {};
    const whenLabel = origin.evidenceRole === 'reporting' ? 'Publication date' : 'Stated';
    const when = claim.assertedAt ? ` · ${whenLabel} ${formatDate(claim.assertedAt)}` : '';
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
      ${translationBlock(origin.translation)}
      ${wording}${state}
      <p>${publisher}${docs}</p>`;
  }

  function chronology(view) {
    const items = (view.chronology || [])
      .map(item => {
        const event = item.event;
        const kind = item.time && item.time.kind;
        const differs = kind && kind !== 'timeline-matches-event-start';
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
          ${dateLabelList(item.dateLabels)}
          <p class="${differs ? 'story-time-differs' : 'story-note'}">${esc(item.time ? item.time.note : '')}</p>
          <h3>${esc(item.label || '')}</h3>
          <p class="story-meta">Event: ${eventLink}</p>
          <p class="story-meta">${event ? esc(event.statusLabel || '') : ''}${item.correctionIds && item.correctionIds.length ? `${event ? ' · ' : ''}correction recorded` : ''}</p>
          <p>${links}</p>
        </li>`;
      })
      .join('');
    const bodyHtml = items
      ? `<ol class="story-chrono">${items}</ol>`
      : '<p class="story-note">No chronology is recorded. This page does not invent times.</p>';
    return section(
      'chronology-heading',
      'Chronology',
      `<p class="story-note">${esc(view.chronologyNote || '')}</p>${bodyHtml}`
    );
  }

  function reporting(view) {
    const block = view.reporting || { origins: [] };
    const items = (block.origins || [])
      .map(origin => {
        return `<article class="story-source" data-reporting="true">
          <h3>${esc(origin.name || 'Unnamed publisher')}</h3>
          <p class="story-note">${origin.syndicated ? esc(origin.note || '') : 'Publisher reported. The original headline is not copied into this record unless the record itself includes it.'}</p>
          ${translationBlock(origin.translation)}
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
          ${translationBlock(source.translation)}
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
        return `<article class="story-evidence" data-evidence="true">
          <p class="story-voices">${esc(item.voiceLabel || 'Primary document')}</p>
          <h3>${esc(item.documentTypeLabel || item.documentType || 'Document')}</h3>
          <p class="story-meta"><strong>${esc(item.issuerName || 'Issuer not named')}</strong> · ${item.publishedAt ? `Document date: ${esc(formatDate(item.publishedAt))}` : 'Document date: not recorded'}</p>
          ${history}
          <p>${externalLink(item.url, `Open the document${item.issuerName ? ` from ${item.issuerName}` : ''}`)}</p>
        </article>`;
      })
      .join('');
    const intro = items
      ? 'These are primary documents in the evidence record. They are distinct from publisher reporting above. A document here is not another publisher.'
      : 'No evidence records are currently attached. Missing evidence is not evidence that none exists.';
    return section('evidence-heading', 'Evidence', `<p class="story-note">${esc(intro)}</p>${items}`);
  }

  function unresolved(view) {
    const block = view.unresolved || { items: [] };
    const items = (block.items || []).map(item => `<li>${esc(item.text || '')}</li>`).join('');
    const list = items ? `<ul class="story-unknowns">${items}</ul>` : '<p class="story-note">Nothing in this record is marked unresolved.</p>';
    return section(
      'unresolved-heading',
      'What remains unresolved',
      `<p class="story-note">${esc(block.intro || 'We do not know yet.')}</p>${list}`
    );
  }

  function corrections(view) {
    const items = (view.corrections || [])
      .map(item => {
        const gaps = (item.unknowns || []).map(text => `<li>${esc(text)}</li>`).join('');
        return `<article class="story-correction">
          <p class="story-voices">Correction date: ${esc(formatDate(item.observedAt))}</p>
          <p class="story-meta"><strong>${esc(item.issuerName || 'Issuer not named')}</strong></p>
          <p class="story-proposition">${esc(item.description || '')}</p>
          <p class="story-note">${esc(item.historyNote || '')}</p>
          ${gaps ? `<ul class="story-unknowns">${gaps}</ul>` : ''}
          <p>${externalLink(item.url, 'Open the corrected release')}</p>
        </article>`;
      })
      .join('');
    const superseded = (view.supersededClaims || [])
      .map(claim => `<article class="story-claim" data-claim-state="superseded"><p class="story-voices">Superseded</p><p class="story-proposition">${esc(claim.proposition || '')}</p></article>`)
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
    const placeBlock = places
      ? `<ul class="story-place-list">${places}</ul>`
      : '<p class="story-note">No event location is recorded. This page does not infer one from a publisher, a feed region, or a language.</p>';
    const events = (view.events || [])
      .map(event => {
        const start = describeWhen(event.startedAt, 'Event start');
        const observed =
          event.observedAt && event.observedAt !== event.startedAt ? `; ${describeWhen(event.observedAt, 'observed')}` : '';
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
       ${placeBlock}
       <h3>Distinct events in this story</h3>
       <ul class="story-entity-list">${events}</ul>
       <h3>Other entities named in the record</h3>
       <ul class="story-entity-list">${entities}</ul>`
    );
  }

  function notes(view) {
    const visible = (view.readingNotes || []).map(note => `<li>${esc(note)}</li>`).join('');
    const extra = (view.detailNotes || []).map(note => `<li>${esc(note)}</li>`).join('');
    const disclosure = extra
      ? `<details class="story-disclosure"><summary>Further notes on this record</summary><ul class="story-notes">${extra}</ul></details>`
      : '';
    const graph = fixturePage
      ? ''
      : '<a class="story-context-link" href="/dossiers/santa-ynez-pipeline/">Open the evidence graph</a>';
    return section(
      'notes-heading',
      'How to read this',
      `<ul class="story-notes">${visible}</ul>
       ${disclosure}
       <p>${graph}<a class="story-context-link" href="/">Back to the World Desk</a></p>`
    );
  }

  function translationBlock(translation) {
    if (!translation || !translation.label) return '';
    const lang = translation.lang ? ` lang="${esc(translation.lang)}"` : '';
    const original = translation.originalHeadline
      ? `<p class="story-original" dir="auto"${lang}><strong>Original headline.</strong> ${esc(translation.originalHeadline)}</p>`
      : '';
    return `<p class="story-note">${esc(translation.label)}</p>${original}`;
  }

  function section(id, title, inner) {
    return `<section class="story-section" aria-labelledby="${id}"><h2 id="${id}">${esc(title)}</h2>${inner}</section>`;
  }

  function externalLink(url, label) {
    const href = safeHttpUrl(url);
    if (!href) return '<span class="story-missing-link">Link not recorded</span>';
    return `<a class="story-read-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}<span class="visually-hidden"> (opens in a new tab)</span></a>`;
  }

  function showFreshness(view) {
    const node = document.getElementById('story-freshness');
    if (!node) return;
    const reviewed = view.reviewedAt && ISO_DATE.test(view.reviewedAt)
      ? `Reviewed ${formatDate(view.reviewedAt)}`
      : 'Review date not recorded';
    const version = view.dossierVersion ? `Content version ${view.dossierVersion}` : 'Content version not recorded';
    node.textContent = `${reviewed}. ${version}.`;
  }

  function dateLabelList(labels) {
    const items = (labels || [])
      .map(entry => `<li>${esc(entry.label || 'Date')}: ${dateValue(entry.date)}</li>`)
      .join('');
    return items ? `<ul class="story-date-list">${items}</ul>` : '';
  }

  function dateValue(iso) {
    if (!iso) return 'not recorded';
    if (!ISO_DATE.test(iso)) return `${esc(String(iso))} (not a full calendar day)`;
    return `<time datetime="${esc(iso)}">${esc(formatDate(iso))}</time>`;
  }

  function describeWhen(iso, label) {
    if (!iso) return `${label} not recorded`;
    if (!ISO_DATE.test(iso)) return `${label} recorded only as ${iso}. No day is invented`;
    return `${label} ${formatDate(iso)}`;
  }

  function formatDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!match) return iso ? String(iso) : 'Date not recorded';
    const month = MONTHS[Number(match[2]) - 1];
    if (!month) return iso;
    return `${month} ${Number(match[3])}, ${match[1]}`;
  }

  function safeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function recordStoryMeasurement(eventName, storyKey) {
    if (eventName !== 'story-opened' && eventName !== 'story-context-opened') return;
    if (typeof storyKey !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storyKey)) return;
    const body = JSON.stringify({ event: eventName, storyKey });
    try {
      if (typeof navigator.sendBeacon === 'function') {
        const sent = navigator.sendBeacon(
          '/api/intelligence/story-measurement',
          new Blob([body], { type: 'text/plain' })
        );
        if (sent) return;
      }
    } catch {
      /* A failed measurement must not affect the story. */
    }
    fetch('/api/intelligence/story-measurement', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();

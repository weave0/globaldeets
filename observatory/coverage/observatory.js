(() => {
  'use strict';

  const endpoint = '/api/intelligence/observatory/coverage';
  const body = document.body;
  const errorPanel = document.getElementById('observatory-error');

  load().catch(() => failClosed());

  async function load() {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Observatory API returned ${response.status}`);
    const data = await response.json();
    assertSafePayload(data);
    render(data);
    body.dataset.observatoryReady = 'true';
  }

  function assertSafePayload(data) {
    if (!data || typeof data !== 'object') throw new Error('Observatory payload missing');
    if (data.observatoryId !== 'coverage-evidence') throw new Error('Observatory identity mismatch');
    if (data.integrity?.valid !== true) throw new Error('Observatory integrity invalid');
    if (
      data.rules?.truthScore !== false ||
      data.rules?.editorialVerdict !== false ||
      data.rules?.compositeCoverageScore !== false ||
      data.rules?.publisherQualityScore !== false ||
      data.rules?.newsCoverageIsEvidenceCoverage !== false ||
      data.rules?.collectionEligibilityRequiresEndpointReview !== true
    ) {
      throw new Error('Observatory semantic contract changed');
    }
    for (const field of ['newsCoverage', 'sourceRights', 'institutionalEvidence', 'evidenceCoverage']) {
      if (!data[field] || typeof data[field] !== 'object') throw new Error(`${field} missing`);
    }
    if (!Array.isArray(data.gaps)) throw new Error('Gap inventory missing');
  }

  function render(data) {
    setText('integrity-status', 'Integrity validated');
    const status = document.getElementById('integrity-status');
    if (status) status.dataset.state = 'valid';
    setText('generated-at', formatDateTime(data.generatedAt));
    setText('observatory-version', data.observatoryVersion);

    const dossiers = array(data.evidenceCoverage.dossiers);
    const unresolvedClaims = dossiers.reduce((sum, dossier) => sum + number(dossier.unresolvedClaimCount), 0);
    const corrections = dossiers.reduce((sum, dossier) => sum + number(dossier.correctionCount), 0);
    const evidenceRecords = dossiers.reduce((sum, dossier) => sum + number(dossier.evidenceCount), 0);

    renderInto('baseline-grid', [
      metric(data.newsCoverage.totalSources, 'Live news sources'),
      metric(data.newsCoverage.gapCount, 'News coverage gaps'),
      metric(data.sourceRights.legacyUnreviewedSources, 'Legacy rights reviews open'),
      metric(data.institutionalEvidence.reviewedSources, 'Institutional candidates reviewed'),
      metric(data.institutionalEvidence.collectionEligibleSources, 'Institutional sources collection-eligible'),
      metric(data.evidenceCoverage.dossierCount, 'Published evidence dossiers'),
      metric(evidenceRecords, 'Evidence records in dossiers'),
      metric(unresolvedClaims, 'Explicit unresolved claims'),
      metric(corrections, 'Correction records'),
    ]);

    renderInto(
      'region-list',
      array(data.newsCoverage.regions).map(region =>
        record(
          titleCase(region.region || 'unknown'),
          region.sourceCount,
          `${region.languageCount} source language${region.languageCount === 1 ? '' : 's'} · ${array(region.languages).join(', ') || 'language identities unavailable'}`
        )
      )
    );

    renderInto(
      'evidence-class-list',
      array(data.evidenceCoverage.evidenceClasses).map(item =>
        record(titleCase(item.documentType), item.count, 'Canonical evidence document type')
      )
    );

    const rights = data.sourceRights;
    renderInto('rights-summary', [
      record('Reviewed live sources', rights.reviewedLiveSources, joinIds(rights.reviewedLiveSourceIds)),
      record('Legacy unreviewed', rights.legacyUnreviewedSources, joinIds(rights.legacyUnreviewedSourceIds)),
      record('Remediation required', array(rights.remediationSourceIds).length, joinIds(rights.remediationSourceIds)),
      record('Unknown rights status', array(rights.unknownRightsSourceIds).length, joinIds(rights.unknownRightsSourceIds)),
      record('Research candidates', array(rights.researchCandidates).length, array(rights.researchCandidates).map(item => item.name).join(' · ')),
    ]);

    const institutional = data.institutionalEvidence;
    renderInto('institutional-summary', [
      record('Classification reviewed', institutional.reviewedSources, 'Evidence role and institutional identity reviewed'),
      record('Issuing-primary candidates', institutional.issuingPrimarySources, 'Role classification only; not collection authority'),
      record('Directory-only', institutional.directoryOnlySources, 'No machine-readable collection authority implied'),
      record('Endpoint-reviewed', institutional.endpointReviewedSources, 'Separately reviewed machine-readable endpoints'),
      record('Collection eligible', institutional.collectionEligibleSources, 'Requires endpoint authority, access, and rights review'),
    ]);

    renderInto('dossier-list', dossiers.map(dossierCard));
    renderInto('gap-list', array(data.gaps).map(gapCard));
  }

  function dossierCard(dossier) {
    const eventsWithoutPrimary = array(dossier.eventCoverage).filter(event => !event.hasPrimaryEvidence).length;
    const eventsWithoutReporting = array(dossier.eventCoverage).filter(event => event.reportingSourceCount === 0).length;
    return element('article', 'dossier-card', [
      element('p', 'eyebrow', [`${dossier.status || 'unknown'} · ${dossier.dossierVersion || 'version unavailable'}`]),
      element('h3', '', [dossier.title || dossier.dossierId]),
      element('div', 'dossier-meta', [
        tag(`${dossier.eventCount} events`),
        tag(`${dossier.claimCount} claims`),
        tag(`${dossier.evidenceCount} evidence records`),
        tag(`${dossier.unresolvedClaimCount} unresolved claims`),
        tag(`${dossier.correctionCount} corrections`),
      ]),
      element('p', '', [
        `${eventsWithoutPrimary} event${eventsWithoutPrimary === 1 ? '' : 's'} without linked primary evidence; ${eventsWithoutReporting} without a claim-origin source classified as reporting.`,
      ]),
      element(
        'div',
        'event-list',
        array(dossier.eventCoverage).map(event =>
          element('div', 'event-row', [
            `${event.title || event.eventId} — ${event.primaryEvidenceCount} primary evidence · ${event.reportingSourceCount} reporting source${event.reportingSourceCount === 1 ? '' : 's'}`,
          ])
        )
      ),
    ]);
  }

  function gapCard(gap) {
    const article = element('article', 'gap-card', [
      element('div', 'gap-header', [
        element('div', '', [
          element('p', 'eyebrow', [gap.domain || 'gap']),
          element('h3', '', [titleCase(gap.type || gap.id)]),
        ]),
        tag(titleCase(gap.severity || 'unknown')),
      ]),
      element('p', '', [gap.detail || 'No detail supplied.']),
      element('div', 'gap-meta', [
        tag(`Observed: ${displayValue(gap.observed)}`),
        tag(`Target: ${displayValue(gap.target)}`),
        ...array(gap.requires).map(requirement => tag(titleCase(requirement))),
      ]),
      element('p', 'gap-action', [element('strong', '', ['Next action: ']), gap.nextAction || 'Review manually.']),
    ]);
    article.dataset.severity = gap.severity || 'info';
    return article;
  }

  function metric(value, label) {
    return element('article', 'metric-card', [
      element('p', 'metric-number', [displayValue(value)]),
      element('p', 'metric-label', [label]),
    ]);
  }

  function record(label, value, detail) {
    return element('div', 'record', [
      element('div', 'record-row', [
        element('span', '', [label]),
        element('span', 'record-value', [displayValue(value)]),
      ]),
      detail ? element('p', 'record-detail', [detail]) : null,
    ]);
  }

  function tag(text) {
    return element('span', 'tag', [text]);
  }

  function element(tagName, className, children = []) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    for (const child of children) {
      if (child == null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function renderInto(id, nodes) {
    const target = document.getElementById(id);
    if (!target) return;
    target.replaceChildren(...nodes.filter(Boolean));
  }

  function setText(id, value) {
    const target = document.getElementById(id);
    if (target) target.textContent = value == null ? '—' : String(value);
  }

  function failClosed() {
    body.dataset.observatoryReady = 'false';
    const status = document.getElementById('integrity-status');
    if (status) {
      status.textContent = 'Payload withheld';
      status.dataset.state = 'invalid';
    }
    for (const id of [
      'baseline-grid',
      'region-list',
      'evidence-class-list',
      'rights-summary',
      'institutional-summary',
      'dossier-list',
      'gap-list',
    ]) {
      const target = document.getElementById(id);
      if (target) target.replaceChildren();
    }
    if (errorPanel) errorPanel.hidden = false;
  }

  function displayValue(value) {
    if (value == null) return 'Unavailable';
    if (typeof value === 'number') return new Intl.NumberFormat('en-US').format(value);
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  function formatDateTime(value) {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function joinIds(values) {
    const items = array(values);
    return items.length ? items.join(' · ') : 'None';
  }

  function titleCase(value) {
    return String(value || '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function number(value) {
    return Number.isFinite(value) ? value : 0;
  }
})();

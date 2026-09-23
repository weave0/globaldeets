// Curated engineering, trust, and business-readiness gap registry for the Mission Control
// observatory (GD-027). This is the single hand-maintained inventory for these gaps — Mission
// Control does not infer or auto-generate curated gaps, only live site-health signals.

export const MISSION_CONTROL_GAP_SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low']);
export const MISSION_CONTROL_GAP_CATEGORIES = Object.freeze([
  'trust',
  'business',
  'operability',
  'engineering',
  'security',
]);
export const MISSION_CONTROL_GAP_STATUSES = Object.freeze(['open', 'in-progress', 'resolved']);

export const MISSION_CONTROL_GAPS = Object.freeze([
  Object.freeze({
    id: 'root-docs-contradict-production',
    site: 'globaldeets.com',
    category: 'trust',
    severity: 'high',
    title: 'Root documentation describes a product that no longer exists',
    observedState:
      "README.md, STATUS.md, and VALIDATION_REPORT.md described a password-gated 12-project portfolio ('weaver' gate, Netlify hosting, Chart.js analytics dashboard) dated Nov 2025, contradicting the public Cloudflare Pages news/civic-data platform actually in production.",
    targetState:
      'Root docs describe the current product truthfully: what GlobalDeets is, how it is governed, and where to find the observatory and mission-control surfaces.',
    nextAction:
      'Resolved: README.md and STATUS.md rewritten against current production; VALIDATION_REPORT.md retired (nothing in it was still accurate).',
    detectedAt: '2026-09-23',
    status: 'resolved',
  }),
  Object.freeze({
    id: 'no-investor-facing-surface',
    site: 'globaldeets.com',
    category: 'business',
    severity: 'high',
    title: 'No page translates engineering maturity into a business narrative',
    observedState:
      'The source-rights governance engine, evidence observatory, mobile certification pipeline, and test coverage are real and substantial, but nothing outside the codebase presents them as business proof points. analytics.html is a leftover portfolio-era Chart.js page unrelated to current product metrics.',
    targetState:
      'A dedicated surface presents infrastructure/trust maturity and, once connected, real traffic and engagement metrics in investor-legible charts, without fabricating numbers that are not measured.',
    nextAction:
      'Build an investor-readiness page sourced from real, defensible counts (sources reviewed, dossiers published, test coverage, uptime) with clearly labeled placeholders for GA4/Cloudflare Analytics/Stripe data pending connector access.',
    detectedAt: '2026-09-23',
    status: 'open',
  }),
  Object.freeze({
    id: 'no-business-model-documented',
    site: 'portfolio',
    category: 'business',
    severity: 'medium',
    title: 'No revenue model, funding ask, or monetization path is documented anywhere in the repo',
    observedState:
      'GLOBALDEETS_VISION.md and GLOBALDEETS_2030_PRODUCT_PLAN.md are thorough on product and content strategy but never address how the product sustains itself beyond a donate.html page.',
    targetState:
      'A short, honest statement of the current monetization posture (donation-supported, pre-revenue, or planned model) exists somewhere an investor would look first.',
    nextAction:
      'Draft a one-page business model / ask summary once direction is confirmed with the founder.',
    detectedAt: '2026-09-23',
    status: 'open',
  }),
  Object.freeze({
    id: 'no-aggregated-revenue-view',
    site: 'globaldeets.com',
    category: 'business',
    severity: 'medium',
    title: 'Stripe donation flow has no aggregated view of donations or conversion',
    observedState:
      'functions/create-checkout.js and functions/get-session.js implement a working Stripe checkout, but there is no dashboard surfacing donation volume, conversion rate, or trend to founders or investors.',
    targetState:
      'A lightweight, access-controlled summary of donation activity is visible without opening the Stripe dashboard directly.',
    nextAction:
      'Add a minimal aggregated metrics read (counts/totals only, no PII) once Stripe reporting access is confirmed.',
    detectedAt: '2026-09-23',
    status: 'open',
  }),
  Object.freeze({
    id: 'ecosystem-site-visibility-gap',
    site: 'portfolio',
    category: 'operability',
    severity: 'medium',
    title: 'Sibling ecosystem sites had no shared operational visibility before Mission Control',
    observedState:
      "aiaimate.com, culturesherpa.org, goodflippinvibes.com, and citizenapproved.org are actively linked from globaldeets.com's ecosystem nav and sphere cards, but were not monitored anywhere — outages or certificate issues on sites nobody actively maintains would go unnoticed.",
    targetState:
      'Live reachability and latency signals for every ecosystem domain are visible in one place, refreshed on every Mission Control load.',
    nextAction:
      "Resolved by this surface's live site-health probes (functions/api/ops/mission-control.js); keep the site registry current as ecosystem domains change.",
    detectedAt: '2026-09-23',
    status: 'resolved',
  }),
]);

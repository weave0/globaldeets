# GlobalDeets — Status

**Last reviewed:** 2026-09-23
**Live site:** <https://globaldeets.com>
**Platform:** Cloudflare Pages + Pages Functions (no build step, no password gate)

This file is a snapshot for humans skimming the repo. For current numbers, prefer the live,
self-validating surfaces over anything written here — they can't go stale the way a status doc can:

- **Coverage & Evidence Observatory** — <https://globaldeets.com/observatory/coverage/> —
  news coverage, evidence coverage, source-rights review debt, unresolved claims
- **Mission Control** — <https://globaldeets.com/mission-control/> — ecosystem site health plus a
  sortable, severity-ranked list of open engineering/trust/business-readiness gaps

## What's live

- Public, ungated news platform with reviewed source admission (21 live sources at last audit, all
  reviewed for usage rights — see `docs/source-admission-rights.md` and the
  `docs/source-admission-audit-*.md` series for the source-by-source disposition).
- Coverage & Evidence Observatory (GD-017) — fail-closed, deliberately score-free.
- One published evidence dossier (`santa-ynez-pipeline`) with claim/evidence modeling and tracked
  corrections.
- Mission Control (GD-027) — live ecosystem site-health probes plus a curated gap registry.
- Mobile production certification work (GD-024/GD-025) across the primary surfaces.
- Stripe-backed donation flow (`donate.html`).
- CI-gated: required files, per-file syntax checks, lint, the full `node:test` function suite,
  Playwright smoke tests (desktop + two mobile viewports), and a staged-deploy dry run on every
  push/PR to `main`.

## What this replaces

This repo previously hosted a different, unrelated product: a password-gated portfolio showcase of
12 client projects (Netlify-hosted, Chart.js analytics dashboard, "weaver" session gate). That
product is retired. If you find a doc still describing it — dated around November 2025 — it's
stale; flag it or fix it rather than trusting it.

## Known gaps

The authoritative, prioritized list lives in Mission Control (`functions/lib/mission-control-gaps.js`,
rendered at `/mission-control/`). As of this review, the open items include: no page yet translates
the platform's engineering/trust maturity into a business-facing narrative, and no monetization
model is documented beyond the donate flow. Check Mission Control directly rather than assuming
this list is current — it updates the moment the registry does; this file doesn't.

## Where to look next

- `README.md` — repository map and quick start
- `GLOBALDEETS_VISION.md` / `GLOBALDEETS_2030_PRODUCT_PLAN.md` — product direction
- `docs/` — contract documentation for each major surface (observatory, Mission Control,
  source-admission rights, claim/evidence model, entity/event model)

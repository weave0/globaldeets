# GlobalDeets

**A source-first live world atlas** — credible news, an interactive globe, a public-knowledge
directory, and a growing evidence-governance layer, served as a static Cloudflare Pages site with
Cloudflare Pages Functions for anything that needs to reach out or cache.

Live: <https://globaldeets.com>

> `STATUS.md` has the current production snapshot. This file is the map of what's in the repo and
> how to work in it.

## What this actually is

GlobalDeets is not the password-gated portfolio showcase it started as. The current product is a
public news and civic-data platform built around one idea: **show what can be observed and what
evidence backs it, and make the gaps explicit instead of papering over them.**

- **News** (`news.html`, `functions/api/news*.js`) — live feeds from a reviewed set of sources,
  each admitted through an explicit source-rights review (see `docs/source-admission-rights.md`
  and the `docs/source-admission-audit-*.md` series). Nothing is scraped and republished without a
  documented usage basis.
- **Coverage & Evidence Observatory** (`/observatory/coverage/`, `docs/coverage-observatory.md`) —
  a fail-closed, self-validating surface that shows news coverage, evidence coverage, source-rights
  debt, and unresolved claims as separate, explicit signals. It deliberately does not compute a
  truth score, a publisher-quality score, or any composite "trust" number.
- **Mission Control** (`/mission-control/`, `docs/mission-control.md`) — a live operational-health
  radar over GlobalDeets and the sibling ecosystem sites (culturesherpa.org, aiaimate.com,
  goodflippinvibes.com, citizenapproved.org), plus a sortable, severity-ranked gap list covering
  engineering, trust, and business-readiness gaps.
- **Evidence dossiers** (`dossiers/`) — claim/evidence-modeled investigative write-ups. The first,
  `santa-ynez-pipeline`, tracks events, claims, evidence, corrections, and explicitly unresolved
  claims rather than presenting a single settled narrative.
- **Globe / worldmap** (`globe.html`, `worldmap.html`) — the interactive globe experience and the
  original Cesium-based webcam globe (kept at `/worldmap`).
- **Knowledge directory** (`knowledge.html`, `data/knowledge-sources.json`) — links straight to
  official, primary sources by category (governance, science, health, economy, etc.).
- **Ecosystem spheres** (`spheres.html`) — the five linked Good Flippin Design properties:
  GlobalDeets, Culture Sherpa, aiaimate, Good Flippin Vibes, and Citizen Approved.
- **Donate** (`donate.html`, `functions/create-checkout.js`, `functions/get-session.js`) — a
  working Stripe checkout flow.

See `GLOBALDEETS_VISION.md` and `GLOBALDEETS_2030_PRODUCT_PLAN.md` for product direction.

## Architecture

- **No build step.** Vanilla HTML/CSS/JS, no bundler. Cloudflare Pages serves the repo root
  directly (`pages_build_output_dir = "."` in `wrangler.toml`).
- **Cloudflare Pages Functions** (`functions/`) handle anything server-side: news aggregation and
  caching (KV-backed), the observatory and Mission Control APIs, Stripe checkout, and machine
  translation for non-English feeds via Workers AI.
- **Tests**: `node:test` for function/contract logic (`tests/*.test.mjs`), Playwright for
  browser-facing smoke tests including two mobile viewports (`tests/*.spec.js`).
- **CI** (`.github/workflows/ci.yml`): required-file checks, syntax checks on every function/lib
  module, lint, the full function test suite, Playwright smoke tests, and a staged-deploy dry run.

## Working conventions

Substantial changes are tracked as numbered work items (`GD-0XX`) with a matching entry in
`docs/` when the change introduces a new contract or surface — see `docs/coverage-observatory.md`
and `docs/mission-control.md` for the pattern: an explicit statement of what the surface does and,
just as importantly, what it deliberately does **not** claim.

## Quick start

```bash
npm install
npm run dev              # vite dev server on :5500
npm run lint              # eslint
npm run test:functions    # node:test — function/contract suite
npm run test:smoke        # Playwright — browser smoke tests
npm run build              # metadata + format, pre-deploy
```

Cloudflare Pages Functions (the `/api/*` routes) are not served by `npm run dev` — that's a plain
static server. Use `wrangler pages dev .` if you need the Functions running locally, or point
`PLAYWRIGHT_BASE_URL` at a deployed preview for full-stack Playwright runs.

## Deployment

Cloudflare Pages, configured via `wrangler.toml`. KV namespace `NEWS_CACHE` backs the news feed
cache; Workers AI (`[ai]` binding) powers machine translation for non-English sources. Security
headers live in `_headers`. `tools/stage-deploy.js` and `tools/deploy-pages.js` handle staging and
deploy; the `tools/verify-*-prod.js` scripts independently re-check the live site's contracts after
a deploy (see `.github/workflows/deploy.yml`).

## Repository map

```text
index.html, news.html, globe.html, worldmap.html,
knowledge.html, spheres.html, about.html, donate.html   Public pages
observatory/coverage/                                    Coverage & Evidence Observatory
mission-control/                                          Operational-health gap radar
dossiers/santa-ynez-pipeline/                             Published evidence dossier
functions/api/                                            Cloudflare Pages Functions (routes)
functions/lib/                                             Shared contract/model logic
data/                                                       Curated static data (knowledge sources)
docs/                                                        Contract docs, source-admission audits
tests/                                                        node:test + Playwright suites
tools/                                                        Deploy, staging, prod-verification scripts
```

## License

MIT

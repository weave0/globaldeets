# GlobalDeets

GlobalDeets is a source-first world news desk: the latest reporting from publishers around the world, each story linking to the original, with source provenance, reuse limits, and coverage gaps shown openly. The longer-term direction is **the world's open information desk, organized by place**.

**Live:** https://globaldeets.com  
**Coverage & Evidence Observatory:** https://globaldeets.com/observatory/coverage/

## Reader promise

> Understand what is happening, where it is happening, who reported it, what evidence exists, what remains uncertain, and what changed since your last visit.

GlobalDeets is not an opinion feed, not a portfolio showcase, and not the public directory of sibling GFD products. Publisher origin, feed routing region, and event location are different facts and are never presented as one another. There is no truth, bias, or quality score.

## Product authority

- **`docs/NEWS_PRODUCT_ROADMAP.md`** — the adopted reader roadmap (R0–R9), progress ledger, and public route inventory. It supersedes conflicting public-product guidance in older plans.
- **`docs/NEWS_UX_ACCEPTANCE.md`** — the reader journeys and the automated checks that gate each release.
- `GLOBALDEETS_2030_PRODUCT_PLAN.md` / `GLOBALDEETS_VISION.md` — the broader thesis. Their ecosystem-navigation proposals are superseded by the GD-037/GD-038 public boundary.
- Root-level portfolio-era documents (`PORTFOLIO.md`, `QUICK_START.md`, `DEPLOYMENT*.md`, and similar) are archival.

## Public surfaces

| Route | Purpose |
| --- | --- |
| `/` | World Desk: dated latest reporting, feed-region entry points, coverage at a glance |
| `/news` | Full news feed with region filter (`?region=`), source context, and rights-aware cards |
| `/categories` | Browse by feed region and by publisher |
| `/timeline` | Recent reporting grouped by publication day |
| `/globe`, `/worldmap` | Optional discovery lenses: globe pins at approximate publisher locations or labeled feed-region fallbacks (never story locations); public webcams |
| `/knowledge` | Public institutions and reference sources |
| `/observatory/coverage/` | Coverage, provenance, rights, and gap evidence |
| `/dossiers/santa-ynez-pipeline/` | Evidence dossier: claims, evidence, contradictions, corrections |

## Internal estate tooling

Mission Control and GFD estate operations are **not** part of the public product (GD-037). The `tools/mission-control/` collector and `observatory/mission-control/` data plane still live in this repository for GFD administration, are stripped from the deploy artifact by `tools/stage-deploy.js`, and are guarded in production by `tools/verify-boundary-retired-prod.js`. See `docs/mission-control-gd031.md` for that system.

## Development

```bash
npm install
npm run lint
npm run test:functions   # node:test contracts for the API and evidence models
npm run test:smoke       # Playwright reader, mobile, and boundary specs
npm run dev              # local site on http://localhost:5500 (reads the production API)
```

Deploys run through `.github/workflows/deploy.yml`, which stages a clean artifact and then verifies the exact production deployment (intelligence, observatory, reader, secondary mobile surfaces, and the public boundary).

## Evidence rule

When a number matters, prefer a live governed endpoint, a reproducible production check, or an explicitly cited and dated source. Edge requests are not people, missing measurement is not zero, and a deployment does not make old news current.

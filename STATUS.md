# GlobalDeets — Current Status

**Status date:** 2026-10-06  
**Product state:** Live source-first world news desk  
**Canonical public surface:** `/` (World Desk) and `/news`  
**Controlling roadmap:** `docs/NEWS_PRODUCT_ROADMAP.md`

> **Supersession note.** The September 24 version of this file named `/observatory/mission-control/` as the canonical operating surface. GD-037 retired Mission Control from the public product, and GD-038 retired the public GFD portfolio directory. Estate operations belong to GFD administration. Do not route public-product work back through Mission Control.

## Reader product

Status of the roadmap's R1 release ("Reader reset", GD-038) on branch `feat/gd038-world-desk`:

| Item | State |
| --- | --- |
| Region-switch race (F4) | Fixed: request generation + abort; regression spec `tests/gd038-feed-reliability.spec.js` |
| Independent, time-bounded trust panels (F5) | Fixed: each panel has its own 8s deadline; the feed has 15s |
| Distinct failure states (loading, upstream, timeout, offline, empty, no-match, load-more failure) | Implemented and tested |
| World Desk homepage | Implemented: dated latest reporting, feed-region entry points, coverage strip |
| Portfolio directory retirement (F1) | Done: `projects-*`, `platform-modal.js`, templates, `bb-content.html` removed; categories/timeline rebuilt |
| Honest globe geography | Done: each pin is labeled `publisher-approximate` or `region-fallback` (unmapped publishers such as Minnesota Reformer and CalMatters); neither claims story location |
| Service worker | Fixed precache (it previously named missing files); offline API copies are labeled |
| Boundary verifier checks semantics | Done: `tools/verify-boundary-retired-prod.js` |
| Stories-first News page and compact cards (F3) | Implemented; first-view regression at 390×844, 360×800, 360×640 |
| Labeled shared navigation (Today, News, Browse, More) | Implemented on all primary pages |
| Service worker install, upgrade, labeled offline copy | Implemented; dedicated SW-enabled spec |
| Light mode | Deferred to R7; not part of this release |
| Production deploy of the above | Not deployed; must pass the deploy workflow's exact-artifact verification |

Static/dynamic source truth (F6) is already on `main` (8459811) with raw-HTML and fallback regressions; the older `feat/gd0260-static-source-truth` branch is superseded.

## R2 story intelligence

On `feat/gd-r2-story-intelligence`, which is based on unmerged PR #80 (`18f29105baed6fa9b8b98f1ddc4cad090e017394`) and is not deployed:

| Item | State |
| --- | --- |
| Maintained story `/story/santa-ynez-pipeline/` | Implemented from the Santa Ynez dossier. The story id does not replace event ids |
| Reader API | `GET /api/intelligence/stories` and `GET /api/intelligence/stories/santa-ynez-pipeline` |
| Shipped record | `story.json` matches the projection. Review date and content version stay visible when the API is down. The story page registers the service worker so a direct link reloads from the precache offline |
| Headline link | "Context & sources" only when `/api/news` marks that exact article URL. The client maps are gone. The Los Angeles Times URL is not in the admitted feed, so live cards do not show it until an admitted item carries that URL |
| Additional public stories | Not invented. One maintained story carries the single-source, multi-source, conflicting, corrected, and limited-evidence cases |
| Incomplete-data states | Evaluation fixtures only (`functions/lib/story-evaluation-fixtures.js`). Not indexed, not linked from the desk, not real-world reporting |
| Place pages | Not part of this slice |

## Evidence state

Production verification is produced by the deploy workflow, not by this document. When this file and a live check disagree, the live check wins. Operational edge telemetry is not certified human audience; no reader-retention baseline exists yet (roadmap R9).

## Known engineering debt

- Many root-level Markdown files describe the retired portfolio product and are archival.

# GlobalDeets reader acceptance checklist

Each release of the public reader product must pass this checklist. Every row is backed by an automated check, so a verifier can run it without asking anyone to click through the site. Where no automation exists yet, the row says so. An unautomated row is not "passing."

Run locally:

```bash
npm run lint
npm run test:functions
npx playwright test
```

The main suite blocks service workers so request mocks stay deterministic; `tests/gd038-service-worker.spec.js` re-enables them to test the real worker.

Production checks run in `.github/workflows/deploy.yml` against the exact deployed artifact.

## R1: Reader reset

| # | Reader journey / invariant | Automated check |
| --- | --- | --- |
| 1 | A new visitor sees dated, newest-first reporting on the homepage, explicitly not ranked by importance | `gd038-world-desk.spec.js`: "homepage leads with dated latest reporting…" |
| 2 | Every story identifies its publisher and opens the original in a new tab; unsafe URLs never become links | same spec |
| 3 | Routing region is labeled as a feed, never as story location. Globe pins carry an explicit `publisher-approximate` or `region-fallback` label, and neither claims story location | `gd038-release-review.spec.js`: "globe pins carry an explicit, honest location kind"; feed labels: `gd038-world-desk.spec.js`: "homepage leads with dated latest reporting…" |
| 4 | Changing region never shows another region's stories, even when an earlier request finishes late | `gd038-feed-reliability.spec.js`: "a slow earlier region…" |
| 5 | A region view is shareable and restorable by URL | `gd038-feed-reliability.spec.js`: "a region deep link…" |
| 6 | A hung or failing trust service degrades only its own panel; headlines stay | `gd038-feed-reliability.spec.js`: "a hung trust endpoint…"; `smoke.spec.js`: "news trust endpoints fail open…"; `gd022-reader-evidence-bridge.spec.js`: "core headlines survive…" |
| 7 | Feed failure, true-empty region, no-match filter, and load-more failure are distinct, honest, and recoverable in place | `gd038-feed-reliability.spec.js` (three tests); `gd038-world-desk.spec.js`: "homepage latest-reporting failure…" |
| 8 | Card display honors source-use permissions (headline-only, excerpt limits, translation labels) | `gd021-news-policy.spec.js`, `gd022-reader-evidence-bridge.spec.js`, `news-functions.test.mjs` |
| 9 | No GFD portfolio content, sibling-product domains, or Mission Control on public pages | `gd038-world-desk.spec.js`: "public pages and the deploy root…"; production: `tools/verify-boundary-retired-prod.js` |
| 10 | Phone widths (390, 360): no horizontal overflow; primary controls ≥ 44×44 CSS px | `mobile-reader.spec.js`, `mobile-secondary-surfaces.spec.js`; production: `verify-reader-prod.js`, `verify-secondary-mobile-prod.js` |
| 11 | Source count shown before JavaScript matches the canonical registry | `smoke.spec.js`: "homepage raw HTML exposes the canonical live source count…" |
| 12 | Offline readers are told they are seeing saved stories; the warning stays visible with details collapsed | `gd038-service-worker.spec.js` (real worker); `gd038-first-view.spec.js` (warning placement) |
| 12a | The service worker installs (every precached file exists) and retires the previous cache | `gd038-service-worker.spec.js` |
| 12d | A first install followed immediately by offline navigation keeps News styling (including the injected bridge stylesheet) and More-menu behavior; the precache covers every asset the shell pages load | `gd038-service-worker.spec.js`: "first install, then immediately offline…"; `offline-shell-agreement.test.mjs` |
| 12e | Only the site header is sticky; headers inside content (World Desk dateline, modal headers) stay in flow | `gd038-release-review.spec.js`: "only the site header is sticky…" |
| 12b | On phones (390×844, 360×800, 360×640) the first headline, its publisher, and its source action are visible without scrolling on the homepage and News | `gd038-first-view.spec.js` |
| 12c | Primary destinations have visible labels; "More" opens and closes by keyboard and returns focus | `gd038-first-view.spec.js` |
| 13 | Keyboard-only and screen-reader journeys | **Not automated yet** (R7) |
| 14 | WebKit and Firefox engines | **Not automated yet** (R7; current projects are Chromium-only) |

## R2: Story intelligence

The first story is the maintained Santa Ynez dossier, not a generated summary and not a cluster of live headlines. Automated checks live in `tests/story-intelligence.test.mjs` and `tests/gd-r2-story.spec.js`.

| # | Reader journey / invariant | Automated check |
| --- | --- | --- |
| 15 | A stable story URL opens a maintained record: title, developing status, record places, latest record date, and the publisher action | `gd-r2-story.spec.js`: "story identity is on the first phone screen" |
| 16 | Chronology separates a timeline date from an earlier event start | same spec: "chronology does not treat publication order as event order" |
| 17 | Reporting, primary documents, contradictions, corrections, and unresolved items stay distinct. Unknown stays unknown | same spec: "the record keeps conflict, evidence, correction, and unknowns" |
| 18 | Original links remain when the shipped record or the story API fails, and a copy that adds a truth score or a prose summary is rejected | same spec: "original links survive a failed record" and "a rule-breaking API copy is rejected" |
| 19 | Story grouping is not event identity. Same-origin and same-URL copies are not corroboration. Places are not inferred from a publisher | `story-intelligence.test.mjs` |
| 20 | A news card links to a story only for an exact maintained reporting URL | `story-intelligence.test.mjs`: "headline context links are exact maintained URLs" |
| 21 | Phone widths 390, 360, and 320 do not overflow, and the first screen is the story rather than a stat grid | `gd-r2-story.spec.js` |

## Release evidence

A release is accepted only with: green CI for the merge commit, green deploy-workflow verifiers against the deployed artifact, and a recorded rollback target (the previous Pages deployment). "Looks good" is not evidence.

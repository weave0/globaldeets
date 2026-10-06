# GlobalDeets reader acceptance checklist

Each release of the public reader product must pass this checklist. Every row is backed by an automated check, so a verifier can run it without asking anyone to click through the site. Where no automation exists yet, the row says so. An unautomated row is not "passing."

Run locally:

```bash
npm run lint
npm run test:functions
npx playwright test
```

Production checks run in `.github/workflows/deploy.yml` against the exact deployed artifact.

## R1: Reader reset

| # | Reader journey / invariant | Automated check |
| --- | --- | --- |
| 1 | A new visitor sees dated, newest-first reporting on the homepage, explicitly not ranked by importance | `gd038-world-desk.spec.js`: "homepage leads with dated latest reporting…" |
| 2 | Every story identifies its publisher and opens the original in a new tab; unsafe URLs never become links | same spec |
| 3 | Routing region is labeled as a feed, never as story location; globe pins are labeled as publisher cities | `gd038-world-desk.spec.js`: "homepage no longer carries portfolio…" |
| 4 | Changing region never shows another region's stories, even when an earlier request finishes late | `gd038-feed-reliability.spec.js`: "a slow earlier region…" |
| 5 | A region view is shareable and restorable by URL | `gd038-feed-reliability.spec.js`: "a region deep link…" |
| 6 | A hung or failing trust service degrades only its own panel; headlines stay | `gd038-feed-reliability.spec.js`: "a hung trust endpoint…"; `smoke.spec.js`: "news trust endpoints fail open…"; `gd022-reader-evidence-bridge.spec.js`: "core headlines survive…" |
| 7 | Feed failure, true-empty region, no-match filter, and load-more failure are distinct, honest, and recoverable in place | `gd038-feed-reliability.spec.js` (three tests); `gd038-world-desk.spec.js`: "homepage latest-reporting failure…" |
| 8 | Card display honors source-use permissions (headline-only, excerpt limits, translation labels) | `gd021-news-policy.spec.js`, `gd022-reader-evidence-bridge.spec.js`, `news-functions.test.mjs` |
| 9 | No GFD portfolio content, sibling-product domains, or Mission Control on public pages | `gd038-world-desk.spec.js`: "public pages and the deploy root…"; production: `tools/verify-boundary-retired-prod.js` |
| 10 | Phone widths (390, 360): no horizontal overflow; primary controls ≥ 44×44 CSS px | `mobile-reader.spec.js`, `mobile-secondary-surfaces.spec.js`; production: `verify-reader-prod.js`, `verify-secondary-mobile-prod.js` |
| 11 | Source count shown before JavaScript matches the canonical registry | `smoke.spec.js`: "homepage raw HTML exposes the canonical live source count…" |
| 12 | Offline readers are told they are seeing saved stories | Service worker marks offline API copies; **no automated browser test yet** |
| 13 | Keyboard-only and screen-reader journeys | **Not automated yet** (R7) |
| 14 | WebKit and Firefox engines | **Not automated yet** (R7; current projects are Chromium-only) |

## Release evidence

A release is accepted only with: green CI for the merge commit, green deploy-workflow verifiers against the deployed artifact, and a recorded rollback target (the previous Pages deployment). "Looks good" is not evidence.

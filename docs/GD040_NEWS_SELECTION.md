# GD-040 — Explainable Publisher-Diverse World Desk

Status: **Candidate stacked on GD-038. Not merged to main or deployed to production.** The stable News reader and Timeline remain chronological.

## The observed failure

The original homepage requests the first eight items from a globally pooled, newest-first RSS aggregation. Because acquisition permits up to twenty items per source and the combined list is sorted by publication timestamp, a frequently posting outlet (for example, ABC Australia) can occupy all eight places even when several other currently available publishers have reporting.

This is **supply concentration**, not evidence that ABC Australia's reporting is low quality or politically biased.

## Selection contract

- `/api/news` defaults to `selection.mode=chronological`: existing newest-first ordering unchanged. Unknown mode values also fail back to chronological.
- `/api/news?mode=diverse` opts in to `gd040-publisher-region-rotation-v1`.
- Apply existing source-admission and item-permission decisions **before** selection. Never recover excluded headlines, summaries, translations or links.
- Start from the already governed, region-filtered candidate list. Sort a copy by actual publication timestamp; stable source/ID tie breakers make equal-time results deterministic.
- Establish the freshest **published timestamp in the available snapshot**. Partition items into the 36-hour-relative candidate window and older backfill. This is *not* a claim that any item is 36 hours old or newer today. When the whole feed is stale, show dated reporting honestly, not a false live badge.
- For in-window items, group by **source's feed-routing region**, then by canonical publisher identity. Choose one per feed region per pass and rotate publishers inside each region; the most recently publishing region begins a pass. No outlet, country, viewpoint, political alignment or region receives a truth/importance weight.
- After all in-window items, append remaining items in strict publication order. Stable URL query pagination occurs only after the full deterministic ordering, so a cached snapshot returns nonoverlapping pages.
- Do not confuse feed-routing region with event location, outlet country, editorial stance, geographic diversity of subjects, or independent corroboration. The selection has no causal or global-representation guarantee.

## API and reader semantics

Both ordering modes preserve the same total and admission fingerprint. The response carries a transparent `selection` descriptor with policy version, explanation, and window. The homepage displays **Across publishers** plus a visible description and direct **See newest first** link to the unaltered News list.

The homepage is not a newsroom-produced Top Stories, a universal fairness/bias index, or a promise that six feed regions had fresh content at request time. If few feeds are healthy, repetition remains possible and must be disclosed by the source-health/coverage observatory rather than masked with old content.

## Regression and release evidence

- Simulate 16 sequential ABC Australia items plus six other publishers. Chronological top eight are all ABC; diverse top eight cover at least five different publishers and regions.
- Verify the 36-hour boundary prevents older items from being promoted above fresher items; all are eventually reachable.
- Verify equal timestamps and missing dates, stable reorder under input permutation, cached pagination completeness, unrecognized-mode fallback, and region-filtering correctness.
- Browser test requires the homepage to request `mode=diverse` and provide the chronological path; original publisher links and rights labels survive.
- Branch preview workflow verifies exact SHA, Functions+Playwright, live-mode contract and a reviewed screenshot. It is a **technical** check: actual international representativeness requires observed source-health and geography metrics, not a test fixture.

## Next differentiated-intelligence step

Collect nonidentifying diagnostics: proportion of first eight headlines by publisher/region, age distribution, available-source count, feed failures, source opens, and Story Intelligence context opens. This is coverage-selection accountability, not a score assigning trust, political bias, or importance to individual outlets. Compare these signals before/after launch with the same admission list and source health. The separate GD-R2.1 dossier remains the only maintained article-to-story association until reviewed membership expands.

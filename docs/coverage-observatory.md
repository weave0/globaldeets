# GlobalDeets Coverage Observatory

Phase II begins by measuring what the production news contract can and cannot see before adding more feeds.

## Current production baseline

The observatory derives its inventory directly from `SOURCES` in `functions/api/news.js` so the analysis cannot silently drift from the deployed ingestion contract.

At the Phase II baseline (`0fc253fb2d3297f5b15c3dbfface64db1ee8a597`):

- 19 configured sources
- 7 coarse regions
- 2 source languages
- 18/19 sources are English-language inputs
- NHK is the only non-English source-language input
- Pacific has one configured source, so it has no feed-level redundancy
- Africa, Americas, Europe, Middle East, and Pacific have only English-language source inputs in the present contract

These are coverage signals, not judgments about truth, ideology, or publisher quality.

## API

`GET /api/news/coverage`

Returns a deterministic inventory containing:

- current source fingerprint
- total sources, regions, and source languages
- English-language concentration
- per-region source counts and language diversity
- per-language source counts
- explicit gap signals generated from a small documented policy

The endpoint is intentionally read-only and does not probe feeds. Operational availability remains the responsibility of `/api/news/health`.

## Initial gap policy

The first policy is intentionally narrow and auditable:

1. A region with fewer than two configured feeds emits a high-severity `regional-redundancy` signal.
2. A non-global region with English-only source inputs emits a medium-severity `source-language-diversity` signal.
3. If at least 80% of the complete source portfolio is English-language input, the portfolio emits a high-severity `portfolio-language-concentration` signal.

These thresholds are diagnostics, not permanent editorial doctrine. They create a measurable baseline from which better source research can proceed.

## Deliberate non-goals of GD-012

This tranche does **not** yet claim to measure:

- publisher ownership or independence
- primary-vs-secondary evidence
- country-level geographic coverage
- topic/beat coverage
- viewpoint or political diversity
- article-level corroboration or contradiction
- source reliability or factual accuracy

Those require explicit provenance metadata and evidence modeling rather than guesses inferred from a publisher name or feed URL.

## Next tranche

GD-013 should add a reviewed source-provenance registry beside the runtime feed definitions. The registry should use explicit fields for source class, geographic scope, locality, organization type, languages, and evidence role, with validation that every live feed has a provenance record. That will allow the observatory to expose substantially more meaningful blind spots without contaminating the feed-cache identity contract.

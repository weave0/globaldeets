# GD-052 — Article origin and exact-link traces

GlobalDeets now exposes **bounded origin clues on individual News cards** rather than making editorial inferences from headlines. This extends GD-050/051, which describe publishers and organizations, to the article metadata GlobalDeets actually receives.

## Reader contract

The openable **Article origin signals** panel shows two distinct observations:

1. **Feed-declared source link.** A direct RSS `<source>`, `<dc:source>`, or original-link marker may contain a URL. We compare its host with the exact news-article URL host. Statuses are `not-recorded`, `unresolved-marker`, `same-article-host-reference`, `external-host-reference`, and `mixed-references`. These are **metadata classifications, not editorial findings**. A source marker does not prove who first investigated an event, who wrote the article, whether material was syndicated, or who controls the publisher.
2. **Exact article URL overlap.** Within one bounded 15-minute regeneration snapshot, if two or more **distinct admitted source feeds** link to an **identical article URL**, the panel records the count and the other monitored publishers. A matching headline is never enough. The same publisher's repeats are not counted twice. The model neither strips tracking parameters nor guesses a canonical URL. A duplicate link does not constitute another independently corroborating report.

There are no automatic assertions of coordinated editorial activity, political affiliation, truth, quality, trust scores, or agenda. Unrecorded or invalid data stays unknown. The sidebar Source Network and rights/admission disclosures remain separate.

## Pipeline

- `functions/lib/article-origin-trace.js` parses only **direct item-level source markers**; embedded article HTML, XML comments, and CDATA cannot create a source marker. Non-HTTPS, credential-bearing, local, malformed, overly large, and conflicting references never produce clickable evidence.
- `functions/api/news.js` projects only safe structured marker metadata, **after existing admission policy**. It then adds exact-URL matches among items surviving that policy. These two signals are attached before KV persistence, and `gd052-feed-origin-v1` participates in feed-cache identity so old cached items cannot masquerade as the new model.
- No new third-party fetches, AI calls, database tables, paid APIs, subscriptions, broad text reproduction, or additional publisher admissions are required. The 21-source production registry stays unchanged.
- Client UI shows only escaped text and an HTTPS, credential-free feed link. The primary article link always goes to the original publisher as before.
- The service worker's existing news-feed offline copy warning applies to cached feed responses. Origin traces in an offline copy are therefore from a **saved snapshot**, not new live findings.

## Evidence strength and known gaps

- RSS item source metadata can be incomplete, inaccurate, or intentionally misleading. It is **publisher/feed-provided**, not independently verified evidence.
- The source link may identify a feed/channel rather than the reporter or article's original newsroom.
- Identical URLs across different feeds show shared links only, not who did the reporting. Different URLs may still represent syndicated/rewritten copies; GD-052 does **not** guess this.
- No ownership relationship is inferred from these data. GD-051's reviewed organizational graph has a separate validation boundary.
- No general multilingual headline-clustering corpus, article-text ingestion, licensing arrangement, or newsroom-byline investigation has been added. Those remain separate future projects with source-specific rights review.

## Release checks

- `tests/gd052-origin-trace.test.mjs`: adversarial XML, invalid/mixed URLs, no false originality claims, exact URL vs similar headline, source deduplication, end-to-end admission/collection wiring.
- `tests/gd052-origin-trace.spec.js`: browser evidence presentation, safe links, missing trust API graceful degradation, keyboard and narrow-mobile layout.
- `tools/verify-reader-prod.js` requires the versioned feed response and a visible, usable origin disclosure in desktop and mobile reader verification.
- `tools/stage-deploy.js` refuses to ship if the new model is missing.

## Next evidence layer

A future **manually reviewed syndication record** can connect two different article URLs only when an explicit, attributable, dated source identifies the licensing, republication, wire-service or original-work relationship. Every relation must carry its actual supporting link, review date, and scope. Similar wording or timestamps are insufficient. No review-free claim may enter a public graph.

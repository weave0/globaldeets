# GD-053 — Article evidence lens

The News reader's evidence lens is a **loaded-story filter**, not a claim about the whole world's news. It extends GD-052's item-level origin signals without fetching new articles, widening the 21 admitted feeds, changing rights treatment, or adding storage, AI, or paid APIs.

## Reader behavior

- **All evidence**: the existing chronological reader.
- **Feed source linked**: one safe, resolvable source/original-link marker is present, regardless of whether it points to the article's host.
- **External host linked**: the source/original-link marker points to a different host. It is a research lead, not proof of syndication.
- **Shared exact URL**: two or more distinct monitored feeds in the same snapshot linked the *identical* article URL. This is not independent corroboration.
- **No resolved link**: no single safe marker was resolved, including missing, invalid, and conflicting markers. This is not proof of firsthand reporting or exclusivity.

The `?signal=...` query parameter makes the filter shareable; the default is `all`. Invalid values fall back to `all`. The region parameter continues to work, and headline search further narrows the current loaded page. Filtering is performed locally on already-received admitted items. **It is not an archive-wide or source-network-wide search.** Results can change when the feed's bounded 15-minute snapshot changes.

Selected evidence cards expand their existing Article origin signals disclosure; default cards stay collapsed to preserve first-screen readability. The interface stays within the existing reader toolbar.

## Scope and cautions

This increment makes GD-052 observations discoverable. It does not construct links between distinct article URLs, establish syndication, infer original reporting, or estimate narrative coordination. Unknowns remain unknown. Reviewer-backed syndication relations, separately documented with dated evidence, remain a future layer.

## Regression contract

`tests/gd052-origin-trace.spec.js` adds desktop and 360px viewport cases covering shareable filters, invalid query parameters, combined search/filter behavior, accessible select height, and no horizontal overflow. Existing CI and production verification remain mandatory; no merge or deployment should be asserted before those checks complete.

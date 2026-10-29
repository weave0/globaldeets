# GD-049 — Article source-hint research classification

Parent: [GD-048 / #99](https://github.com/weave0/globaldeets/issues/99). Baseline: merged PR #115, commit `a4eb801`.

This initial, **offline-only and research-only** module distinguishes explicit, direct article source references from unsupported conclusions about authorship. It does not access feeds, persist item URLs, modify production source contracts or authorize article reproduction. The existing 21 production inputs remain unchanged.

Use `classifyItemSourceHints(innerXml, { publisherHost })` with an item/entry's **inner XML** that was previously structurally validated and bounded by the existing RSS inspector. Never pass arbitrary unvalidated XML as proof of provenance. A `publisher-source-hint` means a direct `source`, `dc:source`, `originalLink` or `feedburner:origLink` references the publisher-host family; it **does not** certify original reporting. An `external-source-hint` indicates a partner-host possibility; `conflicting-source-hints` indicates both. `unresolved` includes missing or unreadable markers. Even in any of these cases, original reporting, article reuse rights, translation authorization and production eligibility remain `false`.

The module deliberately ignores source tags embedded in title, description, article-body or CDATA. Hostname comparisons are constrained to exact host or subdomains, not string prefixes. This is not a semantic licensing engine and cannot establish origin when publishers omit or repurpose the tags.

**Next integration:** Build bounded aggregate-only per-feed counts by category in the existing probe, followed by fixture-backed edge tests, real sample/manual provenance audits and rights review. Do **not** permit a machine-derived source hint to bypass `isProductionAdmissible`, `evaluateItemUse` or existing item-level review. Agency partner content (Agência Brasil) and Global Voices partner/translations must still be separated through independently verified publisher/article evidence.

Run: `node --test tests/source-origin-signals.test.mjs`. No new dependency or paid service.

# GD-049 — Article source-hint research classification

Parent: [GD-048 / #99](https://github.com/weave0/globaldeets/issues/99). Baseline: merged PR #115, commit `a4eb801`.

This initial, **offline-only and research-only** module distinguishes explicit, direct article source references from unsupported conclusions about authorship. It does not access feeds, persist item URLs, modify production source contracts or authorize article reproduction. The existing 21 production inputs remain unchanged.

Use `classifyItemSourceHints(innerXml, { publisherHost })` with an item/entry's **inner XML** that was previously structurally validated and bounded by the existing RSS inspector. Never pass arbitrary unvalidated XML as proof of provenance. A `publisher-source-hint` means a direct `source`, `dc:source`, `originalLink` or `feedburner:origLink` references the publisher-host family; it **does not** certify original reporting. An `external-source-hint` indicates a partner-host possibility; `conflicting-source-hints` indicates both. `unresolved` includes missing or unreadable markers. Even in any of these cases, original reporting, article reuse rights, translation authorization and production eligibility remain `false`.

The module deliberately ignores source tags embedded in title, description, article-body or CDATA. Hostname comparisons are constrained to exact host or subdomains, not string prefixes. This is not a semantic licensing engine and cannot establish origin when publishers omit or repurpose the tags.

**Integrated into the read-only research probe:** Each sampled item now increments exactly one of four aggregate buckets (publisher-host hint, external-host hint, conflicting hints, unresolved). The live GitHub Actions job summary displays only totals, with no article URLs, bylines or content; workflow assertions enforce zero automatic admission and individual-review requirements. The main Function test suite includes both source-hint and probe regression tests.

**Next investigation:** Run the bounded evidence workflow after CI and a governed merge, then undertake real sample/manual provenance audits and rights review. These counts are not an estimate of the number of original articles: publisher hints can represent syndicated material, while missing explicit tags often leave genuine original reports unresolved. Do **not** permit a machine-derived source hint to bypass `isProductionAdmissible`, `evaluateItemUse` or existing item-level review. Agency partner content (Agência Brasil) and Global Voices partner/translations must still be separated through independently verified publisher/article evidence.

Run: `node --test tests/source-origin-signals.test.mjs tests/source-research-probe.test.mjs` or `npm run test:functions`. No new dependency or paid service.

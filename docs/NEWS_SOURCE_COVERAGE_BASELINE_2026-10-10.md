# GlobalDeets news source coverage baseline

**Captured:** 2026-10-10 18:31:21 UTC
**Environment:** `https://globaldeets.com`
**Source fingerprint:** `a8ae04ba`
**Admission fingerprint:** `df3be068`
**Status:** Locally tested baseline; not merged, not a production certification, and not a legal assessment.

## Reproduce

From the repository root, run:

```sh
node tools/report-news-coverage.mjs
```

The reporter reads the existing source, admission, health, and coverage APIs, then samples each routing-region feed using the regions returned by the canonical coverage API. It prints a structured JSON report; it does not create or maintain another source registry.

## Configured portfolio

| Measure                                              | Observation |
| ---------------------------------------------------- | ----------: |
| Configured sources                                   |          21 |
| Feed-routing regions                                 |           7 |
| Publisher countries represented in registry metadata |          16 |
| Configured source languages                          |           2 |
| English / Japanese sources                           |      20 / 1 |
| English share                                        |      95.24% |
| Provenance validation                                |       Valid |
| Admission validation                                 |       Valid |
| Primary-source inputs in coverage contract           |           0 |

The registry's routing distribution is Africa 2, Americas 4, Asia 5, Europe 4, Global 3, Middle East 2, and Pacific 1. Scope metadata classifies 7 sources as global, 9 national, 3 regional, and 2 subnational. The two subnational jurisdiction IDs are `US-CA` and `US-MN`.

The source metadata classifies 17 as reporting and 4 as wire-service sources. This classification is not a measure of editorial independence. Publisher country, declared editorial scope, and feed-routing region do not identify where an individual story's event occurred.

## Rights and endpoint governance

| Admission-ledger allowed-use status | Sources |
| ----------------------------------- | ------: |
| `verified-public-use`               |       3 |
| `permission-required`               |      12 |
| `contract-required`                 |       3 |
| `unknown`                           |       3 |

Endpoint authority is recorded as first-party for 20 endpoints and unverified third-party for 1 (the AP RSSHub route). These are the ledger's reviewed states, not legal conclusions or proof that every item in a feed has identical rights. Item-level restrictions can be stricter than a source-level status.

The admission API's registry review marker is `2026-09-03`; individual records have their own review dates. The reporter preserves those record dates and the separate source/admission fingerprints.

## Health and observed feed output

The health snapshot was generated at `2026-10-10T18:27:50.207Z`, 214 seconds before this capture. It recorded 19 of 21 sources healthy and 2 in error. AP had HTTP 403; Dawn returned HTTP 200 but reported `No stories parsed from source response.` Therefore HTTP success alone is not a usable-feed result. NHK was recorded healthy, but had no appearance in the sampled returned pages.

| Feed routing-region query | Returned / reported total | Distinct canonical URLs | Notes                                                   |
| ------------------------- | ------------------------: | ----------------------: | ------------------------------------------------------- |
| Africa                    |                   75 / 75 |                      75 | Complete response                                       |
| Americas                  |                   78 / 78 |                      78 | Complete response                                       |
| Asia                      |                   99 / 99 |                      99 | Complete response                                       |
| Europe                    |                 100 / 108 |                      99 | Page truncated; one repeated canonical URL in this page |
| Global                    |                 100 / 300 |                     100 | Page truncated                                          |
| Middle East               |                   80 / 80 |                      80 | Complete response                                       |
| Pacific                   |                   60 / 60 |                      60 | Complete response                                       |

Across these seven pages there were 592 story appearances and 296 distinct canonical article URLs in the union. No sampled canonical URL appeared under multiple source IDs. The Europe page had one repeated canonical URL; the reporter now records duplicate counts per page separately from cross-source URL ownership.

These are overlapping, page-limited views, not 592 distinct stories, 296 independent reporting origins, or comprehensive coverage. The `global` query returns all items in the current API contract; other regional queries include globally routed stories. The regional labels therefore describe feed filters, not event geography. All sampled items had valid timestamps and original article URLs in this capture, but a capped sample cannot certify all records or chronological behavior beyond its observed page.

## Research candidates and current gaps

The canonical admission API listed three candidates, all still `research` and not production-admitted:

| Candidate      | Current ledger signal | Unresolved gate                                      |
| -------------- | --------------------- | ---------------------------------------------------- |
| RNZ Pacific    | `permission-required` | Permission review                                    |
| Agencia Brasil | `verified-public-use` | Mixed-rights partner items require item-level review |
| LAist          | `verified-public-use` | Mixed-origin partner items require item-level review |

No candidate was added to ingestion by this baseline. Endpoint reachability or an RSS feed's public accessibility is not permission to reuse its content.

The current registry is heavily English-language, has only two subnational jurisdictions, and has no primary-source inputs in its coverage contract. This baseline does not yet measure story event-country distribution, language per individual item, independently verified publisher ownership, ownership concentration, original-versus-syndicated story volume, story usefulness, or rights at item level beyond the current ledger fields. Candidate qualification and a broader governed lifecycle remain follow-up work.

## Validation and interpretation

The report deliberately keeps source provenance, rights/admission, technical health, feed routing, and story-level observations separate. The health information is a timestamped cached snapshot, while the other API responses were sampled at capture time. The output includes API status and relevant response-cache metadata so later runs can be compared.

Validation for this change:

- `npm run test:functions` — 327 passed.
- `npm run lint` — passed.
- Targeted ESLint for the reporter and test — passed.
- The production reporter was run again after adding per-view duplicate counts; fingerprints, portfolio counts, and feed sample counts were unchanged.

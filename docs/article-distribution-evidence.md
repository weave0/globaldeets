# GD-054 — Documented article distribution

This is a limited, article-level evidence registry, not a general syndication or licensing map. A record describes two exact article URLs and their named source IDs. A wire-attributed version is not asserted to be an identical copy, to be the first publication worldwide, or to establish commercial terms. Publisher-declared republication requires explicit republication credit on the receiving article page. Nothing here certifies truth, bias, editorial control, independent corroboration, or GlobalDeets reuse rights.

## Review and corrections

1. Inspect both first-party article pages, verify the exact URLs, dates, explicit credit and correspondence. Do not admit search-only, similarity-only, image credit, feed hints or shared operator matches. A redirect may be followed in review but is not an automatically matched alias.
2. Record direction, type, date, a concise evidence summary in our own words, and the two links. Keep the review bounded to the pair. Both source IDs must already exist in the governed source registry. Never admit sources through this feature.
3. Validate and test the registry in CI. Validation checks structure, allowed article hosts, dates, conflicting links and one-hop scope; it cannot itself verify external claims. A dated editorial review is required.
4. If evidence changes, set status to withdrawn, add withdrawal date and explanation, retain the stable ID, and release a corrected registry. Withdrawals never match cards; the publisher inspector shows correction history without asserting the prior link as active. Git history retains the changes.
5. Recheck links and credit periodically. No body text, licensing agreement, scraping, new database, or automatic inference is added.

## First reviewed pair

AP and The Guardian, January 11, 2025, Sam Moore obituary. The Guardian's first-party page credits Associated Press in Florida, and the AP-published obituary corresponds with the reporting (including differences). Both pages were inspected on November 25, 2026. The AP short URL redirected to the stored full article URL. The relationship type is wire-attributed-version, not a verified licensing contract.

- https://apnews.com/article/obituary-sam-moore-bcdf09de45e2475a8c016d30b4297709
- https://www.theguardian.com/music/2025/jan/11/soul-man-singer-sam-moore-dies-aged-89-from-surgery-complications

Research lead, not admitted: a Minnesota Reformer article indexed with explicit CalMatters republication credit, June 8, 2025. The indexed text is promising, but direct retrieval of the receiving page returned HTTP 403 in this review. Recheck both first-party pages directly before admission.

## Delivery and failure behavior

The live-only GET /api/news/syndication endpoint returns a fingerprint-bound registry, with no-store response headers. It is not part of the cached feed or service-worker offline authority. Both readers validate the payload independently and fail closed. The News reader requires matching source fingerprint, source ID and exact article URL; it does not display withdrawn records or attach the registry to an offline feed copy. The directory exposes historical pairs on both participating publisher records and distinguishes no reviewed entries from unavailable evidence. In-page data is a session snapshot; reload after a correction. No title similarity, query stripping, automatic redirects, or transitive relationships.

The 21-source admission inventory, existing 15-minute news cache, source rights policy, translations and ranking are unchanged. Production verification checks the live authority, both links on a rendered publisher record when present, and the updated offline shell.

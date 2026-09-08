# Source Admission and Usage-Rights Contract

GlobalDeets separates four questions that were previously easy to conflate:

1. **Publisher provenance** — who publishes/operates the source?
2. **Endpoint authority** — is this feed/API first-party or otherwise authorized?
3. **Technical health** — does the endpoint currently fetch and parse successfully?
4. **Usage/admission state** — is the intended GlobalDeets use reviewed for this endpoint/content?

A positive answer to one does not imply a positive answer to the others. This is an engineering governance ledger, not a legal conclusion.

## Current GlobalDeets use profile

The live RSS pipeline currently normalizes:

- headline/title
- original article link
- RSS description/summary, truncated to 280 characters
- publication timestamp
- source/region/language metadata
- machine-translated headline and summary for non-English feeds when Workers AI succeeds

The admission ledger records that actual use rather than describing GlobalDeets generically as an "RSS reader."

## New-source fail-closed rule

The 19 sources that existed when this gate was introduced are frozen as the legacy set. They may remain visible while their individual reviews migrate from `legacy-unreviewed` to `reviewed`.

Any source outside that frozen set is **new** and fails validation unless its admission record is production-admissible. Production admission requires:

- explicit `reviewed` state
- `verified-public-use` for the intended use
- first-party or reviewed authorized-third-party endpoint authority
- verified technical health
- no unresolved item-level review requirement
- every current use type included in the reviewed permitted-use set

A new source cannot self-label as legacy to bypass the gate.

## Existing 19-source migration

Every live source has an explicit admission record. Most begin as `legacy-unreviewed` with `allowedUseStatus: unknown`; that means "not yet reviewed," not "unauthorized" and not "approved."

Two existing sources have already produced concrete remediation signals:

### AP

The current GlobalDeets AP endpoint is an RSSHub route, not first-party AP access. AP documents its Media API as licensed, account-entitled content ingestion tied to contract terms. The current record therefore remains visible as a legacy source but is classified `contract-required` with `unverified-third-party` endpoint authority. GlobalDeets should not replace RSSHub with another unofficial scraper.

### Guardian

The Guardian's RSS endpoint is first-party, but its published RSS/terms material does not justify marking the present GlobalDeets public use as `verified-public-use` without further permission/licensing review. The record remains visible and is classified `permission-required` pending remediation.

Neither finding silently removes the source or turns an engineering signal into a legal conclusion.

## Research candidates

Rejected/deferred research must remain queryable so dead ends are not repeatedly rediscovered.

### RNZ Pacific

RNZ Pacific remains a `research` candidate with `permission-required` status under the currently reviewed RSS-use signal. The candidate record does not add RNZ to production.

### Agencia Brasil

Agencia Brasil remains a `research` candidate. Its published reproduction policy is promising for journalistic reuse, but partner/syndicated material can carry different restrictions. The candidate is therefore blocked by `itemLevelReviewRequired` until GlobalDeets has a reliable item-origin/restriction strategy.

## Item-level override

Source-level permission never overrides an explicit stricter item signal.

`evaluateItemUse()` applies the more restrictive of the source and item statuses:

- `verified-public-use` → current reviewed display mode
- `unknown`, `permission-required`, `contract-required` → headline/link fallback
- `prohibited` → exclude

This gives future collectors a deterministic conservative behavior when a feed mixes publisher-native and partner content.

## Observability

`GET /api/news/admission` exposes:

- source fingerprint
- independent admission fingerprint
- validation result
- live admission records
- research candidates
- reviewed/backlog/remediation summary
- fail-closed rules

`GET /api/news/coverage` includes admission integrity and raises explicit gaps for:

- invalid admission registry
- remaining legacy review backlog
- reviewed sources requiring remediation

The future GD-017 command center can therefore consume the same deterministic state rather than maintaining a separate spreadsheet.

## Cache identity boundary

Admission metadata has its own fingerprint for observability but does **not** change the news feed cache key. The canonical feed/source definition already participates in the news source fingerprint. If an admitted endpoint actually becomes canonical, changing `SOURCES` changes the feed/cache identity through the existing contract.

This prevents a reviewer-note or policy-link edit from needlessly invalidating production news caches while still making governance changes measurable.

## Non-goals

This gate does not:

- make legal determinations
- infer permission from robots.txt
- infer permission from first-party hosting
- infer permission from successful HTTP health
- add RNZ Pacific or Agencia Brasil to production
- replace AP with an unofficial source
- silently remove Guardian or AP
- bulk-review the remaining 17 legacy sources without evidence
- automatically alter displayed fields based on the ledger yet

The next source-by-source review tranche should convert legacy records to reviewed states using publisher/endpoint-specific evidence and open remediation issues wherever a concrete restriction conflicts with current behavior.

# Mission Control (GD-031): investor intelligence and business meaning

Mission Control answers, for a first-time reader in about a minute: what GFD operates, what each property is for, whether
the estate works, whether anyone uses it, whether usage is growing, what business actions occur, what is broken, what is
unknown, what deserves attention first, and how fresh and trustworthy each answer is. One evidence plane serves two
audiences: an **Executive** view (meaning first) and an **Operator** view (work queue and evidence).

## Non-negotiable semantics

Zero, unknown, uninstrumented, not connected, awaiting authorization, unavailable, stale, incomparable, blocked,
intentionally inactive, healthy, degraded and failing are different things and stay visibly different.
Never convert unknown to zero, reachable to healthy, stale to current, or a fixture to a production fact. Edge requests are
requests, not people.

## The published data plane (`observatory/mission-control/`)

| File | Contract | Purpose |
| --- | --- | --- |
| `estate-health.json` 2.0 | `globaldeets-estate-health` | Per-property profile, health, critical path, instrumentation truth, vantage reconciliation, infrastructure discovery |
| `audience.json` 1.0 | `globaldeets-audience` | Governed 7/28/90-day edge requests, trend, contribution, concentration, daily series |
| `business-events.json` 1.0 | `globaldeets-business-events` | Common outcome vocabulary, per-property declared outcomes, instrumentation state, counts |
| `diagnostics.json` 2.0 | `globaldeets-diagnostics-queue` | Findings with category, confidence, freshness, actionability and an explainable priority score |
| `executive.json` 1.0 | `globaldeets-executive` | Deterministic headline statements, maturity coverage, portfolio, chart datasets, wins/risks/unknowns |
| `history.json` 1.2 | `globaldeets-mission-control-history` | Dated snapshots (1.1 snapshots stay readable, nothing is backfilled) |
| `probes.json`, `mission-control-data.json` | | Raw probe evidence; page entry summary |

The browser never reconstructs authoritative facts. It re-evaluates freshness at render time (published evidence ages),
formats readings, filters and sorts, and **fails closed**: a bundle that contradicts its own contracts is withheld.

## Property profile (registry 2.0)

Every property carries purpose, portfolio category, lifecycle, strategic tier, earning path, primary outcome and expected
state, each with provenance (`owner-brand-registry`, `owner-north-star`, `owner-repository`, `observed-homepage`,
`observed-behaviour`). Unknown stays `null`/`unknown`. An expected-inactive property is never an outage; a property that
serves content its owner declared not live is reported as drift, not as an outage.

## Audience truth

Mission Control does not measure traffic. It reads the governed Traffic Intelligence outputs (Canonical Gold 1.2 per-zone
metrics `cloudflare.<zone>.<7|28|90>d.<field>` and Traffic Insights trend comparisons and daily series).
Fixtures (`fixture !== false`) are rejected, corrupted documents fail closed, partial coverage is excluded from totals,
windows that do not share a comparability key are never summed, and a trend is only shown when the producer marks it
comparable with full daily coverage. No source separates humans from automated traffic, so classification is published as
`unsupported` and all measured traffic is "unclassified edge requests".

**Connection (GD-036).** The documents live behind a private gate at `https://traffic.goodflippindesign.com/gold/`.
The gate accepts a human admin session *or* a narrowly scoped Mission Control feed credential (read-only GET/HEAD of
the Gold and Insights documents; it is not an admin identity). That credential is an application secret, not a
Cloudflare API token: the Traffic Intelligence deploy binds `MISSION_CONTROL_FEED_TOKEN` to its Pages project and the
same value is stored here as `MISSION_CONTROL_GOLD_TOKEN`. The source URLs are not secret and default in
`mission-control-evidence.yml` (`MISSION_CONTROL_GOLD_SOURCE` / `MISSION_CONTROL_INSIGHTS_SOURCE` override them); the
same token is sent to both documents unless `INSIGHTS_SOURCE_TOKEN` is set. To rotate, set both secrets to a new
`mcf_`-prefixed value and re-run the Traffic Intelligence deploy.

Every way the source can fail is a distinct `audience.source.condition`, and the diagnostics finding
`audience:governed-source` is generated from that condition and closes on its own once the source is `connected`:

| Condition | Status | Meaning |
|---|---|---|
| `connected` / `stale` | measured / partial | Readable, valid, non-fixture Gold; `stale` is labelled and raises its own finding |
| `source-missing` | awaiting-authorized-source | No source configured |
| `credential-missing` | awaiting-authorized-source | Source requires a credential and none was provided |
| `credential-rejected` | awaiting-authorized-source | Source rejected the presented credential |
| `edge-challenge` | unavailable | A Cloudflare challenge answered; the credential was not evaluated |
| `transport-failure` | unavailable | Unreachable or an HTTP error |
| `malformed` | rejected | Not valid JSON / structurally corrupt |
| `schema-mismatch` | rejected | Wrong contract or unsupported schema version |
| `fixture` | rejected | Fixture data is never production evidence |
| `no-measurements` | unavailable | Valid document with no fully covered per-property request metric |

The credential preflight probes the feed as `audience.feed.read` (non-required: audience degrades to an explicit,
diagnosed state rather than failing the run). Edge traffic is still requests, not people; nothing here certifies a
human audience.

## Live instrumentation truth

The probe inspects the served homepage HTML for known analytics tags (GA4, Google Tag Manager, Cloudflare Web Analytics
and others). Placeholder measurement IDs (for example `G-XXXXXXXXXX`) are recognised as `configured-invalid`. A shipped tag
is **not** reception: only Cloudflare Web Analytics page-load counts by host (Account Analytics: Read) can promote a
property to `active-verified`. The carried-forward Cloudflare RUM flag is shown as a labelled setting and never as
telemetry.

## Business events

`globaldeets-business-events-feed` 1.0 is the ingestion contract (`records[]` of property, event type, window, integer
count, plus `instrumentedProperties[]`). A zero is accepted only for a property the feed itself lists as instrumented;
rates need a comparable visit denominator. Properties whose source contains event-producing routes are shown as
`not-connected`; properties with nothing declared are `uninstrumented`. The production collector reads the governed
Cloudflare D1 event counters directly through its existing Cloudflare account authority. `MISSION_CONTROL_EVENTS_SOURCE`
and `MISSION_CONTROL_EVENTS_TOKEN` remain an optional compatible-feed override.

## Critical-path maturity

Authoritative contracts exist only where the owner's own configuration defines them: GlobalDeets, Good Flippin Design
(owner health targets), MN Peace (owner deploy verification routes) and AIAIMate (documented search API). The remaining
serving properties are checked only against a homepage baseline and are counted as needing an owner declaration.

## Two vantages

`tools/mission-control/probe-vantage.mjs` runs the same probe engine from a macOS runner. The collector validates the
secondary run and reconciles vantages per property: `agree`, `partial` (one vantage blocked, the conclusive one is used),
`conflict` (health state `vantage-conflict`, neither answer chosen), `single-vantage`, `inconclusive`. A failing or missing
secondary never blocks the primary collection.

## Findings and prioritization

Findings are derived from evidence. Score = severity + investor-critical (or estate-wide) + strategic tier + business
impact + escalation + actionability + confidence + age; every item publishes the exact points (`priorityBreakdown`) and the
model (`priorityModel`). Ties break by id. "Actionable now", "blocked on authority" and "needs a decision" are distinct.

## Sharing

The Executive view has a light print stylesheet (Print / PDF), a copyable summary that carries the copy time and the
probe age, and every chart has a table alternative. Populated-state screenshots used in reviews are built from synthetic
TEST documents (`tests/helpers/mission-control-audience-fixtures.mjs`) in a temp directory and are never part of the
seed or a deploy.

## Operations

* Collection: `.github/workflows/mission-control-evidence.yml` (every 6 hours). `workflow_dispatch` with `dry_run: true`
  collects and validates everything without committing or deploying.
* Migration: evidence published by GD-030 (five files, estate schema 1.x) is checked for integrity, its history is
  preserved, and it is superseded by the full data plane on the first GD-031 collection. Until then the deploy overlay
  refuses the legacy set and the committed seed stays in place.
* Production verifier: `node tools/verify-mission-control-prod.js --base=https://globaldeets.com --require-probe-evidence
  [--min-vantages=2]` re-runs the collector's own validators against what production serves.

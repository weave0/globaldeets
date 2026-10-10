# GD-042: Selection accountability (stacked draft)

## What was wrong

The original homepage presented static numbers, including **21 Live Sources**, **7 Regions**, and empty Local/State and Open Coverage Gaps cards. The live label was inaccurate: 21 is an endpoint registry count, not evidence that 21 sources successfully published a usable item in the current feed snapshot. Seven included the cross-region `global` routing bucket, not seven independent geographic regions of events. Empty placeholders provide no coverage disclosure.

## What this revision actually reports

For the homepage response `/api/news?region=global&limit=8&mode=diverse`, the panel says **Inside this selection** and derives:

| Figure | Exact definition |
|---|---|
| Linked publishers shown | Distinct `sourceId` values (fallback publisher name) among shown items with valid HTTP(S) original publisher URLs |
| Feed regions shown | Distinct recognized feed-routing labels among the same linkable displayed reports, including `global` if present |
| Reports available in feed | The governed endpoint's `total`; may be stale when browser is serving an offline copy; not a sum of newsworthy events |
| Largest linked publisher share | Largest one-publisher share of those linkable shown items, rounded to an integer percent; concentration only, **not** a trust/bias score |

When a request fails, all metrics are reset to `—` with an explicit error. Empty valid feed responses can legitimately show zero; a missing `total` is not turned into zero. When the server does not confirm the known diverse selection-policy version, the panel refuses to claim it verified rotation. A saved offline feed is identified as potentially outdated.

A compact native disclosure describes publisher+region rotation relative to the newest published item in that feed snapshot, and links to the explicitly chronological reader. It does **not** imply feed-routing region equals story location or that publisher source counts imply event coverage, independence, editorial quality, fair political representation, or engagement/retention.

## Governance, privacy and permissions

Selection metrics are computed entirely from the already rendered governed response, not from raw excluded items, private evidence, new requests, user identifiers or additional tracking. Original sources, licensing/display rights, linked-story membership, admitted publisher inventory, sorting mode and APIs do not change. The disclosure is first-party/static and keyboard accessible.

## Proof required before acceptance

- Unit/browser regression with two linkable publisher names, two feed regions, a third unsafe publisher URL, and different endpoint `total` verifies all four counts and that unsafe links do not boost displayed linked-source figures.
- A 503 followed by retry clears stale audit figures instead of displaying an apparent healthy count.
- Full existing suite, isolated Pages exact-commit deployment, desktop/phone images, and hosted assertion comparing counters with the same source response. No claim of production success until authorized review/merge and main deployment certification.

## Dependency

Stacked on GD-041 [PR #87] which itself targets still-unmerged GD-038 [PR #80]. This feature must **not** bypass review or cause duplicate merging of #82/#83/#86/#87. Base SHA at start of work: `b65ab5ea5128416b68365a5fb7221543b9e10b62`.

## Reader outcomes left separate

Issue #81 remains the owned post-Reader-Reset analytics lane. This PR deliberately does **not** implement 7-day return tracking or claim that publisher clicks equal finished reads. Consent, GA4 scope and privacy disclosures must be audited before retention instrumentation is activated.

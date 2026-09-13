# Source-admission audit — 2026-09-13 — final legacy review

This final review resolves review-state debt for the three legacy sources where available first-party evidence does not establish an authorized GlobalDeets excerpt/translation path. A reviewed `unknown` rights status is an explicit fail-closed result, not a claim of permission or prohibition.

## NHK — reviewed / unknown

Current endpoint: `https://www3.nhk.or.jp/rss/news/cat0.xml`

Reviewed evidence/search surface:
- current first-party RSS endpoint
- NHK first-party terms/copyright surfaces discoverable for specific NHK services, including https://school-api-portal.nhk.or.jp/terms

Finding: the reviewed first-party material confirms that NHK protects reuse/storage of service content in service-specific contexts, but this audit did not identify a sufficiently direct, current first-party policy granting or denying the GlobalDeets use profile for the NHK News RSS endpoint itself. A service-specific policy must not be silently generalized into endpoint-wide permission.

Engineering disposition: `unknown`, review state `reviewed`. Preserve headline-link only. Because the live NHK source is non-English, this also means zero translation calls under GD-021 until an authorized translated-headline/summary path is established.

## NPR — reviewed / unknown

Current endpoint: `https://feeds.npr.org/1004/rss.xml`

Reviewed evidence/search surface:
- current first-party NPR feed endpoint
- NPR.org surfaces linking to NPR Terms of Use
- NPR-related StateImpact partner terms describing bounded feed use, including https://stateimpact.npr.org/oklahoma/terms-of-use/

Finding: the audit located partner/project terms that explicitly govern those specific partner surfaces, but did not obtain a directly inspectable NPR-wide policy sufficiently specific to the current NPR world-news feed and GlobalDeets use profile. Partner-station or StateImpact terms are not authority to grant NPR-wide reuse.

Engineering disposition: `unknown`, review state `reviewed`. Preserve headline-link only pending direct NPR authorization or an applicable first-party NPR feed-use policy.

## The Hindu — reviewed / unknown

Current endpoint: `https://www.thehindu.com/news/international/feeder/default.rss`

Reviewed evidence/search surface:
- current first-party RSS endpoint
- The Hindu group service terms discoverable on STEP, including https://step.thehindu.com/termsandconditions

Finding: the available group/service-specific terms contain restrictive copying/database/reproduction language, but this audit did not identify a directly applicable first-party policy governing reuse of The Hindu's international news RSS feed for GlobalDeets. Service-specific STEP terms are not treated as authority for the newsroom feed.

Engineering disposition: `unknown`, review state `reviewed`. Preserve headline-link only pending an applicable first-party policy or written authorization.

## Closure semantics

After these three records move from `legacy-unreviewed` to `reviewed` + `unknown`:
- all 19 frozen legacy source records will have an explicit review outcome;
- `legacyUnreviewedSources` becomes 0;
- unresolved-rights telemetry remains nonzero because `unknown` is intentionally distinct from `verified-public-use`;
- no excerpt, metadata republication, or translation permission is inferred for NHK, NPR, or The Hindu;
- issue #25's review-debt acceptance can close only after implementation, regression tests, and production verification prove these states are live.

# Source Admission Audit — 2026-09-13, Tranche 2

This is an engineering usage-rights review, not a legal opinion. Public feed availability does not itself establish republication rights.

## CNA

- Live endpoint: `https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311`
- Endpoint authority: first-party
- Evidence:
  - `https://www.channelnewsasia.com/rss`
  - `https://www.channelnewsasia.com/rss/rssterms`
- Reviewed state: `permission-required`
- Reason: CNA expressly describes its RSS service as free strictly for personal, non-commercial use and reserves other uses. It provides a rights contact for reproduction/hosting requests.
- Safe GlobalDeets behavior pending authorization: `headline-link`.

## ABC Australia

- Live endpoint: `https://www.abc.net.au/news/feed/51120/rss.xml`
- Endpoint authority: first-party legacy endpoint
- Evidence:
  - `https://help.abc.net.au/hc/en-us/articles/360001548096-ABC-Terms-of-Use`
  - `https://help.abc.net.au/hc/en-us/articles/6147104938383-Why-are-RSS-feeds-no-longer-being-updated`
- Reviewed state: `permission-required`
- Reason: current ABC Terms reserve ABC content for personal, non-commercial use unless permission is obtained. ABC also states that RSS feeds are no longer being updated as it seeks greater control over content distribution, creating a separate freshness/deprecation concern from rights status.
- Safe GlobalDeets behavior: `headline-link`; independently track endpoint freshness/replacement rather than treating rights review as a health fix.

## Dawn

- Live endpoint: `https://www.dawn.com/feeds/home/`
- Endpoint authority: first-party
- Evidence:
  - `https://www.dawn.com/news/1342352`
  - `https://www.dawn.com/news/1342354/reproduction-copyrights`
- Reviewed state: `permission-required`
- Reason: Dawn states that copying, reproduction, republication, broadcast, transmission, or other non-personal/non-commercial use requires prior written permission; its reproduction policy likewise prohibits republication without prior written permission.
- Safe GlobalDeets behavior pending permission: `headline-link`.

## The EastAfrican

- Live endpoint: `https://www.theeastafrican.co.ke/rss.xml`
- Endpoint authority: first-party
- Evidence:
  - `https://www.theeastafrican.co.ke/tea/terms-conditions-of-use-4783192`
- Reviewed state: `permission-required`
- Reason: Nation Media Group terms limit use to personal, non-commercial benefit and require prior written approval for other uses of Nation content, including database-like reuse.
- Safe GlobalDeets behavior pending permission: `headline-link`.

## NPR

- Live endpoint: `https://feeds.npr.org/1004/rss.xml`
- Endpoint authority: first-party
- Reviewed state: `unknown` pending direct NPR feed-terms verification
- Reason: current search did not yield a sufficiently direct, first-party NPR-wide RSS reuse policy for this exact feed. A StateImpact/NPR-partner terms page was found, but its scope is not sufficient to promote the canonical NPR source to a reviewed green state.
- Safe GlobalDeets behavior: remain fail-closed at `headline-link` until NPR-specific terms are verified.

## Result of tranche

- 4 additional sources have strong evidence for a restrictive reviewed state: CNA, ABC Australia, Dawn, and The EastAfrican → `permission-required`.
- NPR remains unresolved rather than being inferred from a partner project's terms.
- ABC additionally carries a separate endpoint-deprecation/freshness signal that should be tracked independently from permissions.
- No source is removed and no source is marked green from technical feed availability alone.

## Combined progress after tranches 1–2

Evidence-backed decisions now exist for 9 of the 17 sources that were legacy-unreviewed at the start of issue #25, plus NPR has an explicit unresolved research state pending direct terms verification. MercoPress remains the only newly reviewed source in these two tranches with first-party language that clearly supports the bounded GlobalDeets RSS-card use pattern.

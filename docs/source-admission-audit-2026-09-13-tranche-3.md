# Source-admission audit — 2026-09-13 — tranche 3

This document records engineering review evidence for five remaining legacy live news sources. It is not a legal opinion. Endpoint authority, feed health, publisher provenance, and reuse permission remain separate dimensions.

## Al Jazeera — permission-required

Current endpoint: `https://www.aljazeera.com/xml/rss/all.xml`

First-party evidence:
- https://www.aljazeera.com/terms-and-conditions
- https://www.aljazeera.com/news/2017/10/15/terms-and-conditions

Observed signal: Al Jazeera's current terms state that service content is for personal, non-commercial use and prohibit copying, reproducing, downloading, posting, storing, distributing, transmitting, broadcasting, commercially exploiting, or modifying content without express prior written permission. The terms also restrict unauthorized automated copying/text-data mining/web scraping. A public RSS endpoint therefore does not independently establish permission for GlobalDeets to republish publisher summaries.

Engineering disposition: `permission-required`; retain headline-link-only display pending an authorized reuse path. No translation or excerpt permission is inferred.

## Anadolu Agency — contract-required

Current endpoint: `https://aa.com.tr/en/rss/default?cat=world`

First-party evidence:
- https://www.aa.com.tr/tr/p/yasal-uyari
- https://www.aa.com.tr/tr/teyithatti/p/yasal-uyari

Observed signal: Anadolu Agency's legal warning states that non-subscribers may not use AA news, photos, video, or information; use outside the contract may not be reproduced or transferred; and websites wishing to use AA news must have an AA subscription agreement. AA also describes special services for internet publishers.

Engineering disposition: `contract-required`; retain headline-link-only display pending an authorized subscription/licensing arrangement.

## France 24 — permission-required

Current endpoint: `https://www.france24.com/en/rss`

First-party/operator evidence:
- https://www.francemm.com/en/legal-notice
- https://www.francemm.com/en/contact?brand=f24&topic=vente_contenu

Observed signal: France Médias Monde's legal notice covers the websites it produces and states that protected content reproduction, representation, adaptation, translation, transformation, transfer, collection, storage, use, extraction, and reproduction are prohibited without authorization. Its France 24 contact workflow separately provides a channel to use or purchase France 24 content.

Engineering disposition: `permission-required`; retain headline-link-only display unless France Médias Monde grants an authorized content-use path.

## Kyiv Independent — permission-required

Current endpoint: `https://kyivindependent.com/news-archive/rss/`

First-party evidence:
- https://kyivindependent.com/contacts/
- https://kyivindependent.com/help-center/about-us/how-do-you-finance-your-work/
- https://kyivindependent.com/assets/files/Syndication_and_Content_Licensing_from_The_Kyiv_Independent.pdf

Observed signal: The Kyiv Independent identifies syndication deals as a commercial revenue source and directs commercial partnerships and content-licensing inquiries to a dedicated licensing contact. The public RSS endpoint is first-party, but the reviewed evidence supports treating republication/syndication as an authorized commercial lane rather than assuming the feed itself grants reuse rights.

Engineering disposition: `permission-required`; retain headline-link-only display pending explicit licensing/permission appropriate to GlobalDeets's use.

## Yonhap — permission-required

Current endpoint: `https://en.yna.co.kr/RSS/news.xml`

First-party evidence:
- https://en.yna.co.kr/view/AEN20260831005800315

Observed signal: Yonhap's copyright notice states that its content is owned by Yonhap, that use beyond personal and noncommercial use is prohibited without written consent, and that requests for other uses should be directed to its Information Business Department.

Engineering disposition: `permission-required`; retain headline-link-only display pending written authorization.

## Remaining legacy-unreviewed after this tranche

Do not manufacture a status from weak or indirect evidence. These three remain for a final review:
- `nhk`
- `npr`
- `the-hindu`

The target after promotion of this tranche is 18 reviewed live sources and 3 `legacy-unreviewed` sources. The unresolved three remain fail-closed to headline-link under GD-021 until their own review is complete.

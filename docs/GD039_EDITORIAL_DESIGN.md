# GD-039 — Editorial Reader / Information Architecture

Status: **Design candidate, draft stacked on GD-038. Not shipped or production-certified.**

## Reader problem and evidence

The current design inherited the old site's "Premium Portfolio Showcase" CSS: neon gradients, glass cards, large animated-logo framing, pill navigation and a desktop globe occupying the first viewport. The reader receives equal-weight cards instead of an obvious news hierarchy. These are presentation problems; the source-governance, coverage and evidence contracts must not be weakened to fix them.

## Design contract

**Positioning:** GlobalDeets is a source-first world-information desk; it is **not** claiming to be the originator of reporting or an editorial newsroom staffed around the clock.

- **Masthead:** Typographic GlobalDeets wordmark, clear Today / News / Browse / Evidence links on desktop, accessible More for exploration and methods. More remains a native details element with Escape/focus behavior. At compact widths, Evidence remains in More so 44px navigation targets do not overflow.
- **Reading palette:** Warm off-white canvas, deep ink typography, gentle accent for source/action links and thin separators; reserve the cinematic dark palette for the globe itself. Serif headlines distinguish editorial content from utility text, with system-font fallback.
- **Home hierarchy:** Dated World Desk and source-linked newest reporting come before the globe. Globe, webcam, timeline and knowledge areas are exploratory destinations, not prerequisites to reading.
- **News hierarchy:** A leading newest item (by publication time, *not* asserted editorial importance) and a flowing two-column index on desktop; one column on phones. Publisher identity, actual date, translation/source-rights indicators and "read at original publisher" actions remain prominent.
- **Organization:** Region selector and limited loaded-story search stay visible. "Sources & coverage" remains a disclosure near the feed and the global evidence observatory gets a direct navigation link. Do not invent location accuracy; a feed region is not an event location.
- **Mobile:** 390, 360, 320 and 285px navigation reflow; 44px minimum important targets, no horizontal scroll, short-phone first headline/publisher/action remain in first viewport. Do not rely on color alone for source context or keyboard usability.
- **Honesty:** No generated article photography, fabricated desk editors, fake breaking-news badges, truth ratings, broad rights claims or attributed summaries without licenses. Keep governance panels operational as currently built.
- **Deployment:** `editorial-reader.css` is isolated to four core reader pages; existing content, APIs and source permissions are unchanged. The additional offline asset is precached as `globaldeets-cache-v9`. Do not blend GD-039 into GD-038 release certification before its own tests/review. Integration with GD-R2.1 will need a fresh cache revision (v10 or later) and reconciliation of overlapping HTML/CSS/service-worker edits.

## Preview and acceptance

Branch-only push workflow `.github/workflows/gd039-editorial-preview.yml` builds, lint/tests, stages and deploys to a Cloudflare Pages *preview branch*, and captures desktop home, desktop Asia News and mobile Asia News screenshots. Never promote this preview to main or call it production certified.

`tests/gd039-editorial.spec.js` locks ordering, newspaper palette, visible Evidence navigation and 285–390px nav reflow. Existing GD-038 tests still own failure states, first-viewport source links, publisher rights and navigation keyboard behavior.

The service-worker offline issue uncovered during GD-038 Pages certification remains a separate **release blocker**, even if the GD-039 online layout preview passes. This design work must not be used to assert GD-038 approval or close its review gates.

## Follow-through after design acceptance

1. Reconcile GD-039 with the final *merged* GD-038 head; run exact-head CI and an accessibility contrast/keyboard audit.
2. Harmonize secondary About, Knowledge, Support and evidence pages with the editorial masthead without altering their substantive source disclosures.
3. Integrate Story Intelligence (PR #82) without restoring older service-worker cache rules or claiming a linked feed story exists when it does not.
4. Measure first-story visibility, original-publisher outbound clicks, region switching and source/evidence discovery before adding any content-personalization or ranking claims.

We accept the design only when it increases clarity and reader access **without** trading away provenance, source-admission permissions, transparency or mobile usability.

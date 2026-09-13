# Source Admission Audit — 2026-09-13

This document records an engineering usage-rights review for a first tranche of legacy GlobalDeets news sources. It is not a legal opinion. Endpoint authority, publisher identity, technical health, and permitted reuse remain separate dimensions.

## Review standard

For each source, this tranche asks whether the current GlobalDeets use profile — headline/link, metadata, an RSS-derived excerpt up to 280 characters, and translation when applicable — is supported by first-party published terms or policy. When the evidence does not clearly authorize that use, the correct state is restrictive rather than assumed-green.

## BBC World

- Live endpoint: `https://feeds.bbci.co.uk/news/world/rss.xml`
- Endpoint authority: first-party
- Evidence:
  - `https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_19September2022english.pdf`
  - `https://information-syndication.api.bbc.com/`
- Reviewed state: `permission-required`
- Reason: BBC terms distinguish personal/public feed use from business use and state that business use of RSS feeds requires permission and may involve a fee. BBC also operates a credentialed Information Syndication API for syndication customers.
- Safe GlobalDeets behavior pending permission: `headline-link`; do not infer permission for RSS-derived excerpts or translated summaries.

## DW

- Live endpoint: `https://rss.dw.com/xml/rss-en-world`
- Endpoint authority: first-party
- Evidence:
  - `https://www.dw.com/en/news-from-germany/a-65919184`
  - `https://b2b.dw.com/page/dw-terms-conditions`
  - `https://www.dw.com/downloads/35915853/contentbox_english.pdf`
- Reviewed state: `permission-required`
- Reason: DW explicitly offers RSS/content integration to media companies, institutions, organizations, and professional partners, but the published distribution material directs prospective users to contact DW / use a customized feed and accept its distribution terms. The generic B2B terms also prohibit copying/disseminating Distribution Website content without prior agreement.
- Safe GlobalDeets behavior pending authorization: `headline-link`.

## Ukrinform

- Live endpoint: `https://www.ukrinform.net/rss/block-lastnews`
- Endpoint authority: first-party
- Evidence:
  - `https://www.ukrinform.net/info/subscribe_conditions.html`
- Reviewed state: `contract-required`
- Reason: Ukrinform publishes paid/subscription newswire products, including an English-language newswire. The presence of a public RSS endpoint does not by itself establish rights to republish excerpts from the subscription-oriented newswire product.
- Safe GlobalDeets behavior pending an authorized reuse path: `headline-link`.

## Premium Times

- Live endpoint: `https://www.premiumtimesng.com/feed/`
- Endpoint authority: first-party
- Evidence:
  - `https://www.premiumtimesng.com/terms-and-conditions`
- Reviewed state: `permission-required`
- Reason: Premium Times states that site content is for personal, non-commercial use and prohibits reproduction, distribution, or republication without prior written consent. A public RSS endpoint does not override that stated restriction.
- Safe GlobalDeets behavior pending permission: `headline-link`.

## MercoPress

- Live endpoint: `https://en.mercopress.com/rss/`
- Endpoint authority: first-party
- Evidence:
  - `https://en.mercopress.com/feeds`
- Reviewed state: `verified-public-use`
- Permitted GlobalDeets use: `headline-link`, `metadata`, bounded RSS excerpt up to 280 characters
- Translation: not applicable to the current English feed
- Reason: MercoPress explicitly says webmasters are welcome to include MercoPress news updates on their sites and requires preservation of the link back to the original article. This directly covers the GlobalDeets feed-card use pattern more clearly than the other sources in this tranche.
- Attribution boundary: preserve source identity and original article link; do not expand this finding into authorization for full-article republication.

## Result of tranche

- 5 legacy sources receive evidence-backed review decisions.
- 1 source (`mercopress`) supports the current bounded excerpt use profile.
- 3 sources (`bbc-world`, `dw`, `premium-times`) require permission before richer public reuse.
- 1 source (`ukrinform`) is treated as contract-required pending a verified authorized path.
- No source is removed solely because its use state is restrictive.
- No source is marked green based on feed availability, robots.txt, or technical health.

## Implementation follow-up

Update `functions/lib/news-source-admission.js` so these five records move from `legacy-unreviewed` to `reviewed`, preserving the restrictive fail-closed display mode for BBC, DW, Ukrinform, and Premium Times while enabling only the bounded reviewed use for MercoPress. Add regressions covering review counts, remediation IDs, and MercoPress display behavior before promotion.

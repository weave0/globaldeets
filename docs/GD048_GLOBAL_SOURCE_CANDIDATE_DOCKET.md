# GD-048 — Governed worldwide source-expansion candidate docket
Status: research-only, non-production intake. Captured: 2026-10-18.
Controlling issue: https://github.com/weave0/globaldeets/issues/99

## Why this exists
The established production baseline has 21 configured feeds, of which 20 are English-language and one Japanese-language. A seven-region routing interface does not imply original reporting, geographic event coverage, or linguistic plurality. The current homepage selection policy already diversifies *available publisher inputs*. This docket does not change that policy or admit sources.

## Twelve additional candidate operators for investigation
These are **candidate publishers**, not verified feeds. Official homepage links below identify organizations for first-party endpoint discovery; a homepage is **not** an RSS endpoint or permission to reproduce its content. Region is a target area of editorial context, not guaranteed story-event geography. No candidate may be promoted without a verified first-party or licensed endpoint and an individually reviewed rights record.

| Candidate publisher / organization | Primary review context | Primary language to investigate | Publisher starting point | Required research focus |
|---|---|---|---|---|
| Agência Brasil / EBC | Brazil / Latin America | Portuguese | https://agenciabrasil.ebc.com.br/ | Existing admission *research* record; distinguish partner-agency content and original rights |
| La República | Peru / Latin America | Spanish | https://larepublica.pe/ | Verify first-party feed, operator identity, reuse terms |
| El Espectador | Colombia / Latin America | Spanish | https://www.elespectador.com/ | Verify endpoint and publisher licensing |
| La Tercera | Chile / Latin America | Spanish | https://www.latercera.com/ | Confirm original/local reporting versus third-party syndication |
| Le Monde | France / Europe | French | https://www.lemonde.fr/ | First-party RSS existence, usage rights, reader headline-only restrictions |
| RFI / France Médias Monde | France / Europe and Africa | French | https://www.rfi.fr/fr/ | **Owner-family overlap** with France 24; don't count as independent operator |
| Jeune Afrique | Pan-African news, Paris-based organization | French | https://www.jeuneafrique.com/ | Do not equate geographic focus with locally owned African journalism |
| News24 | South Africa / sub-Saharan Africa | English; regional-language options unverified | https://www.news24.com/ | Validate operator, primary reporting, public feed endpoint |
| The Conversation Africa | African academic-led publishing | English; other language versions unverified | https://theconversation.com/africa | Institutional/article author provenance and Creative Commons conditions; verify edition terms |
| Al Jazeera Arabic | MENA / Arabic reporting | Arabic | https://www.aljazeera.net/ | **Same operator as existing Al Jazeera input**; language depth, not independent publisher growth |
| ANTARA | Indonesia / Southeast Asia | Indonesian | https://www.antaranews.com/ | State news-agency ownership, syndication and reuse restrictions, first-party endpoint |
| VnExpress | Vietnam / Southeast Asia | Vietnamese | https://vnexpress.net/ | Establish publisher-owned feed endpoint, content and translation permissions |

### Additional discovery queue (not included in twelve)
Mainichi Shimbun (Japan / Japanese, https://mainichi.jp/); Tempo (Indonesia / Indonesian, https://www.tempo.co/); Rappler (Philippines / English and Filipino coverage, https://www.rappler.com/); RNZ Pacific (Pacific / English and local-language possibilities, https://www.rnz.co.nz/international/pacific-news), which is already recorded as a research-only candidate.

## Required per-candidate evidence before *any* promotion
1. First-party **endpoint URL**, documented by the publisher, with fetch status, type, parse status, GUID/link consistency, observation date, and sample bounds. A publisher homepage or a third-party RSS proxy is not enough.
2. Exact legal **operator** and editorial ownership family; identify country of origin separately from geography of stories and audience. Do not treat RFI/France 24 or two Al Jazeera language editions as independent organizations.
3. Source language and observed article original language. Record translations only when rights authorize those transforms; a machine-translated title is not original-language journalism.
4. Document **reuse permissions** from directly applicable publisher terms or written permission, with a date and URL. Never infer rights from RSS availability, public access, Creative Commons branding on other editions, or a different company's terms.
5. Syndication, partner content, imported wires, advertisements, and per-item restrictions. Unless confidently separable and allowed, candidate remains research-only.
6. Health testing with timeout, invalid XML/HTML detection, canonical URL duplication checks, freshness, and bot/authorization failures logged as evidence rather than silently excluded.
7. Privacy/copyright impact of headline-link, summaries, full-text, translation, imagery, retention. Admit only uses individually permitted by the governance model.

## Acceptance
- Candidate count is **not** included in the 21-source production inventory or homepage coverage metrics.
- No candidate goes into `SOURCES`, `SOURCE_ADMISSIONS`, or `SOURCE_PROVENANCE` until `isProductionAdmissible` can return true on reviewed records without relaxing any rule, and canonical fingerprint/health/integration tests pass.
- Start with rights-clear original-reporting publishers from underrepresented language and operator families, not a source-count target.
- Measure language/operator/geography separately after each governed admission. Preserve chronological News and explainable diverse homepage.
- Publish proof for each admitted batch: tested feed samples, authority URLs, licensed uses, new source fingerprint, offline/mobile regressions, and exact deployed SHA.

## Explicit current verification limits
This is a first-pass discovery list. The exact live RSS endpoints, current publisher terms, candidate feed health, translation rights, and admissibility have **not yet been established here**. Every row defaults to **not approved for production**. This document is not a legal opinion.

## Verified first-party policy and feed-directory sweep — 2026-10-18

These are **publisher-declared XML feed locations and policy findings**, not validated ingest results. External browsing confirmed the publishers' RSS-directory links or official usage statements; XML endpoints were returned to the retrieval tool as unsupported XML/RSS content, so the tool could **not** establish status-200-through-our-edge, well-formed parsing, item dates, freshness, duplicate URLs, or continuously healthy service. None may enter the live `SOURCES` contract on this evidence alone.

| Candidate | First-party feed documented on official page | Publisher's applicable terms | Rights finding / admission gate |
|---|---|---|---|
| Agência Brasil (Brazil, Portuguese) | [Publisher feed index](https://agenciabrasil.ebc.com.br/feed/) links to [latest XML](https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml); old research record incorrectly treated the index itself as RSS | [Agência Brasil reproduction policy](https://agenciabrasil.ebc.com.br/sobre) | EBC permits certain journalistic reproduction with attribution, **but expressly warns partner content can carry different terms**. `verified-public-use` describes a qualified publisher policy, **not full-feed clearance**. Item origin and GlobalDeets eligibility are unproven; `itemLevelReviewRequired=true`, research-only. |
| ANTARA News (Indonesia, Indonesian) | [ANTARA RSS directory](https://www.antaranews.com/rss/) links to [latest XML](https://www.antaranews.com/rss/terkini.xml) | [ANTARA terms](https://www.antaranews.com/ketentuan-penggunaan) | General site terms restrict reproduction/communication/distribution outside specifically allowed personal non-commercial uses without written approval. RSS availability is **not** permission for GlobalDeets: `permission-required`. |
| VnExpress (Vietnam, Vietnamese) | [VnExpress RSS directory](https://vnexpress.net/rss) links to [world XML](https://vnexpress.net/rss/the-gioi.rss) | [RSS notices](https://vnexpress.net/rss); [Vietnamese terms](https://vnexpress.net/dieu-khoan-su-dung) | RSS is described as free to individuals and non-profits. Commercial copying/distribution requires prior written consent. Neither nonprofit status nor permission for GlobalDeets has been established: `permission-required`. No translation grant inferred. |
| Le Monde (France, French) | [Official RSS directory](https://www.lemonde.fr/le-monde-et-vous/article/2025/07/14/les-flux-rss-du-monde-fr_5498778_3237.html) links to [front-page XML](https://www.lemonde.fr/rss/une.xml) | [Same official RSS usage conditions](https://www.lemonde.fr/le-monde-et-vous/article/2025/07/14/les-flux-rss-du-monde-fr_5498778_3237.html) | RSS use restricted to strictly personal, non-professional and non-collective use. Others require authorization and remuneration: `contract-required`; production barred. |
| The Conversation Africa (South Africa / research commentary, not a general-breaking-news wire) | A specifically authorized region-filtered XML endpoint has **not been verified** | [The Conversation Africa's organizational report](https://cdn.theconversation.com/static_files/files/1338/AF_five_year_report_-_The_Conversation_FA_3.pdf?1606151073=) and [Global editorial guidelines](https://cdn.theconversation.com/static_files/files/2010/Global_Editorial_Guidelines.pdf) | Organizational material describes Creative Commons republication, but article-specific attribution, license version, item/image exceptions, feed endpoint, and suitability as *reporting versus analysis* are not verified. Remains **docket-only**, not a `SOURCE_RESEARCH_CANDIDATES` record. |

### Live-source safety invariants and next proof

- The programmatic candidates are *discoverability records*; no live endpoint was added, `SOURCES.length` and `SOURCE_ADMISSIONS.length` remain 21.
- Each new candidate has `disposition: 'research'`, `healthVerificationStatus: 'research-only'`, no granted `permittedUse`, and no authority to translate or excerpt.
- A source requires a separate bounded feed-read probe (status, content type, parse validity, item GUID/link coverage, dates, canonical duplicates, operator/partner flags), dated permission and human-readable source notes **before** a narrowly scoped admission PR.
- Candidates with permission-required or contract-required states remain unadmitted until explicit authorizations are recorded; do not build a rights workaround by calling the result a link aggregator.

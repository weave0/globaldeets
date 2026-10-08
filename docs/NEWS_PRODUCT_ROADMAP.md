# GlobalDeets: completion assessment and news UX/UI roadmap

**Review date:** October 6, 2026  
**Scope:** GlobalDeets' public news, evidence, discovery, and place-context product.  
**Repository baseline inspected:** `weave0/globaldeets`, main `d988a153d5bd9e1e2c1e6292623ce13227a6fcec`, dated September 27, 2026.  
**Document status:** Adopted as the controlling public-product roadmap on 2026-10-06 (R0). It supersedes conflicting public-product guidance in `GLOBALDEETS_2030_PRODUCT_PLAN.md`, `GLOBALDEETS_VISION.md`, and root-level portfolio-era documents. The review text below is preserved as written; current progress is tracked in the ledger in section 9.  
**Evidence limits:** Repository files, current issue/branch records, a CI record, earlier product decisions, and retrievable public page text were reviewed. Some public API requests failed in the review tools. No new complete production browser, accessibility, performance, or feed-health certification was performed. An inaccessible review-tool request is not proof of a site outage.

## Executive decision

GlobalDeets has a substantial implemented technical and evidence foundation, but it is not yet the coherent, place-aware, repeat-use news experience described by its vision. The highest-leverage next work is not another ecosystem operator dashboard or a wholesale technology rewrite. It is a bounded reader-product release: complete GD-038, turn the homepage into a useful World Desk, make the feed's navigation and failure states dependable, and expose the existing evidence work through clear reader journeys.

Treat four kinds of progress separately: **implemented**, **production-verified at a stated time**, **usable in a tested reader journey**, and **demonstrably useful to an audience**. Passing an earlier deployment gate is not a claim that all four are complete today. Do not manufacture a single completion percentage without a defined, weighted scope.

## 1. The controlling vision

The existing product plan calls GlobalDeets a daily, source-first world atlas and the world's open information desk organized by place. Its intended loop is news -> original publisher -> nearby place/culture/public-source context -> a useful reason to return. [E1]

The September boundary correction and GD-038 narrow how that vision should be expressed: GlobalDeets is not the public directory for sibling businesses, and Mission Control belongs behind GFD administration. Later boundary decisions supersede the old plan's global ecosystem navigation proposal. Relevant, reviewed contextual material can eventually support a place page; it must not recreate a cross-project marketing shell. [E2, E3]

### Reader promise

> Understand what is happening, where it is happening, who reported it, what evidence exists, what remains uncertain, and what changed since your last visit.

The product should provide a useful two-minute visit and an optional deeper investigation. It must not require an account to read, require a globe to navigate, or bury publisher attribution. The publisher remains the destination for the publisher's full article unless a specific reuse agreement permits something more.

### Boundaries that must survive redesign

- Publisher origin, feed routing region, and event location are different fields.
- A primary document is not automatically a true statement; a document's existence and the claims inside it have different evidentiary roles.
- Technical feed health, publisher provenance, and permission to display or translate content are separate.
- Multiple articles do not establish independent corroboration when they repeat one wire report, press release, or statement.
- Unknown, unavailable, stale, disputed, corrected, and confirmed record states must not be collapsed.
- No invented truth, political-bias, quality, or universal trust score.
- Translation, classification, and AI assistance are labeled and auditable. Synthetic opinion is not presented as reporting.

These extend the current entity/event and observatory contracts rather than replacing them. [E6, E7]

## 2. Completion assessment

| Capability | Evidence observed | Assessment and remaining gap |
|---|---|---|
| News feed and publisher routing | News HTML and JavaScript implement source-linked cards, regional selection, pagination, and 21 configured source endpoints. [E4, E5] | Implemented baseline. Endpoint inventory is not proof that all endpoints are currently healthy, permitted for every display mode, or globally representative. |
| Source context and evidence governance | Reader bridge, admission context, coverage, health, durable identity, and observatory contracts exist. [E5, E6, E7] | Substantial foundation. Turn this into understandable choices without removing protections. |
| Source permissions | The final legacy-review document explicitly preserves reviewed-but-unknown outcomes for NHK, NPR, and The Hindu. [E8] | Review completion must not be presented as broad reuse permission. Validate live policy before new summaries, translation, storage, or imagery. |
| Evidence dossiers and event identity | Existing contracts support stable event identities, claims/evidence, corrections, and dossier observability. [E6, E7] | Foundation exists. A general reader-facing developing-story experience is not established by those contracts alone. |
| Homepage and public information architecture | Homepage text includes product-direction and roadmap sections; GD-038 remains open for portfolio semantics in core pages. [E2, E10] | Incomplete product identity. Replace the useful page functions, not just their scripts. |
| Places and geographic context | The identity seed is deliberately partial; the public homepage describes country pages as roadmap work. [E6, E10] | Resume GD-026. A partial country identity registry is not a completed place product. |
| Search and discovery | The feed search filters loaded items; the UI explicitly labels that scope. [E4, E5] | Useful filter, not full search across stories, history, places, and sources. |
| Mobile | Configured desktop and two phone viewport projects exist. All three use Chromium. [E9] | Preserve existing coverage. Add browser-engine diversity, real-device checks, accessibility, and user-task validation. |
| Current build evidence | Main CI run 241 succeeded at the inspected main SHA. [E11] | A real implemented baseline; not a new production certification from this review. |
| Habit, retention, and business outcomes | No current reader-retention dataset was inspected for this review. | Unassessed. Do not infer audience success from repository activity or raw edge traffic. |

### Specific findings to address first

**F1 - Public-product boundary remains unfinished.** GD-038 identifies portfolio data/rendering in the homepage, category page, and timeline. Preserve generic reusable rendering concepts, but replace project content, project filters, project versions, and project-export behavior with GlobalDeets-native content and navigation. [E2]

**F2 - Planning documents still contradict the boundary.** `STATUS.md` still identifies the retired public Mission Control path as the canonical operating surface and describes the old deployment arrangement. Documentation drift is an execution risk: a future agent can follow obsolete instructions back into the same wrong product. [E12]

**F3 - The feed exposes implementation vocabulary too early.** Current copy emphasizes governed endpoints, reuse rights, and coverage limitations before the story list; JavaScript inserts a substantial reading-context panel. Preserve the facts but compress the default presentation. Full rights and provenance details belong one deliberate action away; materially consequential warnings stay visible. [E4, E5]

**F4 - A region-switch race exists in the inspected control flow.** The region handler changes selection and clears items, then calls `loadNews(true)`. An active `loading` guard can suppress that request while the earlier request later supplies items. A reduced local harness reproduced that control-flow outcome; the full production browser was not exercised. Require a full application regression before patch acceptance. [E5, local reproduction files]

**F5 - Async dependency handling deserves targeted repair.** The reviewed trust hydration waits for all four requests to settle before rendering their results; the fetch helper has no explicit timeout. A request that remains pending can leave already-available trust information waiting. Make each panel independently time-bounded. The core feed is already started separately, which should be preserved. [E5]

**F6 - Static and dynamic truth need one contract.** The source count, source list, public labels, and first-view content should come from the same governed data. Retain pre-hydration checks; do not label all configured endpoints healthy or recreate a parallel hard-coded inventory. [E4, E5]

## 3. Target user experience

### 3.1 World Desk homepage

Keep the GlobalDeets identity and globe, but make the page useful before it makes a pitch. Recommended order:

1. A restrained header: Today, Explore, Topics, Sources, Search.
2. A real date and last successful update, with a plain-language partial/stale notice when relevant.
3. A finite set of lead developments with visible source, timestamp, and honest location status.
4. Latest reporting with understandable filters.
5. Changed since your last visit, when real retained history supports it.
6. Explore the world: compact map or globe with an equivalent list.
7. Place/context and Life & Culture / Progress modules backed by available content.
8. A modest trust footer linking methodology, corrections, coverage, privacy, and support.

Do not label a newest-first list 'most important' without an actual importance-selection policy. Explain 'Why this is shown' using recorded inclusion/ranking reasons, not invented AI explanations. During an early release, label the section 'Latest' rather than pretending an editorial desk or story-clustering system already exists.

Move product promises, future features, and implementation explanations to About or the roadmap. Do not display empty modules merely to advertise intended capability.

### 3.2 News card

The default card should prioritize a readable headline, source name, publication/update time, and verified location or an honest unknown. Display content only in the mode allowed by the source-use record. Translation and headline-only treatment must be legible without jargon or hover-only explanations.

Primary action: **Read at [publisher]**. Secondary action: **Context & sources**. Add Save/Follow only when the persistence behavior is complete and tested. A direct source link must remain reachable even if optional context APIs fail.

Avoid decorative confidence meters. A 'three sources' label should disclose whether that means three articles, three publishers, or independently established source families. Do not make a card clickable in a way that creates nested-link or keyboard ambiguity.

### 3.3 Story/context page

A stable story URL gathers related reporting without pretending to republish the source articles. It should offer a concise attributed orientation, a chronological change log, publisher links, referenced documents, known unknowns, corrections, and places involved.

Suggested reading depth is **Headline -> Context -> Sources -> Evidence -> Timeline -> Place**. Keep the original-source action prominent at every depth. Distinguish 'reported by', 'stated in this document', 'corroborated through reviewed evidence', and 'not yet resolved'. The story page must work as a direct landing page from search or social media.

### 3.4 Place page

Use the agreed `/places/{iso2}/` country route, with a stable entity-based extension for regions and subnational places later. The page should integrate current reporting, local/regional publishers, public institutions, sourced context, culture, environment, and verified progress. Show the scope and date of every statistic or time-sensitive fact.

Start with a small, reviewed pilot selected for source permission, useful content, and regional/language diversity. Do not fabricate complete country profiles from a sparse registry. A place with no current covered stories must say 'No recent stories from our current sources', not imply that nothing is happening there.

### 3.5 Explore map/globe

Treat the globe as an optional discovery lens, not a loading gate. The list and map must share filters and selection. Every pin should have an explicit geographic meaning: event location, publisher location, or approximate regional grouping. Exact pins require supported coordinates; uncertain geography stays broad or unpinned.

Supply a 2D/list alternative, keyboard navigation, reduced motion, clustering for dense views, and a usable failure state when WebGL or map dependencies are unavailable. Keep webcams as a contextual layer, separate from claims about reporting coverage.

### 3.6 Topics, search, and history

Use a reviewed topic taxonomy appropriate to the content actually available. Separate full search from 'filter these loaded results'. Search must describe its indexed scope, date range, and freshness. Offer shareable queries and useful no-result states.

History should preserve real publication, ingestion, event, and correction times rather than treating each refreshed fetch as a new story. Distinguish a topic timeline from one event's timeline. Never turn an old product-release timeline into apparent world-event history through relabeling alone.

### 3.7 Visual system

Recommended direction: a calm world-news desk with an atlas identity, not a generic SaaS dashboard or a wall of glowing cards. Preserve recognizable dark-mode character while offering a comfortable light mode. Use high-contrast text, a limited accent palette, meaningful type hierarchy, quiet borders, disciplined spacing, and restrained motion.

Define shared tokens and components for header, navigation, card, source badge, timestamp, disclosure, filter, drawer, pagination, empty/error/stale states, and correction notices. Suggested reading-body starting point: 17-19 px, comfortable line height, and approximately 60-75 characters per line, validated across devices. These are proposed design defaults, not observations of current styling.

On phones, use a single-column story flow and a compact labeled navigation pattern; put secondary filters in an accessible sheet. Preserve scroll position and back navigation. Do not force swiping or dragging for essential actions. Avoid disruptive automatic reordering; show 'New updates available' and let the reader choose when to refresh.

## 4. Roadmap and dependencies

The R0-R9 labels below are proposed roadmap labels, not newly created GitHub issues. Continue existing GD-038 and GD-026 records rather than replacing them with competing plans.

### R0 - Restore a single public-product contract

**Priority:** Immediate. **Lead:** Product/integration agent. **Dependency:** Existing main baseline only.

Reconcile the 2030 plan, current vision, README, STATUS, GD-038, and boundary verification. Establish this reader roadmap as one candidate authority with explicit supersession notes. Separate public news milestones from ecosystem operations milestones. Inventory public routes and annotate keep/replace/redirect/retire.

Freeze the first release's reader tasks, route model, core components, inclusion policy, and source-first boundaries. Create a named acceptance checklist that another verifier can run without asking the owner to manually click through the site.

**Exit:** One non-conflicting roadmap and route inventory; GD-038 remains the primary immediate work item; no public-news dependency on completion of FWOMPS or the GFD cockpit unless a specific shared service is actually required.

### R1 - Ship a coherent World Desk (GD-038)

**Priority:** Immediate public release. **Lead:** Frontend/product agent. **Dependencies:** R0; existing feed and source contracts.

Replace the project-directory semantics in `index.html`, `categories.html`, `timeline.html`, `projects-data.js`, `projects-render.js`, and related maintainer guidance. Reuse safe presentation machinery only after removing project-management assumptions. Inspect `app.js` for old project export/add-project behavior.

Deliver the new homepage first view, shared labeled navigation, compact source/freshness treatment, accessible card, useful topic entry point, and an honest chronological reporting view. Unsupported topic assignments stay uncategorized; no invented automatic story groups are required to ship this release.

Repair the region race using immutable request context plus cancellation or request-generation rejection. Define explicit timeouts, safe retries, and independent trust-panel resolution. Test loading, true empty, no matches, partial results, stale cache, upstream failure, and offline states separately. Do not conflate every failure with 'worker warming up'.

**Exit:** A new visitor can find current reporting, identify the publisher, open the original, change region without mismatched results, and inspect source context on desktop and phone. No sibling-project directory semantics remain in the public artifact. A failing optional trust service does not blank the feed. The exact deployed artifact passes fresh public critical-path checks and retains a tested rollback.

### R2 - Make the evidence foundation a reader-facing story product

**Priority:** Next core release. **Lead:** Data/evidence and frontend agents. **Dependencies:** Existing entity/claim/dossier contracts; R1 components.

Add a reader-facing story collection that references canonical events and article records. A story grouping is not itself proof of event identity. Candidate clustering may suggest relationships but cannot silently merge ambiguous entities or events. Begin with curated/explicit relationships and an evaluation set.

Implement stable story IDs, article memberships, publication/update history, source-family relationships where established, evidence links, contradictions, corrections, and unresolved location/claim fields. Preserve old versions and correction provenance. Use existing schemas instead of introducing a second identity or truth system.

Publish a small representative set of real, maintained story pages. The initial set should exercise single-source, multi-source, conflicting, corrected, and limited-evidence cases rather than only easy examples.

**Exit:** Reader journeys work from headline to sources/evidence and back. Duplicate syndicated reports are not portrayed as independent corroboration. False merges and false splits are evaluated on a reviewed corpus. Source links survive optional evidence outages. No unsupported summaries or display permissions are introduced.

### R3 - Deliver Place Intelligence (resume GD-026)

**Priority:** Core differentiator. **Lead:** Place/context and frontend agents. **Dependencies:** Existing stable place identity; R1 shell; story links where R2 provides them.

Extend the reviewed country/area registry without conflating attributes with identity. Add provenance for names, coordinates, language/context data, and institutional links. Implement `/places/{iso2}/`, review editorial treatment of disputed geography, and maintain an explicit pilot coverage manifest.

Connect news -> place -> local sources -> context -> news. Add original-language/local-source discovery, respectful cultural context, and evidence-backed progress where content supports it. Use relevant external contributions only within the later public-boundary rules.

**Exit:** Pilot pages are genuinely useful, sourced, dated, mobile-tested, and reachable from supported stories/map selections. Missing coverage is accurately labeled. Event geography is never inferred solely from publisher headquarters or routing region. Expand the pilot by content readiness rather than country-count vanity.

### R4 - Complete discovery, search, and history

**Priority:** Core navigation and return value. **Lead:** Search/data and frontend agents. **Dependencies:** R1 taxonomy and route contract; R2/R3 for their searchable objects.

Add server-side or generated-index search over the governed retained corpus, with rights-aware storage and display. Index stable source, story, place, and topic references. State searchable date coverage. Make pagination deterministic and preserve filter/back/scroll state. Provide direct, shareable links for meaningful states.

Replace old `categories` and `timeline` semantics fully; preserve old URLs through truthful redirects where useful. Add source detail pages, archive/date exploration, and clear source-publication versus event-time choices.

**Exit:** Search does not silently search only the loaded page. Old, ambiguous, corrected, and zero-result queries have tested outcomes. A reader can find the same story again through a stable URL and understand how it changed.

### R5 - Make returning worthwhile without manipulation

**Priority:** After the core paths are reliable. **Lead:** Reader-product agent. **Dependencies:** R2 history and stable IDs; R3/R4 for followed entities.

Create a dated, finite Daily World Brief assembled from approved metadata and explicitly attributed, permitted material. Explain selection and scope. It should show meaningful developments and missing coverage, not assert that it represents all world news.

Add browser-local saves first, with clear 'saved on this device' copy. Add followed places/topics/stories and a meaningful 'since your last visit' view using actual record changes. Provide topic/place RSS and opt-in digest delivery when operationally supported. Accounts and cross-device synchronization are optional later upgrades, not barriers to reading.

Add corrections to the update mechanism. A correction should reach affected followers through the same honest history model. Avoid default push prompts, streaks, engagement bait, and algorithmic personalization readers cannot inspect or reset.

**Exit:** Saves persist as promised, follow/unfollow works, repeated refreshes do not masquerade as new developments, digest content points to stable live records, and delivery/unsubscribe failures are handled. User feedback distinguishes genuine utility from superficial engagement.

### R6 - Expand coverage and multilingual utility deliberately

**Priority:** Parallel with R2-R5, bounded by content readiness. **Lead:** Source/evidence agent. **Dependencies:** Existing admission governance and observed coverage gaps.

Prioritize undercovered places and languages, local/subnational reporting, and useful primary institutions. Make each proposed addition an explicit contract: provenance, endpoint authority, permitted use/storage/translation, expected cadence, geography, failure behavior, and validation evidence. Keep directory-only institutions separate from ingested evidence.

Continue the AP and Guardian decision records and other unresolved source-use states without assuming permission. Do not use unofficial scraping as a substitute for unavailable licensed access. Build budgets and visible degraded states for translation. Preserve original language and source wording where permitted; support native scripts and right-to-left layout as actual content enters the product.

**Exit:** Each addition improves a stated reader coverage gap, passes admission and hostile-content tests, and appears accurately in coverage reporting. No raw source-count marketing substitutes for geographic, language, or evidence-role coverage. Permission expiry/revocation invalidates unauthorized cached display paths.

### R7 - Meet a world-class interaction and accessibility bar

**Priority:** Begins in R1 and gates every release. **Lead:** Independent UX/accessibility verifier. **Dependencies:** All touched reader surfaces.

Retain the existing 390x844 and 360x800 coverage. Add WebKit and Firefox, tablet/landscape, narrow reflow, real iOS Safari and Android Chrome checks, keyboard-only navigation, screen-reader sampling, reduced motion, zoom, and text-spacing overrides.

Target WCAG 2.2 AA. Use 44x44 CSS pixel hit areas for primary touch controls as a project design target; do not misstate that as the universal AA minimum. WCAG 2.2's minimum-target criterion is 24x24 CSS pixels with specified exceptions. [E13]

Exercise drawer focus entry/return, Escape/close behavior, visible focus, sticky-header obstruction, status announcements, full control names, and map alternatives. Test incomplete metadata, long non-English headlines, no image, broken image, corrections, many sources, and malicious feed markup. Automated scanning is a component of acceptance, not a declaration of complete conformance.

Run task-based usability sessions with representative readers, including low-bandwidth/mobile and assistive-technology users. Use the actual tasks: find a current story, identify its origin, explain the uncertainty, open the source, locate the place, and return to the same context.

**Exit:** No unresolved critical/serious automated findings on the tested surfaces, no known blocking keyboard/screen-reader issue, and the core tasks succeed in observed sessions. Record remaining limitations rather than silently declaring universal accessibility.

### R8 - Certify performance, freshness, discoverability, and resilience

**Priority:** Begins in R1; expands with content. **Lead:** Platform and independent release verifier. **Dependencies:** Source/API/display contracts and real deployment evidence.

Deliver meaningful HTML before optional hydration where feasible. Make the globe, webcams, and secondary charts optional/lazy enhancements. Bound feed fan-out and translation work; preserve anonymous cached reading during abuse throttles. Continue SEC-002's edge-cost controls independently of page design. Test service-worker upgrades, stale caches, schema mismatches, bad timestamps, partial failures, slow responses, and revoked content rights.

Adopt field performance targets of LCP <= 2.5 seconds, INP <= 200 milliseconds, and CLS <= 0.1 at the 75th percentile, segmented by mobile and desktop. These are targets, not measured GlobalDeets results. Laboratory checks prevent regressions but do not replace field evidence. [E14]

Set explicit freshness classes by source cadence and data type. Separate source publication, retrieval, last successful refresh, document correction, and deployment times. A new deployment does not make old news current.

Maintain truthful canonical routes, useful metadata, accessible HTML, sitemaps, and social previews. Structured data must describe actual visible content and authorship; use article markup only when the page qualifies, not to impersonate an original publisher. Validate supported markup and keep publication/update dates accurate. [E15]

**Exit:** Exact-artifact deployment verification, rollback evidence, tested degraded behavior, and source/freshness invariants are present. Report field metrics as unmeasured when sample data is insufficient. Pages remain useful when optional scripts or external services fail.

### R9 - Operate a trustworthy product and prove repeat utility

**Priority:** Instrument in R1; expand after stable experiences exist. **Lead:** Product operations and analytics owners. **Dependencies:** Clear event definitions, privacy choices, and reliable critical paths.

Track source opens, evidence/context opens, place exploration, saves/follows, search success signals, meaningful story updates, and repeat visits where measurement is permitted. A source open is an outbound click, not proof someone read the publisher's article. Do not treat a short successful source-routing visit as automatically bad. Do not fingerprint readers or retain sensitive search strings merely to improve reporting.

Use a candidate north-star outcome such as **returning readers who complete a useful source/context journey**, with a published definition and denominator before comparing periods. Monitor correctness, coverage, latency, freshness, and user comprehension alongside engagement. Set retention targets only after establishing a valid baseline and cohort definition; never relabel edge requests as people.

Establish source review, corrections intake, takedown/rights handling, editorial inclusion responsibility, incident response, and routine content maintenance. World-class news utility requires an ongoing publishing and review process, not just a feature-complete repository.

Investor demonstrations should use the same public reader paths and real dated records. Show audience data only when it is valid for the stated population/time window. Label any demonstration data separately and keep it out of production claims.

Consider support/membership and paid convenience features only after the anonymous product earns repeat use. Do not make sponsorship influence appear to be editorial or algorithmic importance.

**Exit:** A reproducible audience/utility report, an operating cadence, clear correction ownership, and a demonstration that follows the same working product the public receives. Sustained quality and utility, not a feature checklist, justify the 'world-class' claim.

## 5. Dependency order and release packaging

**Main reader path:** R0 -> R1 -> R2 -> R3 -> R4 -> R5. R2 and R3 can partly overlap after shared identity/UI contracts are stable. Do not delay a truthful latest-headlines release for generalized clustering or worldwide place enrichment.

**Parallel paths:** R6 coverage work; R7 accessibility; R8 performance/reliability; R9 measurement instrumentation. These are bounded companions to the current reader slice, not excuses for returning to an all-ecosystem rebuild.

| Release | Publicly observable improvement | Completion evidence |
|---|---|---|
| Reader reset | World Desk, clean public identity, dependable feed/filters, clear source actions | GD-038 semantics removed, browser task tests, exact deployed artifact, failure-state tests |
| Connected understanding | Maintained story/context pages and useful pilot place pages | Stable links, evidence histories, geography validation, pilot quality review |
| Daily-use product | Search/history, saves/follows, dated brief and change awareness | Persistence, corpus-scope tests, real update diffs, usability feedback |
| World-class candidate | Wider governed coverage, cross-browser accessibility, real field performance and repeat utility | Ongoing measured quality, corrections operations, valid audience evidence |

No calendar completion date is asserted. Sequence by demonstrated exits and actual capacity. A release can be useful before the whole vision is complete.

## 6. Engineering handoff

### Work packet contract

Every packet should name: one reader problem, one observable outcome, controlling source contracts, touched routes/files, excluded scope, implementation branch/PR, deterministic tests, independent review requirements, exact deploy evidence, and rollback. Closure must attach evidence rather than say 'looks good'.

### Roles

- Product/integration agent maintains the north star, resolves conflicts, and protects the current release scope.
- Frontend agent implements shared components and complete reader paths.
- Data/evidence agent owns identity, permissions, provenance, history, and geographic truth.
- Independent verifier tests desktop/mobile, failure states, content semantics, accessibility, and exact deployed behavior.
- Release/operator lane uses existing authorized review/deploy controls and records the outcome.

Do not make the owner manually operate a browser acceptance checklist or shuttle secrets between agents. At the same time, do not bypass platform access, code-review, or security boundaries. Record a real blocked action narrowly and continue unrelated public-reader work.

### Suggested repository artifacts

These are proposed destinations, not files created in the repository during this review:

- `docs/NEWS_PRODUCT_ROADMAP.md`: this roadmap after reconciliation/adoption.
- `docs/NEWS_UX_ACCEPTANCE.md`: reader journeys and release gates.
- `docs/NEWS_INFORMATION_ARCHITECTURE.md`: routes, taxonomy, redirects, and public boundary.
- `docs/NEWS_DESIGN_SYSTEM.md`: visual tokens, components, content/state examples.
- `docs/NEWS_EDITORIAL_AND_AI_POLICY.md`: inclusion, attribution, corrections, AI, uncertainty.
- `docs/NEWS_MEASUREMENT.md`: event definitions, privacy, cohorts, and limitations.

Prefer lightweight structured manifests for routes, pilot places, and test scenarios. Do not introduce another duplicated source registry, evidence schema, or audience metric system.

## 7. Definition of done

**Useful reader release:** A first-time reader can understand the site, find current reporting, identify/open the publisher, inspect context, navigate correctly on a phone, and recover from a partial outage. No portfolio drift, fake freshness, or unsupported claims remain in that path.

**Differentiated product:** Readers can connect maintained stories, evidence, places, and history; search and return to them; and see consequential updates without consuming an endless undifferentiated feed.

**World-class candidate:** The product sustains those paths across devices and access needs, expands coverage honestly, meets measured reliability/performance standards, operates a credible correction/source process, and demonstrates repeated usefulness to real readers.

The project is neither 'almost finished because CI is green' nor 'starting over because the UI is unfinished'. The next task is to connect and present the existing assets as a coherent public experience.

## 8. Evidence register

Repository reads were performed October 6, 2026. Repository-file references below are pinned to the inspected main commit for reproducibility. Issue and workflow references describe their state at review time.

- **E1:** `GLOBALDEETS_2030_PRODUCT_PLAN.md` - source-first atlas vision, daily habit loop, original-source priority. `https://github.com/weave0/globaldeets/blob/d988a153d5bd9e1e2c1e6292623ce13227a6fcec/GLOBALDEETS_2030_PRODUCT_PLAN.md`
- **E2:** Open issue 78, GD-038 - portfolio-directory retirement and GlobalDeets-native IA. `https://github.com/weave0/globaldeets/issues/78`
- **E3:** Main branch/PR 77 merge - public Mission Control/ecosystem boundary correction. `https://github.com/weave0/globaldeets/commit/d988a153d5bd9e1e2c1e6292623ce13227a6fcec`
- **E4:** `news.html` - navigation, source-count copy, loaded-news search, source-routing structure. `https://github.com/weave0/globaldeets/blob/d988a153d5bd9e1e2c1e6292623ce13227a6fcec/news.html`
- **E5:** `news.js` - feed rendering, request state, reader context, trust hydration, display modes. `https://github.com/weave0/globaldeets/blob/d988a153d5bd9e1e2c1e6292623ce13227a6fcec/news.js`
- **E6:** `docs/phase2-entity-event-model.md` - stable identity, partial country seed, ambiguity and explicit non-goals. `https://github.com/weave0/globaldeets/blob/d988a153d5bd9e1e2c1e6292623ce13227a6fcec/docs/phase2-entity-event-model.md`
- **E7:** `docs/coverage-observatory.md` - provenance/permission/health boundaries, dossier and correction contracts. Its numeric baseline is historical, not asserted as current. `https://github.com/weave0/globaldeets/blob/d988a153d5bd9e1e2c1e6292623ce13227a6fcec/docs/coverage-observatory.md`
- **E8:** `docs/source-admission-audit-2026-09-13-final-legacy.md` - reviewed/unknown semantics, not a new legal determination. `https://github.com/weave0/globaldeets/blob/d988a153d5bd9e1e2c1e6292623ce13227a6fcec/docs/source-admission-audit-2026-09-13-final-legacy.md`
- **E9:** `playwright.config.js` - desktop Chromium and Chromium-based 390x844/360x800 projects. `https://github.com/weave0/globaldeets/blob/d988a153d5bd9e1e2c1e6292623ce13227a6fcec/playwright.config.js`
- **E10:** Public homepage retrieved October 6 - product-direction sections and country-page roadmap label. This is page-text evidence, not a complete interactive rendering. `https://globaldeets.com/`
- **E11:** Main CI run 241 at the inspected commit - completed successfully September 27. `https://github.com/weave0/globaldeets/actions/runs/36352760156`
- **E12:** `STATUS.md` - September 24 operating narrative still identifies the retired public Mission Control surface. `https://github.com/weave0/globaldeets/blob/d988a153d5bd9e1e2c1e6292623ce13227a6fcec/STATUS.md`
- **E13:** W3C WCAG 2.2, retrieved October 6. `https://www.w3.org/TR/WCAG22/`
- **E14:** Google Web Vitals guidance, retrieved October 6. `https://web.dev/articles/vitals`
- **E15:** Google Search Central Article structured-data guidance, retrieved October 6. `https://developers.google.com/search/docs/appearance/structured-data/article`

### Local reproduction

`region-race-repro.mjs` and `region-race-result.json` accompany this document. The reduced harness reproduces the inspected request-ordering problem only; it does not prove all browser manifestations, run the complete application, or constitute a production test. Run it with `node region-race-repro.mjs`.

## 9. Progress ledger

Updated as work lands. "Implemented" means merged code with automated tests; it is not a production certification. Production state comes from the deploy workflow's exact-artifact verifiers.

| Roadmap item | State | Evidence |
| --- | --- | --- |
| R0: single public-product contract | Implemented on `feat/gd038-world-desk` | This document, `README.md`, `STATUS.md` (supersession note), route inventory below, `docs/NEWS_UX_ACCEPTANCE.md` |
| F1: portfolio directory retired (GD-038) | Implemented | `tests/gd038-world-desk.spec.js`; `tools/verify-boundary-retired-prod.js` now checks content |
| F2: planning docs contradict the boundary | Implemented | `README.md` and `STATUS.md` rewritten |
| F3: implementation vocabulary before stories | Implemented: `/news` is toolbar → status → visible warnings → stories; intro, inventory, rights statistics, and reading context sit behind "Sources & coverage" | `tests/gd038-first-view.spec.js` |
| F4: region-switch race | Implemented | `tests/gd038-feed-reliability.spec.js` ("a slow earlier region can never overwrite…") |
| F5: trust hydration waits on the slowest request | Implemented | `tests/gd038-feed-reliability.spec.js` ("a hung trust endpoint…") |
| F6: static/dynamic source truth | Implemented on `main` (8459811); the stale `feat/gd0260-static-source-truth` branch is superseded and left untouched | `smoke.spec.js` raw-HTML and fallback source-count tests |
| R1 World Desk homepage | Implemented | `tests/gd038-world-desk.spec.js` |
| R1 labeled shared navigation | Implemented: Today, News, Browse + a labeled "More" menu on all primary pages | `gd038-first-view.spec.js` (nav test) |
| R1 compact readable cards | Implemented: headline → publisher/time → permitted text → "Read at"; source context collapsed | `gd038-first-view.spec.js`, `gd021`, `gd022` |
| R1 phone first view | Implemented: first headline, publisher, and source action visible without scrolling at 390×844, 360×800, 360×640 | `gd038-first-view.spec.js` |
| R1 service worker install/upgrade/offline labeling | Implemented with a dedicated service-worker-enabled test path | `gd038-service-worker.spec.js` |
| R1 light mode | **Deferred** (not part of the reader-reset release; tracked under R7) | — |
| R1 production release | Not deployed | — |
| R2 story page | Implemented on `feat/gd-r2-story-intelligence`, which depends on unmerged PR #80 (`18f2910`). Not deployed. One public story. Incomplete-data states are evaluation fixtures, not extra public stories | `tests/story-intelligence.test.mjs`, `tests/gd-r2-story.spec.js`, `docs/story-intelligence.md` |
| R3–R9 | Not started (GD-026 place work exists on `feat/gd0261-place-registry`) | — |

## 10. Public route inventory (R0)

| Route | Decision | Notes |
| --- | --- | --- |
| `/` | Replaced | World Desk (GD-038) |
| `/news` | Keep | Region deep links via `?region=` |
| `/categories` | Replaced | Browse by feed region and publisher; topic browsing waits for a reviewed taxonomy |
| `/timeline` | Replaced | Reporting grouped by publication day; not an event timeline |
| `/globe` | Keep (optional lens) | Each pin carries a labeled location kind: `publisher-approximate` (near a mapped publisher's base, offset to avoid overlap) or `region-fallback` (publisher not mapped; general feed-region position). Neither is an event location |
| `/worldmap` | Keep (optional lens) | Webcams are separate from reporting coverage |
| `/knowledge` | Keep | Review for portfolio drift in a later pass |
| `/about`, `/contact`, `/donate` | Keep, review copy | `donate.html` title ("Power World-Changing Tech") needs a reader-product rewrite |
| `/observatory/coverage/` | Keep | Trust deep link from the desk and feed |
| `/dossiers/santa-ynez-pipeline/` | Keep | Evidence graph for the maintained Santa Ynez story |
| `/story/santa-ynez-pipeline/` | Added (R2) | Reader story. Stable id `story:santa-ynez-pipeline`. Not a headline URL |
| `/places/{iso2}/` | Planned (R3) | GD-026 |
| `/observatory/mission-control/`, `/spheres.html`, `/analytics.html` | Retired (GD-037) | Must stay unreachable |
| `/bb-content.html`, `projects-*.js`, `platform-modal.js` | Retired (GD-038) | Must stay unreachable |


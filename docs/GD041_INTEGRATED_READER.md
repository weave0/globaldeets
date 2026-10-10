# GD-041 — Integrated World Reader (candidate only)

**State: draft integration; no production or editorial approval.** This branch is stacked on GD-038 (#80), which is still blocked by required review. Its scope is an explicit confluence test of GD-039 dark editorial, GD-040 publisher-diverse/region-accurate news selection, and GD-R2 maintained Story Intelligence—not a replacement for any required review or rollout process.

## Contract and purpose

The independently verified previews do not constitute an integrated user journey. Without confluence, GD-039's dark design still shows chronological source concentration and includes global publisher feeds in regional tabs; GD-040's balanced selection still displays the oversized legacy header/globe first; GD-R2's story uses the older identity and navigation. GD-041 closes that gap on a **separate branch**.

- **Home:** compact midnight masthead and dated original-publisher reporting first, with an explicitly opt-in deterministic **Across publishers** selection. No publisher, geographic viewpoint, or political truth scores. Globe is optional exploration below reporting.
- **News:** publisher-source feed, newest first by default. `region=asia` means Asia-assigned publisher channels only. This does **not** assert that stories took place in Asia. No global padding of weak regions.
- **Intelligence:** one maintained Santa Ynez record, explicit original reporting link and independent evidence graph/corrections/unknowns, server-owned exact-URL membership only; no automatic clustering.
- **Governance:** the upstream R1 public-boundary, rights policy, unsafe URL checks, source admissions, and source-health caveats remain enforced. Service-worker v10 precaches both the midnight stylesheet and the public story records while preserving redirected HTML normalization.
- **Proof:** source and admission fingerprint still gate the KV cache; both sort modes read the same governed dataset. Stable pagination and mode/region metadata validated in 300+ tests.
- **Privacy:** no new engagement cookies, personal profiles, unreviewed publisher content or tracking. Story event counts remain intentionally anonymous as in R2.
- **Release:** all changes require an authorized reviewed merge of #80, a deliberate feature integration review, and exact-commit production deployment and verification. Never call a Cloudflare preview production.

## Verification and acceptance

Run lint, all Node Function/evidence contracts, all Playwright browser/mobile/service-worker regressions, stage exact-commit Pages assets, then verify on a unique preview URL. The live check asserts first-eight publisher breadth, strict region boundaries, default chronological mode, the dark first-viewport hierarchy and navigation, API/story projection agreement, v10 offline service-worker shell, and direct offline reloading of the maintained story with original links.

Archive desktop Home, desktop/mobile Asia News, and desktop Story screenshots. Assess visible publisher provenance, informational density, color contrast, link discoverability and correction prominence by eye after automated acceptance. The preview cannot certify geospatial event mapping, publisher impartiality, newsroom staffing, or a second documented maintained story.

## Dependency / change ownership

- #80 owns R1 Reader Reset safety + release gates.
- #86 owns deterministic news selection + honest publisher-region routing.
- #83 owns dark editorial pages.
- #82 owns server-approved story association, record, evidence and corrections.
- This branch exercises their combined contracts and addresses only integration defects.

Do not independently merge all four PRs and this integration branch. Before promotion, choose one reviewed integration route, reconcile feature branches against final parent SHA, and run the complete production smoke/offline gates.

## Premium story progression

The maintained Santa Ynez Story now uses the same midnight editorial masthead and compact evidence navigation as the desk. The body adds a transparently calculated **Record at a glance** with actual structured-record counts and a **Publisher comparison** panel that explicitly refuses to synthesize multiple independent perspectives when only one reporting origin is documented. All record dates, primary-doc evidence, corrections, official statements and unresolved gaps retain their original provenance. This is not a fabricated comparative scoring system or claim of continuous live updating. Public story HTML, fixture rendering, keyboard tests and offline source actions remain required acceptance gates.

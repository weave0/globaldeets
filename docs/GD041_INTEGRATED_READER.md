# GD-041 — Integrated World Reader (candidate only)

**State: candidate integration; not merged or production-certified.** Reader Reset (#80) is merged and was production-certified on October 12, 2026; the GD-047 boundary incident (#93) is closed. This branch reconciles the dark editorial, publisher-diverse/region-accurate feed, and governed maintained-story work with the current production release controls. Automated preview acceptance is distinct from a completed production rollout.

## Contract and purpose

The independently verified previews do not constitute an integrated user journey. Without confluence, GD-039's dark design still shows chronological source concentration and includes global publisher feeds in regional tabs; GD-040's balanced selection still displays the oversized legacy header/globe first; GD-R2's story uses the older identity and navigation. GD-041 closes that gap on a **separate branch**.

- **Home:** compact midnight masthead and dated original-publisher reporting first, with an explicitly opt-in deterministic **Across publishers** selection. No publisher, geographic viewpoint, or political truth scores. Globe is optional exploration below reporting.
- **News:** publisher-source feed, newest first by default. `region=asia` means Asia-assigned publisher channels only. This does **not** assert that stories took place in Asia. No global padding of weak regions.
- **Intelligence:** one maintained Santa Ynez record, explicit original reporting link and independent evidence graph/corrections/unknowns, server-owned exact-URL membership only; no automatic clustering.
- **Governance:** the upstream R1 public-boundary, rights policy, unsafe URL checks, source admissions, and source-health caveats remain enforced. Service-worker v10 precaches the midnight stylesheet and reviewed public story records, preserves redirected HTML normalization, and retains #95 isolation from unrelated same-origin caches.
- **Proof:** source and admission fingerprint still gate the KV cache; both sort modes read the same governed dataset. Stable pagination and mode/region metadata validated in 300+ tests.
- **Privacy:** no new engagement cookies, personal profiles, unreviewed publisher content or tracking. Story event counts remain intentionally anonymous as in R2.
- **Release:** Reader Reset #80 and the GD-047 retired-path protections are already merged and certified. This integrated reader still requires a successful exact-head CI/hosted preview, ordinary authorized merge, and post-merge production verification. Never call a Cloudflare preview production.

## Verification and acceptance

Run lint, all Node Function/evidence contracts, all Playwright browser/mobile/service-worker regressions, stage exact-commit Pages assets, then verify on a unique preview URL. The live check asserts first-eight publisher breadth, strict region boundaries, default chronological mode, the dark first-viewport hierarchy and navigation, API/story projection agreement, v10 offline service-worker shell, and direct offline reloading of the maintained story with original links.

Archive desktop Home, desktop/mobile Asia News, and desktop Story screenshots. Assess visible publisher provenance, informational density, color contrast, link discoverability and correction prominence by eye after automated acceptance. The preview cannot certify geospatial event mapping, publisher impartiality, newsroom staffing, or a second documented maintained story.

## Dependency / change ownership

- #80 owns the merged R1 Reader Reset safety + release gates; #94/#98/#100/#101 retain the certified retired-path boundary.
- #86 owns deterministic news selection + honest publisher-region routing.
- #83 owns dark editorial pages.
- #82 owns server-approved story association, record, evidence and corrections.
- This branch exercises their combined contracts and addresses only integration defects.

PR #87 is the integrated release vehicle; do not separately merge its older source branches #82/#83/#86, as that would double-land the implementation. The current branch has been reconciled with production `main` including #95 service-worker isolation and #96 source-coverage reporting. Preserve exact-head CI, preview, and production verification evidence before reporting public completion.

## Premium story progression

The maintained Santa Ynez Story now uses the same midnight editorial masthead and compact evidence navigation as the desk. The body adds a transparently calculated **Record at a glance** with actual structured-record counts and a **Publisher comparison** panel that explicitly refuses to synthesize multiple independent perspectives when only one reporting origin is documented. All record dates, primary-doc evidence, corrections, official statements and unresolved gaps retain their original provenance. This is not a fabricated comparative scoring system or claim of continuous live updating. Public story HTML, fixture rendering, keyboard tests and offline source actions remain required acceptance gates.

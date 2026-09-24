# GlobalDeets — Current Status

**Status date:** 2026-09-24  
**Product state:** Live source-first world information platform  
**Canonical operating surface:** `/observatory/mission-control/`

## Current product

GlobalDeets is live as a world-information product, not the former password-gated portfolio showcase described by older archival material.

The active product includes live world news and original-source routing, globe/place discovery, public knowledge and webcam surfaces, governed source admission, coverage/evidence integrity tooling, published evidence dossiers, the Coverage & Evidence Observatory, and investor/operator Mission Control.

## GD-029 state

GD-029 moves Mission Control from a strong point-in-time dashboard to a versioned operating data plane.

It now has three directly consumable contracts:

- `history.json` — dated snapshots and ingestion seams for 7/28/90-day views;
- `estate-health.json` — all 25 active zones, with GlobalDeets first and Culture Sherpa prominent, including observability, deploy evidence where available, last meaningful activity, and explicit unknown availability/critical-path state;
- `diagnostics.json` — the sortable human/agent work queue with severity, business impact, status, owner lane, age, evidence, next action, and escalation rules.

Mission Control renders those contracts directly rather than maintaining a second decorative analytics truth.

## GD-030 state

GD-030 converts GD-029's deliberate unknowns into evidence:

- a scheduled collector (every six hours) probes all 25 active zones and stores dated evidence on the `mission-control-evidence` branch, then deploys it;
- availability is `available` / `degraded` / `unavailable` / `no-service-published` / `unknown`, with failure class, timestamp, evidence, and next action on every failure; edge challenges and gated roots are *insufficient evidence*, not outages; parked zones with no published service are a topology decision, not an outage;
- critical path is authoritative only for GlobalDeets; other properties carry a homepage-identity baseline (drift, never outage) or an explicit `unknown` where no honest contract exists;
- history is idempotent, gap-honest, and comparability-keyed: trends and deltas are computed only across matching metric definitions and observation boundaries;
- freshness is enforced everywhere: stale evidence is labelled, expired evidence is shown as unknown, and the diagnostics queue derives outage, degraded, stale-evidence, insufficient-evidence, maintenance, and observability-gap findings automatically with escalation classes;
- **not done, by design:** certified human audience and business-event ingestion keep their seams but no data (no qualifying source is connected), and no Canonical Gold metric is bound until a governed non-fixture source is configured.

## Evidence state

The connected Cloudflare inventory on September 24, 2026 shows 25 active zones and 21 with RUM enabled. The four explicit browser-observability gaps are `artificelligance.com`, `artificelligence.com`, `fwomps.com`, and `fwomp.us`.

The latest comparable GlobalDeets operational traffic snapshot remains the 28-day window ending September 23, 2026: 157,486 edge requests and 36,391 raw edge visits, of which 31,681 are attached to `/_stcore/health`. Those values are operational telemetry and are not certified human audience.

Production availability and critical-path state come only from the scheduled probes described above. Before the first collected run, and whenever evidence expires, those states are **unknown**, not healthy and not zero. Read `estate-health.json` for the live state rather than this document.

## Investor-readiness gaps

The canonical queue in Mission Control is authoritative. The material unresolved lanes are:

- certify human audience metrics;
- extend authoritative critical-path contracts beyond GlobalDeets and add a second probe vantage;
- instrument meaningful business conversion/retention events;
- let scheduled snapshots accumulate (90 days for a full 90-day view) and connect a governed Canonical Gold source for comparable operational-edge points;
- resolve or explicitly exempt four RUM gaps;
- quantify Culture Sherpa convergence with real overlap/utility evidence;
- align stale external GitHub repository metadata with the current product story.

## Evidence standard

Any investor-facing claim must be tied to a source and time window, explicit about what the metric measures and its limitations, and withheld when the evidence is unavailable.

The goal is not a prettier dashboard. The goal is a trustworthy diagnostic and business-intelligence layer that can explain the product, expose risk, preserve uncertainty, and direct the next unit of work.

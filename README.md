# GlobalDeets

GlobalDeets is a source-first world information platform: live world news, place context, public knowledge, culture, webcams, and governed evidence organized around geography.

**Live:** https://globaldeets.com  
**Mission Control:** https://globaldeets.com/observatory/mission-control/  
**Coverage & Evidence Observatory:** https://globaldeets.com/observatory/coverage/

## Product direction

GlobalDeets is becoming **the world's open information desk, organized by place**.

The core product is not a portfolio showcase and not an opinion feed. It is a routing and context layer that helps people understand what is happening, where it is happening, who is reporting it, what public sources exist, and what cultural context makes a place intelligible.

Current product pillars include:

- live world news with original-publisher links;
- a globe and place-based discovery model;
- governed source admission and source-health contracts;
- public knowledge and civic-resource routing;
- evidence dossiers and a Coverage & Evidence Observatory;
- culture-context integration, with Culture Sherpa as a future convergence opportunity;
- Good Flippin Vibes as a future positive-progress context layer.

See `GLOBALDEETS_2030_PRODUCT_PLAN.md` and `GLOBALDEETS_VISION.md` for the broader product thesis.

## Mission Control

`/observatory/mission-control/` is the canonical investor + operator intelligence surface.

It is designed to answer four questions without inventing certainty:

1. **What is demonstrably real?**
2. **What can and cannot be responsibly claimed?**
3. **What is broken, missing, risky, or strategically important?**
4. **What should be worked next?**

Mission Control currently combines:

- Cloudflare estate inventory;
- Web Analytics/RUM coverage inventory;
- GlobalDeets edge telemetry;
- live governed-source and evidence counts from the Coverage Observatory;
- a versioned historical data plane for truthful 7/28/90-day views, **accumulated automatically** by a scheduled collector (GD-030);
- an estate-wide property health contract across all active zones, fed by **scheduled production availability and critical-path probes** (GD-030);
- an agent-consumable diagnostics queue **derived from that evidence** with severity, business impact, status, owner lane, age, evidence, next action, and escalation class.

### Evidence pipeline (GD-030)

`.github/workflows/mission-control-evidence.yml` runs every six hours (and on demand):

1. probes every active zone: DNS → HTTP → expected page / critical path, with retries and a delayed confirmation re-probe;
2. refreshes Cloudflare zone and Pages inventory when the token permits, and consumes a governed Canonical Gold 1.2 document when a non-fixture source is configured;
3. upserts one idempotent dated snapshot, derives the diagnostics queue, and validates the whole data plane;
4. commits the validated evidence to the `mission-control-evidence` branch (never to `main`) and deploys it with the current `main`.

Any failure leaves the last valid evidence untouched, and stale evidence is shown as stale — then unknown — in the page, the raw JSON, and the queue. Health is defined by an explicit contract (`estate-health.json` → `healthContract`): HTTP 200 alone is `reachable-unverified`; only an authoritative critical-path pass on fresh evidence is `verified-healthy`. Contracts for agents: `history.json`, `estate-health.json`, `diagnostics.json`, `probes.json`. Property registry and probe contracts live in `tools/mission-control/config/`.

### Investor-claims contract

Mission Control intentionally separates **operational telemetry** from **certified audience metrics**.

- Edge requests and visits are not automatically human audience.
- Missing measurement is not treated as zero.
- Synthetic monitoring and health traffic must be classified before traction claims are made.
- Investor-facing claims should have a source, date window, and known limitation.

This is a feature, not a weakness: the diagnostic system is meant to surface uncertainty rather than bury it.

## Estate observability

As of the Mission Control snapshot dated September 23, 2026:

- 25 active Cloudflare zones are represented.
- 21 of 25 have browser-observability coverage.
- Four zones are explicitly identified as not yet observed or exempted.
- The current 28-day GlobalDeets edge telemetry is measurement-constrained by synthetic health traffic and is **not** presented as certified human audience traction.

Use the live Mission Control page for the current snapshot rather than copying these numbers into investor material indefinitely.

## Engineering discipline

The current codebase includes:

- governed source-admission contracts;
- rights and attribution checks;
- coverage/evidence integrity tests;
- local-reporting observatory checks;
- production verification tooling;
- mobile certification tests;
- Mission Control smoke coverage;
- CI-gated work-item delivery.

The work-item sequence is tracked as `GD-###`. **GD-027** and **GD-028** established investor-safe Mission Control; **GD-029** adds the versioned history, estate-health, and agent-diagnostics data plane; **GD-030** makes that data plane accumulate from scheduled snapshots and estate-wide production probes.

## Development

Typical commands:

```bash
npm install
npm run lint
npm test
```

See `package.json`, `DEVELOPMENT.md`, and the GitHub Actions workflows for the current executable contracts.

## Current priorities

The live operating queue in Mission Control is authoritative. Current high-level priorities are:

1. certify human audience and engagement metrics from RUM/GA4-quality signals;
2. close browser-observability gaps across the estate;
3. finish eliminating stale portfolio-era product narrative;
4. instrument meaningful business conversion and retention events;
5. extend critical-path contracts beyond GlobalDeets (owners declare stable paths) and add a second probe vantage;
6. quantify the Culture Sherpa convergence thesis with real usage evidence;
7. connect a governed Canonical Gold source and certified audience / business-event ingestion (the seams exist; no data is fabricated).

## Provenance rule

Do not use estimated Lighthouse scores, stale traffic claims, old portfolio counts, or decorative analytics as investor evidence.

When a number matters, prefer a live governed endpoint, a dated Mission Control snapshot, a reproducible production check, or an explicitly cited external source.

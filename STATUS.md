# GlobalDeets — Current Status

**Status date:** 2026-09-23  
**Product state:** Live source-first world information platform  
**Canonical operating surface:** `/observatory/mission-control/`

## Current product

GlobalDeets is live as a world-information product, not the former password-gated portfolio showcase described by older documentation.

The active product includes:

- live world news and original-source routing;
- globe/place discovery;
- public knowledge and webcam surfaces;
- governed source admission;
- coverage/evidence integrity tooling;
- published evidence dossiers;
- a Coverage & Evidence Observatory;
- investor/operator Mission Control.

## What is strong

### Product
The north-star product is coherent: organize current information, public sources, and context around place. The product plan also creates a credible path to blend Culture Sherpa context and Good Flippin Vibes progress stories into the same world model.

### Engineering
The repository now has meaningful governance around source rights, evidence integrity, production verification, mobile behavior, and fail-closed diagnostics.

### Observability
Mission Control can already represent the estate and explicitly distinguish measured facts from unknowns. That is the foundation for a self-diagnostic web estate rather than a collection of individually maintained sites.

## What is not yet investor-ready

The product should not yet present raw edge traffic as human traction. The current GlobalDeets edge-visit count is materially contaminated by synthetic health traffic.

The main unresolved investor-readiness gaps are tracked directly in Mission Control:

- audience certification;
- full-estate browser observability;
- stale narrative cleanup;
- business-conversion instrumentation;
- estate-wide service health;
- Culture Sherpa convergence evidence;
- retirement of legacy analytics surfaces.

## GD-028 direction

GD-028 upgrades Mission Control from an engineering evidence page into an investor + operator intelligence product.

The target experience includes:

- certified-vs-operational metric labeling;
- business-language interpretation;
- visual traffic/coverage/risk diagnostics;
- sortable and searchable priority queues;
- explicit business impact and ownership lanes;
- durable provenance;
- one canonical analytics surface;
- eventual historical trends, alerts, and automated ingestion.

## Next system-level work

After GD-028 lands, the highest-value work is to automate the data plane:

1. ingest RUM/GA4-quality human audience and engagement metrics;
2. ingest per-property availability, latency, critical-path, and deploy-freshness signals;
3. define and ingest first-party business conversion/retention events;
4. persist historical snapshots so Mission Control can show trends rather than only point-in-time state;
5. add alerting/escalation rules for critical gaps and regressions;
6. expand the estate table so neglected properties become visible automatically.

## Evidence standard

Any investor-facing claim must be:

- tied to a source;
- tied to a time window;
- explicit about what the metric measures;
- explicit about known contamination or blind spots;
- withheld when the underlying evidence is unavailable.

The goal is not a prettier dashboard. The goal is a trustworthy diagnostic and business-intelligence layer that can explain the product, expose risk, and direct the next unit of work.

# GD-026 — Place Intelligence Spine

Status: active
Baseline: GD-026.0 production commit `845981158952788fe62b9e83c13b65d7162d257d`

## Product goal

GlobalDeets becomes a source-first world desk organized by durable place identity. News, evidence, culture, public resources, and future positive-progress records may relate to a place without confusing source origin, routing region, or story subject.

## Governing decisions

1. Canonical human route: `/places/{iso2}/` for country/area pages. The place model is broader than countries so subdivisions can share the same identity spine.
2. Country/area identity authority: United Nations Statistics Division M49. Descriptive enrichment may later use reviewed Wikidata records; Rest Countries is not an authority.
3. Positive progress is a governed source/evidence family with explicit provenance and explicit place relations. It is not a sentiment score.
4. Culture Sherpa and Good Flippin Vibes begin as reviewed contextual links. Their own country-level content is promoted only when stable, deterministic country URLs/data exist.

## Identity law

- M49 country/area identity is distinct from news routing regions.
- Publisher origin is distinct from a story being about a place.
- `primaryCountry` and reviewed `jurisdictionIds` may establish a deterministic **reported from** relation.
- **About this place** relations require separate evidence; source origin never implies story subject.
- Ambiguous names do not silently resolve.
- Place records are local snapshots; production does not fetch identity authority at request time.
- The UN M49 grouping is statistical and does not imply a GlobalDeets position on political status.

## Tranches

### GD-026.0 — static/runtime truth sync
Production-certified. Raw homepage source count is bound to the canonical source registry and the missing-`totalSources` fallback is browser-tested.

### GD-026.1 — canonical place registry
- expand the existing M49 seed to the complete current UN M49 country/area identity set;
- mark country/area identity coverage complete;
- add Minnesota (`US-MN`) and California (`US-CA`) as explicit ISO 3166-2 child places under the United States;
- preserve stable M49 IDs and add stable subdivision IDs;
- expose complete counts and authority metadata through the intelligence schema;
- production-certify the exact registry contract.

### GD-026.2 — place profiles and reviewed enrichment
Add a structured place profile contract for reviewed capital/language/coordinates/context fields. UN/M49 remains identity authority; enrichment evidence is field-specific and may be absent.

### GD-026.3 — place pages
Create `/places/{iso2}/` with truthful empty states. Pilot places must include Senegal (zero-source/zero-seed stress case) and Brazil (coverage-gap stress case).

### GD-026.4 — news/place relations
Add deterministic source-origin **reported from** relations and separately governed **about this place** relations. Exact headline-name matching may seed candidate subject relations; it must never collapse into publisher-origin inference.

### GD-026.5 — context layers
Add reviewed civic/public-source, Culture Sherpa, Good Flippin Vibes/positive-progress, and other contextual links as separately attributed place relations.

### GD-026.6 — production certification
Certify desktop/mobile place pages, relation semantics, empty states, route integrity, no horizontal overflow, touch targets, schema/API consistency, and exact production artifact identity.

## GD-026.1 acceptance

- current official UN M49 English country/area table is represented as one deterministic local snapshot;
- every M49 code, ISO alpha-2 code, and ISO alpha-3 code is unique;
- no runtime identity fetch is required;
- existing M49 IDs remain stable;
- `US-MN` and `US-CA` have stable subdivision IDs and parent `place:m49:840`;
- the combined place graph has no orphan country links;
- the public schema distinguishes country/area count, subdivision count, and total place count;
- CI and the production intelligence verifier fail if completeness/count/identity rules drift.

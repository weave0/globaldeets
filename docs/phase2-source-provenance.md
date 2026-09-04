# Phase II — Reviewed Source Provenance

GlobalDeets treats source provenance as evidence, not reputation scoring.

## Purpose

The live news pipeline previously knew only a source name, feed URL, coarse region, and feed language. That is sufficient for fetching and health checks but insufficient for answering higher-order questions about what kinds of institutions GlobalDeets is hearing from and what evidence classes are absent.

GD-013 adds a reviewed provenance registry beside the canonical ingestion contract. It does **not** change feed URLs, feed cache identity, source-health keys, parsing, translation, or ranking.

## Routing region is not geographic scope

The existing `SOURCES.region` field is a feed-routing bucket used by the current product. It must not be interpreted as the publisher's actual reporting footprint or organizational geography. For example, a publisher can be routed through a regional bucket while its reviewed provenance has a global geographic scope.

The provenance fields `geographicScope`, `primaryCountry`, and `locality` exist specifically so future coverage analysis does not confuse routing behavior with source origin, reach, or localness.

## Registry contract

Every live `SOURCES` entry must map to exactly one provenance record. CI rejects missing, orphaned, duplicate, drifted, or structurally invalid records. A source name or feed-language change invalidates the associated provenance record until it is reviewed alongside the source change.

Each record contains:

- canonical source ID
- display/source name
- publisher/organization name
- source class
- evidence role
- geographic scope
- primary country when applicable
- locality indicator
- live feed language(s)
- ownership/operator separately from publisher identity
- one or more provenance/evidence URLs
- review date

Unknown facts stay unknown. The registry must not infer political ideology, factuality, editorial independence, or trustworthiness from a publisher name, country, ownership structure, or funding model.

## Public surfaces

### `GET /api/news/sources`

Returns the source fingerprint, provenance review date, registry validation result, and reviewed source records with their evidence links.

### `GET /api/news/coverage`

Adds provenance-aware inventory dimensions:

- source classes
- evidence roles
- geographic scopes
- source-origin countries
- provenance integrity
- unknown ownership/operator records

## New measurable gaps

The current 19-source live contract contains **zero primary-source institutional inputs**. Its evidence roles are reporting and wire services only. This is now a first-class high-severity gap because major stories should eventually be connectable to original evidence such as court filings, regulator releases, government records, sanctions notices, central-bank publications, election authorities, multilateral organizations, and other authoritative primary material.

The live contract also contains **zero subnational/local sources**. National and regional publishers remain essential, but a fuller intelligence system needs the ability to reach below national narratives when a story is fundamentally local.

These signals do not mean that an institutional source is automatically correct or that a local source is automatically superior. They mean GlobalDeets can now measure whether those evidence perspectives are present at all.

GlobalDeets already has a separate Knowledge catalog containing many institutional and research resources. The zero-primary-input signal refers to the **live news/evidence ingestion contract**, not to the absence of institutional links elsewhere in the platform. GD-015 should review and reuse suitable Knowledge entries rather than build a duplicate institutional directory.

## Evidence review examples

The registry uses publisher or operator material where practical. Examples reviewed for this tranche include:

- Associated Press documenting its cooperative identity.
- Guardian documenting Guardian News & Media and The Scott Trust ownership structure.
- Al Jazeera identifying Al Jazeera Media Network.
- France Medias Monde identifying France 24 as its international news channel.
- Kyiv Independent documenting its newsroom history and Ukrainian origin.
- Ukrinform identifying itself as Ukraine's national news agency.
- CNA identifying Mediacorp and its Singapore base.
- Dawn identifying Pakistan Herald Publications Private Limited as publisher of Dawn and Dawn.com.
- NPR identifying itself as an independent nonprofit media organization.
- Australian Broadcasting Corporation identifying itself as Australia's publicly owned public-service media organization.
- Premium Times identifying Premium Times Services Limited as its publisher.
- Nation Media Group identifying The EastAfrican as a regional East African title.
- MercoPress identifying itself as an independent Montevideo-based news agency focused on Mercosur and the South Atlantic.

## Explicit non-goals

This tranche does not create:

- a truth score
- a political-bias score
- a reliability score
- an ideological label
- automatic ownership inference
- automatic source promotion or demotion

Those shortcuts would collapse different questions into a misleading single number. GlobalDeets should instead expose concrete provenance, corroboration, contradiction, and primary evidence separately.

## Release contract

After the normal exact-commit production health verifier confirms custom-domain convergence, deployment separately verifies the intelligence APIs. `/api/news/coverage` and `/api/news/sources` must agree on the source fingerprint and source count, both registries must validate, and every exposed source must retain evidence URLs before the release can certify.

## Next gate

GD-014 should introduce canonical entities and events so incoming articles and future primary-source records can attach to durable people, organizations, places, and developing stories rather than remaining isolated feed items. Place entities should also become the canonical geography foundation for the long-planned country library and globe context.

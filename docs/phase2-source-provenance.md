# Phase II — Reviewed Source Provenance

GlobalDeets treats source provenance as evidence, not reputation scoring.

## Purpose

The live news pipeline previously knew only a source name, feed URL, coarse region, and feed language. That is sufficient for fetching and health checks but insufficient for answering higher-order questions about what kinds of institutions GlobalDeets is hearing from and what evidence classes are absent.

GD-013 adds a reviewed provenance registry beside the canonical ingestion contract. It does **not** change feed URLs, feed cache identity, source-health keys, parsing, translation, or ranking.

## Registry contract

Every live `SOURCES` entry must map to exactly one provenance record. CI rejects missing, orphaned, duplicate, or structurally invalid records.

Each record contains:

- canonical source ID
- display/source name
- organization name
- source class
- evidence role
- geographic scope
- primary country when applicable
- locality indicator
- live feed language(s)
- ownership/operator when verified, otherwise `null`
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

## Evidence review examples

The registry uses publisher or operator material where practical. Examples reviewed for this tranche include:

- Associated Press describing itself as an independent news cooperative.
- Guardian documenting Guardian News & Media and The Scott Trust ownership structure.
- Al Jazeera identifying Al Jazeera Media Network and disclosing that it is funded in part by the Qatari government.
- France Médias Monde identifying France 24 as its international news channel.
- Kyiv Independent documenting its newsroom history and Ukrainian origin.
- Ukrinform identifying itself as Ukraine's national news agency.
- CNA identifying Mediacorp and its Singapore base.
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

## Next gate

GD-014 should introduce canonical entities and events so incoming articles and future primary-source records can attach to durable people, organizations, places, and developing stories rather than remaining isolated feed items.

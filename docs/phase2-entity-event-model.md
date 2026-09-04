# Phase II — Canonical Entity and Event Identity

GD-014 creates the durable identity layer required for place-aware intelligence, claims/evidence, and later story dossiers.

## Governing rule

Similarity is not identity.

GlobalDeets does not merge people, organizations, places, or events merely because names or headlines look alike. Durable records require an explicit identity key or a reviewed standard identifier. Ambiguity remains visible until evidence resolves it.

## Entities

The initial model supports:

- person
- organization
- government/public body
- company
- place
- multilateral body

Every entity has a stable ID derived from an explicit identity key. Display names can change without changing identity. Aliases are optional, but every alias must carry at least one evidence reference; raw unreferenced alias strings are rejected.

Alias lookup returns one of three states:

- `matched`
- `ambiguous`
- `no-match`

An ambiguous alias never silently selects a winner.

## Places and UN M49

Country/area identity uses the United Nations Statistics Division M49 standard where available. M49 identity retains the M49 numeric code plus ISO alpha-2 and alpha-3 identifiers.

The initial committed seed is deliberately **partial**: it contains the countries represented by the current live-news source-origin provenance records. It does not claim to be a complete world-country dataset.

The production runtime does not fetch M49 data live. M49 is source material for a committed, reviewable snapshot/import process so identity cannot change unexpectedly because an upstream page changes.

UN region/subregion classifications are retained as statistical metadata only. They must not be treated as GlobalDeets positions on sovereignty, boundaries, political status, or legal affiliation.

Capitals, languages, coordinates, culture links, political/legal context, emergency resources, and similar facts are attributes, not identity. They require separate provenance.

## Events

Events require an explicit stable `eventKey`. The event ID is derived from that key, not from title/headline prose.

Therefore:

- changing a title does not create a new event;
- identical titles do not merge distinct events;
- article relationships can be many-to-many;
- linked people/organizations/places remain explicit;
- unresolved facts are preserved in an `unknowns` collection;
- event status describes record state (`developing`, `confirmed`, `closed`, `disputed`) rather than a truth score.

## Graph integrity

Validation detects:

- duplicate entity IDs
- duplicate event IDs
- orphan entity references
- orphan place references
- non-place entities used as place references
- structurally invalid entity/event identities

History and contradictions will be modeled in later claim/evidence gates rather than overwritten by this identity layer.

## Legacy globe migration

The existing webcam/worldmap catalog remains authoritative for its current IDs, location strings, coordinates, timezones, stream/source URLs, and other operational metadata. GD-014 establishes the place identity boundary but does not silently reinterpret free-text webcam geography.

A later reviewed migration may add `placeEntityId` links. Ambiguous locations must remain unlinked until reviewed.

## Public schema

`GET /api/intelligence/schema` exposes the model version, entity/event enums, identity rules, and place-seed metadata. It intentionally does not expose the partial seed as if it were a complete country directory.

## Explicit non-goals

GD-014 does not add:

- LLM entity extraction
- fuzzy automatic identity merges
- AI-written story summaries
- truth/reliability scores
- claim resolution
- automatic event clustering from headline similarity
- unreviewed capital/language/culture enrichment

The next gate, GD-015, can build claims and primary evidence on top of these durable identities without having to reinvent who/what/where each record refers to.

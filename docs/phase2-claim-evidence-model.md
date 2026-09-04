# Phase II — Claim and Primary-Evidence Model

GD-015 adds the evidence-state layer between GlobalDeets' canonical entity/event identity and future evidence dossiers.

## Purpose

The model records what a source actually asserts, what primary evidence is available, and how claims/evidence relate without reducing disagreement to a synthetic truth or reliability score.

The governing boundary is:

- reporting is a claim origin;
- an issuing institution can produce primary evidence;
- corroboration requires a genuinely distinct originating source;
- contradiction is preserved rather than resolved by hidden weighting;
- supersession appends history rather than deleting earlier records;
- unknown/unreviewed evidence state remains explicit.

## Claim identity

Claims require an explicit `claimKey` plus `originSourceId`. The proposition text is not the identity boundary, so wording can be corrected without changing the durable claim ID. Two publishers making textually similar assertions do not collapse into one claim.

Supported claim types:

- `fact-assertion`
- `estimate`
- `forecast`
- `allegation`
- `denial`
- `official-position`

Supported evidence states:

- `unreviewed`
- `single-source`
- `corroborated`
- `contradicted`
- `superseded`
- `withdrawn`

These states describe the evidence record. They are not declarations of truth.

## Evidence identity

Evidence records require:

- explicit `evidenceKey`
- issuing canonical entity
- canonical document/reference URL
- document type
- provenance reference(s)
- optional immutable reference
- publication/effective/retrieval/review timestamps
- links to relevant events, entities, places, and claims

Primary-document types include court filings, judgments, government/regulator releases, election records, sanctions notices, central-bank/statistical releases, multilateral publications, corporate filings, datasets, official records, and other reviewed primary material.

## Relationship model

Claim-to-claim relationships support:

- `corroborates`
- `contradicts`
- `supersedes`

Evidence-to-claim relationships support:

- `supports`
- `contradicts`
- `supersedes`

The graph validator rejects an attempted `corroborates` relationship when both claims originate from the same source. A source cannot manufacture independent corroboration by repeating itself.

## Existing Knowledge catalog reuse

GlobalDeets already has `data/knowledge-sources.json`. GD-015 does not replace it or clone it into a second public directory.

Instead, `functions/lib/institutional-evidence-sources.js` adds a reviewed classification overlay keyed back to exact existing Knowledge entries. The initial overlay is intentionally partial and contains ten high-value institutional candidates spanning multilateral organizations, public data portals, statistical offices, regulators, and health authorities.

The overlay records:

- exact Knowledge catalog reference
- canonical organization/entity ID
- source class
- evidence role
- jurisdiction/scope
- document types
- canonical base URL
- machine-readable endpoint list
- authentication/licensing review state
- classification evidence URL(s)
- review date/status

## Directory identity is not collection authority

Every initial GD-015 institutional source is `directory-only` and `collectionEligible: false`.

The machine-readable endpoint arrays are deliberately empty. A website/data-directory URL does not become a feed/API ingestion endpoint by implication. Future endpoint admission must separately establish endpoint identity, authority, authentication, usage/licensing requirements, and technical health before collection can be enabled.

This also means the Knowledge catalog itself is **not** an ingestion authority.

## Integrity contracts

CI covers:

- deterministic claim/evidence IDs
- mutable proposition wording without identity drift
- same proposition from different sources remaining distinct
- contradictory claims coexisting
- same-source fake corroboration rejection
- evidence provenance requirement
- orphan claim/evidence/entity/place/event detection
- non-place geography references
- supersession preserving historical records
- exact reuse of existing Knowledge catalog entries
- zero collection-eligible institutional endpoints in this gate
- public schema boundary and no-truth-score/no-bulk-collection invariants

## Public schema

`GET /api/intelligence/evidence-schema` publishes the deterministic enums and safety boundaries required by future dossier/collection work. Production verification requires the endpoint to preserve the no-truth-score, independent-corroboration, history-preservation, Knowledge-boundary, endpoint-review, and no-bulk-collection rules.

## Explicit non-goals

GD-015 does not enable:

- bulk evidence collection
- LLM factual conclusions treated as evidence
- automatic legal interpretation
- automatic truth determination
- publisher reliability or political-bias scores
- silent conflict resolution
- automatic promotion of Knowledge entries into ingestion sources

## Downstream

GD-016 should consume these records to build the first source-first evidence dossier: timeline, geography, entities, claims, primary evidence, independent corroboration, contradiction, superseded information, and unresolved unknowns.

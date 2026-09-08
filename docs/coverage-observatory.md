# GlobalDeets Coverage & Evidence Observatory

GD-017 turns the deficiencies preserved by the Phase II source, provenance, admission, claim/evidence, and dossier contracts into a deterministic operational intelligence surface.

The observatory is not a ranking system. It does not calculate truth, publisher quality, political bias, reliability, or a composite coverage score.

## Surfaces

- Human interface: `GET /observatory/coverage/`
- Machine-readable observatory: `GET /api/intelligence/observatory/coverage`
- Canonical news coverage remains: `GET /api/news/coverage`
- Operational feed health remains: `GET /api/news/health`

The machine-readable observatory is generated from existing canonical contracts. It does not maintain a second hand-edited source inventory.

## Semantic boundaries

The observatory preserves these distinctions mechanically:

1. **News coverage is not evidence coverage.** A configured reporting source does not imply that an event has primary evidence.
2. **Publisher provenance is not usage permission.** Provenance metadata does not authorize collection.
3. **Endpoint authority is not usage permission.** A first-party endpoint can still require permission or contractual access.
4. **Feed health is not usage permission.** A technically healthy feed can remain governance-ineligible.
5. **Reviewed institutional identity is not collection authority.** A directory-only institutional candidate remains ineligible until a machine-readable endpoint and its access/usage contract are separately reviewed.
6. **Unresolved is a first-class state.** Single-source, contradicted, disputed, and unreviewed claims remain visible until evidence justifies a state transition.
7. **Corrections preserve history.** Correction and supersession activity is observable; corrected-away artifacts are not silently treated as if they never existed.

## GD-017 production baseline

GD-017 begins from the certified GD-016 main baseline `60ec29982421cda2d535b836413a220ac1d04fa2`:

- 19 live news sources
- 17 live legacy sources still requiring source-rights review
- 2 reviewed live legacy sources (AP and Guardian), both preserving restrictive governance states rather than being silently approved
- 10 reviewed institutional evidence candidates
- 0 institutional candidates collection-eligible
- 1 published evidence dossier (`santa-ynez-pipeline`)
- explicit geographic, language, provenance, subnational/local, evidence-role, source-rights, dossier-evidence, unresolved-claim, correction, and operational-health signals where the underlying contracts support them

These counts are a baseline, not permanent acceptance thresholds. Production verification cross-checks them against the canonical APIs so drift cannot be hidden inside the observatory.

## Gap records

Every observatory gap has explicit fields for:

- stable identity
- domain
- gap type
- severity
- observed state
- target or desired state
- affected canonical IDs
- explanation
- next permitted action
- requirements such as manual review, licensing, or code

Suggested actions are operational instructions, not automatic source admission. The observatory has no mutation path and `automaticRemediation` is explicitly false.

## Source-health handling

The observatory may read the existing matching source-health KV snapshot. It never launches a second set of feed probes. A health snapshot is accepted only when its source fingerprint and source count match the deployed canonical source contract; stale identities are treated as unavailable rather than blended into current telemetry.

## Dossier observability

For each published dossier the observatory derives, without changing the dossier:

- event, claim, source, and evidence counts
- evidence-document classes
- events with and without linked primary-evidence / primary-disclosure records
- reporting-source presence per event
- unresolved claim states
- contradiction relationships
- corrections
- supersession activity
- explicit unknowns
- missing retained correction artifacts

The dossier must first pass the existing dossier-integrity contract. Invalid dossiers are not accepted as valid observatory inputs.

## Fail-closed behavior

`functions/lib/coverage-evidence-observatory.js` validates the generated observatory. The API withholds the normal payload with HTTP 503 when integrity fails. The browser surface independently checks the critical semantic rules before rendering and clears the intelligence panels if the payload is invalid.

CI covers hostile contract mutations, desktop rendering, the 390×844 mobile surface, syntax/lint, the Function suite, and clean deployment staging. Production deployment separately verifies the live observatory against the canonical news, admission, evidence-schema, and dossier APIs.

## Non-goals

GD-017 deliberately does not:

- compute a truth score
- publish an editorial verdict
- compute a publisher-quality or reliability score
- infer political or viewpoint diversity
- combine heterogeneous metrics into a composite coverage score
- auto-add a source because a gap exists
- auto-enable collection because an institutional source has been reviewed
- infer corroboration from repeated institutional statements
- convert missing evidence into an estimate

The observatory exists to make limits measurable enough that the next research and engineering tranche can be selected from evidence rather than intuition.

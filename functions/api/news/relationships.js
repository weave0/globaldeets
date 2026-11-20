// GD-051: public, independently reviewed typed relationships; no inferred edges.
import { SOURCE_FINGERPRINT } from '../news.js';
import { SOURCE_PROVENANCE, validateSourceProvenance } from '../../lib/news-source-provenance.js';
import {
  OWNERSHIP_EVIDENCE_SCHEMA_VERSION,
  OWNERSHIP_EVIDENCE_REVIEW_DATE,
  OWNERSHIP_ENTITIES,
  OWNERSHIP_EDGES,
  validateOwnershipEvidence,
} from '../../lib/source-ownership-evidence.js';

export async function onRequestGet() {
  const sources = validateSourceProvenance();
  const relationships = validateOwnershipEvidence();
  const valid = sources.valid && relationships.valid;
  // Fail closed: do not leak partial or inconsistent assertions.
  return new Response(JSON.stringify(valid ? {
    schemaVersion: OWNERSHIP_EVIDENCE_SCHEMA_VERSION,
    sourceFingerprint: SOURCE_FINGERPRINT,
    reviewedAt: OWNERSHIP_EVIDENCE_REVIEW_DATE,
    validation: { valid: true },
    scope: 'reviewed-links-among-selected-monitored-sources',
    entities: OWNERSHIP_ENTITIES,
    edges: OWNERSHIP_EDGES,
    monitoredSources: SOURCE_PROVENANCE.length,
  } : { error: 'relationship-evidence-unavailable', validation: { valid: false } }), {
    status: valid ? 200 : 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

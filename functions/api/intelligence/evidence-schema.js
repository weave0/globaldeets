// Cloudflare Pages Function - GET /api/intelligence/evidence-schema
import {
  CLAIM_EVIDENCE_MODEL_VERSION,
  CLAIM_RELATION_TYPES,
  CLAIM_STATES,
  CLAIM_TYPES,
  EVIDENCE_DOCUMENT_TYPES,
  EVIDENCE_RELATION_TYPES,
} from '../../lib/claim-evidence-model.js';
import {
  ACCESS_USE_STATES,
  COLLECTION_STATES,
  ENDPOINT_AUTHORITY_STATES,
  INSTITUTIONAL_EVIDENCE_ROLES,
  institutionalRegistrySummary,
} from '../../lib/institutional-evidence-sources.js';
import {
  INSTITUTIONAL_ACQUISITION_VERSION,
  acquisitionSummary,
} from '../../lib/institutional-evidence-acquisition.js';

const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

function headers(request) {
  const origin = request?.headers?.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://globaldeets.com',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    Vary: 'Origin',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function onRequestGet({ request }) {
  return new Response(
    JSON.stringify({
      modelVersion: CLAIM_EVIDENCE_MODEL_VERSION,
      acquisitionVersion: INSTITUTIONAL_ACQUISITION_VERSION,
      claimTypes: CLAIM_TYPES,
      claimStates: CLAIM_STATES,
      evidenceDocumentTypes: EVIDENCE_DOCUMENT_TYPES,
      claimRelationTypes: CLAIM_RELATION_TYPES,
      evidenceRelationTypes: EVIDENCE_RELATION_TYPES,
      institutionalEvidenceRoles: INSTITUTIONAL_EVIDENCE_ROLES,
      collectionStates: COLLECTION_STATES,
      endpointAuthorityStates: ENDPOINT_AUTHORITY_STATES,
      accessUseStates: ACCESS_USE_STATES,
      rules: {
        truthScore: false,
        explicitClaimIdentity: true,
        explicitEvidenceIdentity: true,
        contradictoryClaimsMayCoexist: true,
        independentCorroborationRequiresDistinctOriginSource: true,
        supersessionDeletesHistory: false,
        knowledgeCatalogIsIngestionAuthority: false,
        machineReadableEndpointRequiresSeparateReview: true,
        collectionEligibilityRequiresReviewedEndpoint: true,
        arbitraryEndpointCollectionAllowed: false,
        observatoryIsCollectionAuthority: false,
        acquiredEvidenceAutomaticallyMutatesClaims: false,
        retrievalFailureUsesStaleArtifact: false,
        bulkCollectionEnabled: false,
      },
      institutionalSources: institutionalRegistrySummary(),
      acquisition: acquisitionSummary(),
    }),
    { headers: headers(request) }
  );
}

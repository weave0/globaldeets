import { REVIEWED_INSTITUTIONAL_SOURCES } from './institutional-evidence-sources.js';

export const INSTITUTIONAL_ACQUISITION_VERSION = '2026-09-08.1';

export const INSTITUTIONAL_ACQUISITIONS = Object.freeze([
  Object.freeze({
    acquisitionId: 'eurostat:population-density:eu27-latest',
    sourceId: 'knowledge:economy:eurostat',
    endpointId: 'eurostat:statistics-api:demo-r-d3dens:eu27-latest',
    documentType: 'dataset',
    expectedPublisherCode: 'ESTAT',
    contentClass: 'official-statistical-dataset',
  }),
]);

export function validateAcquisitionRegistry(
  acquisitions = INSTITUTIONAL_ACQUISITIONS,
  sources = REVIEWED_INSTITUTIONAL_SOURCES
) {
  if (!Array.isArray(acquisitions) || !Array.isArray(sources)) {
    throw new TypeError('acquisitions and sources must be arrays');
  }

  const duplicateAcquisitionIds = duplicates(acquisitions.map(item => item?.acquisitionId));
  const sourceIndex = new Map(sources.map(source => [source.sourceId, source]));
  const invalidAcquisitions = [];
  const unauthorizedAcquisitions = [];
  const endpointMismatches = [];

  for (const acquisition of acquisitions) {
    if (!validAcquisitionShape(acquisition)) {
      invalidAcquisitions.push(acquisition?.acquisitionId || 'missing-acquisition-id');
      continue;
    }
    const source = sourceIndex.get(acquisition.sourceId);
    if (!source) {
      unauthorizedAcquisitions.push(acquisition.acquisitionId);
      continue;
    }
    const endpoint = source.machineReadableEndpoints?.find(item => item.endpointId === acquisition.endpointId);
    if (!endpoint) {
      endpointMismatches.push(acquisition.acquisitionId);
      continue;
    }
    if (!source.collectionEligible || source.collectionState !== 'endpoint-reviewed' || !endpoint.collectionEligible) {
      unauthorizedAcquisitions.push(acquisition.acquisitionId);
      continue;
    }
    if (
      endpoint.reviewStatus !== 'verified' ||
      endpoint.accessUseStatus !== 'verified-public-use' ||
      !['first-party', 'authorized-third-party'].includes(endpoint.endpointAuthority)
    ) {
      unauthorizedAcquisitions.push(acquisition.acquisitionId);
    }
  }

  return {
    valid:
      duplicateAcquisitionIds.length === 0 &&
      invalidAcquisitions.length === 0 &&
      unauthorizedAcquisitions.length === 0 &&
      endpointMismatches.length === 0,
    duplicateAcquisitionIds,
    invalidAcquisitions: unique(invalidAcquisitions),
    unauthorizedAcquisitions: unique(unauthorizedAcquisitions),
    endpointMismatches: unique(endpointMismatches),
  };
}

export async function acquireInstitutionalEvidence(
  acquisitionId,
  {
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
    acquisitions = INSTITUTIONAL_ACQUISITIONS,
    sources = REVIEWED_INSTITUTIONAL_SOURCES,
  } = {}
) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  const registryValidation = validateAcquisitionRegistry(acquisitions, sources);
  if (!registryValidation.valid) throw new Error('institutional acquisition registry is invalid');

  const acquisition = acquisitions.find(item => item.acquisitionId === acquisitionId);
  if (!acquisition) throw new Error('acquisition is not authorized');

  const source = sources.find(item => item.sourceId === acquisition.sourceId);
  const endpoint = source?.machineReadableEndpoints?.find(item => item.endpointId === acquisition.endpointId);
  if (!source || !endpoint) throw new Error('authorized acquisition endpoint is unavailable');

  const response = await fetchImpl(endpoint.url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response?.ok) throw new Error(`institutional acquisition failed with HTTP ${response?.status ?? 'unknown'}`);

  const raw = await response.text();
  if (!raw) throw new Error('institutional acquisition returned an empty artifact');

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('institutional acquisition returned invalid JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('institutional acquisition returned an invalid payload shape');
  }
  if (acquisition.expectedPublisherCode && payload.source !== acquisition.expectedPublisherCode) {
    throw new Error('institutional acquisition publisher identity mismatch');
  }

  const contentDigest = await sha256(raw);
  const retrievedAt = normalizeTime(now());
  const artifact = Object.freeze({
    artifactId: `artifact:${acquisition.acquisitionId}:${contentDigest.slice('sha256:'.length, 'sha256:'.length + 24)}`,
    acquisitionVersion: INSTITUTIONAL_ACQUISITION_VERSION,
    acquisitionId: acquisition.acquisitionId,
    sourceId: source.sourceId,
    organizationEntityId: source.organizationEntityId,
    endpointId: endpoint.endpointId,
    canonicalRef: endpoint.url,
    endpointAuthority: endpoint.endpointAuthority,
    accessUseStatus: endpoint.accessUseStatus,
    documentType: acquisition.documentType,
    contentClass: acquisition.contentClass,
    mediaType: 'application/json',
    contentDigest,
    retrievedAt,
    sourceUpdatedAt: textOrNull(payload.updated),
    payload,
    claimIds: Object.freeze([]),
    claimStateMutation: false,
    truthDetermination: false,
  });

  const validation = validateAcquiredArtifact(artifact, acquisitions, sources);
  if (!validation.valid) throw new Error('acquired institutional artifact failed integrity validation');
  return artifact;
}

export function validateAcquiredArtifact(
  artifact,
  acquisitions = INSTITUTIONAL_ACQUISITIONS,
  sources = REVIEWED_INSTITUTIONAL_SOURCES
) {
  const errors = [];
  if (!artifact || typeof artifact !== 'object') return { valid: false, errors: ['artifact:not-object'] };

  const acquisition = acquisitions.find(item => item.acquisitionId === artifact.acquisitionId);
  if (!acquisition) errors.push('artifact:unauthorized-acquisition');
  const source = sources.find(item => item.sourceId === artifact.sourceId);
  if (!source) errors.push('artifact:unknown-source');
  const endpoint = source?.machineReadableEndpoints?.find(item => item.endpointId === artifact.endpointId);
  if (!endpoint) errors.push('artifact:unknown-endpoint');

  if (acquisition && artifact.sourceId !== acquisition.sourceId) errors.push('artifact:source-mismatch');
  if (acquisition && artifact.endpointId !== acquisition.endpointId) errors.push('artifact:endpoint-mismatch');
  if (endpoint && artifact.canonicalRef !== endpoint.url) errors.push('artifact:canonical-ref-drift');
  if (!/^sha256:[0-9a-f]{64}$/.test(artifact.contentDigest || '')) errors.push('artifact:invalid-content-digest');
  if (!/^artifact:[^:]+(?:[:][^:]+)*:[0-9a-f]{24}$/.test(artifact.artifactId || '')) errors.push('artifact:invalid-id');
  if (!validIsoTime(artifact.retrievedAt)) errors.push('artifact:invalid-retrieved-at');
  if (!Array.isArray(artifact.claimIds) || artifact.claimIds.length !== 0) errors.push('artifact:auto-claim-link');
  if (artifact.claimStateMutation !== false) errors.push('artifact:claim-state-mutation');
  if (artifact.truthDetermination !== false) errors.push('artifact:truth-determination');

  return { valid: errors.length === 0, errors: unique(errors) };
}

export function acquisitionSummary() {
  const validation = validateAcquisitionRegistry();
  return {
    acquisitionVersion: INSTITUTIONAL_ACQUISITION_VERSION,
    configuredAcquisitions: INSTITUTIONAL_ACQUISITIONS.length,
    registryValid: validation.valid,
    arbitraryEndpointCollectionAllowed: false,
    observatoryIsCollectionAuthority: false,
    automaticClaimMutation: false,
    truthDetermination: false,
    staleArtifactFallbackOnFailure: false,
    acquisitions: INSTITUTIONAL_ACQUISITIONS.map(item => ({ ...item })),
  };
}

function validAcquisitionShape(item) {
  return Boolean(
    item &&
    typeof item.acquisitionId === 'string' && item.acquisitionId.length > 0 &&
    typeof item.sourceId === 'string' && item.sourceId.length > 0 &&
    typeof item.endpointId === 'string' && item.endpointId.length > 0 &&
    typeof item.documentType === 'string' && item.documentType.length > 0 &&
    typeof item.contentClass === 'string' && item.contentClass.length > 0
  );
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('retrieval time is invalid');
  return date.toISOString();
}

function validIsoTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].filter(Boolean).sort();
}

function unique(values) {
  return [...new Set(values)].sort();
}

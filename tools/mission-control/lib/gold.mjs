/**
 * Canonical Gold 1.2 consumer for the operational-edge seam (GD-030).
 *
 * Mission Control does not acquire edge telemetry itself: it consumes the governed GFD
 * traffic-intelligence Canonical Gold contract. A document qualifies only if it is a real (non-fixture)
 * gfd-canonical-gold 1.2.x document and the bound metric is measured with a full, non-partial observation.
 * Anything else is recorded as unavailable with the reason; values are never coerced.
 */
const ROLES = ['edge-requests', 'edge-visits', 'synthetic-health-visits'];

export function unavailableOperational(reason) {
  return {
    observationWindow: null,
    edgeRequests: null,
    edgeVisits: null,
    syntheticHealthVisits: null,
    residualUnclassifiedVisits: null,
    evidenceState: 'unavailable',
    investorSafe: false,
    reason,
  };
}

function windowDays(observation) {
  const start = Date.parse(observation.start);
  const end = Date.parse(observation.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 86400000);
}

function inspectMetric(doc, binding) {
  const metric = (doc.metrics || []).find(item => item.metric_id === binding.metricId);
  if (!metric) return { error: 'metric ' + binding.metricId + ' is absent from the Gold document' };
  if (metric.evidence_state !== 'measured') return { error: 'metric ' + binding.metricId + ' evidence_state is ' + metric.evidence_state };
  if (typeof metric.value !== 'number' || !Number.isFinite(metric.value)) return { error: 'metric ' + binding.metricId + ' has no numeric value' };
  const observation = metric.observation;
  if (!observation) return { error: 'metric ' + binding.metricId + ' has no observation boundary' };
  const days = windowDays(observation);
  if (days == null) return { error: 'metric ' + binding.metricId + ' has an invalid observation window' };
  return { metric, observation, days };
}

/**
 * @param {object|null} doc parsed Canonical Gold document (or null when the source could not be read)
 * @param {Array} bindings registry goldBindings: [{ propertyId, role, metricId }]
 * @returns operational snapshot section
 */
export function extractOperational(doc, bindings, propertyId = 'globaldeets.com') {
  const bound = (bindings || []).filter(item => item.propertyId === propertyId && ROLES.includes(item.role));
  if (!doc) return unavailableOperational('The governed Canonical Gold source could not be read.');
  if (!bound.length) return unavailableOperational('No Canonical Gold metric is bound to ' + propertyId + ' (registry goldBindings is empty).');
  if (doc.contract_name !== 'gfd-canonical-gold') return unavailableOperational('Source is not a gfd-canonical-gold document.');
  if (!/^1\.2\./.test(String(doc.schema_version))) return unavailableOperational('Unsupported Canonical Gold schema_version ' + doc.schema_version + '.');
  if (doc.fixture !== false) return unavailableOperational('Canonical Gold document is a fixture (fixture !== false); fixtures are contract test data, not observations.');

  const requests = bound.find(item => item.role === 'edge-requests');
  const visits = bound.find(item => item.role === 'edge-visits');
  const synthetic = bound.find(item => item.role === 'synthetic-health-visits');
  if (!requests && !visits) return unavailableOperational('Neither edge-requests nor edge-visits is bound.');

  const parts = {};
  for (const [role, binding] of [['edgeRequests', requests], ['edgeVisits', visits], ['syntheticHealthVisits', synthetic]]) {
    if (!binding) continue;
    const inspected = inspectMetric(doc, binding);
    if (inspected.error) return unavailableOperational(inspected.error + '.');
    parts[role] = inspected;
  }

  const reference = parts.edgeRequests || parts.edgeVisits;
  const { observation, days } = reference;
  for (const part of Object.values(parts)) {
    if (part.observation.start !== observation.start || part.observation.end !== observation.end) {
      return unavailableOperational('Bound metrics do not share one observation window; refusing to combine them.');
    }
  }
  const partial = Object.values(parts).some(part => part.observation.partial_current_period === true || part.metric.coverage?.state !== 'full_coverage');
  const key = ['gold', doc.schema_version.split('.').slice(0, 2).join('.'), days + 'd', observation.boundary, observation.timezone, partial ? 'partial' : 'complete'].join('|');
  const value = name => (parts[name] ? parts[name].metric.value : null);
  const edgeVisits = value('edgeVisits');
  const syntheticVisits = value('syntheticHealthVisits');

  return {
    observationWindow: { start: observation.start, end: observation.end, days },
    edgeRequests: value('edgeRequests'),
    edgeVisits,
    syntheticHealthVisits: syntheticVisits,
    residualUnclassifiedVisits: edgeVisits != null && syntheticVisits != null ? Math.max(0, edgeVisits - syntheticVisits) : null,
    evidenceState: partial ? 'partial' : 'measured',
    investorSafe: false,
    source: 'gfd-canonical-gold@' + doc.schema_version + ' (' + doc.pipeline_version + ')',
    comparabilityKey: key,
    extractedAt: observation.extracted_at,
    limitations: partial ? 'Partial coverage or current period; excluded from trends.' : 'Operational edge telemetry; not certified human audience.',
  };
}

/**
 * Reads a configured governed source (file path or https URL with optional bearer token). Never reads fixtures by
 * default. `configured` distinguishes "nothing is set up" from "set up but not readable"; `httpStatus` lets the
 * caller tell a missing credential (401/403) from an outage.
 */
export async function loadGoldSource({ source, token, fetchImpl, readFile, label = 'Gold' }) {
  if (!source) return { doc: null, configured: false, httpStatus: null, reason: 'No ' + label + ' source configured.' };
  try {
    if (/^https:\/\//i.test(source)) {
      const response = await fetchImpl(source, { headers: { accept: 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) return { doc: null, configured: true, httpStatus: response.status, reason: label + ' source returned HTTP ' + response.status + '.' };
      return { doc: await response.json(), configured: true, httpStatus: response.status, reason: null };
    }
    return { doc: JSON.parse(await readFile(source, 'utf8')), configured: true, httpStatus: null, reason: null };
  } catch (error) {
    return { doc: null, configured: true, httpStatus: null, reason: label + ' source unreadable: ' + String(error?.message || error).slice(0, 120) };
  }
}

/** The insights document sits beside the Gold document; its default location is derived from the Gold source. */
export function defaultInsightsSource(goldSource) {
  const source = String(goldSource || '');
  return /canonical-gold-m1\.2\.json$/.test(source) ? source.replace(/canonical-gold-m1\.2\.json$/, 'traffic-insights-1.0.json') : null;
}

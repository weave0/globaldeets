/**
 * Multi-vantage probe evidence (GD-031).
 *
 * One runner on one network must never be the sole truth source. Every vantage probes the whole estate with
 * the same engine; this module reconciles their per-property observations WITHOUT silently choosing the
 * answer that looks nicer:
 *
 *   agree          every vantage was conclusive and they say the same thing
 *   partial        the conclusive vantages agree, but at least one vantage was blocked/unknown
 *   conflict       conclusive vantages disagree (for example available vs confirmed unavailable)
 *   single-vantage only one valid vantage exists
 *   inconclusive   no vantage could establish state
 *
 * A conflict becomes its own health state (`vantage-conflict`) and finding; it is never resolved by picking
 * a side. When one vantage is merely blocked (an edge challenge is insufficient evidence, not an outage) and
 * another is conclusive, the conclusive evidence is used and the blocked vantage stays visible.
 */

const CONCLUSIVE = ['available', 'degraded', 'unavailable', 'no-service-published'];
const SEVERITY = { available: 0, 'no-service-published': 0, degraded: 1, unavailable: 2 };

/** Effective availability of one vantage observation (an unconfirmed failure is degraded, never an outage). */
export function effectiveObservation(observation) {
  if (!observation) return { state: 'unknown', blocked: false, conclusive: false, failureClass: null };
  let state = observation.state;
  if (state === 'unavailable' && observation.confirmed !== true) state = 'degraded';
  const invalid = observation.failureClass === 'vantage-failure';
  const blocked = Boolean(observation.blocked);
  return { state, blocked, conclusive: !invalid && !blocked && CONCLUSIVE.includes(state), failureClass: observation.failureClass || null };
}

/**
 * @param {Array<{ run: object, record: object|null }>} entries per-vantage probe records for ONE property,
 *        in priority order (primary first). Runs must already be validated as valid.
 */
export function reconcileVantages(entries) {
  const vantages = entries.map(({ run, record }) => {
    const effective = effectiveObservation(record?.observation);
    return {
      vantage: run.vantage,
      network: run.network || null,
      observedAt: run.finishedAt || run.startedAt,
      state: effective.state,
      blocked: effective.blocked,
      conclusive: effective.conclusive,
      failureClass: effective.failureClass,
      httpStatus: record?.http?.status ?? null,
      durationMs: record?.http?.durationMs ?? null,
    };
  });
  const conclusive = vantages.filter(item => item.conclusive);
  if (!conclusive.length) {
    return { authoritativeIndex: 0, agreement: entries.length > 1 ? 'inconclusive' : 'single-vantage', conflict: false, state: null, vantages };
  }
  // Serving somewhere while conclusively not serving elsewhere is a real disagreement about the property.
  const serving = conclusive.some(item => item.state === 'available' || item.state === 'degraded');
  const notServing = conclusive.some(item => item.state === 'unavailable' || item.state === 'no-service-published');
  const conflict = serving && notServing;
  let agreement;
  if (entries.length === 1) agreement = 'single-vantage';
  else if (conflict) agreement = 'conflict';
  else if (conclusive.length === vantages.length) agreement = 'agree';
  else agreement = 'partial';

  // Prefer the first conclusive vantage (the primary when it is conclusive); a worse non-conflicting state wins.
  let authoritativeIndex = vantages.indexOf(conclusive[0]);
  if (!conflict) {
    const worst = conclusive.reduce((a, b) => (SEVERITY[b.state] > SEVERITY[a.state] ? b : a));
    authoritativeIndex = vantages.indexOf(worst);
  }
  return { authoritativeIndex, agreement, conflict, state: conflict ? null : vantages[authoritativeIndex].state, vantages };
}

/** Validates a secondary vantage run before it may influence estate evidence. Returns error strings. */
export function validateSecondaryRun(run, { expectPropertyIds, primary }) {
  const errors = [];
  if (run?.contractName !== 'globaldeets-probe-run') return ['secondary vantage: contractName'];
  if (run.validity !== 'valid') errors.push('secondary vantage ' + run.vantage + ': run is not valid (' + run.validity + ')');
  if (!run.vantage || typeof run.vantage !== 'string') errors.push('secondary vantage: missing vantage id');
  if (primary && run.vantage === primary.vantage) errors.push('secondary vantage: must differ from the primary vantage (' + run.vantage + ')');
  if (!Array.isArray(run.properties)) return [...errors, 'secondary vantage: properties'];
  const seen = run.properties.map(item => item.propertyId);
  if (new Set(seen).size !== seen.length || [...seen].sort().join('|') !== [...expectPropertyIds].sort().join('|')) errors.push('secondary vantage ' + run.vantage + ': must contain each registered property exactly once');
  if (!Number.isFinite(Date.parse(run.finishedAt))) errors.push('secondary vantage ' + run.vantage + ': invalid finishedAt');
  if (primary && Number.isFinite(Date.parse(run.finishedAt)) && Math.abs(Date.parse(run.finishedAt) - Date.parse(primary.finishedAt)) > 3 * 3600000) {
    errors.push('secondary vantage ' + run.vantage + ': observed more than 3 hours away from the primary run; not comparable');
  }
  for (const record of run.properties) if (!record.observation?.state) errors.push('secondary vantage ' + run.vantage + ': ' + record.propertyId + ' observation');
  return errors;
}

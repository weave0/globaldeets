/**
 * Readings: the single cell type behind every number the audience and business-event contracts publish.
 *
 * A reading with a number is either a measured value or a measured zero. Every other state (uninstrumented,
 * not-connected, awaiting-authorized-source, unavailable, stale, incomparable, unknown) carries `value: null`
 * and a reason. Nothing in this module can turn a null into a zero.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const semantics = require('../../../observatory/mission-control/evidence-semantics.js');

export const READING_STATES = semantics.READING_STATES;

/** Only fields that carry information are serialized; `value` is always present so null is explicit, never implied. */
function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, item]) => item !== null && item !== undefined));
}

/** A reading without a value. `state` must be a non-value state; use measuredReading for numbers. */
export function emptyReading(state, reason, fields = {}) {
  if (!READING_STATES.includes(state)) throw new Error('unknown reading state ' + state);
  if (state === 'measured' || state === 'partial') throw new Error('a valueless reading cannot be ' + state);
  return { evidenceState: state, value: null, ...compact(fields), reason: reason || 'No reason recorded.' };
}

export function measuredReading(value, { partial = false, ...fields } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('measured reading needs a finite number');
  return { evidenceState: partial ? 'partial' : 'measured', value, ...compact(fields) };
}

/** Strict structural check used by validators: numbers only under measured/partial, null everywhere else. */
export function validateReading(reading, label) {
  const errors = [];
  if (!reading || typeof reading !== 'object') return [label + ': not a reading'];
  if (!READING_STATES.includes(reading.evidenceState)) errors.push(label + ': unknown evidenceState ' + reading.evidenceState);
  const numeric = typeof reading.value === 'number' && Number.isFinite(reading.value);
  const valued = reading.evidenceState === 'measured' || reading.evidenceState === 'partial';
  if (valued && !numeric) errors.push(label + ': ' + reading.evidenceState + ' without a numeric value');
  if (!valued && reading.value !== null) errors.push(label + ': ' + reading.evidenceState + ' must not carry a value');
  if (valued && reading.value < 0) errors.push(label + ': negative value');
  if (!valued && !reading.reason) errors.push(label + ': ' + reading.evidenceState + ' needs a reason');
  return errors;
}

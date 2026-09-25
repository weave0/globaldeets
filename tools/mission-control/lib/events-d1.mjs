/**
 * First-party business-event source backed by the governed Cloudflare D1 counter store.
 *
 * This is read-only and count-only. It intentionally reads the same three tables used by
 * gfd-mission-control-events, then emits the existing globaldeets-business-events-feed contract.
 * An explicit EVENTS_SOURCE remains an override for external/alternate producers.
 */
import { EVENT_WINDOWS, FEED_CONTRACT_NAME } from './events.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const DAY_MS = 86400000;

function unavailable(configured, reason, httpStatus = null) {
  return { configured, doc: null, reason, httpStatus };
}

function utcMidnight(value) {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function validProducer(row) {
  return typeof row?.property_id === 'string' && row.property_id && typeof row?.event_type === 'string' && row.event_type;
}

function validDaily(row) {
  return validProducer(row) && /^\d{4}-\d{2}-\d{2}$/.test(String(row.day)) && Number.isInteger(row.count) && row.count >= 0;
}

async function queryD1({ token, accountId, databaseId, sql, fetchImpl }) {
  const response = await fetchImpl(`${API}/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    const message = body?.errors?.[0]?.message || ('HTTP ' + response.status);
    const error = new Error(String(message).slice(0, 180));
    error.httpStatus = response.status;
    throw error;
  }
  const result = Array.isArray(body.result) ? body.result[0] : null;
  if (!result?.success || !Array.isArray(result.results)) throw new Error('Cloudflare D1 returned an unreadable query result.');
  return result.results;
}

export function buildD1BusinessEventsFeed({ producers, daily, now }) {
  const endMs = utcMidnight(now);
  const generatedAt = new Date(now).toISOString();
  const instrumentedProperties = [...new Set(producers.filter(validProducer).map(row => row.property_id))].sort();
  const announced = new Set(producers.filter(validProducer).map(row => row.property_id + '|' + row.event_type));
  const counts = new Map();
  const lastDays = new Map();
  const nowMs = Date.parse(generatedAt);

  for (const row of daily.filter(validDaily)) {
    const dayMs = Date.parse(row.day + 'T00:00:00.000Z');
    if (!Number.isFinite(dayMs) || dayMs > nowMs) continue; // a future day can never be an observed event
    const key = row.property_id + '|' + row.event_type;
    if (!announced.has(key)) continue;
    // The latest confirmed event may fall on today (a partial day); completed-window counts never include it.
    if (row.count > 0 && (!lastDays.has(key) || row.day > lastDays.get(key))) lastDays.set(key, row.day);
    if (dayMs >= endMs) continue; // the current UTC day is never a completed window
    for (const days of EVENT_WINDOWS) {
      const startMs = endMs - days * DAY_MS;
      if (dayMs >= startMs) counts.set(key + '|' + days, (counts.get(key + '|' + days) || 0) + row.count);
    }
  }

  const records = [];
  for (const row of producers.filter(validProducer)) {
    for (const days of EVENT_WINDOWS) {
      records.push({
        propertyId: row.property_id,
        eventType: row.event_type,
        window: {
          start: new Date(endMs - days * DAY_MS).toISOString(),
          end: new Date(endMs).toISOString(),
          days,
        },
        count: counts.get(row.property_id + '|' + row.event_type + '|' + days) || 0,
        lastEventDay: lastDays.get(row.property_id + '|' + row.event_type) || null,
      });
    }
  }

  records.sort((a,b) => a.propertyId.localeCompare(b.propertyId) || a.eventType.localeCompare(b.eventType) || a.window.days - b.window.days);
  return {
    contractName: FEED_CONTRACT_NAME,
    schemaVersion: '1.0.0',
    fixture: false,
    generatedAt,
    source: { id: 'gfd-mission-control-events-d1', label: 'First-party Mission Control event counters (Cloudflare D1)' },
    instrumentedProperties,
    records,
  };
}

export async function loadBusinessEventsD1({ token, accountId, databaseId, fetchImpl, now }) {
  if (!token || !accountId || !databaseId) return unavailable(false, 'Cloudflare D1 business-event source is not configured.');
  try {
    const [producers, daily] = await Promise.all([
      queryD1({ token, accountId, databaseId, fetchImpl, sql: 'SELECT property_id, event_type FROM mc_event_producers ORDER BY property_id, event_type', }),
      queryD1({ token, accountId, databaseId, fetchImpl, sql: 'SELECT property_id, event_type, day, count FROM mc_event_daily ORDER BY day, property_id, event_type', }),
    ]);
    return { configured: true, doc: buildD1BusinessEventsFeed({ producers, daily, now }), reason: null, httpStatus: 200 };
  } catch (error) {
    const status = Number.isInteger(error?.httpStatus) ? error.httpStatus : null;
    return unavailable(true, 'Cloudflare D1 business-event source could not be read: ' + String(error?.message || error).slice(0, 180), status);
  }
}

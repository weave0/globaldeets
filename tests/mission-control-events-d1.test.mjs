import assert from 'node:assert/strict';
import test from 'node:test';
import { buildD1BusinessEventsFeed, loadBusinessEventsD1 } from '../tools/mission-control/lib/events-d1.mjs';
import { validateFeed } from '../tools/mission-control/lib/events.mjs';
import { registry } from './helpers/mission-control-fakes.mjs';

const NOW = '2026-09-25T16:30:00.000Z';

test('D1 rows become the existing governed feed contract, including measured zero windows', () => {
  const feed = buildD1BusinessEventsFeed({
    now: NOW,
    producers: [
      { property_id: 'cyancanoe.com', event_type: 'lead' },
      { property_id: 'goodflippindesign.com', event_type: 'lead' },
    ],
    daily: [
      { property_id: 'cyancanoe.com', event_type: 'lead', day: '2026-09-24', count: 2 },
      { property_id: 'cyancanoe.com', event_type: 'lead', day: '2026-09-01', count: 3 },
      { property_id: 'goodflippindesign.com', event_type: 'lead', day: '2026-09-25', count: 99 }, // incomplete current UTC day excluded
    ],
  });
  assert.deepEqual(feed.instrumentedProperties, ['cyancanoe.com', 'goodflippindesign.com']);
  assert.equal(feed.records.find(r => r.propertyId === 'cyancanoe.com' && r.window.days === 7).count, 2);
  assert.equal(feed.records.find(r => r.propertyId === 'cyancanoe.com' && r.window.days === 28).count, 5);
  assert.equal(feed.records.find(r => r.propertyId === 'goodflippindesign.com' && r.window.days === 7).count, 0);
  assert.equal(validateFeed(feed, registry()), null);
});

test('D1 loading is unconfigured without existing Cloudflare authority', async () => {
  const source = await loadBusinessEventsD1({ token: '', accountId: '', databaseId: '', fetchImpl: async () => { throw new Error('should not call'); }, now: NOW });
  assert.equal(source.configured, false);
  assert.equal(source.doc, null);
});

test('D1 loading fails closed on authorization errors and exposes no count', async () => {
  const source = await loadBusinessEventsD1({
    token: 'tok',
    accountId: 'acct',
    databaseId: 'db',
    now: NOW,
    fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ message: 'forbidden' }] }), { status: 403, headers: { 'content-type': 'application/json' } }),
  });
  assert.equal(source.configured, true);
  assert.equal(source.doc, null);
  assert.equal(source.httpStatus, 403);
  assert.match(source.reason, /forbidden/);
});

test('D1 loader reads producers and counters with the existing Cloudflare token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const sql = JSON.parse(init.body).sql;
    const rows = sql.includes('mc_event_producers')
      ? [{ property_id: 'aiaimate.com', event_type: 'signup' }]
      : [{ property_id: 'aiaimate.com', event_type: 'signup', day: '2026-09-24', count: 4 }];
    return new Response(JSON.stringify({ success: true, result: [{ success: true, results: rows }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const source = await loadBusinessEventsD1({ token: 'tok', accountId: 'acct', databaseId: 'db', fetchImpl, now: NOW });
  assert.equal(source.doc.records.find(r => r.window.days === 7).count, 4);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.init.headers.authorization === 'Bearer tok'));
  assert.ok(calls.every(call => call.url.endsWith('/accounts/acct/d1/database/db/query')));
});

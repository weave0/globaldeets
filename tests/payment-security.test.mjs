import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  onRequestGet as getSession,
  onRequestOptions as getSessionOptions,
} from '../functions/get-session.js';
import {
  onRequestPost as createCheckout,
  onRequestOptions as createCheckoutOptions,
} from '../functions/create-checkout.js';
import { onRequest as securityMiddleware } from '../functions/_middleware.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

function request(url, { method = 'GET', origin, body } = {}) {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('get-session has no hardcoded Stripe credential assignment', () => {
  const source = fs.readFileSync(new URL('../functions/get-session.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /STRIPE_SECRET_KEY\s*=\s*['"]/);
  assert.match(source, /env\?\.STRIPE/);
});

test('get-session fails closed when STRIPE binding is absent', async () => {
  const response = await getSession({
    request: request('https://globaldeets.com/get-session?session_id=cs_test_123', {
      origin: 'https://globaldeets.com',
    }),
    env: {},
  });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, 'Payment system configuration error');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://globaldeets.com');
});

test('get-session returns non-PII donation state only', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        amount_total: 2500,
        currency: 'usd',
        customer_details: { email: 'donor@example.com', name: 'Private Donor' },
        payment_status: 'paid',
        mode: 'payment',
        created: 1789228800,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  const response = await getSession({
    request: request('https://globaldeets.com/get-session?session_id=cs_test_123', {
      origin: 'https://www.goodflippindesign.com',
    }),
    env: { STRIPE: 'test-secret-from-env' },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.amount, 25);
  assert.equal(body.currency, 'USD');
  assert.equal(body.paymentStatus, 'paid');
  assert.equal(body.customerEmail, undefined);
  assert.equal(body.customerName, undefined);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://www.goodflippindesign.com');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('payment endpoints reject arbitrary browser origins and never emit wildcard CORS', async () => {
  const hostileOrigin = 'https://attacker.example';
  const getOptions = await getSessionOptions({
    request: request('https://globaldeets.com/get-session', { method: 'OPTIONS', origin: hostileOrigin }),
  });
  const checkoutOptions = await createCheckoutOptions({
    request: request('https://globaldeets.com/create-checkout', {
      method: 'OPTIONS',
      origin: hostileOrigin,
    }),
  });

  assert.equal(getOptions.status, 403);
  assert.equal(checkoutOptions.status, 403);
  assert.equal(getOptions.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(checkoutOptions.headers.get('Access-Control-Allow-Origin'), null);
});

test('create-checkout accepts explicit GFD origin and uses env Stripe credential', async () => {
  let authorization = null;
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return new Response(
      JSON.stringify({ id: 'cs_test_created', url: 'https://checkout.stripe.test/session' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const response = await createCheckout({
    request: request('https://globaldeets.com/create-checkout', {
      method: 'POST',
      origin: 'https://goodflippindesign.com',
      body: { amount: 25, type: 'one-time' },
    }),
    env: { STRIPE: 'env-secret' },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.sessionId, 'cs_test_created');
  assert.equal(authorization, 'Bearer env-secret');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://goodflippindesign.com');
});

test('Function middleware exposes no executable CSP capability', async () => {
  const response = await securityMiddleware({
    next: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  });
  const csp = response.headers.get('Content-Security-Policy');

  assert.equal(csp, "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  assert.doesNotMatch(csp, /unsafe-eval|unsafe-inline|script-src|https:/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});

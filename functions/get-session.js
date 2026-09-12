/**
 * Cloudflare Pages Function: Retrieve Stripe Checkout Session
 *
 * Endpoint: GET /get-session?session_id={CHECKOUT_SESSION_ID}
 *
 * Returns the minimum non-PII donation details required by the success page.
 * Required environment variable: STRIPE
 */

const STRIPE_API_VERSION = '2025-04-10';
const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'https://goodflippindesign.com',
  'https://www.goodflippindesign.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

function corsHeaders(request) {
  const origin = request?.headers?.get('Origin');
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function originIsAllowed(request) {
  const origin = request?.headers?.get('Origin');
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function json(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!originIsAllowed(request)) {
    return json({ error: 'Origin not allowed' }, 403, request);
  }

  const stripeSecret = env?.STRIPE;
  if (!stripeSecret) {
    console.error('STRIPE environment variable not set');
    return json({ error: 'Payment system configuration error' }, 500, request);
  }

  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) {
      return json({ error: 'Missing session_id parameter' }, 400, request);
    }

    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${stripeSecret}`,
          'Stripe-Version': STRIPE_API_VERSION,
        },
      }
    );

    if (!response.ok) {
      console.error(`Stripe session retrieval failed with status ${response.status}`);
      return json({ error: 'Failed to retrieve session' }, 502, request);
    }

    const session = await response.json();
    const amountTotal = Number(session.amount_total);
    const created = Number(session.created);

    return json(
      {
        amount: Number.isFinite(amountTotal) ? amountTotal / 100 : null,
        currency:
          typeof session.currency === 'string' ? session.currency.toUpperCase() : null,
        paymentStatus: session.payment_status || null,
        mode: session.mode || null,
        createdAt: Number.isFinite(created) ? new Date(created * 1000).toISOString() : null,
      },
      200,
      request
    );
  } catch (error) {
    console.error('Session retrieval error:', error);
    return json({ error: 'Failed to retrieve session' }, 500, request);
  }
}

export async function onRequestOptions(context) {
  const request = context?.request;
  const headers = corsHeaders(request);
  headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type';
  headers['Access-Control-Max-Age'] = '86400';

  return new Response(null, {
    status: originIsAllowed(request) ? 204 : 403,
    headers,
  });
}

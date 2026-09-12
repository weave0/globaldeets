/**
 * Cloudflare Pages Function: Create Stripe Checkout Session
 *
 * Endpoint: POST /create-checkout
 *
 * Handles Stripe Checkout Session creation for donations.
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

export async function onRequestPost(context) {
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
    const { amount, type } = await request.json();
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 5 || numericAmount > 100000) {
      return json({ error: 'Donation amount must be between $5 and $100,000' }, 400, request);
    }

    if (!['one-time', 'recurring'].includes(type)) {
      return json({ error: 'Invalid donation type' }, 400, request);
    }

    const session = await createCheckoutSession(numericAmount, type, stripeSecret);
    return json({ sessionId: session.id, url: session.url }, 200, request);
  } catch (error) {
    console.error('Checkout error:', error);
    return json({ error: 'Failed to create checkout session' }, 500, request);
  }
}

async function createCheckoutSession(amount, type, stripeSecret) {
  const amountInCents = Math.round(amount * 100);
  const recurring = type === 'recurring';
  const name = recurring
    ? 'Monthly Support for Good Flippin Design'
    : 'Support Good Flippin Design';
  const description = recurring
    ? 'Sustaining monthly contribution to fund free AI education, cultural preservation, and civic tech'
    : 'One-time contribution to fund free AI education, cultural preservation, and civic tech';

  const body = new URLSearchParams({
    mode: recurring ? 'subscription' : 'payment',
    success_url:
      'https://www.goodflippindesign.com/donate/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://www.goodflippindesign.com/donate?canceled=true',
    billing_address_collection: 'auto',
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': name,
    'line_items[0][price_data][product_data][description]': description,
    'line_items[0][price_data][unit_amount]': String(amountInCents),
    'line_items[0][quantity]': '1',
    'metadata[donation_type]': type,
    'metadata[amount]': amount.toString(),
  });

  if (recurring) {
    body.set('line_items[0][price_data][recurring][interval]', 'month');
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_API_VERSION,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    console.error(`Stripe checkout creation failed with status ${response.status}`);
    throw new Error('Stripe checkout creation failed');
  }

  return response.json();
}

export async function onRequestOptions(context) {
  const request = context?.request;
  const headers = corsHeaders(request);
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type';
  headers['Access-Control-Max-Age'] = '86400';

  return new Response(null, {
    status: originIsAllowed(request) ? 204 : 403,
    headers,
  });
}

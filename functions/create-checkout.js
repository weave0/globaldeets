/**
 * Cloudflare Pages Function: Create Stripe Checkout Session
 *
 * Endpoint: POST /create-checkout
 *
 * Handles Stripe Checkout Session creation for donations
 * - One-time donations
 * - Recurring monthly subscriptions
 * - Custom amounts (minimum $5)
 *
 * Required Environment Variables:
 * - STRIPE: Stripe live secret key (sk_live_...)
 */

const STRIPE_API_VERSION = '2023-10-16';

export async function onRequestPost(context) {
    try {
        // Get Stripe secret key from environment variables
        const STRIPE_SECRET_KEY = context.env.STRIPE;

        if (!STRIPE_SECRET_KEY) {
            console.error('STRIPE environment variable not set');
            return new Response(JSON.stringify({
                error: 'Payment system configuration error',
                details: 'Missing Stripe credentials'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { amount, type } = await context.request.json();

        // Validate inputs
        if (!amount || amount < 5) {
            return new Response(JSON.stringify({ error: 'Minimum donation is $5' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!['one-time', 'recurring'].includes(type)) {
            return new Response(JSON.stringify({ error: 'Invalid donation type' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Create Checkout Session
        const session = await createCheckoutSession(amount, type, STRIPE_SECRET_KEY);

        return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error) {
        console.error('Checkout error:', error);
        return new Response(JSON.stringify({
            error: 'Failed to create checkout session',
            details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function createCheckoutSession(amount, type, STRIPE_SECRET_KEY) {
    const amountInCents = Math.round(amount * 100);

    const lineItems = type === 'recurring'
        ? [{
            price_data: {
                currency: 'usd',
                product_data: {
                    name: 'Monthly Support for Good Flippin Design',
                    description: 'Sustaining monthly contribution to fund free AI education, cultural preservation, and civic tech',
                },
                unit_amount: amountInCents,
                recurring: {
                    interval: 'month'
                }
            },
            quantity: 1
        }]
        : [{
            price_data: {
                currency: 'usd',
                product_data: {
                    name: 'Support Good Flippin Design',
                    description: 'One-time contribution to fund free AI education, cultural preservation, and civic tech',
                },
                unit_amount: amountInCents
            },
            quantity: 1
        }];

    const sessionData = {
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: type === 'recurring' ? 'subscription' : 'payment',
        success_url: 'https://www.goodflippindesign.com/donate/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://www.goodflippindesign.com/donate?canceled=true',
        billing_address_collection: 'auto',
        metadata: {
            donation_type: type,
            amount: amount.toString()
        }
    };

    // Call Stripe API
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Stripe-Version': STRIPE_API_VERSION
        },
        body: new URLSearchParams({
            'mode': sessionData.mode,
            'success_url': sessionData.success_url,
            'cancel_url': sessionData.cancel_url,
            'billing_address_collection': sessionData.billing_address_collection,
            'payment_method_types[0]': 'card',
            ...(type === 'recurring' ? {
                'line_items[0][price_data][currency]': 'usd',
                'line_items[0][price_data][product_data][name]': lineItems[0].price_data.product_data.name,
                'line_items[0][price_data][product_data][description]': lineItems[0].price_data.product_data.description,
                'line_items[0][price_data][unit_amount]': amountInCents,
                'line_items[0][price_data][recurring][interval]': 'month',
                'line_items[0][quantity]': 1
            } : {
                'line_items[0][price_data][currency]': 'usd',
                'line_items[0][price_data][product_data][name]': lineItems[0].price_data.product_data.name,
                'line_items[0][price_data][product_data][description]': lineItems[0].price_data.product_data.description,
                'line_items[0][price_data][unit_amount]': amountInCents,
                'line_items[0][quantity]': 1
            }),
            'metadata[donation_type]': type,
            'metadata[amount]': amount.toString()
        }).toString()
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Stripe API error: ${response.status} - ${errorData}`);
    }

    return await response.json();
}

// Handle OPTIONS for CORS
export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
        }
    });
}

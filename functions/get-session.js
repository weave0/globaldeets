/**
 * Cloudflare Pages Function: Retrieve Stripe Checkout Session
 *
 * Endpoint: GET /get-session?session_id={CHECKOUT_SESSION_ID}
 *
 * Returns donation details for the success page
 */

const STRIPE_SECRET_KEY = 'mk_1So71wBL2ppdbQKqalkrbvd0';
const STRIPE_API_VERSION = '2023-10-16';

export async function onRequestGet(context) {
    try {
        const url = new URL(context.request.url);
        const sessionId = url.searchParams.get('session_id');

        if (!sessionId) {
            return new Response(JSON.stringify({ error: 'Missing session_id parameter' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Retrieve Checkout Session from Stripe
        const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=line_items`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
                'Stripe-Version': STRIPE_API_VERSION
            }
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Stripe API error: ${response.status} - ${errorData}`);
        }

        const session = await response.json();

        // Extract relevant data
        const sessionData = {
            amount: session.amount_total / 100, // Convert cents to dollars
            currency: session.currency.toUpperCase(),
            customerEmail: session.customer_details?.email || null,
            customerName: session.customer_details?.name || null,
            paymentStatus: session.payment_status,
            mode: session.mode, // 'payment' or 'subscription'
            createdAt: new Date(session.created * 1000).toISOString()
        };

        return new Response(JSON.stringify(sessionData), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error) {
        console.error('Session retrieval error:', error);
        return new Response(JSON.stringify({
            error: 'Failed to retrieve session',
            details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Handle OPTIONS for CORS
export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
        }
    });
}

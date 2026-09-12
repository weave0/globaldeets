// Cloudflare Pages Functions Middleware
// Applies security headers to API/payment responses routed through Functions.
// Static pages are governed separately by the root `_headers` policy.

const BASE_SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

export async function onRequest(context) {
  const response = await context.next();
  const secured = new Response(response.body, response);
  for (const [header, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    secured.headers.set(header, value);
  }
  return secured;
}

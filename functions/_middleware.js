// Cloudflare Pages Functions Middleware
// Applies security headers to all responses

const BASE_SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https: blob:; connect-src 'self' https:; font-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
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

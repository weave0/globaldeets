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

// Intercept retired public URLs before static asset lookup. Deleted assets may remain
// available in Pages' distributed asset cache after a successful release and URL purge.
// Keep this list synchronized with the production boundary verifier.
const RETIRED_PUBLIC_PATHS = new Set([
  '/observatory/mission-control/',
  '/observatory/mission-control/estate-health.json',
  '/observatory/mission-control/executive.json',
  '/shared/ecosystem-nav.js',
  '/shared/ecosystem-nav.css',
  '/spheres.html',
  '/analytics.html',
  '/projects-data.js',
  '/projects-render.js',
  '/platform-modal.js',
  '/PROJECT_TEMPLATE.js',
  '/QUICK_REFERENCE.js',
  '/bb-content.html',
  '/bi-ecosystem.css',
]);

export async function onRequest(context) {
  const pathname = context.request?.url ? new URL(context.request.url).pathname : '';
  const retired = RETIRED_PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/observatory/mission-control/');
  const response = retired
    ? new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Not Found</title></head><body><h1>Not Found</h1></body></html>', {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0',
          'X-Robots-Tag': 'noindex',
        },
      })
    : await context.next();
  const secured = new Response(response.body, response);
  for (const [header, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    secured.headers.set(header, value);
  }
  return secured;
}

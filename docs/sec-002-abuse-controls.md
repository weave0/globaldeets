# SEC-002 abuse and cost controls

Status: application fallback implemented on `security/sec002-abuse-cost-controls`; Cloudflare edge rule is **not deployed** because the currently connected Cloudflare credential can read Rulesets but receives API error `10000 Authentication error` at the Rulesets mutation boundary.

## Threat model

SEC-002 limits cost-amplification paths without requiring accounts or CAPTCHA for ordinary readers:

- repeated `/create-checkout` requests can create unnecessary Stripe Checkout sessions;
- synchronized `/api/news` cache misses can fan out to the publisher portfolio;
- translation and source-health work must stay explicitly bounded;
- controls must not log donor PII or unnecessary client identifiers.

## Checkout controls

### Intended Cloudflare edge rule — pending authorization

GlobalDeets is currently on Cloudflare Free, which provides one rate-limiting rule with a 10-second period. That scarce rule is reserved for the payment-session creation path rather than normal news reading.

Planned Ruleset configuration:

- phase: `http_ratelimit`
- kind: `zone`
- ruleset name: `SEC-002 GlobalDeets rate limits`
- rule ref: `sec002_checkout`
- expression: `http.request.uri.path eq "/create-checkout"`
- action: `block`
- characteristics: `cf.colo.id`, `ip.src`
- period: `10` seconds
- requests per period: `5`
- mitigation timeout: `10` seconds

Cloudflare Free does not expose HTTP method matching for this rate-limiting rule, so the path is the edge match boundary. There is no deployed rule identifier yet. Do not record one until Cloudflare accepts the mutation and a read-back confirms the exact live rule.

### Application fallback

`functions/create-checkout.js` adds a best-effort defense-in-depth counter using the existing `NEWS_CACHE` KV namespace under the isolated prefix `sec002_checkout_v1`.

- threshold: 5 requests per 10-second fixed window;
- the sixth request returns HTTP 429 with `Retry-After` before Stripe is called;
- the client signal is Cloudflare's `CF-Connecting-IP` request header at the Pages Function boundary;
- raw IP addresses are never logged or written to KV;
- the KV key contains only a SHA-256 digest scoped to the fixed time bucket;
- counter records contain only `{ count }` and expire after 20 seconds;
- missing client-IP or unavailable KV preserves payment availability because the future edge rule remains the authoritative control.

KV counters are eventually consistent and therefore are not represented as an atomic distributed rate limiter. Their purpose is to reduce straightforward repeated-session abuse while the Cloudflare edge rule remains authorization-blocked.

## News controls

News-cost controls are a separate SEC-002 tranche so checkout security can be reviewed and shipped independently. The next tranche will preserve normal anonymous cached reads while adding explicit source/translation ceilings and cache-miss anti-stampede behavior. Existing protections already include:

- a 15-minute governed feed cache;
- a fixed canonical source list (21 sources at SEC-002 start);
- a 5-second timeout per source;
- at most 300 normalized stories per refresh;
- GD-021 admission enforcement before translation and persistence, which currently prevents unreviewed/restricted sources from invoking summary translation.

The news tranche must not rate-limit ordinary cache hits merely to protect the more expensive regeneration path.

## Verification requirements

Checkout tranche is mergeable only when CI proves:

1. five sequential requests from one Cloudflare client identity are permitted in one 10-second bucket;
2. the sixth is rejected with 429 before any Stripe request;
3. the stored KV key does not contain the raw client IP;
4. throttle-error telemetry contains no raw client IP;
5. missing/failed KV does not break legitimate checkout;
6. existing origin, credential, PII, CSP, lint, Function and browser regressions remain green.

Edge deployment remains incomplete until Cloudflare write authorization is restored, the rule is created, its returned identifier is recorded here, and a subsequent Rulesets GET confirms the live configuration.

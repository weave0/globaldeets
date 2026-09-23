# GlobalDeets Mission Control

GD-027 gives GlobalDeets and its sibling ecosystem sites (culturesherpa.org, aiaimate.com,
goodflippinvibes.com, citizenapproved.org) an operational-health surface. These sites are
actively linked from GlobalDeets's ecosystem nav and sphere cards but are not otherwise
watched by anyone day to day — Mission Control exists so an outage or a stalled roadmap item
on a site nobody is actively living in still gets noticed.

Mission Control is not a health score. It does not compute an uptime SLA, a composite
readiness percentage, or an automatic priority ranking beyond the severity a human assigned
when a gap was curated.

## Surfaces

- Human interface: `GET /mission-control/`
- Machine-readable payload: `GET /api/ops/mission-control`

The machine-readable payload is generated fresh on every request: it re-probes every
ecosystem site from the Cloudflare edge and merges the result with the hand-curated gap
registry. It does not cache a stale "last known good" state as if it were current.

## Two kinds of gap

1. **Curated gaps** (`functions/lib/mission-control-gaps.js`) — hand-written, reviewed
   records with an id, site, category, severity, observed state, target state, and next
   permitted action. A curated gap stays exactly as written until a human edits it; the
   system never marks one resolved on its own.
2. **Live-probe gaps** — generated fresh on every request when a site fails its reachability
   check. These carry `origin: "live-probe"` and disappear on their own the next time the
   probe succeeds; they are not written back into the curated registry.

These two origins are never blended into a single number. `gapSummary` counts them together
for the severity distribution view, but each gap row always shows which kind it is through
its `origin` field.

## Site registry

`ECOSYSTEM_SITES` in `functions/lib/mission-control.js` is the single source of truth for
which domains are probed. GlobalDeets is marked `role: "flagship"` — an unreachable flagship
probe is escalated to `critical` severity; a sibling site's outage is `high`. This is the one
severity inference Mission Control performs, and it is deliberately narrow: reachability only,
never content or performance.

## Fail-closed behavior

`functions/lib/mission-control.js` validates the generated payload before the API returns it.
A structural or semantic contract violation — a missing site, a malformed gap, a duplicate id,
or a scoring rule flipped to `true` — returns HTTP 503 with the integrity failure detail
instead of a payload. The browser surface (`mission-control/mission-control.js`) independently
re-checks the same contract before rendering and clears the page if the payload does not pass.

A single site's probe timing out or erroring does **not** 503 the endpoint — that failure is
exactly what the tool exists to surface, so it is rendered as a live-probe gap instead of
being treated as Mission Control's own failure.

## Non-goals

GD-027 deliberately does not:

- compute a composite health, readiness, or trust score
- promise an uptime SLA from a single HTTP HEAD probe
- infer severity for curated gaps (severity is always human-assigned)
- auto-resolve a curated gap because a related probe recovered
- diagnose _why_ a site is unreachable — DNS, TLS, hosting, and application-level failures
  all render as the same "unreachable" signal; next steps are for a human to investigate
- monitor anything beyond the sites in `ECOSYSTEM_SITES` — adding a new ecosystem site means
  adding it to that registry, not inferring it from a link somewhere on the site

Mission Control exists to make gaps — engineering, trust, and business-readiness alike —
visible enough that an agent picking up this repo cold, or a founder who hasn't opened a
sibling site in months, can see what needs attention without reading every file first.

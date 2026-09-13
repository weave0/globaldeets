# GD-023 — Live surface truth sync

Date: 2026-09-13

## Defect

Production governance and APIs report 21 live news sources, but reader-facing static surfaces still embed the predecessor 19-source count. `news.html` also carries stale descriptive metadata and a 19-source fallback list that omits Minnesota Reformer and CalMatters. Search crawlers and any client that sees the static document before JavaScript hydration therefore receive stale product claims.

The service worker cache name has also remained `globaldeets-cache-v2`, which gives previously installed clients no explicit shell-version transition when reader assets change.

## Repair contract

- make homepage and news-page static claims match the governed 21-source production state;
- remove `credible`/`primary` wording from source-count metadata where the governed source portfolio does not assert a quality score or universal primary-evidence role;
- make the static source fallback list contain all 21 live sources;
- preserve dynamic API hydration as the runtime authority;
- bump the service-worker shell cache version and immediately activate the new worker so obsolete caches are deleted;
- add a regression test that compares static reader source counts/list membership against the canonical source registry so this cannot silently drift again.

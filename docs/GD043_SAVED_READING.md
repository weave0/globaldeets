# GD-043: one saved story on this device (opt-in)

Status: separate draft stacked on GD-042 (#88), GD-041 (#87), and GD-038 (#80). No production deploy or cohort measurement is claimed.

## Reader goal

Give a returning reader a real, honest way to continue the **one maintained Santa Ynez record** without creating an account, newsletter signup, privacy compromise, or fictional update service. The existing story has original sources, a chronology, a record version, disputed claims, official documents, corrections and explicitly unresolved points. This shortcut points back to the maintained reader so a visitor can review those on another visit.

## Contract

- A button is revealed only after the shipped public story record has passed the existing client acceptance checks and rendered an allowlisted `dossierVersion`. No unreviewed fixture or arbitrary reporting URL can be saved.
- Only after deliberate click, the browser writes one entry to first-party localStorage: `globaldeets:saved-story:v1 = {"id":"santa-ynez-pipeline","version":"2026-09-03.1"}` (version is the loaded value, not a hard-coded claim). **No** identity, IP, query, publisher URL, email, tracking ID, action history or unsanitized text is persisted.
- The homepage shows a **Saved on this device** panel with a fixed, same-origin maintained-story path, and a remove control. It is hidden otherwise.
- Revisit the story to compare the currently **loaded** verified version with the version stored on this device. If different, disclose only that difference and point to corrections/dates. No claim of live surveillance, freshness guarantees, push/email alerts, or independently verified update.
- LocalStorage is explicit and best-effort: when disallowed, show `Saving unavailable` and recommend a browser bookmark, never fake a successful save. Cross-tab `storage` events update the link panel. A reader can clear the shortcut on the homepage or on the story.
- No extra analytics call, cookie, server database, login, newsletter subscription or new external script. Existing independent anonymous `story-opened` measurements in the story renderer are unchanged; this new save control introduces no event. **This is not a measured 7-day return rate.**

## Offline guarantees

The static `saved-reading.js` is part of the reviewed v11 service-worker shell, which already precaches the maintained story shell/record and offline news reader. The installed worker can reopen the local saved shortcut without a network connection and preserve the source link and label. Unknown or corrupted storage entries cannot create links or escaped HTML.

## Acceptance

- Browser fixture: actual save/removal, persisted home shortcut and return, cross-tab syncing, malformed storage ignored, denied-storage fallback, and old-version versus loaded-version message.
- No POST/beacon from the save action; a user-initiated save is not proof of a reader return.
- Full lint/Function/Playwright suites and exact SHA hosted Cloudflare preview; desktop/mobile screenshots and first-install offline reopening of the saved link.
- User review of affordance, contrast, first-screen original-source CTA and status language.
- Release is blocked behind #80 approval and the review of the integrated #87/selection #88 stack; avoid multiple independent merges of overlapping changes.

## Measurement work deliberately separate

Reader-outcome issue #81 still requires consent/privacy/GA4 evaluation, measurement semantics and a real post-production cohort. We have not observed new return rate, alerts opened, or retention lift.

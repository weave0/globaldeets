# R2 — Story Intelligence

A story page is a reader projection of records GlobalDeets already keeps. It is not a second identity system and not a generated summary.

## What already existed

- Stable events (`eventKey`), entities, and places in `functions/lib/intelligence-model.js`
- Claims, evidence, corroboration, contradiction, and supersession in `functions/lib/claim-evidence-model.js`
- The Santa Ynez dossier: events, timeline, corrections, and unknowns
- Source admission and display permissions for the live news feed, separate from this dossier
- News-card labels for machine translation and original language

## What this slice shows

`/story/santa-ynez-pipeline/` projects that dossier. The story id is `story:santa-ynez-pipeline`. It references the seven event ids and does not merge them. The page is backed by the dossier module. `story.json` is that same projection, shipped with the page so original links and the record still render when `GET /api/intelligence/stories/santa-ynez-pipeline` is down. The page states the review date and content version in the HTML, so that line remains when `story.json` fails. The page registers `/service-worker.js`. After that install, reloading the story URL with the network gone still shows the reviewed record from the precache.

The one public story is the Santa Ynez dossier. Inside it the record already has a single publisher report, distinct-origin corroboration, a contradiction, a correction, and named gaps. No additional public stories were invented.

News cards gain "Context & sources" only when `/api/news` attaches story membership for an exact approved article URL. The allowlist is `functions/lib/story-membership.js` (`2026-10-08.1`). The only member is the Los Angeles Times report already cited in the Santa Ynez dossier. The news and World Desk pages do not keep their own copy of that URL. A similar headline, a query string, or a forged `story` object does not open a story. Every other card still goes to the publisher.

The Los Angeles Times is not an admitted live feed source, so a normal `/api/news` response still has no card for that article until an admitted item carries that exact URL. Membership does not add the article to the feed.

Story discovery and reading send a first-party POST to `/api/intelligence/story-measurement` with only `story-opened` or `story-context-opened` and the story key. The request does not include the article URL, the headline, or a client id, and it sets no cookie. A failed measurement does not change the page. Evaluation fixtures are rejected.

## How incomplete records read

The same renderer covers records that are missing pieces. Evaluation fixtures in `functions/lib/story-evaluation-fixtures.js` exercise those states. They are not public stories, not in the story index, not in the sitemap, and not real-world reporting. Names and documents there are fixture labels on `example.com`.

| State | What the reader sees |
| --- | --- |
| Several publishers | Each publisher keeps its name and its own link. A filing is labeled as a primary document, not as another publisher. |
| One publisher | The page says a single source is not agreement. Nothing is marked corroborated unless the record says so. |
| No primary document | The evidence section says none is attached. Missing evidence is not treated as evidence that none exists. |
| Conflicting accounts | Both accounts stay visible. The page does not pick a winner. An allegation stays an allegation. A denial stays a denial. |
| No event place | The page says the location is not recorded. A publisher city, feed region, or language is not used as the place. |
| No full day | An incomplete timeline date is shown as recorded. No calendar day is invented. |
| Correction | The earlier line stays on the page. The note says whether the earlier artifact was retained. |
| Unsafe link | `javascript:` and `data:` URLs are not clickable. A normal https link still is. |
| Long title | The title and the publisher action wrap. Type stays at least the story's normal size. |
| Non-English | A machine translation is labeled and is not called the original report. An untranslated original keeps its language label and its headline, with `dir="auto"`. |

A slow `story.json` shows a loading line and leaves the title and original links in place. A failed or hung story API does not remove a record that already rendered. A payload with a truth score or a prose summary is rejected.

## What stays unknown

Anything the dossier does not state. Unknowns are listed. A missing primary order stays missing. The July 20 California Department of Justice source is listed and uncited; the page does not say what it asserted. Publisher headquarters, feed region, language, and routing region are not event locations. No place page is linked, because `/places/{iso2}/` is not published yet.

The Santa Ynez reporting source does not store the Los Angeles Times headline, so the story page does not invent one. Display permission is unchanged.

## Backend gaps

These are why Story Intelligence is still one maintained story rather than a general layer over the news feed:

1. Story membership is server-owned, but the only approved article is not an admitted feed source. Live news cards will not show "Context & sources" until an admitted item uses that exact URL.
2. The claim model can say allegation, denial, estimate, forecast, official position, or fact assertion. It has no structured charged / pleaded / convicted / sentenced states, and no structured claimed-loss / proven-loss / restitution / forfeiture states. The page does not infer them.
3. Dossier sources do not carry `originalLang`, `translated`, or `originalHeadline`. The projector shows those only when a record includes them. The live news translation labels are not joined onto the story.
4. Evidence, chronology, and reporting travel in one story record. There is no separate evidence-enrichment call. A failed story fetch leaves the static source links. A failed story API leaves the shipped record.
5. Place pages are R3 and are not published.
6. False-merge and false-split checks exist for explicit keys, same-origin corroboration, and same-URL copies. There is no reviewed corpus of live headline clusters, and clustering is not used.

## Rules that do not move

No truth, bias, reliability, or confidence score. No unattributed prose summary. No change to source-admission display permissions. Same-origin repetition and same-URL syndication are not independent corroboration. Corrections keep their history note, including when the earlier artifact was not retained. Machine translation is not original-language reporting. A count of publishers is not a finding.

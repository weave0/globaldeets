# R2 — Story Intelligence

A story page is a reader projection of records GlobalDeets already keeps. It is not a second identity system and not a generated summary.

## What already existed

- Stable events (`eventKey`), entities, and places in `functions/lib/intelligence-model.js`
- Claims, evidence, corroboration, contradiction, and supersession in `functions/lib/claim-evidence-model.js`
- The Santa Ynez dossier: events, timeline, corrections, and unknowns
- Source admission and display permissions for the live news feed, separate from this dossier

## What this slice shows

`/story/santa-ynez-pipeline/` projects that dossier. The story id is `story:santa-ynez-pipeline`. It references the seven event ids and does not merge them. The page is backed by the dossier module. `story.json` is that same projection, shipped with the page so original links and the record still render when `GET /api/intelligence/stories/santa-ynez-pipeline` is down.

The one maintained story is the representative set. Inside it the record already has a single publisher report, distinct-origin corroboration, a contradiction, a correction, and named gaps. No additional public stories were invented.

## What stays unknown

Anything the dossier does not state. Unknowns are listed. A missing primary order stays missing. The July 20 California Department of Justice source is listed and uncited; the page does not say what it asserted. Publisher headquarters, feed region, language, and routing region are not event locations. No place page is linked, because `/places/{iso2}/` is not published yet.

## What a headline link means

News cards gain "Context & sources" only when the item URL is exactly a reporting URL in the maintained story. Similar headlines are not clustered.

## Rules that do not move

No truth, bias, reliability, or confidence score. No unattributed prose summary. No change to source-admission display permissions. Same-origin repetition and same-URL syndication are not independent corroboration. Corrections keep their history note, including when the earlier artifact was not retained.

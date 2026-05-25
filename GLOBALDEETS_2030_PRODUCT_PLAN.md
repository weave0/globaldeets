# GlobalDeets 2030 Product Plan

GlobalDeets should become a daily, source-first world atlas: a place where a visitor can see what is happening, where it is happening, who is reporting it, what culture lives there, and which public resources help them keep learning.

## North Star

**The world's open information desk, organized by place.**

GlobalDeets is not a content farm and not an opinion feed. It is a global routing layer for credible live news, public data, cultural context, civic information, and positive progress.

## Product Pillars

1. **Live World Desk**
   - Credible free feeds by region and source.
   - Original publisher links always visible.
   - Machine translation labeled clearly.
   - Source health, cache age, and freshness visible.

2. **Country And Region Library**
   - One durable page per country and major region.
   - News, official institutions, public datasets, emergency resources, culture, arts, language, climate, civic information, and webcams.
   - Built as structured data first so pages can grow without becoming hand-written clutter.

3. **Culture Layer**
   - Culture Sherpa contributes food, music, language, holidays, etiquette, arts, and living traditions.
   - Culture should appear beside current events so visitors understand places as human communities, not just crisis headlines.

4. **Good Flippin Vibes Layer**
   - Positive progress, healing, joy, community wins, scientific hope, and human restoration.
   - This becomes the antidote to doom scrolling: learn the world without leaving heavier than you arrived.

5. **Civic And Public Source Layer**
   - Citizen Approved and official source directories anchor public-interest resources.
   - Every claim links outward to a source, institution, or dataset.

6. **Creative And AI Literacy Layer**
   - aiaimate supplies responsible AI creativity, media literacy, and transparent tool/process education.
   - AI can translate, classify, and route, but it must be labeled and auditable.

## Daily Habit Loop

1. Visitor lands on the globe and sees fresh pins.
2. They choose a region, country, source, or topic.
3. A story opens at the original publisher.
4. GlobalDeets offers nearby context: country page, culture notes, public sources, webcams, and positive-progress threads.
5. The visitor leaves with a useful path and returns because the world desk is fresh, calm, and fast.

## Immediate Build Sequence

1. Add source health metadata to `/api/news` responses.
2. Create structured `data/countries.json` with country, region, capital, languages, source links, culture links, webcam links, and ecosystem links.
3. Add a `/country.html?code=XX` route or static generated country pages.
4. Make globe pins open a richer story tray: headline, source, region, time, MT badge, country context link, source link.
5. Connect Culture Sherpa and Good Flippin Vibes as contextual layers, starting with manually curated seed data.
6. Replace hand-written ecosystem drift with a single `data/ecosystem.json` consumed by homepage, about, spheres, footer, and nav.

## Quality Rules

- No unlabeled rewriting of source material.
- No dead cards or disabled CTAs on public pages.
- No brand aliases: use **Good Flippin Vibes**, **Culture Sherpa**, **aiaimate**, **Citizen Approved**, **GlobalDeets**, and **Good Flippin Design** consistently.
- No perpetual loading states.
- Every public section must answer a visitor question: what happened, where, who says, what does it mean locally, and where can I learn more?

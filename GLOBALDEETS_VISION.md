# Globaldeets — Vision, Strategy & Rebuild Roadmap

> _A living window into Earth: credible news, a dark/neon interactive globe, and gateway to the GFD ecosystem._

**Document date:** 2026-06
**Author:** Brett Weaver / Good Flippin Design
**Target site:** https://globaldeets.com (Cloudflare Pages)

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [The Vision](#2-the-vision)
3. [Architecture Decisions](#3-architecture-decisions)
4. [Information Architecture](#4-information-architecture)
5. [Design System](#5-design-system)
6. [Tech Stack](#6-tech-stack)
7. [News Feed Worker](#7-news-feed-worker)
8. [Globe 2.0 — Dark/Neon Earth](#8-globe-20--darkneon-earth)
9. [Ecosystem Spheres](#9-ecosystem-spheres)
10. [Universal Knowledge Categories](#10-universal-knowledge-categories)
11. [Phased Roadmap](#11-phased-roadmap)
12. [File-by-File Execution Plan](#12-file-by-file-execution-plan)
13. [SEO & Accessibility](#13-seo--accessibility)
14. [Infrastructure Checklist](#14-infrastructure-checklist)

---

## 1. Current State Audit

### What's Already There (Good Stuff to Keep/Adapt)

| Asset                                                                 | Status                                        | Action                             |
| --------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------- |
| `worldmap.html` + `worldmap.js` + `worldmap.css` + `worldmap-data.js` | ✅ Fully built Cesium 3D webcam globe         | Adapt concept, upgrade to Globe.gl |
| `styles.css` (40KB)                                                   | ✅ Rich dark-theme CSS system                 | Keep as base, add neon tokens      |
| `analytics.html`, `categories.html`, `timeline.html`                  | ✅ Built views for portfolio                  | Repurpose or retire                |
| `service-worker.js` + PWA manifest                                    | ✅ Offline/PWA ready                          | Keep                               |
| GA4 (`G-WM6Q66W9W0`)                                                  | ✅ Already wired in all pages                 | Keep                               |
| `wrangler.toml`                                                       | ✅ CF Pages config                            | Keep, add KV binding               |
| `_headers`                                                            | ✅ Security headers                           | Keep, tighten CSP for Globe.gl CDN |
| `donate.html`                                                         | ✅ Donation flow                              | Keep as-is                         |
| `robots.txt` + `sitemap.xml`                                          | ✅ SEO basics                                 | Update for new pages               |
| `functions/_middleware.js`                                            | ❌ Cookie-based password gate ("Moose")       | **REMOVE**                         |
| `auth.js`                                                             | ❌ sessionStorage password gate ("weaver")    | **REMOVE**                         |
| `index.html`                                                          | ❌ Merge conflict markers in `<script>` block | **FIX**                            |
| `STATUS.md` says "Platform: Netlify"                                  | ❌ Stale                                      | Update                             |
| `contact.html` uses Netlify Forms                                     | ❌ Stale                                      | Update to Formspree or CF Worker   |

### Git Health Issues to Fix First

```bash
# Repo is in a paused rebase — one conflict in index.html
# Fix before anything else:

cd "Z:\GFD\GFD Dev Projects\Globaldeets"

# Option A: Accept the current HEAD version (cleaner version of the script block)
# Edit index.html manually — remove <<<<<<, =======, >>>>>>> markers
# Keep the HEAD section (has onerror monitoring) then:
git add index.html
git rebase --continue

# If rebase is messy, abort and reset:
git rebase --abort
git checkout main  # or whatever branch you want
```

The conflict in `index.html` is in the `<script>` block at the top:

- **HEAD** has: `onerror` + `unhandledrejection` GA4 error monitoring (KEEP THIS)
- **Incoming** has: bare `gtag('config', ...)` close

Keep the HEAD version (with error monitoring), remove the merge markers, continue the rebase.

---

## 2. The Vision

**Globaldeets is the Earth's information nerve center** — public, open, beautiful, fast, and trustworthy.

### Core Pillars

```
┌─────────────────────────────────────────────────────────────────┐
│  🌍  THE EARTH  (Globe.gl — Dark/Neon Interactive)              │
│                                                                 │
│  News pins glow on the globe in real-time.                      │
│  Click a region → see the news. No opinion. Just signal.        │
├──────────┬──────────────────┬──────────────────┬───────────────┤
│  📰       │   🌈              │   🎨              │  ✅           │
│  WORLD   │  GF VIBES        │  CULTURE          │  CIVIC        │
│  NEWS    │  goodflippin     │  culturesherpa    │  citizen      │
│          │  vibes.com       │  .org             │  approved.org │
├──────────┴──────────────────┴──────────────────┴───────────────┤
│  🤖 AI SPHERE: aiaimate.com     📚 KNOWLEDGE: official sources  │
└─────────────────────────────────────────────────────────────────┘
```

### The Promise to Every Visitor

1. **Zero barriers** — no gate, no login, no paywall, no cookie wall beyond legal minimum
2. **Zero opinion** — news links go directly to credible primary sources; we are the delivery mechanism, not the narrator
3. **One Earth** — the globe is the UI; geography is the filter
4. **Five Spheres** — five lenses for experiencing everything good, creative, civic, intelligent, and informational on this planet

---

## 3. Architecture Decisions

### Decision 1: Globe Library — Globe.gl over Cesium

**Cesium** (current `worldmap.html`) is powerful but heavy, satellite-realistic, and requires a token for advanced features. It fights the "fun/neon" aesthetic.

**Globe.gl** (Three.js wrapper by Vasco Asturiano) wins on every front for this vision:

| Feature                   | Globe.gl                                   | Cesium                      |
| ------------------------- | ------------------------------------------ | --------------------------- |
| Neon/dark aesthetic       | ✅ Full control, custom shaders            | ⚠️ Fights satellite realism |
| Ripple rings on news pins | ✅ Built-in `ringsData` layer              | ❌ Custom only              |
| Animated arcs             | ✅ Built-in `arcsData` with dash animation | ⚠️ Complex                  |
| Hex country polygons      | ✅ Built-in `hexPolygonsData`              | ❌                          |
| Particles (star field)    | ✅ Built-in `particlesData`                | ❌                          |
| HTML markers (news cards) | ✅ Built-in `htmlElementsData`             | ⚠️                          |
| CDN script tag (no token) | ✅ `cdn.jsdelivr.net/npm/globe.gl`         | ⚠️ Token for some features  |
| Bundle size               | ~1MB                                       | ~30MB                       |
| Mobile performance        | Good                                       | Poor on mid-range devices   |

**Keep the Cesium webcam globe** at `/worldmap` as a secondary experience. It's built — don't throw it away.
**Build the new Globe.gl experience** as the homepage hero.

---

### Decision 2: Data Architecture — CF Workers + KV Cache

```
Browser → globaldeets.com/api/news?region=europe&limit=20
                    ↓
         Cloudflare Worker (functions/api/news.js)
                    ↓
         Check CF KV cache (TTL: 15 minutes)
                    ↓ miss
         Parallel fetch: Reuters RSS, Guardian API, AP RSS,
                         BBC RSS, Al Jazeera RSS, DW RSS
                    ↓
         Parse XML/JSON → normalize → rank → dedupe
                    ↓
         Store in KV with 15-min TTL
                    ↓
         Return JSON: [{headline, summary, source, url,
                        published, lat, lng, region, category}]
```

**No database needed for Phase 1.** KV caching is enough. D1 comes in Phase 4 for bookmarks/curated lists.

---

### Decision 3: No Build Tools

Consistent with GFD philosophy. Vanilla HTML/CSS/JS. Globe.gl from CDN. Workers in CF Functions directory (`functions/api/`). No webpack, no Vite, no bundler.

---

## 4. Information Architecture

### Pages

```
globaldeets.com/               → index.html   (Globe hero + news ticker + sphere cards)
globaldeets.com/globe          → globe.html   (Full immersive Globe.gl experience)
globaldeets.com/news           → news.html    (Curated world news feed by region/topic)
globaldeets.com/worldmap       → worldmap.html (Keep: Cesium webcam globe)
globaldeets.com/spheres        → spheres.html (Ecosystem partner directory)
globaldeets.com/knowledge      → knowledge.html (Official source directory by category)
globaldeets.com/donate         → donate.html  (Keep as-is)
globaldeets.com/about          → about.html   (Mission, who built it, contact)

# Sub-ecosystem (existing, keep):
eliassen.globaldeets.com       → BI portfolio demo
```

### API Routes (CF Functions)

```
/api/news            → GET: news feed (params: region, category, limit, offset)
/api/sources         → GET: directory of credible sources by category
/api/health          → GET: health probe
```

---

## 5. Design System

### Color Palette — "Deep Space Neon"

Extend the existing `styles.css` color system with these tokens:

```css
:root {
  /* Existing dark base — keep */
  --bg-primary: #060913; /* deep space */
  --bg-secondary: #0d1117; /* card backgrounds */
  --bg-surface: #111827; /* elevated surfaces */

  /* Neon accent palette */
  --neon-cyan: #00f5ff; /* primary highlight, globe markers */
  --neon-purple: #a855f7; /* ecosystem/spheres accent */
  --neon-orange: #ff6b35; /* news pins, alerts */
  --neon-green: #39ff14; /* "good vibes" sphere */
  --neon-pink: #ff0090; /* culture sphere */

  /* Globe-specific */
  --globe-surface: #0a0f1e; /* dark ocean texture */
  --globe-land: #1a2744; /* continent color */
  --globe-border: #00f5ff33; /* country borders (cyan + alpha) */
  --globe-atmo: #4444ff; /* atmosphere glow */

  /* Text */
  --text-primary: #e2e8f0;
  --text-muted: #64748b;
  --text-accent: var(--neon-cyan);
}
```

### Typography

```css
/* Keep existing Inter from Google Fonts */
font-family: 'Inter', system-ui, sans-serif;

/* Add for news headlines */
font-family: 'Space Grotesk', Inter, sans-serif; /* heavier, editorial feel */
```

### Globe Visual Spec

```
Background:    Pure black (#000000) + star particles layer
Atmosphere:    Electric blue glow (#4444ff, altitude: 0.25)
Ocean surface: Dark navy (#0a0f1e) — no texture map needed for the aesthetic
Land:          Dark blue-gray (#1a2744) hex polygons (Globe.gl hexPolygons layer)
Borders:       Cyan strokes (#00f5ff, low opacity) via hexPolygons
News pins:     Orange cylinders rising from surface, ripple rings emanating outward
Webcam pins:   Cyan dots (from worldmap-data.js — reuse that dataset)
Ecosystem pins: Colored HTML markers (one per partner site)
Arcs:          Animated dashed lines connecting news stories to "sphere" regions
Rotation:      Slow auto-rotation (0.2°/s), pauses on hover
```

---

## 6. Tech Stack

| Layer           | Tech                                   | Source                          |
| --------------- | -------------------------------------- | ------------------------------- |
| Hosting         | Cloudflare Pages                       | wrangler.toml (existing)        |
| Edge compute    | Cloudflare Functions (Pages Functions) | `functions/` dir                |
| Globe 3D        | Globe.gl v2 (Three.js)                 | `cdn.jsdelivr.net/npm/globe.gl` |
| Webcam globe    | Cesium.js (keep at /worldmap)          | CDN (existing)                  |
| Fonts           | Google Fonts (Inter + Space Grotesk)   | CDN                             |
| Analytics       | GA4 `G-WM6Q66W9W0`                     | Already wired                   |
| PWA             | Service Worker (existing)              | `service-worker.js`             |
| News cache      | Cloudflare KV                          | Add binding: `NEWS_CACHE`       |
| Icons           | inline SVG                             | No icon library needed          |
| Country GeoJSON | Natural Earth / GitHub cdn             | Free, no auth                   |

### Adding CF KV to wrangler.toml

```toml
# Add to wrangler.toml:

[[kv_namespaces]]
binding = "NEWS_CACHE"
id = "REPLACE_WITH_KV_NAMESPACE_ID"     # create via: wrangler kv namespace create NEWS_CACHE
preview_id = "REPLACE_WITH_PREVIEW_ID"  # create via: wrangler kv namespace create NEWS_CACHE --preview
```

Create the KV namespace:

```bash
wrangler kv namespace create NEWS_CACHE
wrangler kv namespace create NEWS_CACHE --preview
```

---

## 7. News Feed Worker

### File: `functions/api/news.js`

**Curated credible sources (free, no API key except The Guardian):**

| Source           | RSS/API URL                                      | Region Bias        |
| ---------------- | ------------------------------------------------ | ------------------ |
| Reuters          | `https://feeds.reuters.com/reuters/worldNews`    | Global             |
| Associated Press | `https://rsshub.app/apnews/topics/world-news`    | Global             |
| BBC World        | `https://feeds.bbci.co.uk/news/world/rss.xml`    | UK/Global          |
| The Guardian     | `https://www.theguardian.com/world/rss`          | UK/Global          |
| Al Jazeera       | `https://www.aljazeera.com/xml/rss/all.xml`      | Middle East/Global |
| Deutsche Welle   | `https://rss.dw.com/xml/rss-en-world`            | Europe/Global      |
| France 24        | `https://www.france24.com/en/rss`                | Europe/Africa      |
| NHK World        | `https://www3.nhk.or.jp/rss/news/cat0.xml`       | Asia               |
| NPR World        | `https://feeds.npr.org/1004/rss.xml`             | Americas           |
| ABC Australia    | `https://www.abc.net.au/news/feed/51120/rss.xml` | Pacific            |

> **Note on "zero opinion":** We fetch headlines + publication links ONLY. No editorial summaries written by Globaldeets — the teaser shown is the original article's description field from the RSS. The link always points to the original source. We are a discovery layer, not a publisher.

### Worker Logic

```javascript
// functions/api/news.js
// Cloudflare Pages Function — /api/news

const SOURCES = [
  { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/worldNews', region: 'global' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', region: 'global' },
  { name: 'Guardian', url: 'https://www.theguardian.com/world/rss', region: 'global' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', region: 'middle-east' },
  { name: 'DW', url: 'https://rss.dw.com/xml/rss-en-world', region: 'europe' },
  { name: 'NHK', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', region: 'asia' },
  { name: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml', region: 'americas' },
];

const CACHE_KEY = 'news_feed_v1';
const CACHE_TTL_SECONDS = 900; // 15 minutes

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const region = url.searchParams.get('region') || 'global';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);

  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://globaldeets.com',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=900',
  };

  // Check KV cache
  const cached = await env.NEWS_CACHE?.get(CACHE_KEY, { type: 'json' });
  if (cached) {
    const filtered = filterByRegion(cached, region).slice(0, limit);
    return new Response(JSON.stringify({ items: filtered, cached: true, count: filtered.length }), {
      headers: corsHeaders,
    });
  }

  // Fetch all sources in parallel (with timeout)
  const items = await fetchAllSources();

  // Cache in KV
  if (env.NEWS_CACHE) {
    await env.NEWS_CACHE.put(CACHE_KEY, JSON.stringify(items), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  }

  const filtered = filterByRegion(items, region).slice(0, limit);
  return new Response(JSON.stringify({ items: filtered, cached: false, count: filtered.length }), {
    headers: corsHeaders,
  });
}

async function fetchAllSources() {
  const results = await Promise.allSettled(SOURCES.map(source => fetchAndParseRSS(source)));

  const items = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  // Sort by publish date, dedupe by title similarity
  return items.sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 200); // store 200 in KV, serve filtered subset
}

async function fetchAndParseRSS({ name, url, region }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    clearTimeout(timeout);
    return parseRSS(text, name, region);
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

function parseRSS(xml, sourceName, region) {
  // XML parsing via regex (no DOM parser in CF Workers unless using HTMLRewriter)
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link');
    const desc = extractTag(item, 'description');
    const pubDate = extractTag(item, 'pubDate');

    if (!title || !link) continue;

    items.push({
      id: `${sourceName}-${hashStr(title)}`,
      headline: cleanText(title),
      summary: cleanText(desc).slice(0, 200),
      source: sourceName,
      sourceUrl: link,
      published: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      region: region,
      // lat/lng will be added client-side for geo-pinning based on keyword matching
    });
  }

  return items.slice(0, 20); // max 20 per source
}

function extractTag(xml, tag) {
  const match = xml.match(
    new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`
    )
  );
  return match ? (match[1] || match[2] || '').trim() : '';
}

function cleanText(str) {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim();
}

function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function filterByRegion(items, region) {
  if (region === 'global') return items;
  return items.filter(item => item.region === region || item.region === 'global');
}
```

### Guardian Free API (Optional Enhancement)

```javascript
// The Guardian has a clean JSON API — no XML parsing needed
// Free tier: 500 req/day, 12 req/sec
// GET https://content.guardianapis.com/search?section=world&api-key=YOUR_KEY

// Add to wrangler.toml vars:
// GUARDIAN_API_KEY = "your-free-key"
// Register at: https://open-platform.theguardian.com/access/
```

---

## 8. Globe 2.0 — Dark/Neon Earth

### File: `globe.html` (new) and homepage hero in `index.html`

### Globe.gl Quick Start

```html
<!-- Load from CDN — no npm needed -->
<script src="https://cdn.jsdelivr.net/npm/globe.gl@2/dist/globe.gl.min.js"></script>
```

### Core Globe Configuration

```javascript
(function () {
  const Globe = window.Globe;

  const world = Globe({ animateIn: true })(document.getElementById('globe-container'))

    // --- Globe Surface ---
    .globeImageUrl(null) // no satellite texture — pure dark
    .backgroundColor('#000000')

    // --- Atmosphere: electric blue glow ---
    .showAtmosphere(true)
    .atmosphereColor('#2255ff')
    .atmosphereAltitude(0.25)

    // --- Graticule lines (latitude/longitude grid) ---
    .showGraticules(true);

  // --- Country hex polygons (dark blue with cyan borders) ---
  // Load countries GeoJSON from CDN:
  // https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json
  // then convert to GeoJSON features

  // --- Country hex polygons ---
  fetch(
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
  )
    .then(r => r.json())
    .then(countries => {
      world
        .hexPolygonsData(countries.features)
        .hexPolygonResolution(3)
        .hexPolygonMargin(0.3)
        .hexPolygonColor(() => `rgba(26, 39, 68, ${0.6 + Math.random() * 0.4})`)
        .hexPolygonAltitude(0.005)
        // Hover highlight
        .onHexPolygonHover((hovered, prev) => {
          world.hexPolygonColor(feat =>
            feat === hovered
              ? 'rgba(0, 245, 255, 0.6)' // neon cyan on hover
              : `rgba(26, 39, 68, ${0.6 + Math.random() * 0.4})`
          );
        })
        .onHexPolygonClick((polygon, event, coords) => {
          // Fly to region + filter news
          world.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: 1.5 }, 1000);
          filterNewsByRegion(polygon.properties?.REGION_WB);
        });
    });

  // --- News pins ---
  function renderNewsPins(newsItems) {
    // Points layer: orange cylinders rising from surface
    world
      .pointsData(newsItems.filter(n => n.lat && n.lng))
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude(0.04)
      .pointRadius(0.3)
      .pointColor(() => '#ff6b35')
      .pointsMerge(false)
      .onPointClick(point => openNewsCard(point));

    // Rings layer: pulsing ripples on news pins
    world
      .ringsData(newsItems.filter(n => n.lat && n.lng))
      .ringLat('lat')
      .ringLng('lng')
      .ringAltitude(0.002)
      .ringColor(() => t => `rgba(255, 107, 53, ${1 - t})`) // fade outward
      .ringMaxRadius(3)
      .ringPropagationSpeed(1.5)
      .ringRepeatPeriod(1200);
  }

  // --- Webcam pins (from existing worldmap-data.js) ---
  // WEBCAM_DATA is loaded from worldmap-data.js (already in project)
  if (typeof WEBCAM_DATA !== 'undefined') {
    world
      .labelsData(WEBCAM_DATA.slice(0, 50)) // first 50 webcams
      .labelLat('coordinates[0]')
      .labelLng('coordinates[1]')
      .labelText('name')
      .labelColor(() => '#00f5ff')
      .labelSize(0.4)
      .labelDotRadius(0.15)
      .labelAltitude(0.005)
      .onLabelClick(cam => openWebcamModal(cam));
  }

  // --- Ecosystem partner HTML markers ---
  const ECOSYSTEM_PINS = [
    {
      name: '🌈 Good Flippin Vibes',
      lat: 39.83,
      lng: -98.58,
      url: 'https://goodflippinvibes.com',
      color: '#39ff14',
    },
    {
      name: '🎨 Culture',
      lat: 48.86,
      lng: 2.35,
      url: 'https://culturesherpa.org',
      color: '#ff0090',
    },
    {
      name: '🤖 aiaimate',
      lat: 37.77,
      lng: -122.41,
      url: 'https://aiaimate.com',
      color: '#a855f7',
    },
    {
      name: '✅ Citizen',
      lat: 38.89,
      lng: -77.03,
      url: 'https://citizenapproved.org',
      color: '#00f5ff',
    },
  ];

  world
    .htmlElementsData(ECOSYSTEM_PINS)
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.02)
    .htmlElement(d => {
      const el = document.createElement('div');
      el.className = 'ecosystem-pin';
      el.style.cssText = `color:${d.color}; font-size:11px; font-weight:700;
        cursor:pointer; text-shadow:0 0 8px ${d.color}; white-space:nowrap;`;
      el.innerHTML = d.name;
      el.addEventListener('click', () => window.open(d.url, '_blank', 'noopener'));
      return el;
    });

  // --- Star field particles ---
  const STARS = Array.from({ length: 2000 }, () => ({
    lat: (Math.random() - 0.5) * 180,
    lng: (Math.random() - 0.5) * 360,
    alt: Math.random() * 3 + 1.5,
  }));

  world
    .particlesData([{ particles: STARS }])
    .particlesList(d => d.particles)
    .particleLat('lat')
    .particleLng('lng')
    .particleAltitude('alt')
    .particlesSize(0.3)
    .particlesColor(() => 'rgba(255,255,255,0.6)');

  // --- Auto-rotate ---
  world.controls().autoRotate = true;
  world.controls().autoRotateSpeed = 0.2;
  // Pause rotation on user interaction
  world.controls().addEventListener('start', () => {
    world.controls().autoRotate = false;
  });

  // --- Initial camera ---
  world.pointOfView({ lat: 20, lng: 10, altitude: 2.5 });

  // --- Load news ---
  fetch('/api/news?limit=50')
    .then(r => r.json())
    .then(data => renderNewsPins(data.items))
    .catch(() => {}); // fail silently — globe still works
})();
```

### Neon Globe CSS

```css
#globe-container {
  width: 100%;
  height: 100vh;
  background: #000000;
  position: relative;
}

.ecosystem-pin {
  transition:
    transform 0.2s ease,
    filter 0.2s ease;
}

.ecosystem-pin:hover {
  transform: scale(1.2);
  filter: brightness(1.4);
}

/* News ticker at bottom of globe */
.news-ticker {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(6, 9, 19, 0.92);
  border-top: 1px solid var(--neon-cyan);
  padding: 10px 20px;
  font-size: 13px;
  color: var(--text-primary);
  backdrop-filter: blur(10px);
  display: flex;
  gap: 40px;
  overflow: hidden;
  z-index: 100;
}

.news-ticker-item {
  white-space: nowrap;
  flex-shrink: 0;
}

.news-ticker-item a {
  color: var(--neon-cyan);
  text-decoration: none;
  font-weight: 500;
}

.news-ticker-item .source-badge {
  color: var(--text-muted);
  font-size: 11px;
  margin-right: 6px;
}
```

---

## 9. Ecosystem Spheres

### Sphere Card Design (for `spheres.html` and homepage)

Each partner site gets a "sphere card" — animated gradient orb + tagline + link.

```html
<div class="spheres-grid">
  <a
    href="https://goodflippinvibes.com"
    target="_blank"
    rel="noopener"
    class="sphere-card"
    data-color="green"
  >
    <div class="sphere-orb">🌈</div>
    <div class="sphere-info">
      <h3>Good Flippin Vibes</h3>
      <p class="sphere-tagline">Things to feel good about everywhere</p>
      <span class="sphere-domain">goodflippinvibes.com</span>
    </div>
  </a>

  <a
    href="https://culturesherpa.org"
    target="_blank"
    rel="noopener"
    class="sphere-card"
    data-color="pink"
  >
    <div class="sphere-orb">🎨</div>
    <div class="sphere-info">
      <h3>Culture Sherpa</h3>
      <p class="sphere-tagline">Earth's vibrant living culture</p>
      <span class="sphere-domain">culturesherpa.org</span>
    </div>
  </a>

  <a
    href="https://aiaimate.com"
    target="_blank"
    rel="noopener"
    class="sphere-card"
    data-color="purple"
  >
    <div class="sphere-orb">🤖</div>
    <div class="sphere-info">
      <h3>aiaimate</h3>
      <p class="sphere-tagline">The future of AI-human creativity</p>
      <span class="sphere-domain">aiaimate.com</span>
    </div>
  </a>

  <a
    href="https://citizenapproved.org"
    target="_blank"
    rel="noopener"
    class="sphere-card"
    data-color="cyan"
  >
    <div class="sphere-orb">✅</div>
    <div class="sphere-info">
      <h3>Citizen Approved</h3>
      <p class="sphere-tagline">What every citizen deserves to know</p>
      <span class="sphere-domain">citizenapproved.org</span>
    </div>
  </a>
</div>
```

```css
.spheres-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  padding: 40px 20px;
}

.sphere-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 24px;
  background: rgba(13, 17, 23, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  text-decoration: none;
  transition:
    transform 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;
  cursor: pointer;
}

.sphere-card:hover {
  transform: translateY(-4px);
}

.sphere-card[data-color='green']:hover {
  border-color: var(--neon-green);
  box-shadow: 0 0 30px rgba(57, 255, 20, 0.2);
}
.sphere-card[data-color='pink']:hover {
  border-color: var(--neon-pink);
  box-shadow: 0 0 30px rgba(255, 0, 144, 0.2);
}
.sphere-card[data-color='purple']:hover {
  border-color: var(--neon-purple);
  box-shadow: 0 0 30px rgba(168, 85, 247, 0.2);
}
.sphere-card[data-color='cyan']:hover {
  border-color: var(--neon-cyan);
  box-shadow: 0 0 30px rgba(0, 245, 255, 0.2);
}

.sphere-orb {
  font-size: 48px;
  margin-bottom: 16px;
  filter: drop-shadow(0 0 12px currentColor);
}

.sphere-card h3 {
  color: var(--text-primary);
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0 0 8px;
}

.sphere-tagline {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 0 0 12px;
}

.sphere-domain {
  font-size: 0.75rem;
  color: var(--neon-cyan);
  opacity: 0.7;
}
```

---

## 10. Universal Knowledge Categories

### Concept

A directory of **official, primary sources** organized by universal human categories. No aggregators, no opinionated media, no middlemen — just direct links to the authoritative source.

### Category Structure (for `knowledge.html`)

```
🏛️  GOVERNANCE          🔬  SCIENCE              🎭  ARTS & CULTURE
    United Nations          NASA                     UNESCO
    World Bank              WHO (Data Portal)        Library of Congress
    OECD Data               NOAA                     Europeana
    Open Government         PubMed                   Internet Archive
    Data.gov                arXiv                    Smithsonian Open Access

🌍  ENVIRONMENT          💰  ECONOMY               🏥  HEALTH
    IPCC Reports            World Bank Data          WHO
    UNEP                    IMF                      CDC
    Global Forest Watch     OECD Statistics          NIH
    NASA Earth Observatory  Federal Reserve Data     Our World in Data
    EPA Open Data           Eurostat                 IHME

📚  EDUCATION            ⚖️  HUMAN RIGHTS           🏆  ACHIEVEMENT
    MIT OpenCourseWare      Amnesty International    Nobel Prize
    Khan Academy            Human Rights Watch       Guinness World Records
    Coursera (free)         UN Human Rights          Olympic Data
    Wikipedia               Freedom House            Sports Reference
    Project Gutenberg       ACLU (US)                National Academies
```

### Implementation Note

This is a **static JSON file** (`data/knowledge-sources.json`) rendered by a simple JS module. No API, no CMS, no database. Update the JSON to add/edit sources.

```json
{
  "governance": {
    "label": "Governance & Policy",
    "icon": "🏛️",
    "color": "#00f5ff",
    "sources": [
      {
        "name": "United Nations Data",
        "url": "https://data.un.org",
        "description": "Official UN statistics and indicators",
        "type": "data"
      }
    ]
  }
}
```

---

## 11. Phased Roadmap

### Phase 0 — Git Health & De-Gate (Day 1, ~2 hours)

**Goal:** Clean repo on main branch, no password gates, site is public.

```bash
# 1. Fix the rebase conflict
cd "Z:\GFD\GFD Dev Projects\Globaldeets"

# Edit index.html — remove merge markers, keep HEAD version (onerror monitoring)
# Then:
git add index.html
git rebase --continue

# 2. Remove password gates
# - In functions/_middleware.js: Remove the password check block entirely,
#   keep only the security headers injection
# - Delete auth.js (or strip the password logic, leave the file empty)
# - Search all HTML for: sessionStorage.setItem, password, "weaver", "Moose"
#   and remove those checks

# 3. Fix stale references
# - STATUS.md: Update "Platform: Netlify" → "Platform: Cloudflare Pages"
# - contact.html: Replace Netlify form action with Formspree or remove

# 4. Ensure .gitignore covers node_modules
# (Check that node_modules is already in .gitignore — it should be)

# 5. Commit clean state
git add -A
git commit -m "feat: remove password gates, fix merge conflict, public site"
git push origin main
```

**Files to touch:** `index.html`, `functions/_middleware.js`, `auth.js`, `STATUS.md`, `contact.html`

---

### Phase 1 — Homepage + Globe Hero (Week 1, ~8 hours)

**Goal:** New index.html with Globe.gl hero, news ticker placeholder, sphere card grid.

Tasks:

1. Replace `index.html` hero section with Globe.gl container
2. Add Globe.gl CDN script
3. Write `globe-hero.js` — the neon globe initialization code (see Section 8)
4. Add news ticker bar at bottom (static placeholder for now)
5. Add sphere card grid (see Section 9 HTML/CSS)
6. Add "Explore the Globe" CTA → `/globe`
7. Keep existing portfolio/BI section at bottom (it's built and good)
8. Remove dead nav links (industries, methodology, insights)
9. Add proper nav: Home | Globe | News | Spheres | Knowledge | Webcams | About

**New files:**

- `globe-hero.js` — globe init + news pin rendering
- (Modify) `index.html` — hero section swap
- (Modify) `styles.css` — add neon tokens + globe-specific styles

---

### Phase 2 — News Worker (Week 2, ~6 hours)

**Goal:** Live news feed from credible sources, geo-pinned on globe.

Tasks:

1. Create CF KV namespace: `wrangler kv namespace create NEWS_CACHE`
2. Add KV binding to `wrangler.toml`
3. Write `functions/api/news.js` (see Section 7)
4. Write `news.html` — full news feed page with region/topic filters
5. Wire globe `globe-hero.js` to fetch `/api/news` and render pins + rings
6. Write news ticker JS — auto-scroll, pause on hover
7. Test locally: `wrangler pages dev .`

**New files:**

- `functions/api/news.js`
- `news.html`
- `news.js` (feed renderer + filter logic)

---

### Phase 3 — Full Globe Page (Week 2-3, ~6 hours)

**Goal:** `/globe` as a dedicated full-screen immersive Earth experience.

Tasks:

1. Create `globe.html` — full viewport Globe.gl with all layers
2. Webcam pins layer (reuse `worldmap-data.js` dataset)
3. Ecosystem pins (HTML markers)
4. Country hover → news filter interaction
5. "Fly to" on news card click
6. Mobile touch support (Globe.gl handles this natively)
7. Fallback: simple 2D leaflet map for browsers without WebGL
8. Performance: `will-change: transform` on container, lazy-load data

**New files:**

- `globe.html`
- `globe.js` (full globe logic, builds on globe-hero.js)

---

### Phase 4 — Spheres + Knowledge Pages (Week 3, ~4 hours)

**Goal:** Two content pages that give depth to the ecosystem and sources.

Tasks:

1. `spheres.html` — full sphere card grid with descriptions, live status checks
2. `knowledge.html` — category directory from `data/knowledge-sources.json`
3. `data/knowledge-sources.json` — curate 8 categories × 5-8 sources each
4. Write `knowledge.js` — render categories from JSON, search/filter
5. Update sitemap.xml with new pages

**New files:**

- `spheres.html`
- `knowledge.html`
- `knowledge.js`
- `data/knowledge-sources.json`

---

### Phase 5 — Live Data Overlays (Month 2)

**Goal:** The globe becomes a living model with real-time data.

Ideas:

- **News arc animations**: animated dashed arcs from source city to reader's region
- **Story heat map**: hexBin layer where hexagons glow brighter with more news coverage
- **Day/night overlay**: `Globe.gl` solar terminator example — shows current light/dark
- **Trending topics**: keyword extraction from news → top-5 topics badge
- **Culture Sherpa widget**: embed a featured culture story from Culture Sherpa in a globe popup
- **GoodFlippinVibes widget**: embed a "feel good story" from GFV in globe popup

---

### Phase 6 — Polish + Performance (Month 3)

- Lighthouse 95+ on all pages
- WCAG 2.1 AA on globe (keyboard nav, screen reader labels for pins)
- Core Web Vitals: LCP < 2.5s (globe loads async, content is in DOM instantly)
- Image optimization (OG image, favicon variants)
- Structured data / JSON-LD for SEO
- Submit sitemap to Google Search Console

---

## 12. File-by-File Execution Plan

### Files to Delete or Gut

```bash
# DELETE (or replace with redirect):
# industries.html   — was referenced but never created; remove nav link
# methodology.html  — same
# insights.html     — same

# GUT (keep file, remove password logic):
# auth.js           — remove sessionStorage password gate, can keep as empty module
# functions/_middleware.js — keep security headers, remove password check
```

### Files to Keep As-Is

```
worldmap.html           — Keep (Cesium webcam globe, lives at /worldmap)
worldmap.js
worldmap.css
worldmap-data.js
donate.html             — Keep (Stripe donation flow)
service-worker.js       — Keep
manifest.json           — Update theme-color to match new palette
robots.txt              — Update to allow all (remove any disallow rules from gated era)
```

### Files to Modify

```
index.html              — New hero + globe, keep portfolio section
styles.css              — Add neon tokens, keep existing system
wrangler.toml           — Add KV namespace binding
_headers                — Tighten CSP: add cdn.jsdelivr.net for Globe.gl
sitemap.xml             — Add new pages
```

### Files to Create

```
globe.html              — Full immersive Globe.gl page
globe.js                — Globe initialization + all layers
globe-hero.js           — Lighter hero version for homepage
news.html               — News feed page
news.js                 — Feed renderer + filters
spheres.html            — Ecosystem sphere directory
knowledge.html          — Knowledge source directory
knowledge.js            — Category renderer
data/knowledge-sources.json  — Curated source database
functions/api/news.js   — CF Worker: news feed proxy
functions/api/health.js — CF Worker: health probe (returns 200)
about.html              — Mission + contact
```

---

## 13. SEO & Accessibility

### SEO — Site is Now Crawlable

Removing the password gate makes globaldeets.com crawlable for the first time. Prep:

```
robots.txt:
  User-agent: *
  Allow: /
  Disallow: /api/

sitemap.xml:
  Add all new pages with proper lastmod dates

Canonical meta: Already in worldmap.html — add to all new pages

JSON-LD structured data:
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Globaldeets",
    "description": "A living window into Earth — curated world news, interactive globe, and ecosystem discovery",
    "url": "https://globaldeets.com",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://globaldeets.com/news?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  }
  </script>
```

### Accessibility — WCAG 2.1 AA

Globe.gl itself is a `<canvas>` — inherently inaccessible. Mitigate:

```html
<!-- Accessible globe wrapper -->
<div
  id="globe-container"
  role="img"
  aria-label="Interactive 3D globe showing global news locations. Use the news feed below for a text-accessible version."
  tabindex="0"
></div>

<!-- Screen reader accessible news list (visually hidden until focused) -->
<section class="sr-only" aria-live="polite" id="news-feed-accessible">
  <!-- Populated by JS from same /api/news call -->
</section>

<!-- Skip link to news feed -->
<a class="skip-link" href="#news-feed-accessible">Skip globe, go to news feed</a>
```

Touch targets: All interactive elements 44px minimum (existing `styles.css` should enforce this).

Color contrast: All text elements must meet 4.5:1 ratio. Neon colors against dark backgrounds — verify `--neon-cyan (#00f5ff)` on `--bg-primary (#060913)`:

- `#00f5ff` on `#060913` = **contrast ratio ~16:1** ✅ (well above AA)
- Caution: `--text-muted (#64748b)` on `--bg-primary (#060913)` = ~3.9:1 ⚠️ — bump to `#718096` or lighter.

---

## 14. Infrastructure Checklist

Before launch, verify each item:

### Cloudflare Pages Settings

- [ ] Custom domain: `globaldeets.com` → pointing to CF Pages deployment
- [ ] `www.globaldeets.com` CNAME → same deployment
- [ ] Subdomains: `eliassen.globaldeets.com` → keep existing routing in `_middleware.js`
- [ ] Build command: `(none)` — static site, no build step
- [ ] Build output dir: `.` (root)

### Environment Variables / KV

```bash
# Create KV namespace
wrangler kv namespace create NEWS_CACHE
# → Copy the ID into wrangler.toml

# No secrets needed for Phase 1-2
# Optional (Phase 2 enhancement):
wrangler secret put GUARDIAN_API_KEY  # get free key at open-platform.theguardian.com
```

### Security Headers (`_headers`)

The existing `_headers` file is solid. Update CSP to allow Globe.gl CDN:

```
# Add to connect-src:
https://cdn.jsdelivr.net

# Add to script-src:
https://cdn.jsdelivr.net

# Add to worker-src (for web workers Globe.gl may spin up):
blob:
```

### Monitoring

- GA4 `G-WM6Q66W9W0` — already wired ✅
- Add `/api/health` endpoint → returns `{ status: "ok", version: "2.0" }` for uptime monitors
- Consider UptimeRobot free tier pointing at `https://globaldeets.com/api/health`

---

## Quick Reference: First Commands to Run

```bash
# In the Globaldeets workspace terminal:

cd "Z:\GFD\GFD Dev Projects\Globaldeets"

# 1. Check git state
git status
git log --oneline -5

# 2. Fix the rebase (if still in paused state)
#    Edit index.html, remove <<<<<< ======= >>>>>>> markers, keep HEAD code
git add index.html
git rebase --continue

# 3. Create KV namespace for news cache
wrangler kv namespace create NEWS_CACHE
wrangler kv namespace create NEWS_CACHE --preview
# → paste the IDs into wrangler.toml

# 4. Run local dev server to test
wrangler pages dev .
# → opens http://localhost:8788

# 5. Install Globe.gl for local testing (optional — CDN is fine for production)
# No install needed — use CDN script tag
```

---

_This document is the source of truth for the Globaldeets rebuild. Update it as decisions evolve._
_Good Flippin Design / Brett Weaver — globaldeets.com_

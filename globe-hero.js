/**
 * GlobalDeets — Homepage Globe Hero
 * Globe.gl initialization, live news pin rendering, and news ticker
 */
(function () {
  'use strict';

  // Approximate source-to-location mapping for geo-pinning news items
  const SOURCE_COORDS = {
    Reuters: [40.71, -74.01],
    AP: [40.71, -74.01],
    'BBC World': [51.5, -0.12],
    Guardian: [51.5, -0.12],
    'Al Jazeera': [25.28, 51.52],
    DW: [52.52, 13.4],
    'France 24': [48.86, 2.35],
    NHK: [35.68, 139.69],
    NPR: [38.89, -77.03],
    'ABC Australia': [-33.87, 151.21],
  };

  function jitter(val, range) {
    return val + (Math.random() - 0.5) * range;
  }

  function assignCoords(item) {
    const base = SOURCE_COORDS[item.source];
    if (base) return { lat: jitter(base[0], 10), lng: jitter(base[1], 14) };
    // Region fallback centroids
    const regionFallback = {
      global: [20, 0],
      americas: [10, -80],
      europe: [50, 15],
      asia: [30, 105],
      'middle-east': [26, 44],
      pacific: [-25, 140],
    };
    const fb = regionFallback[item.region] || [0, 0];
    return { lat: jitter(fb[0], 20), lng: jitter(fb[1], 25) };
  }

  // -------------------------------------------------------------------------
  // Globe init
  // -------------------------------------------------------------------------
  let world = null;
  let newsItems = [];

  function initGlobeHero() {
    const container = document.getElementById('globe-hero-container');
    if (!container || typeof Globe === 'undefined') {
      console.warn('Globe.gl not ready — skipping globe hero init');
      return;
    }

    world = Globe({ animateIn: true })(container)
      .globeImageUrl(null)
      .backgroundColor('#000000')
      .showAtmosphere(true)
      .atmosphereColor('#2255ff')
      .atmosphereAltitude(0.25)
      .showGraticules(true);

    // Country hex polygons
    fetch(
      'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
    )
      .then(r => r.json())
      .then(countries => {
        world
          .hexPolygonsData(countries.features)
          .hexPolygonResolution(3)
          .hexPolygonMargin(0.3)
          .hexPolygonColor(() => 'rgba(26,39,68,0.7)')
          .hexPolygonAltitude(0.005)
          .onHexPolygonHover(hovered => {
            world.hexPolygonColor(f =>
              f === hovered ? 'rgba(0,245,255,0.5)' : 'rgba(26,39,68,0.7)'
            );
          })
          .onHexPolygonClick((_poly, _ev, coords) => {
            if (world && coords) {
              world.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: 1.8 }, 1200);
            }
          });
      })
      .catch(() => {});

    // Auto-rotate; pause when the user drags
    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.2;
    world.controls().addEventListener('start', () => {
      world.controls().autoRotate = false;
    });

    // Kick off news fetch
    fetchNews();
  }

  // -------------------------------------------------------------------------
  // News fetch
  // -------------------------------------------------------------------------
  function fetchNews() {
    fetch('/api/news?region=global&limit=40')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        newsItems = (data.items || []).map(item => ({ ...item, ...assignCoords(item) }));
        renderNewsPins(newsItems);
        populateTicker(newsItems);
      })
      .catch(() => {
        // Graceful degradation — globe still renders, ticker shows placeholder
        populateTicker([]);
      });
  }

  // -------------------------------------------------------------------------
  // News pins on globe
  // -------------------------------------------------------------------------
  function renderNewsPins(items) {
    if (!world || !items.length) return;

    // Points — orange cylinders rising from surface
    world
      .pointsData(items)
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude(0.04)
      .pointRadius(0.25)
      .pointColor(() => '#ff6b35')
      .pointsMerge(false)
      .onPointClick(point => openNewsOverlay(point));

    // Rings — pulsing ripples around each pin
    world
      .ringsData(items)
      .ringLat('lat')
      .ringLng('lng')
      .ringAltitude(0.002)
      .ringColor(() => t => `rgba(255,107,53,${1 - t})`)
      .ringMaxRadius(3)
      .ringPropagationSpeed(1)
      .ringRepeatPeriod(1500);
  }

  // -------------------------------------------------------------------------
  // News overlay card (appears when a globe pin is clicked)
  // -------------------------------------------------------------------------
  function openNewsOverlay(item) {
    const overlay = document.getElementById('news-pin-overlay');
    if (!overlay) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || '';
    };

    set('news-overlay-source', item.source);
    set('news-overlay-title', item.headline);
    set('news-overlay-summary', item.summary);

    const link = document.getElementById('news-overlay-link');
    if (link) {
      link.href = item.sourceUrl || '#';
      link.textContent = `Read at ${item.source || 'source'} →`;
    }

    overlay.classList.add('visible');
  }

  // -------------------------------------------------------------------------
  // News ticker
  // -------------------------------------------------------------------------
  function populateTicker(items) {
    const track = document.getElementById('ticker-track');
    if (!track) return;

    const stories =
      items.length > 0
        ? items.slice(0, 24)
        : [{ headline: 'Live world news — loading…', source: 'GlobalDeets', sourceUrl: '#' }];

    // Duplicate so the ticker loops seamlessly
    const html = [...stories, ...stories]
      .map(
        item => `
        <a class="ticker-item"
           href="${escapeAttr(item.sourceUrl || '#')}"
           target="_blank"
           rel="noopener noreferrer">
          <span class="ticker-source">${escapeHtml(item.source || '')}</span>
          <span class="ticker-headline">${escapeHtml(item.headline || '')}</span>
        </a>`
      )
      .join('');

    track.innerHTML = html;
    startTicker(track, stories.length);
  }

  function startTicker(track, storyCount) {
    const ITEM_WIDTH = 320; // must match CSS .ticker-item min/max-width
    const SPEED = 0.4; // px per frame
    let paused = false;
    let pos = 0;
    let rafId = null;

    track.addEventListener('mouseenter', () => {
      paused = true;
    });
    track.addEventListener('mouseleave', () => {
      paused = false;
    });

    function tick() {
      if (!paused) {
        pos += SPEED;
        if (pos >= ITEM_WIDTH * storyCount) pos = 0;
        track.style.transform = `translateX(-${pos}px)`;
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    // Pause animation when tab is hidden (battery/perf)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Utils
  // -------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    // Wire overlay close button
    const closeBtn = document.getElementById('news-overlay-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('news-pin-overlay')?.classList.remove('visible');
      });
    }

    // Close overlay on backdrop click
    document.getElementById('news-pin-overlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('visible');
    });

    initGlobeHero();
  });
})();

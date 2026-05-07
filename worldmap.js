/**
 * GlobalDeets World Map - Main Application
 * 3D interactive globe with live webcam feeds
 */

// Initialize webcam manager
const webcamManager = new WebcamManager(WEBCAM_DATA);

// Global state
let viewer = null;
let is3DMode = true;
let selectedCam = null;
let camEntities = [];

/**
 * Initialize the application
 */
function init() {
  initCesiumGlobe();
  initEventListeners();
  updateStats();
  renderFeaturedCams();
  hideLoading();
}

/**
 * Initialize Cesium 3D Globe
 */
function initCesiumGlobe() {
  try {
    console.log('Initializing Cesium globe...');

    viewer = new Cesium.Viewer('cesium-container', {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: true,
      vrButton: false,
      infoBox: true,
      selectionIndicator: true,
      shadows: false,
      shouldAnimate: true,
      imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
      }),
    });

    console.log('Cesium viewer created successfully');

    // Enable lighting for realistic shadows
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.showGroundAtmosphere = true;

    // Reduce fog
    viewer.scene.fog.enabled = false;

    // Set initial camera position
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 30, 20000000),
      orientation: {
        heading: 0.0,
        pitch: -Cesium.Math.PI_OVER_TWO,
        roll: 0.0,
      },
    });

    // Add webcam markers
    addWebcamMarkers();

    // Handle marker clicks
    viewer.selectedEntityChanged.addEventListener(selectedEntity => {
      if (selectedEntity && selectedEntity.properties && selectedEntity.properties.webcamId) {
        const camId = selectedEntity.properties.webcamId.getValue();
        openWebcamModal(camId);
      }
    });
  } catch (error) {
    console.error('Error initializing Cesium:', error);
    alert('Cesium Error: ' + error.message);
    showError('Failed to load 3D globe. Please try refreshing the page.');
  }
}

/**
 * Add webcam markers to the globe
 */
function addWebcamMarkers() {
  if (!viewer) return;

  // Clear existing entities
  camEntities.forEach(entity => viewer.entities.remove(entity));
  camEntities = [];

  const webcams = webcamManager.getFiltered();

  webcams.forEach(cam => {
    const entity = viewer.entities.add({
      name: cam.name,
      position: Cesium.Cartesian3.fromDegrees(cam.coordinates[1], cam.coordinates[0], 0),
      billboard: {
        image: createCameraIcon(cam.category),
        show: true,
        pixelOffset: new Cesium.Cartesian2(0, -15),
        scale: 0.5,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: cam.name,
        font: '14px Inter, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, 20),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10000000),
        scaleByDistance: new Cesium.NearFarScalar(1000000, 1.0, 10000000, 0.3),
      },
      description: createWebcamDescription(cam),
      properties: {
        webcamId: cam.id,
        location: cam.location,
        category: cam.category,
        isLive: cam.isLive,
      },
    });

    camEntities.push(entity);
  });
}

/**
 * Create camera icon SVG
 */
function createCameraIcon(category) {
  const colors = {
    city: '#06b6d4',
    nature: '#84cc16',
    beach: '#22d3ee',
    mountain: '#a855f7',
    landmark: '#c026d3',
    wildlife: '#84cc16',
    traffic: '#f97316',
    weather: '#8b5cf6',
  };

  const color = colors[category] || '#06b6d4';

  // Create simple SVG with neon glow effect
  const svg = `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <circle cx="24" cy="24" r="18" fill="${color}" opacity="0.2">
      <animate attributeName="r" values="18;22;18" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.2;0.1;0.2" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="24" cy="24" r="14" fill="none" stroke="${color}" stroke-width="2" opacity="0.6" filter="url(#glow)"/>
    <circle cx="24" cy="24" r="12" fill="${color}" opacity="0.3"/>
    <rect x="17" y="19" width="14" height="10" rx="1" fill="white" opacity="0.9" stroke="${color}" stroke-width="1.5"/>
    <rect x="20" y="16" width="8" height="3" rx="1" fill="${color}" opacity="0.8"/>
    <circle cx="24" cy="24" r="3" fill="${color}" opacity="0.9"/>
    <circle cx="24" cy="24" r="1.5" fill="white" opacity="1">
      <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>
    </circle>
  </svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * Create webcam description for info box
 */
function createWebcamDescription(cam) {
  return `
        <div style="font-family: Inter, sans-serif; padding: 10px;">
            <h3 style="margin: 0 0 10px 0; color: #1e293b;">${cam.name}</h3>
            <p style="margin: 5px 0; color: #475569;">
                <strong>Location:</strong> ${cam.location}
            </p>
            <p style="margin: 5px 0; color: #475569;">
                <strong>Category:</strong> ${cam.category}
            </p>
            <p style="margin: 5px 0; color: #475569;">
                <strong>Quality:</strong> ${cam.quality}
            </p>
            <p style="margin: 10px 0; color: #64748b;">
                ${cam.description}
            </p>
            ${cam.isLive ? '<span style="color: #10b981; font-weight: 600;">● Live</span>' : '<span style="color: #ef4444;">○ Offline</span>'}
        </div>
    `;
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
  // Search
  const searchInput = document.getElementById('location-search');
  searchInput?.addEventListener('input', handleSearch);

  // Filters
  const regionFilter = document.getElementById('region-filter');
  const categoryFilter = document.getElementById('category-filter');

  regionFilter?.addEventListener('change', handleFilters);
  categoryFilter?.addEventListener('change', handleFilters);

  // View toggle
  const viewToggle = document.getElementById('view-toggle');
  viewToggle?.addEventListener('click', toggleView);

  // Panel toggle
  const panelToggle = document.getElementById('panel-toggle');
  panelToggle?.addEventListener('click', togglePanel);

  // Modal close
  const modalClose = document.querySelector('.modal-close');
  const modalOverlay = document.querySelector('.modal-overlay');

  modalClose?.addEventListener('click', closeWebcamModal);
  modalOverlay?.addEventListener('click', closeWebcamModal);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

/**
 * Handle search input
 */
function handleSearch(e) {
  const query = e.target.value;
  handleFilters();
}

/**
 * Handle filter changes
 */
function handleFilters() {
  const region = document.getElementById('region-filter')?.value || 'all';
  const category = document.getElementById('category-filter')?.value || 'all';
  const search = document.getElementById('location-search')?.value || '';

  webcamManager.applyFilters(region, category, search);
  addWebcamMarkers();
  updateStats();
}

/**
 * Toggle between 3D and 2D view
 */
function toggleView() {
  is3DMode = !is3DMode;
  const viewModeText = document.getElementById('view-mode-text');
  const cesiumContainer = document.getElementById('cesium-container');
  const map2d = document.getElementById('map-2d');

  if (is3DMode) {
    cesiumContainer?.classList.add('active');
    map2d?.classList.remove('active');
    viewModeText.textContent = '3D';
  } else {
    cesiumContainer?.classList.remove('active');
    map2d?.classList.add('active');
    viewModeText.textContent = '2D';
    init2DMap();
  }
}

/**
 * Initialize 2D map (fallback using simple markers)
 */
function init2DMap() {
  const map2d = document.getElementById('map-2d');
  if (!map2d || map2d.querySelector('.map-content')) return;

  // Simple 2D representation using CSS and positioned elements
  const mapContent = document.createElement('div');
  mapContent.className = 'map-content';
  mapContent.innerHTML = `
        <div class="map-background">
            <div class="map-grid"></div>
            <p class="map-note">2D map view - Click markers to view webcams</p>
        </div>
    `;

  map2d.appendChild(mapContent);

  // Add simple markers
  const webcams = webcamManager.getFiltered();
  webcams.forEach(cam => {
    const marker = document.createElement('div');
    marker.className = 'map-marker';
    marker.title = cam.name;

    // Convert lat/lng to percentage position
    const x = ((cam.coordinates[1] + 180) / 360) * 100;
    const y = ((90 - cam.coordinates[0]) / 180) * 100;

    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;

    marker.onclick = () => openWebcamModal(cam.id);

    mapContent.appendChild(marker);
  });
}

/**
 * Toggle control panel
 */
function togglePanel() {
  const panel = document.querySelector('.control-panel');
  panel?.classList.toggle('collapsed');
}

/**
 * Open webcam modal
 */
function openWebcamModal(camId) {
  const cam = webcamManager.getById(camId);
  if (!cam) return;

  selectedCam = cam;

  // Update modal content
  document.getElementById('modal-title').textContent = cam.name;
  document.getElementById('modal-location').textContent = cam.location;
  document.getElementById('modal-category').textContent =
    cam.category.charAt(0).toUpperCase() + cam.category.slice(1);
  document.getElementById('modal-timezone').textContent = cam.timezone;
  document.getElementById('modal-external-link').href = cam.sourceUrl;

  // Load webcam stream
  const player = document.getElementById('webcam-player');
  player.innerHTML = `
        <iframe
            src="${cam.streamUrl}"
            frameborder="0"
            allowfullscreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            loading="lazy"
            title="${cam.name} live webcam"
        ></iframe>
    `;

  // Show modal
  const modal = document.getElementById('webcam-modal');
  modal.removeAttribute('hidden');
  modal.classList.add('active');

  // Trap focus
  trapFocus(modal);
}

/**
 * Close webcam modal
 */
function closeWebcamModal() {
  const modal = document.getElementById('webcam-modal');
  modal.classList.remove('active');

  setTimeout(() => {
    modal.setAttribute('hidden', '');
    document.getElementById('webcam-player').innerHTML = '';
    selectedCam = null;
  }, 300);
}

/**
 * Update statistics
 */
function updateStats() {
  const stats = webcamManager.getStats();
  const filtered = webcamManager.getFiltered().length;

  document.getElementById('total-cams').textContent = filtered;
  document.getElementById('live-cams').textContent = stats.live;
  document.getElementById('countries-count').textContent = stats.countries;
}

/**
 * Render featured webcams
 */
function renderFeaturedCams() {
  const featured = webcamManager.getFeatured(5);
  const list = document.getElementById('featured-list');

  if (!list) return;

  list.innerHTML = featured
    .map(
      cam => `
        <div class="featured-item" onclick="flyToLocation('${cam.id}')">
            <div class="featured-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                </svg>
            </div>
            <div class="featured-info">
                <div class="featured-name">${cam.name}</div>
                <div class="featured-location">${cam.location}</div>
            </div>
            ${cam.isLive ? '<span class="live-badge">Live</span>' : ''}
        </div>
    `
    )
    .join('');
}

/**
 * Fly camera to location
 */
function flyToLocation(camId) {
  const cam = webcamManager.getById(camId);
  if (!cam || !viewer) return;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(cam.coordinates[1], cam.coordinates[0], 5000000),
    duration: 2,
    complete: () => {
      // Open modal after flight
      setTimeout(() => openWebcamModal(camId), 500);
    },
  });
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboard(e) {
  // ESC to close modal
  if (e.key === 'Escape') {
    const modal = document.getElementById('webcam-modal');
    if (!modal.hasAttribute('hidden')) {
      closeWebcamModal();
    }
  }

  // Ctrl+F to focus search
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    document.getElementById('location-search')?.focus();
  }
}

/**
 * Trap focus within modal
 */
function trapFocus(element) {
  const focusableElements = element.querySelectorAll(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  element.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      }
    }
  });

  firstElement?.focus();
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  overlay?.classList.add('hidden');
  setTimeout(() => overlay?.remove(), 300);
}

/**
 * Show error message
 */
function showError(message) {
  const toast = document.createElement('div');
  toast.className = 'toast toast-error';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

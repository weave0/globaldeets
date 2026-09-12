// Simplified main app orchestrator (logic moved to modules)
// Now delegates to: projects-render.js, ui-effects.js, interactions.js

const searchInput = document.getElementById('searchInput');
const filterCategory = document.getElementById('filterCategory');
const filterStatus = document.getElementById('filterStatus');
const addProjectBtn = document.getElementById('addProjectBtn');
const exportBtn = document.getElementById('exportBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'https://globaldeets.com'
  : '';

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Show/hide loading
function showLoading() {
  loadingIndicator?.classList.add('active');
}
function hideLoading() {
  loadingIndicator?.classList.remove('active');
}

// Check performance
function checkPerformance() {
  if (typeof projects !== 'undefined' && projects.length > 50) {
    showLoading();
    setTimeout(hideLoading, 300);
  }
}

// Export projects
function exportProjectsList() {
  const filtered = typeof projects === 'undefined' ? [] : projects;
  const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `globaldeets-projects-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
  if (window.showToast) window.showToast('Projects exported successfully!', 'success');
}

function getHomepageMetric(label) {
  return [...document.querySelectorAll('.dm-stat')].find(
    stat => stat.querySelector('.dm-stat-label')?.textContent.trim() === label
  );
}

function setHomepageMetric(metric, value, label) {
  if (!metric) return;
  const valueNode = metric.querySelector('.dm-stat-value');
  const labelNode = metric.querySelector('.dm-stat-label');
  if (valueNode) valueNode.textContent = String(value);
  if (labelNode && label) labelNode.textContent = label;
}

function ensureHomepageTrustLinks() {
  const actions = document.querySelector('.featured-platform .platform-actions');
  if (!actions) return;

  const links = [
    {
      href: '/observatory/coverage/',
      label: 'Coverage & Evidence Observatory',
      className: 'btn-sample',
    },
    {
      href: '/dossiers/santa-ynez-pipeline/',
      label: 'Open Evidence Dossier',
      className: 'btn-sample',
    },
  ];

  links.forEach(({ href, label, className }) => {
    if (actions.querySelector(`a[href="${href}"]`)) return;
    const link = document.createElement('a');
    link.href = href;
    link.className = className;
    link.textContent = label;
    actions.appendChild(link);
  });
}

function replaceHomepageTrustCopy() {
  // These two old metrics were not backed by the current intelligence contract.
  // Replace them immediately, even if observability APIs are temporarily unavailable.
  setHomepageMetric(getHomepageMetric('Webcams'), '—', 'Local/State Sources');
  setHomepageMetric(getHomepageMetric('Paywalls'), '—', 'Open Coverage Gaps');

  const staleHealthItem = [...document.querySelectorAll('.industry-feature')].find(feature =>
    feature.textContent.includes('Archives and source health coming next')
  );
  if (staleHealthItem) {
    const check = staleHealthItem.querySelector('.feature-check');
    staleHealthItem.textContent = '';
    if (check) staleHealthItem.appendChild(check);
    staleHealthItem.appendChild(
      document.createTextNode(' Source health, provenance, and coverage gaps are inspectable now')
    );
  }
}

async function hydrateHomepageTrustSurface() {
  replaceHomepageTrustCopy();
  ensureHomepageTrustLinks();

  const liveSourcesMetric = getHomepageMetric('Live Sources');
  const regionsMetric = getHomepageMetric('Regions');
  const localSourcesMetric = getHomepageMetric('Local/State Sources');
  const gapsMetric = getHomepageMetric('Open Coverage Gaps');

  if (!liveSourcesMetric && !regionsMetric && !localSourcesMetric && !gapsMetric) return;

  try {
    const response = await fetch(`${API_BASE}/api/news/coverage`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const coverage = await response.json();

    setHomepageMetric(liveSourcesMetric, coverage.totalSources ?? '—');
    setHomepageMetric(regionsMetric, coverage.totalRegions ?? '—');
    setHomepageMetric(localSourcesMetric, coverage.subnationalReporting?.sourceCount ?? '—');
    setHomepageMetric(gapsMetric, Array.isArray(coverage.gaps) ? coverage.gaps.length : '—');
  } catch (error) {
    // Fail open: the homepage remains usable and links to the observatory stay available.
    console.warn('GlobalDeets coverage snapshot unavailable:', error);
  }
}

// Attach listeners
function attachEventListeners() {
  if (searchInput && window.filterProjects) {
    searchInput.addEventListener('input', debounce(window.filterProjects, 300));
  }
  if (filterCategory && window.filterProjects) {
    filterCategory.addEventListener('change', window.filterProjects);
  }
  if (filterStatus && window.filterProjects) {
    filterStatus.addEventListener('change', window.filterProjects);
  }
  if (addProjectBtn) {
    addProjectBtn.addEventListener('click', e => {
      e.preventDefault();
      if (window.showToast)
        window.showToast(
          'To add a new project, edit the projects-data.js file and add a new entry to the projects array.',
          'info'
        );
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', e => {
      e.preventDefault();
      exportProjectsList();
    });
  }
}

// Header scroll effect
window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  const header = document.querySelector('header');
  if (header) {
    if (currentScroll > 100) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  }
});

// Initialize
function init() {
  if (window.renderProjects && typeof projects !== 'undefined') window.renderProjects(projects);
  if (window.updateStats && typeof projects !== 'undefined') window.updateStats(projects);
  attachEventListeners();
  checkPerformance();
  hydrateHomepageTrustSurface();
  // UI effects module will auto-init when available
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

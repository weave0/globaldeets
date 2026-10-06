// GlobalDeets homepage orchestrator.
// The World Desk story list lives in world-desk.js; this file hydrates the coverage strip from the
// governed coverage contract and keeps the header behavior shared with other pages.

const API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'https://globaldeets.com'
  : '';

function getHomepageMetric(label) {
  return [...document.querySelectorAll('.dm-stat')].find(
    stat => stat.querySelector('.dm-stat-label')?.textContent.trim() === label
  );
}

function setHomepageMetric(metric, value) {
  const valueNode = metric?.querySelector('.dm-stat-value');
  if (valueNode) valueNode.textContent = String(value);
}

async function hydrateHomepageTrustSurface() {
  const liveSourcesMetric = getHomepageMetric('Live Sources');
  const regionsMetric = getHomepageMetric('Regions');
  const localSourcesMetric = getHomepageMetric('Local/State Sources');
  const gapsMetric = getHomepageMetric('Open Coverage Gaps');
  if (!liveSourcesMetric && !regionsMetric && !localSourcesMetric && !gapsMetric) return;

  // The raw HTML carries the canonical registry count; hydration may refine it but never invent one.
  const staticLiveSources =
    liveSourcesMetric?.querySelector('.dm-stat-value')?.textContent.trim() || '—';

  try {
    const response = await fetch(`${API_BASE}/api/news/coverage`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const coverage = await response.json();

    setHomepageMetric(liveSourcesMetric, coverage.totalSources ?? staticLiveSources);
    setHomepageMetric(regionsMetric, coverage.totalRegions ?? '—');
    setHomepageMetric(localSourcesMetric, coverage.subnationalReporting?.sourceCount ?? '—');
    setHomepageMetric(gapsMetric, Array.isArray(coverage.gaps) ? coverage.gaps.length : '—');
  } catch (error) {
    console.warn('GlobalDeets coverage snapshot unavailable:', error);
  }
}

window.addEventListener(
  'scroll',
  () => {
    document.querySelector('header')?.classList.toggle('scrolled', window.pageYOffset > 100);
  },
  { passive: true }
);

function init() {
  hydrateHomepageTrustSurface();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

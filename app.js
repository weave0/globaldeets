// Simplified main app orchestrator (logic moved to modules)
// Now delegates to: projects-render.js, ui-effects.js, interactions.js

const searchInput = document.getElementById('searchInput');
const filterCategory = document.getElementById('filterCategory');
const filterStatus = document.getElementById('filterStatus');
const addProjectBtn = document.getElementById('addProjectBtn');
const exportBtn = document.getElementById('exportBtn');
const loadingIndicator = document.getElementById('loadingIndicator');

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// Show/hide loading
function showLoading() { loadingIndicator.classList.add('active'); }
function hideLoading() { loadingIndicator.classList.remove('active'); }

// Check performance
function checkPerformance() {
    if (projects.length > 50) {
        showLoading();
        setTimeout(hideLoading, 300);
    }
}

// Export projects
function exportProjectsList() {
    const filtered = projects; // Could use window.filteredProjects if modules expose it
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `globaldeets-projects-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    if (window.showToast) window.showToast('Projects exported successfully!', 'success');
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
            if (window.showToast) window.showToast('To add a new project, edit the projects-data.js file and add a new entry to the projects array.', 'info');
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
let lastScroll = 0;
window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    const header = document.querySelector('header');
    if (header) {
        if (currentScroll > 100) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
});

// Initialize
function init() {
    if (window.renderProjects) window.renderProjects(projects);
    if (window.updateStats) window.updateStats(projects);
    attachEventListeners();
    checkPerformance();
    // UI effects module will auto-init when available
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

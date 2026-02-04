// Project rendering & filtering module
// Depends on global `projects` array.

// Exposed globals: renderProjects, filterProjects, updateStats, openProjectModal

(function() {
    const projectsGrid = document.getElementById('projectsGrid');
    const noResults = document.getElementById('noResults');
    const totalProjectsEl = document.getElementById('totalProjects');
    const activeProjectsEl = document.getElementById('activeProjects');
    const recentUpdatesEl = document.getElementById('recentUpdates');
    const modal = document.getElementById('projectModal');
    const modalBody = document.getElementById('modalBody');
    const closeModalBtn = document.querySelector('.close');
    const searchInput = document.getElementById('searchInput');
    const filterCategory = document.getElementById('filterCategory');
    const filterStatus = document.getElementById('filterStatus');

    let filteredProjects = [...projects];

    // URL validation (http/https only, no javascript: or data:)
    function isValidProjectUrl(url) {
        try {
            const u = new URL(url);
            return (u.protocol === 'http:' || u.protocol === 'https:');
        } catch (_) {
            return false;
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function createProjectCard(project, index) {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.style.animationDelay = `${index * 0.05}s`;

        const statusClass = `status-${project.status.toLowerCase()}`;
        const categoryClass = `category-${project.category.toLowerCase()}`;
        const safeUrl = isValidProjectUrl(project.url) ? escapeHtml(project.url) : null;

        card.innerHTML = `
            <div class="project-header">
                <div>
                    <h3 class="project-title">${escapeHtml(project.name)}</h3>
                    ${safeUrl ? `<a href="${safeUrl}" class="project-url" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">View live project</a>` : `<span class="project-url invalid-url" title="Invalid URL">URL unavailable</span>`}
                </div>
                <span class="project-status ${statusClass}">${escapeHtml(project.status)}</span>
            </div>
            <p class="project-description">${escapeHtml(project.description)}</p>
            <div class="project-meta">
                <div class="meta-item">
                    <span class="${categoryClass}">●</span>
                    <span>${escapeHtml(project.category)}</span>
                </div>
                ${project.version ? `<div class="meta-item">v${escapeHtml(project.version)}</div>` : ''}
            </div>
            ${project.tags && project.tags.length ? `<div class="project-tags">${project.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            <div class="project-footer">
                <span class="last-updated">Updated: ${formatDate(project.lastUpdated)}</span>
                <div class="footer-actions">
                    <button class="view-details" type="button" onclick="event.stopPropagation()">View Details</button>
                    <a href="contact.html?project=${encodeURIComponent(project.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}" 
                       class="btn-feedback" 
                       title="Send feedback about this project"
                       onclick="event.stopPropagation()">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                    </a>
                </div>
            </div>
        `;

        card.addEventListener('click', () => openProjectModal(project));
        const viewDetailsBtn = card.querySelector('.view-details');
        viewDetailsBtn.addEventListener('click', e => { e.stopPropagation(); openProjectModal(project); });
        return card;
    }

    function renderProjects(projectsToRender) {
        projectsGrid.innerHTML = '';
        if (!projectsToRender.length) {
            noResults.style.display = 'block';
            return;
        }
        noResults.style.display = 'none';
        projectsToRender.forEach((p, i) => projectsGrid.appendChild(createProjectCard(p, i)));
        // After rendering, initialize effects (defined in ui-effects.js) if available
        if (window.initUiEffects) window.initUiEffects();
    }

    function openProjectModal(project) {
        const statusClass = `status-${project.status.toLowerCase()}`;
        const categoryClass = `category-${project.category.toLowerCase()}`;
        const safeUrl = isValidProjectUrl(project.url) ? escapeHtml(project.url) : null;
        modalBody.innerHTML = `
            <div class="project-header" style="margin-bottom: 1.5rem;">
                <div>
                    <h2 class="project-title" style="font-size: 1.75rem; margin-bottom: 0.5rem;">${escapeHtml(project.name)}</h2>
                    ${safeUrl ? `<a href="${safeUrl}" class="project-url" target="_blank" rel="noopener noreferrer" style="font-size: 1rem;">View live project</a>` : `<span class="project-url invalid-url" style="font-size:1rem;">URL unavailable</span>`}
                </div>
                <span class="project-status ${statusClass}">${escapeHtml(project.status)}</span>
            </div>
            <div style="margin-bottom: 1.5rem;">
                <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase;">Description</h3>
                <p style="color: var(--text-primary); line-height: 1.6;">${escapeHtml(project.description)}</p>
            </div>
            <div class="project-meta" style="margin-bottom: 1.5rem;">
                <div class="meta-item">
                    <span class="${categoryClass}">●</span>
                    <span>${escapeHtml(project.category)}</span>
                </div>
                ${project.version ? `<div class="meta-item">Version: ${escapeHtml(project.version)}</div>` : ''}
                <div class="meta-item">Updated: ${formatDate(project.lastUpdated)}</div>
            </div>
            ${project.tags && project.tags.length ? `<div style="margin-bottom: 1.5rem;">
                <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase;">Tags</h3>
                <div class="project-tags">${project.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
            </div>` : ''}
            ${project.updates && project.updates.length ? `<div style="margin-bottom:1.5rem;">
                <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase;">Recent Updates</h3>
                <ul style="list-style:none; padding:0;">
                    ${project.updates.slice(0,5).map(u => `<li style="padding:0.75rem; background: var(--bg-card); border-radius:0.5rem; margin-bottom:0.5rem;">
                        <div style="color: var(--text-primary); margin-bottom:0.25rem;">${escapeHtml(u.message)}</div>
                        <div style="color: var(--text-muted); font-size:0.8rem;">${formatDate(u.date)}</div>
                    </li>`).join('')}
                </ul>
            </div>` : ''}
            <div style="display:flex; gap:1rem; margin-top:2rem;">
                ${safeUrl ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="view-details" style="text-decoration:none; flex:1; text-align:center;">Visit Project</a>` : ''}
                ${project.repository ? `<a href="${escapeHtml(project.repository)}" target="_blank" rel="noopener noreferrer" class="view-details" style="text-decoration:none; flex:1; text-align:center; background: var(--bg-card);">View Repository</a>` : ''}
            </div>
        `;
        modal.style.display = 'block';
        if (window.activateFocusTrap) window.activateFocusTrap(modal);
    }

    function updateStats(projectsToCount) {
        totalProjectsEl.textContent = projects.length;
        activeProjectsEl.textContent = projects.filter(p => p.status.toLowerCase() === 'active').length;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        recentUpdatesEl.textContent = projects.filter(p => new Date(p.lastUpdated) > thirtyDaysAgo).length;
    }

    // Simple fuzzy / weighted search ranking
    function rankProjects(list, term) {
        if (!term) return list;
        const t = term.toLowerCase();
        return list.map(p => {
            let score = 0;
            if (p.name.toLowerCase().includes(t)) score += 3;
            if (p.description.toLowerCase().includes(t)) score += 1;
            if (p.tags && p.tags.some(tag => tag.toLowerCase().includes(t))) score += 2;
            // partial matching boost
            if (!p.name.toLowerCase().includes(t) && p.name.toLowerCase().split(/\s+/).some(w => w.startsWith(t))) score += 1;
            return { project: p, score };
        }).sort((a,b) => b.score - a.score).map(x => x.project);
    }

    function filterProjects() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        const category = filterCategory.value;
        const status = filterStatus.value;
        filteredProjects = projects.filter(project => {
            const matchesSearch = !searchTerm || project.name.toLowerCase().includes(searchTerm) || project.description.toLowerCase().includes(searchTerm) || (project.tags && project.tags.some(tag => tag.toLowerCase().includes(searchTerm)));
            const matchesCategory = category === 'all' || project.category.toLowerCase() === category;
            const matchesStatus = status === 'all' || project.status.toLowerCase() === status;
            return matchesSearch && matchesCategory && matchesStatus;
        });
        filteredProjects = rankProjects(filteredProjects, searchTerm);
        renderProjects(filteredProjects);
    }

    // Close modal handler (focus return handled in interactions.js focus trap cleanup)
    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        if (window.deactivateFocusTrap) window.deactivateFocusTrap();
    });
    window.addEventListener('click', e => { if (e.target === modal) { modal.style.display = 'none'; if (window.deactivateFocusTrap) window.deactivateFocusTrap(); } });

    // Expose globals
    window.renderProjects = renderProjects;
    window.filterProjects = filterProjects;
    window.updateStats = updateStats;
    window.openProjectModal = openProjectModal;
})();

/**
 * GlobalDeets Platform Detail Modal System
 * Interactive platform deep-dive dialogs
 * Phase 3: UX Polish
 */

(function() {
    'use strict';

    // Platform data - expandable as new platforms are added
    const platformData = {
        'kaiser-permanente': {
            title: 'Kaiser Permanente Strategic Globalization',
            category: 'Healthcare Analytics',
            categoryColor: '#10b981',
            description: 'Real-time dashboard tracking 433K+ employees across 50+ countries with $110B+ in international revenue visibility.',
            fullDescription: 'This platform provides comprehensive business intelligence for Kaiser Permanente\'s global operations, tracking workforce distribution, revenue patterns, and strategic expansion opportunities across the healthcare sector.',
            stats: [
                { label: 'Total Employees Tracked', value: '433,215', color: '#8b5cf6' },
                { label: 'International Revenue', value: '$110B+', color: '#6366f1' },
                { label: 'Geographic Markets', value: '50+', color: '#60a5fa' },
                { label: 'Data Sources', value: '247', color: '#a78bfa' },
                { label: 'Daily Updates', value: '1.2M+', color: '#10b981' },
                { label: 'Query Performance', value: '<100ms', color: '#f59e0b' }
            ],
            technologies: [
                { name: 'DuckDB', description: 'Sub-second query performance on 433K+ records' },
                { name: 'Claude Sonnet 4.5', description: 'Natural language insights generation' },
                { name: 'GPT-4', description: 'Multi-dimensional pattern recognition' },
                { name: 'Public Data', description: '100% ethically sourced government datasets' }
            ],
            insights: [
                {
                    title: 'Workforce Distribution',
                    content: 'Analysis reveals 67% concentration in North America with emerging growth in APAC markets (23% YoY increase).'
                },
                {
                    title: 'Revenue Patterns',
                    content: '$110B+ tracked across subsidiaries with healthcare services representing 78% of international revenue.'
                },
                {
                    title: 'Strategic Opportunities',
                    content: 'Data indicates 15 untapped markets with healthcare infrastructure gaps matching KP capabilities.'
                }
            ],
            methodology: 'Data sourced from Department of Labor, SEC EDGAR filings, WHO health statistics, and international business registries. All information is publicly available and ethically collected. DuckDB provides real-time aggregation with sub-100ms query latency.',
            liveUrl: 'https://kp-strategic-globalization.netlify.app',
            lastUpdated: '2026-02-05'
        }
        // Add more platforms here as they're created
    };

    // ============================================
    // MODAL CLASS
    // ============================================

    class PlatformModal {
        constructor() {
            this.modal = null;
            this.currentPlatform = null;
            this.init();
        }

        init() {
            // Create modal structure
            this.modal = document.createElement('div');
            this.modal.className = 'platform-modal';
            this.modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <button class="modal-close" aria-label="Close modal">&times;</button>
                    </div>
                    <div class="modal-body"></div>
                </div>
            `;
            document.body.appendChild(this.modal);

            // Event listeners
            this.modal.querySelector('.modal-close').addEventListener('click', () => this.close());
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.close();
            });

            // ESC key to close
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                    this.close();
                }
            });

            // Attach click handlers to platform elements
            this.attachHandlers();
        }

        attachHandlers() {
            // Handle clicks on "View Sample Insights" buttons
            document.querySelectorAll('[data-platform-modal]').forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    const platformId = button.getAttribute('data-platform-modal');
                    this.open(platformId);
                });
            });

            // Handle clicks on metadata badges
            document.querySelectorAll('.meta-badge').forEach(badge => {
                badge.addEventListener('click', (e) => {
                    e.preventDefault();
                    const platformId = badge.closest('[data-platform-id]')?.getAttribute('data-platform-id');
                    if (platformId) {
                        this.open(platformId);
                    }
                });
            });
        }

        open(platformId) {
            const data = platformData[platformId];
            if (!data) {
                console.warn(`Platform data not found for: ${platformId}`);
                return;
            }

            this.currentPlatform = platformId;
            this.render(data);
            this.modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        }

        close() {
            this.modal.classList.remove('active');
            document.body.style.overflow = ''; // Restore scroll
            this.currentPlatform = null;
        }

        render(data) {
            const header = this.modal.querySelector('.modal-header');
            const body = this.modal.querySelector('.modal-body');

            // Update header
            header.innerHTML = `
                <div style="padding-right: 3rem;">
                    <span class="platform-category-badge" style="background: ${data.categoryColor}22; color: ${data.categoryColor};">
                        ${data.category}
                    </span>
                    <h2 class="modal-platform-title">${data.title}</h2>
                    <p style="color: rgba(255,255,255,0.7); margin-top: 0.5rem;">${data.description}</p>
                </div>
                <button class="modal-close" aria-label="Close modal">&times;</button>
            `;

            // Re-attach close button listener (since we replaced innerHTML)
            header.querySelector('.modal-close').addEventListener('click', () => this.close());

            // Build body content
            let bodyHTML = `
                <div style="margin-bottom: 2rem;">
                    <p style="color: rgba(255,255,255,0.85); font-size: 1.0625rem; line-height: 1.7;">
                        ${data.fullDescription}
                    </p>
                </div>

                <div style="margin: 2.5rem 0;">
                    <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem;">Platform Statistics</h3>
                    <div class="modal-platform-stats">
                        ${data.stats.map(stat => `
                            <div class="modal-stat">
                                <div class="modal-stat-label">${stat.label}</div>
                                <div class="modal-stat-value" style="color: ${stat.color};">${stat.value}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin: 2.5rem 0;">
                    <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem;">Technology Stack</h3>
                    <div style="display: grid; gap: 1rem;">
                        ${data.technologies.map(tech => `
                            <div style="padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                                <h4 style="font-weight: 600; color: ${data.categoryColor}; margin-bottom: 0.5rem;">${tech.name}</h4>
                                <p style="color: rgba(255,255,255,0.7); font-size: 0.9375rem;">${tech.description}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin: 2.5rem 0;">
                    <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem;">Key Insights</h3>
                    <div style="display: grid; gap: 1.5rem;">
                        ${data.insights.map(insight => `
                            <div style="padding: 1.5rem; background: rgba(0,0,0,0.3); border-left: 3px solid ${data.categoryColor}; border-radius: 8px;">
                                <h4 style="font-weight: 600; color: rgba(255,255,255,0.95); margin-bottom: 0.75rem; font-size: 1.0625rem;">${insight.title}</h4>
                                <p style="color: rgba(255,255,255,0.75); line-height: 1.6;">${insight.content}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="margin: 2.5rem 0; padding: 1.5rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <h4 style="font-weight: 600; margin-bottom: 0.75rem; color: rgba(255,255,255,0.9);">📊 Data Methodology</h4>
                    <p style="color: rgba(255,255,255,0.7); line-height: 1.6; font-size: 0.9375rem;">${data.methodology}</p>
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.875rem; color: rgba(255,255,255,0.6);">
                        Last updated: ${data.lastUpdated}
                    </div>
                </div>

                <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                    <a href="${data.liveUrl}" target="_blank" rel="noopener" class="btn-launch" style="text-decoration: none;">
                        Launch Live Platform →
                    </a>
                    <button class="modal-close-footer" style="flex: 0.4; padding: 0.875rem 1.5rem; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.9); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s ease;">
                        Close
                    </button>
                </div>
            `;

            body.innerHTML = bodyHTML;

            // Attach close button listener for footer close button
            body.querySelector('.modal-close-footer').addEventListener('click', () => this.close());
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        console.log('🎭 Initializing Platform Modal System...');
        new PlatformModal();
        console.log('✅ Modal system ready');
    }

    init();

})();

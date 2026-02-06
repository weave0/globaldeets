/**
 * GlobalDeets UX Animations
 * Count-up animations, scroll reveals, parallax effects
 * Phase 3: Best-in-class UX implementation
 */

(function() {
    'use strict';

    // ============================================
    // COUNT-UP ANIMATION
    // ============================================

    class CountUpAnimation {
        constructor(element, target, duration = 2000, suffix = '') {
            this.element = element;
            this.target = target;
            this.duration = duration;
            this.suffix = suffix;
            this.hasAnimated = false;
        }

        easeOutQuart(t) {
            return 1 - Math.pow(1 - t, 4);
        }

        animate() {
            if (this.hasAnimated) return;
            this.hasAnimated = true;

            const startTime = performance.now();
            const startValue = 0;

            const updateCount = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / this.duration, 1);
                const easedProgress = this.easeOutQuart(progress);
                const currentValue = Math.floor(easedProgress * this.target);

                this.element.textContent = this.formatNumber(currentValue) + this.suffix;

                if (progress < 1) {
                    requestAnimationFrame(updateCount);
                } else {
                    this.element.textContent = this.formatNumber(this.target) + this.suffix;
                }
            };

            requestAnimationFrame(updateCount);
        }

        formatNumber(num) {
            // Add commas for thousands
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }
    }

    // Initialize count-up animations
    function initCountUpAnimations() {
        const statElements = [
            { selector: '[data-count="433000"]', target: 433000, suffix: '+' },
            { selector: '[data-count="110000000000"]', target: 110, suffix: 'B+' }, // Display as 110B+
            { selector: '[data-count="615000000"]', target: 615, suffix: 'M+' }, // Display as 615M+
            { selector: '[data-count="5"]', target: 5, suffix: '' }
        ];

        const animations = statElements.map(stat => {
            const element = document.querySelector(stat.selector);
            if (element) {
                return new CountUpAnimation(element, stat.target, 2000, stat.suffix);
            }
            return null;
        }).filter(Boolean);

        // Trigger animations when stats come into view
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animations.forEach(animation => animation.animate());
                    observer.disconnect(); // Only animate once
                }
            });
        }, {
            threshold: 0.5
        });

        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid) {
            observer.observe(statsGrid);
        }
    }

    // ============================================
    // SCROLL REVEAL ANIMATIONS
    // ============================================

    function initScrollReveal() {
        const revealElements = document.querySelectorAll('.scroll-reveal');

        if (revealElements.length === 0) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    // Optional: disconnect after revealing to prevent re-animation
                    // observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });

        revealElements.forEach(element => {
            observer.observe(element);
        });
    }

    // ============================================
    // PARALLAX EFFECT
    // ============================================

    function initParallax() {
        const heroSection = document.querySelector('.hero-section');
        if (!heroSection) return;

        let ticking = false;

        function updateParallax() {
            const scrolled = window.pageYOffset;
            const heroRect = heroSection.getBoundingClientRect();
            const heroTop = heroRect.top + scrolled;

            // Only apply parallax when hero is in view
            if (scrolled > heroTop - window.innerHeight && scrolled < heroTop + heroRect.height) {
                const offset = (scrolled - heroTop) * 0.4; // Parallax speed multiplier
                heroSection.style.setProperty('--parallax-offset', `${offset}px`);
            }

            ticking = false;
        }

        function requestTick() {
            if (!ticking) {
                requestAnimationFrame(updateParallax);
                ticking = true;
            }
        }

        window.addEventListener('scroll', requestTick, { passive: true });

        // Apply parallax transform via custom property
        const style = document.createElement('style');
        style.textContent = `
            .hero-section::before {
                transform: translateY(var(--parallax-offset, 0)) rotate(0deg);
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================
    // SMOOTH SCROLL ENHANCEMENTS
    // ============================================

    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#' || href === '#!') return;

                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    // ============================================
    // HOVER ENHANCEMENTS
    // ============================================

    function initHoverEffects() {
        // Add subtle tilt effect on industry cards
        const industryCards = document.querySelectorAll('.industry-card');

        industryCards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = (y - centerY) / 30;
                const rotateY = (centerX - x) / 30;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = '';
            });
        });
    }

    // ============================================
    // PERFORMANCE MONITORING
    // ============================================

    function monitorPerformance() {
        if (window.performance && window.performance.timing) {
            window.addEventListener('load', () => {
                const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
                console.log(`🚀 Page loaded in ${loadTime}ms`);

                if (loadTime > 3000) {
                    console.warn('⚠️ Page load time exceeds 3 seconds - consider optimization');
                }
            });
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function init() {
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        console.log('🎨 Initializing GlobalDeets UX animations...');

        // Initialize all animation systems
        initCountUpAnimations();
        initScrollReveal();
        initParallax();
        initSmoothScroll();
        initHoverEffects();
        monitorPerformance();

        console.log('✅ UX animations ready');
    }

    // Start initialization
    init();

})();

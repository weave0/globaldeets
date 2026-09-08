/**
 * GFD Ecosystem Navigation Component JavaScript
 * Handles dropdown toggle, accessibility, keyboard navigation, and GlobalDeets evidence discovery.
 */

(function () {
  'use strict';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
  } else {
    initNavigation();
  }

  function initNavigation() {
    initEvidenceDossierLink();
    initEcosystemNav();
  }

  function initEvidenceDossierLink() {
    const path = window.location.pathname.replace(/\/$/, '');
    if (path !== '/news' && path !== '/news.html') return;

    const primaryNav = document.querySelector('.primary-nav');
    if (!primaryNav || primaryNav.querySelector('[data-evidence-dossier-link]')) return;

    const link = document.createElement('a');
    link.href = '/dossiers/santa-ynez-pipeline/';
    link.className = 'nav-icon-btn';
    link.title = 'Evidence Dossier — Santa Ynez Pipeline';
    link.setAttribute('aria-label', 'Evidence Dossier — Santa Ynez Pipeline');
    link.setAttribute('data-evidence-dossier-link', 'santa-ynez-pipeline');
    link.textContent = '◇';

    const newsLink = primaryNav.querySelector('a[href="news.html"], a[href="/news"]');
    if (newsLink) newsLink.insertAdjacentElement('afterend', link);
    else primaryNav.appendChild(link);
  }

  function initEcosystemNav() {
    const nav = document.querySelector('.gfd-ecosystem-nav');
    if (!nav) return;

    const toggleButton = nav.querySelector('.ecosystem-toggle');
    const dropdown = nav.querySelector('.ecosystem-dropdown');
    let backdrop = document.querySelector('.ecosystem-backdrop');

    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'ecosystem-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
    }

    if (!toggleButton || !dropdown) return;

    let isOpen = false;

    function toggleDropdown(open) {
      isOpen = typeof open === 'boolean' ? open : !isOpen;

      dropdown.classList.toggle('active', isOpen);
      backdrop.classList.toggle('active', isOpen);
      nav.classList.toggle('menu-open', isOpen);
      toggleButton.setAttribute('aria-expanded', isOpen);
      dropdown.setAttribute('aria-hidden', !isOpen);

      if (isOpen) {
        const firstLink = dropdown.querySelector('.nav-link');
        if (firstLink) {
          setTimeout(() => firstLink.focus(), 100);
        }
      }
    }

    toggleButton.addEventListener('click', () => {
      toggleDropdown();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen) {
        toggleDropdown(false);
        toggleButton.focus();
      }
    });

    document.addEventListener('click', e => {
      if (isOpen && !nav.contains(e.target)) {
        toggleDropdown(false);
      }
    });

    backdrop.addEventListener('click', () => {
      if (isOpen) {
        toggleDropdown(false);
        toggleButton.focus();
      }
    });

    const navLinks = dropdown.querySelectorAll('.nav-link, .nav-cta-link');

    dropdown.addEventListener('keydown', e => {
      if (!isOpen) return;

      const focusedIndex = Array.from(navLinks).indexOf(document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (focusedIndex + 1) % navLinks.length;
        navLinks[nextIndex].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (focusedIndex - 1 + navLinks.length) % navLinks.length;
        navLinks[prevIndex].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        navLinks[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        navLinks[navLinks.length - 1].focus();
      }
    });

    const currentHostname = window.location.hostname;
    navLinks.forEach(link => {
      try {
        const linkHostname = new URL(link.href).hostname;
        if (linkHostname === currentHostname) {
          link.classList.add('current-site');
          link.setAttribute('aria-current', 'page');
          link.style.background = 'rgba(139, 92, 246, 0.12)';
          link.style.borderColor = 'rgba(139, 92, 246, 0.3)';
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    toggleButton.addEventListener('click', () => {
      if (window.gtag) {
        window.gtag('event', 'ecosystem_nav_toggle', {
          event_category: 'Navigation',
          event_label: isOpen ? 'Open' : 'Close',
        });
      }
    });

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.gtag) {
          const destination = link.querySelector('.nav-link-title')?.textContent || 'Unknown';
          window.gtag('event', 'ecosystem_nav_click', {
            event_category: 'Navigation',
            event_label: destination,
            transport_type: 'beacon',
          });
        }
      });
    });
  }
})();

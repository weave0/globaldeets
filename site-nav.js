/**
 * GlobalDeets — shared primary navigation behavior (GD-038)
 * The "More" menu is a native <details> disclosure, so it works without JavaScript. This adds the
 * expected dismissal behavior: Escape closes it and returns focus to its toggle, and a click or
 * focus move outside closes it.
 */
(function () {
  'use strict';

  function init() {
    const menus = document.querySelectorAll('details.nav-more');
    menus.forEach(menu => {
      const toggle = menu.querySelector('summary');
      menu.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !menu.open) return;
        menu.open = false;
        toggle?.focus();
      });
      menu.addEventListener('focusout', event => {
        if (menu.open && event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
      });
    });
    document.addEventListener('click', event => {
      menus.forEach(menu => {
        if (menu.open && !menu.contains(event.target)) menu.open = false;
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

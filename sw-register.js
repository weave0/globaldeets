// Lightweight service worker registration for all pages.
// The script URL is root-absolute. A relative "service-worker.js" from
// /story/santa-ynez-pipeline/ would look for a worker in that directory.
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .catch(err => console.warn('SW registration failed', err));
    });
  }
})();

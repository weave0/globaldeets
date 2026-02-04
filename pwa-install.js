// PWA Installation Prompt Handler
// Enhances user experience by prompting to install the app
// Tracks install events and provides UI feedback

(function() {
  let deferredPrompt;
  const installButton = document.getElementById('installPWA');
  const installBanner = document.getElementById('installBanner');
  
  // Listen for beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show install button/banner if elements exist
    if (installButton) {
      installButton.style.display = 'block';
      installButton.removeAttribute('hidden');
    }
    if (installBanner) {
      installBanner.classList.remove('hidden');
      installBanner.style.display = 'flex';
    }
    
    console.log('⬇️ PWA install prompt available');
  });

  // Handle install button click
  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) {
        console.log('❌ Install prompt not available');
        return;
      }
      
      // Show the install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`👤 User response: ${outcome}`);
      
      if (outcome === 'accepted') {
        if (window.showToast) {
          window.showToast('Installing GlobalDeets...', 'success');
        }
      } else {
        if (window.showToast) {
          window.showToast('Install cancelled', 'info');
        }
      }
      
      // Clear the deferredPrompt
      deferredPrompt = null;
      
      // Hide install UI
      if (installButton) installButton.style.display = 'none';
      if (installBanner) installBanner.classList.add('hidden');
    });
  }

  // Handle banner dismiss
  const dismissBanner = document.getElementById('dismissInstall');
  if (dismissBanner && installBanner) {
    dismissBanner.addEventListener('click', () => {
      installBanner.classList.add('hidden');
      // Store preference to not show again for 7 days
      localStorage.setItem('installBannerDismissed', Date.now());
    });
  }

  // Check if banner was recently dismissed
  if (installBanner) {
    const dismissed = localStorage.getItem('installBannerDismissed');
    if (dismissed) {
      const daysSince = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        installBanner.classList.add('hidden');
      }
    }
  }

  // Listen for app installed event
  window.addEventListener('appinstalled', (evt) => {
    console.log('✅ PWA installed successfully');
    if (window.showToast) {
      window.showToast('GlobalDeets installed! Launch from home screen.', 'success');
    }
    
    // Hide install UI
    if (installButton) installButton.style.display = 'none';
    if (installBanner) installBanner.classList.add('hidden');
    
    // Track installation (optional analytics)
    if (window.gtag) {
      gtag('event', 'pwa_install', {
        event_category: 'engagement',
        event_label: 'PWA Install',
      });
    }
  });

  // Detect if running as installed PWA
  function isStandalone() {
    return (window.matchMedia('(display-mode: standalone)').matches) || 
           (window.navigator.standalone) || 
           document.referrer.includes('android-app://');
  }

  if (isStandalone()) {
    console.log('🚀 Running as installed PWA');
    // Hide install prompts when already installed
    if (installButton) installButton.style.display = 'none';
    if (installBanner) installBanner.classList.add('hidden');
    
    // Add standalone class for potential styling
    document.body.classList.add('pwa-standalone');
  }

  // Expose utility for checking install status
  window.isPWAInstalled = isStandalone;

})();

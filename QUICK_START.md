# 🎯 GlobalDeets Quick Reference

## 🚀 Getting Started

```bash
# Install dependencies (optional, for icon generation)
npm install

# Start development server
npm start
# → http://localhost:5500

# Generate PNG icons from SVG
npm run generate-icons

# Lint & format code
npm run build
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Focus search |
| `Ctrl/Cmd + T` | Toggle theme |
| `Tab` | Navigate elements |
| `Shift + Tab` | Navigate backwards |
| `Arrow Keys` | Navigate icon buttons |
| `Enter` or `Space` | Activate button/link |
| `Escape` | Close modal/dismiss |

---

## 📁 File Reference

### HTML Pages
- `index.html` - Main landing page with project grid
- `analytics.html` - Analytics dashboard with charts
- `categories.html` - Categorized project view
- `timeline.html` - Chronological timeline
- `bb-content.html` - Business platform showcase
- `offline.html` - PWA offline fallback

### JavaScript
- `projects-data.js` - **Edit this!** Your project database
- `projects-render.js` - Rendering & filtering logic
- `ui-effects.js` - Visual effects (particles, tilt, parallax)
- `interactions.js` - Keyboard & accessibility handlers
- `app.js` - Main orchestrator
- `auth.js` - Authentication utilities
- `data.js` - BB-content data & Chart.js logic
- `pwa-install.js` - PWA install prompt handler
- `sw-register.js` - Service worker registration
- `service-worker.js` - Offline caching strategy

### Styles
- `styles.css` - Global styles, themes, animations

### Config
- `manifest.json` - PWA manifest
- `package.json` - NPM scripts & dependencies

### Assets
- `assets/icon-*.svg` - App icons (72-512px)
- `assets/screenshot-*.svg` - PWA screenshots

---

## 🎨 Customization Quick Guide

### Change Theme Colors

Edit `styles.css`:

```css
:root {
  --primary: #3b82f6;      /* Change primary color */
  --accent: #8b5cf6;       /* Change accent color */
}
```

### Add a New Project

Edit `projects-data.js`:

```javascript
projects.push({
  name: "New Project",
  url: "https://example.com",
  description: "Project description",
  category: "Development", // or Creative, Business, Experimental
  status: "Active",        // or Beta, Maintenance, Archived
  tags: ["tag1", "tag2"],
  lastUpdated: "2025-11-23"
});
```

### Disable UI Effects

Edit `ui-effects.js` or remove script tag from HTML:

```javascript
// Comment out in initUiEffects():
// init3DTilt();          // Disable card tilt
// initParticles();       // Disable particles
// initParallax();        // Disable parallax
```

### Update Service Worker Cache

Edit `service-worker.js`:

```javascript
const CACHE_NAME = 'globaldeets-cache-v3'; // Increment version
```

---

## ♿ Accessibility Features

- ✅ Skip links (Tab on page load)
- ✅ ARIA landmarks & labels
- ✅ Keyboard navigation (no mouse required)
- ✅ Screen reader announcements
- ✅ Reduced motion support
- ✅ Focus indicators
- ✅ Semantic HTML

---

## 📱 PWA Features

- ✅ Install banner (dismissible, 7-day cooldown)
- ✅ Offline support
- ✅ Add to home screen
- ✅ Splash screen
- ✅ Theme color integration
- ✅ Background sync

---

## 🔍 Testing Checklist

### Local Testing
- [ ] Open all 5 HTML pages
- [ ] Test search & filtering
- [ ] Toggle grid/list view
- [ ] Switch theme (dark/light)
- [ ] Test keyboard navigation
- [ ] Open project details modal
- [ ] Test on mobile viewport (DevTools)

### PWA Testing
- [ ] Open DevTools → Application
- [ ] Check Service Workers (should be activated)
- [ ] Check Manifest (should show icons)
- [ ] Toggle "Offline" in Network tab
- [ ] Navigate pages offline
- [ ] Click "Install app" in Lighthouse

### Accessibility Testing
- [ ] Run Lighthouse accessibility audit
- [ ] Tab through all pages (keyboard only)
- [ ] Test with screen reader (NVDA/JAWS)
- [ ] Check color contrast
- [ ] Test with `prefers-reduced-motion` enabled

---

## 🚨 Common Issues & Fixes

### Service Worker Not Updating
```javascript
// Increment version in service-worker.js
const CACHE_NAME = 'globaldeets-cache-v3';
// Then hard refresh (Ctrl+Shift+R)
```

### Theme Not Persisting
- Check browser isn't in private/incognito mode
- Verify localStorage not disabled
- Check browser console for errors

### Charts Not Rendering
- Verify Chart.js CDN loaded (Network tab)
- Check console for errors
- Ensure canvas IDs match data.js

### PWA Not Installable
- Must be served over HTTPS (or localhost)
- Check manifest.json is valid
- Verify icons exist and are accessible
- Run Lighthouse PWA audit for details

---

## 📊 File Sizes (Approximate)

| File | Size | Cacheable |
|------|------|-----------|
| index.html | ~18 KB | Yes |
| styles.css | ~45 KB | Yes |
| projects-data.js | ~5 KB | Yes |
| interactions.js | ~8 KB | Yes |
| ui-effects.js | ~6 KB | Yes |
| service-worker.js | ~2 KB | No |
| manifest.json | ~1 KB | Yes |

**Total (core)**: ~85 KB (uncompressed)  
**With gzip**: ~20 KB

---

## 🔗 Quick Links

- [Full Documentation](README.md)
- [Deployment Checklist](DEPLOYMENT_CHECKLIST.md)
- [Production Ready Summary](PRODUCTION_READY.md)
- [Implementation Details](IMPLEMENTATION_SUMMARY.md)
- [Development Guide](DEVELOPMENT.md)

---

## 🆘 Support

### Resources
- **PWA Docs**: https://web.dev/progressive-web-apps/
- **Accessibility**: https://www.w3.org/WAI/WCAG21/quickref/
- **Chart.js**: https://www.chartjs.org/docs/

### Debugging
```bash
# Check for JS errors
# → DevTools Console

# Check service worker status
# → DevTools > Application > Service Workers

# Check manifest
# → DevTools > Application > Manifest

# Run accessibility audit
# → DevTools > Lighthouse > Accessibility

# Test PWA installability
# → DevTools > Lighthouse > Progressive Web App
```

---

**Last Updated**: November 23, 2025  
**Version**: 2.0.0

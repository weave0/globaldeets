# 🚀 Production Deployment Checklist

## Pre-Deployment Validation

### 1. **Dependencies & Assets**
- [ ] All script files present and loading correctly
  - `projects-data.js`, `projects-render.js`, `ui-effects.js`, `interactions.js`
  - `app.js`, `auth.js`, `data.js`, `pwa-install.js`, `sw-register.js`
- [ ] All HTML pages have consistent structure
  - Skip links, ARIA landmarks, semantic HTML
  - PWA meta tags (manifest, theme-color, icons)
  - Footer with theme toggle & scroll-to-top
- [ ] CSS fully loaded (`styles.css`)
  - All UI effects classes present (ripple, btn-press, toast, etc.)
  - Reduced motion support active
  - Light/dark theme focus styles

### 2. **PWA Requirements**
- [ ] Generate PNG icons from SVG
  ```bash
  npm run generate-icons
  ```
  Or manually convert `assets/icon-base.svg` to PNG at sizes: 72, 96, 128, 144, 152, 192, 384, 512
  
- [ ] Update `manifest.json` if using PNG instead of SVG
  ```json
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
  ```

- [ ] Test service worker registration
  - Open DevTools → Application → Service Workers
  - Verify CACHE_NAME version matches current deployment
  - Check all assets cached successfully

- [ ] Test offline functionality
  - Disconnect network
  - Navigate to different pages
  - Verify offline.html appears for uncached routes

### 3. **Accessibility Validation**
- [ ] Run Lighthouse accessibility audit (target: 95+)
- [ ] Test keyboard navigation
  - Tab through all interactive elements
  - Arrow keys work on navigation icons
  - Enter/Space activate buttons
  - Skip link functional (press Tab on page load)
- [ ] Test with screen reader (NVDA/JAWS/VoiceOver)
  - All images have alt text
  - ARIA labels present and descriptive
  - Live regions announce changes (toast, section switches)
- [ ] Verify ARIA attributes
  - `aria-current="page"` on active nav links
  - `role="navigation"` on nav containers
  - `aria-live="polite"` on toast and announcer regions

### 4. **Performance Optimization**
- [ ] Run Lighthouse performance audit (target: 90+)
- [ ] Minify production assets
  ```bash
  # Install terser & clean-css-cli
  npm install -D terser clean-css-cli
  
  # Minify JS
  npx terser interactions.js -o interactions.min.js -c -m
  npx terser ui-effects.js -o ui-effects.min.js -c -m
  npx terser data.js -o data.min.js -c -m
  npx terser pwa-install.js -o pwa-install.min.js -c -m
  
  # Minify CSS
  npx cleancss -o styles.min.css styles.css
  ```
  Update script tags to `.min.js` and link to `.min.css`

- [ ] Optimize images
  - Compress PNG icons (use tinypng.com or imagemin)
  - Ensure SVGs are optimized (use svgo)

- [ ] Enable compression on server
  - Gzip or Brotli compression for text files
  - Cache headers for static assets (1 year for versioned, 1 hour for HTML)

### 5. **Browser Compatibility**
Test in:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (macOS/iOS)
- [ ] Mobile browsers (Chrome Android, Safari iOS)

Verify:
- [ ] Glassmorphism effects render correctly
- [ ] CSS Grid/Flexbox layouts work
- [ ] Service worker installs (not on iOS < 11.3)
- [ ] Theme toggle persists in localStorage

### 6. **Functionality Testing**
- [ ] **index.html**: Projects grid/list toggle, filtering, modal
- [ ] **analytics.html**: Charts render (Chart.js CDN available)
- [ ] **categories.html**: Category filtering, project cards
- [ ] **timeline.html**: Timeline display, sorting
- [ ] **bb-content.html**: Section switching, keyboard nav, assessment/ROI forms
- [ ] Theme toggle works across all pages
- [ ] Scroll-to-top button appears after scroll
- [ ] Toast notifications display correctly
- [ ] PWA install prompt appears (if not installed)

### 7. **Security & Privacy**
- [ ] HTTPS enforced (required for service workers)
- [ ] Content Security Policy (CSP) configured
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
  ```
- [ ] No sensitive data in client-side code
- [ ] External CDN resources use SRI (Subresource Integrity)
  ```html
  <script src="https://cdn.jsdelivr.net/npm/chart.js" integrity="sha384-..." crossorigin="anonymous"></script>
  ```

### 8. **Analytics & Monitoring** (Optional)
- [ ] Add Google Analytics or privacy-friendly alternative
- [ ] Set up error tracking (Sentry, LogRocket)
- [ ] Monitor Core Web Vitals
- [ ] Track PWA install events (already in pwa-install.js)

### 9. **SEO Optimization**
- [ ] Meta descriptions on all pages (✅ already added)
- [ ] Open Graph tags for social sharing
  ```html
  <meta property="og:title" content="GlobalDeets - Premium Portfolio">
  <meta property="og:description" content="Exclusive showcase of enterprise capabilities">
  <meta property="og:image" content="https://www.globaldeets.com/assets/og-image.png">
  <meta property="og:url" content="https://www.globaldeets.com">
  ```
- [ ] Twitter Card tags
- [ ] Sitemap.xml generated
- [ ] Robots.txt configured
- [ ] Canonical URLs set

### 10. **Final Pre-Launch**
- [ ] Update `CACHE_NAME` in service-worker.js to new version
- [ ] Test PWA installability
  - Chrome: DevTools → Application → Manifest → "Add to homescreen"
  - Verify icons, name, colors display correctly
- [ ] Run final audit suite
  ```bash
  npm run lint
  npm run format
  ```
- [ ] Backup current production version
- [ ] Set up rollback plan

---

## Deployment Commands

### Static Hosting (Netlify/Vercel/GitHub Pages)

```bash
# Build optimized assets
npm run build

# Deploy to Netlify
npx netlify-cli deploy --prod

# Deploy to Vercel  
npx vercel --prod

# Deploy to GitHub Pages
git push origin main
```

### Manual Server Deploy

```bash
# Upload files via FTP/SFTP
# Ensure server serves:
# - index.html as default document
# - Correct MIME types (manifest.json → application/manifest+json)
# - HTTPS enabled
# - Compression enabled (gzip/brotli)

# Apache .htaccess example
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>

# Cache headers
<FilesMatch "\.(js|css|png|jpg|svg|woff2)$">
  Header set Cache-Control "max-age=31536000, public"
</FilesMatch>
```

---

## Post-Deployment Verification

1. **PWA Install Test**
   - Visit site on mobile Chrome/Edge
   - Verify install banner appears
   - Install app, check icon/splash screen
   - Test offline functionality

2. **Lighthouse Audit**
   - Performance: 90+
   - Accessibility: 95+
   - Best Practices: 95+
   - SEO: 90+
   - PWA: ✅ Installable

3. **Real User Monitoring**
   - Monitor install rate
   - Track Core Web Vitals
   - Check error logs for JS exceptions

4. **Cross-Device Testing**
   - Desktop (Windows/Mac/Linux)
   - Mobile (iOS/Android)
   - Tablet
   - Different screen sizes (320px → 2560px)

---

## Troubleshooting Common Issues

### Service Worker Not Updating
- Increment `CACHE_NAME` version in service-worker.js
- Hard refresh clients (Ctrl+Shift+R)
- Use "Update on reload" in DevTools during development

### Icons Not Displaying in PWA
- Verify PNG icons exist at all required sizes
- Check manifest.json paths are correct (relative to root)
- Ensure MIME type `image/png` served correctly
- Test with Lighthouse PWA audit

### Charts Not Rendering
- Check Chart.js CDN loaded (network tab)
- Verify canvas elements have IDs matching data.js
- Check browser console for Chart.js errors
- Ensure try/catch in data.js catches errors gracefully

### Theme Not Persisting
- Check localStorage not blocked (private browsing)
- Verify interactions.js loads before page render
- Test in incognito mode

### Accessibility Issues
- Run axe DevTools or WAVE extension
- Test with keyboard only (unplug mouse)
- Use screen reader to verify announcements
- Check color contrast (4.5:1 minimum)

---

**Ready to deploy!** 🎉

For questions or issues, review the implementation in:
- `README.md` - Project overview
- `DEVELOPMENT.md` - Development workflow  
- `IMPLEMENTATION_SUMMARY.md` - Technical details

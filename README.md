# GlobalDeets Landing Page

A modern, responsive, **accessible** landing page for showcasing all your GlobalDeets projects and subdomains.

## 🌟 Features

### Core Functionality

- **Project Showcase**: Display all your projects with descriptions, status, and tags
- **Smart Filtering**: Filter by category, status, or search by keywords with fuzzy ranking
- **Grid/List View Toggle**: Switch between card grid and detailed list layouts
- **Live Stats**: See total projects, active projects, and recent updates at a glance
- **Project Details Modal**: Accessible modal with focus trap and keyboard navigation
- **Easy Management**: Simple JavaScript file for adding/updating projects
- **Export Functionality**: Export your project list to JSON

### User Experience

- **Responsive Design**: Works perfectly on desktop, tablet, and mobile (320px → 2560px+)
- **Dark/Light Theme**: Toggle with persistent localStorage, theme-aware focus styles
- **Advanced UI Effects**: 3D card tilt, particle backgrounds, ripple clicks, parallax scrolling
- **Smooth Animations**: Reveal on scroll, section transitions (respects `prefers-reduced-motion`)
- **Toast Notifications**: Non-intrusive feedback for user actions
- **Scroll-to-Top**: Appears after scrolling, smooth return to top

### Progressive Web App (PWA)

- **Installable**: Add to home screen on mobile/desktop
- **Install Prompts**: Smart banner with dismiss tracking (7-day cooldown)
- **Offline Support**: Service worker with cache-first strategy + offline fallback page
- **Fast Loading**: Precached assets, background updates
- **App-like Experience**: Fullscreen mode, custom splash screen, theme color

### Accessibility (WCAG 2.1 AA+)

- **Semantic HTML**: `<main>`, `<nav>`, `<section>` with ARIA landmarks
- **Skip Links**: Jump to main content (keyboard users)
- **Screen Reader Support**: ARIA labels, live regions for dynamic updates
- **Keyboard Navigation**:
  - Tab through all interactive elements
  - Arrow keys navigate icon buttons
  - Enter/Space activate buttons
  - Ctrl+K search, Ctrl+T theme toggle, Escape close modals
- **Focus Management**: Visible focus indicators, theme-aware outlines, modal focus trapping
- **Active States**: `aria-current="page"` on navigation
- **Announcements**: Section changes, notifications announced to assistive tech

### Security

- **URL Validation**: XSS prevention on project URLs
- **Content Security Policy Ready**: Structure supports CSP headers
- **Error Handling**: Graceful degradation for failed CDN resources (Chart.js)

## 📁 Project Structure

```text
Globaldeets/
├── index.html                  # Main landing page
├── analytics.html              # Analytics dashboard  
├── categories.html             # Categorized project view
├── timeline.html               # Chronological timeline
├── bb-content.html             # Business platform showcase
├── offline.html                # PWA offline fallback
├── styles.css                  # Global styles & themes
├── projects-data.js            # Project database (edit this!)
├── projects-render.js          # Rendering & filtering logic
├── ui-effects.js               # Visual effects (particles, tilt, parallax)
├── interactions.js             # Accessibility & keyboard handlers
├── app.js                      # Main orchestrator
├── auth.js                     # Authentication utilities
├── data.js                     # BB-content data & Chart.js logic
├── pwa-install.js              # PWA install prompt handler
├── sw-register.js              # Service worker registration
├── service-worker.js           # Offline caching strategy
├── manifest.json               # PWA manifest
├── package.json                # Scripts & dependencies
├── generate-icons.js           # Icon generation utility
└── assets/
    ├── icon-*.svg              # App icons (72-512px)
    ├── screenshot-*.svg        # PWA screenshots
    └── README.md               # Asset documentation
```

## Brand & Icon Assets

All SVG icons are generated under `assets/` in multiple sizes (`72` → `512`). These are vector and maskable-safe (rounded rect background) with a multi-stop gradient reflecting the platform's spectrum (tech → creative → data → growth). Text layer "GD" remains centered with optical alignment adjustments.

Manifest currently points to SVG variants. For maximum cross-browser PWA install compatibility you may also export PNG versions. Recommended workflow:

1. Open `icon-base.svg` in a vector tool (Inkscape / Illustrator).
2. Export PNG renditions at sizes: 72, 96, 128, 144, 152, 192, 384, 512.
3. Replace or add them alongside existing SVGs and update `manifest.json` back to PNG types if wider device support is required.

Screenshots (`screenshot-wide.svg`, `screenshot-mobile.svg`) visually communicate key UI components for store / install prompts.

## Service Worker Strategy

Cache version `globaldeets-cache-v2` uses network-first for all `GET` requests, persisting successful responses for offline reuse. Navigation failures fall back to `offline.html`. Update the version when static assets or offline behavior changes.

## Icon Design Principles

- Rounded rectangle ensures safe maskable rendering on Android launchers.
- Central gradient circle + glow builds depth and brand recognition.
- High-contrast white glyph preserves legibility in light/dark contexts.
- Multi-size specific glyph scaling avoids cramped appearance at lower resolutions.

## Future Enhancements (Optional)

- Add workbox for smarter runtime caching & precache manifest.
- Generate PNG icons automatically via a build script (node-canvas or sharp).
- Add light-theme specific icon variant if desired.
- Integrate a simple diagnostics panel to show cache contents & SW status.

## 🚀 Quick Start

### 1. Add Your Projects

Edit `projects-data.js` and add your projects to the `projects` array:

```javascript
{
    name: "Project Name",
    url: "http://yourproject.globaldeets.com/",
    description: "Brief description of what this project does",
    category: "Development", // Development, Creative, Business, or Experimental
    status: "Active",        // Active, Beta, Maintenance, or Archived
    version: "1.0.0",
    tags: ["tag1", "tag2", "tag3"],
    lastUpdated: "2025-11-20",
    repository: "https://github.com/yourusername/projectname",
    updates: [
        {
            date: "2025-11-20",
            message: "Latest update description"
        }
    ]
}
```

### 2. Test Locally

#### Development Server

```bash
npm start
# Opens at http://localhost:5500
```

Or simply open `index.html` in your browser (file:// protocol).

#### Generate PNG Icons (Optional)

For maximum PWA compatibility across all devices:

```bash
npm run generate-icons
```

Requires `sharp` (install with `npm install sharp`). Alternatively, see manual conversion instructions in the script output or use online tools like [CloudConvert](https://cloudconvert.com/svg-to-png).

### 3. Pre-Deployment Checklist

**Essential tasks before going live:**

- [ ] Update all projects in `projects-data.js`
- [ ] Test all pages (index, analytics, categories, timeline, bb-content)
- [ ] Verify offline mode works (DevTools → Application → Service Workers → Offline)
- [ ] Run accessibility audit (Lighthouse → Accessibility score 95+)
- [ ] Test keyboard navigation (Tab, Arrow keys, Ctrl+K, Ctrl+T)
- [ ] Test PWA install prompt (Chrome → Install app)
- [ ] Update `CACHE_NAME` version in `service-worker.js`
- [ ] Enable HTTPS (required for service workers)

**Full deployment checklist:** See [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)

### 4. Deploy to Your Domain

Deploy the files to your web server at `www.globaldeets.com`:

#### Option A: Using FTP/SFTP

1. Connect to your web host via FTP/SFTP
2. Upload all files to your web root directory (usually `public_html` or `www`)

#### Option B: Using Git

```bash
# If your host supports Git deployment
git init
git add .
git commit -m "Initial GlobalDeets landing page"
git remote add origin <your-git-remote>
git push -u origin main
```

#### Option C: Using cPanel File Manager

1. Log into cPanel
2. Navigate to File Manager
3. Upload all files to `public_html`

## 🎨 Customization

### Colors

Edit the CSS variables in `styles.css` to match your brand:

```css
:root {
    --primary-color: #2563eb;     /* Main accent color */
    --bg-primary: #0f172a;        /* Background color */
    --text-primary: #f1f5f9;      /* Main text color */
    /* ... more variables */
}
```

### Categories

The following categories are supported by default:

- **Development**: Blue color
- **Creative**: Purple color
- **Business**: Green color
- **Experimental**: Yellow color

### Status Types

- **Active**: Green badge - for live, actively maintained projects
- **Beta**: Orange badge - for projects in testing
- **Maintenance**: Gray badge - for stable projects with minimal updates
- **Archived**: Red badge - for deprecated or discontinued projects

## 📊 Features Explained

### Search

Type in the search box to filter projects by name, description, or tags in real-time.

### Filtering

Use the dropdown menus to filter by:

- **Category**: Development, Creative, Business, or Experimental
- **Status**: Active, Beta, Maintenance, or Archived

### Stats Bar

- **Total Projects**: Count of all projects
- **Active**: Count of projects with "Active" status
- **Recent Updates**: Projects updated in the last 30 days

### Project Cards

Each card shows:

- Project name and direct link
- Current status badge
- Description
- Category and version
- Tags
- Last update date
- "View Details" button

### Project Modal

Click any project card to see:

- Full project details
- All tags
- Recent update history (up to 5 most recent)
- Links to visit project and repository

### Export

Click "Export List" in the footer to download your current filtered project list as JSON.


## 🔧 Maintenance

### Adding a New Project

1. Open `projects-data.js`
2. Copy an existing project object
3. Update all the values
4. Save the file
5. Refresh your browser

### Updating a Project

1. Find the project in `projects-data.js`
2. Modify the values you want to change
3. Add new entries to the `updates` array for significant changes
4. Update `lastUpdated` to today's date
5. Save and refresh

### Removing a Project

Simply delete or comment out the project object in `projects-data.js`.

## ⌨️ Keyboard Shortcuts

- **Ctrl/Cmd + K**: Focus search input
- **Ctrl/Cmd + T**: Toggle theme (light/dark)
- **Tab**: Navigate through interactive elements
- **Arrow Keys**: Navigate icon button groups (navigation)
- **Enter/Space**: Activate buttons and links
- **Escape**: Close modal or dismiss notifications

## ♿ Accessibility Features

- **WCAG 2.1 AA Compliant**: Meets international accessibility standards
- **ARIA Roles & Attributes**: Proper semantic markup for assistive tech
- **Focus Management**:
  - Visible focus indicators with theme-aware styles
  - Focus trap in modals (Tab cycles through modal content only)
  - Skip links to jump to main content
- **Keyboard Navigation**: All features accessible without mouse
- **Screen Reader Support**:
  - Descriptive labels and ARIA live regions
  - Dynamic updates announced (toast, section changes)
  - `aria-current="page"` on active navigation
- **Reduced Motion**: Respects `prefers-reduced-motion` preference
- **High Contrast**: Text meets 4.5:1 minimum contrast ratios
- **Semantic HTML**: Proper heading hierarchy, landmarks (`<main>`, `<nav>`)

## 🌐 Progressive Web App (PWA)

### Features

- **Installable**: Add to home screen on mobile and desktop
- **Offline-First**: Service worker caches all core assets
- **Background Updates**: Stale-while-revalidate strategy
- **Smart Install Prompts**: Non-intrusive banner with dismiss tracking
- **App-Like Experience**:
  - Fullscreen mode when installed
  - Custom splash screen
  - Platform-integrated theme colors
  - Maskable icons for adaptive launchers

### Files

- **manifest.json**: PWA metadata (name, icons, theme colors, display mode)
- **service-worker.js**: Cache strategy (`globaldeets-cache-v2`)
- **pwa-install.js**: Install prompt handler with analytics hooks
- **offline.html**: Graceful offline fallback page

### Testing

1. Open DevTools → Application → Manifest
2. Verify "Installable" checkmark
3. Click "Add to homescreen" to test
4. Toggle "Offline" in Network tab to test offline functionality

## 📦 NPM Scripts

```bash
npm start          # Start dev server (port 5500)
npm run dev        # Alias for start
npm run lint       # Run ESLint on JS files
npm run lint:fix   # Fix auto-fixable lint issues
npm run format     # Format code with Prettier
npm run build      # Lint + format (pre-deploy)
npm run generate-icons  # Create PNG icons from SVG
```

## 🎨 Advanced Customization

### Theme Colors

Edit CSS variables in `styles.css`:

```css
:root {
  --primary: #3b82f6;        /* Primary blue */
  --accent: #8b5cf6;         /* Accent purple */
  --bg-void: #050911;        /* Darkest background */
  /* ... more variables */
}

[data-theme="light"] {
  --primary: #2563eb;        /* Light mode primary */
  /* ... light theme overrides */
}
```

### UI Effects

Toggle effects in `ui-effects.js`:

```javascript
// Disable specific effects
// initUiEffects({
//   particles: false,    // Disable particle background
//   tilt: false,         // Disable 3D card tilt
//   parallax: false      // Disable parallax scrolling
// });
```

### PWA Branding

Update `manifest.json`:

```json
{
  "name": "Your Brand Name",
  "short_name": "Brand",
  "theme_color": "#3b82f6",
  "background_color": "#0a0e1a"
}
```

## 📱 Browser Support

- ✅ Chrome/Edge 90+ (Chromium)
- ✅ Firefox 88+
- ✅ Safari 14+ (iOS 14+)
- ✅ Mobile browsers (Chrome Android, Safari iOS)
- ⚠️ Service workers require HTTPS (except localhost)
- ⚠️ Some older browsers may not support all features (graceful degradation)

## 🔒 Security

- **URL Validation**: All project URLs validated (http/https only, no `javascript:` or `data:`)
- **XSS Protection**: All user content HTML-escaped before rendering
- **rel="noopener noreferrer"**: External links open safely

## 💡 Tips

1. **Keep URLs updated**: Make sure all project URLs are correct and working
2. **Regular updates**: Update the `lastUpdated` field when you make changes
3. **Use descriptive tags**: Tags make it easier to search and categorize
4. **Add update notes**: Use the `updates` array to track significant changes
5. **Link repositories**: Add GitHub/GitLab links when available
6. **Backup your data**: Keep a backup of `projects-data.js`

## 🎯 Module Architecture

The codebase is split into focused modules:

- **`app.js`**: Main orchestrator, initialization, export
- **`projects-render.js`**: Project rendering, filtering, modal display, URL validation
- **`ui-effects.js`**: Visual effects (particles, 3D tilt, parallax, reveal animations)
- **`interactions.js`**: Accessibility (focus trap, theme toggle, keyboard shortcuts, toast)
- **`service-worker.js`**: Offline caching for PWA support

## 📄 License

This landing page template is free to use and modify for your GlobalDeets projects.

---

**Need help?** Edit the `projects-data.js` file to add your projects, then open `index.html` in your browser!

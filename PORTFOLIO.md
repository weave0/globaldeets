# GlobalDeets Portfolio

A comprehensive landing page showcasing all GlobalDeets projects across creative, business, and experimental domains.

## 🌟 Live Projects

This portfolio currently features **10 active projects**:

### Business Intelligence
- **Consulting Insights Portal** - BD Intelligence Portal with $615M+ pipeline analysis
- **Neurology Practice Analytics** - Healthcare globalization with ROI modeling
- **National Health System Intelligence** - 433K+ records, $110B revenue tracking
- **Community Health Network** - 72 organizations, 171 care sites
- **Manufacturing Partner Hub** - 106-year-old manufacturer with 21 facilities
- **Sports Lighting Executive Profile** - Global sports lighting leader (135+ countries)
- **Medical Compliance Portal** - Healthcare compliance & equity standards

### Creative Projects
- **Fantasy Penpal** - Interactive storytelling for ages 5-13+
- **Steve B Tribute** - Artistic tribute with data visualizations

### Experimental
- **AI Aimate** - RAG-powered AI knowledge base with neural visualizations

## 📂 Project Structure

```
globaldeets/
├── index.html              # Main landing page (grid/list views)
├── categories.html         # Projects organized by category
├── timeline.html           # Chronological project timeline
├── analytics.html          # Portfolio insights & statistics
├── styles.css              # Complete styling system (dark/light themes)
├── app.js                  # Interactive features & functionality
├── projects-data.js        # Project database (10 real projects)
├── manifest.json           # PWA configuration
├── package.json            # NPM scripts & dependencies
├── .prettierrc             # Code formatting rules
├── .eslintrc.json          # Linting configuration
└── docs/                   # Comprehensive documentation
```

## 🚀 Features

### Multi-View Landing Page
- **Grid View** - Card-based project showcase with hover effects
- **List View** - Detailed table view with sortable columns
- **Search** - Real-time debounced search (300ms)
- **Filters** - Category and status filtering
- **Theme Toggle** - Dark/light mode with localStorage persistence

### Additional Pages
- **Categories Page** - Projects grouped by Business/Creative/Experimental
- **Timeline Page** - Chronological view with update history
- **Analytics Page** - Portfolio statistics, charts, and tag cloud

### Advanced UX
- ✅ Keyboard shortcuts (Ctrl+K search, Ctrl+T theme, Escape close)
- ✅ Toast notifications for user feedback
- ✅ Modal system for project details
- ✅ Scroll-to-top button
- ✅ Loading indicators
- ✅ Export to JSON functionality
- ✅ Responsive design (mobile/tablet/desktop)
- ✅ PWA ready (installable app)

## 🛠️ Development

### Quick Start
```bash
# Install dependencies
npm install

# Start live development server (auto-reload)
npm run dev
# Opens at http://localhost:5500

# Format code
npm run format

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Build (format + lint)
npm run build
```

### Tech Stack
- **HTML5** - Semantic markup with accessibility features
- **CSS3** - Grid, Flexbox, CSS Variables for theming
- **Vanilla JavaScript** - No framework dependencies
- **Google Fonts** - Inter typeface
- **Animate.css** - Smooth transitions via CDN
- **Live Server** - Hot reload development (npx)
- **Prettier** - Code formatting
- **ESLint** - Code quality

## 📊 Portfolio Stats

- **Total Projects:** 10
- **Active Projects:** 10
- **Categories:** 3 (Business, Creative, Experimental)
- **Unique Tags:** 30+
- **Healthcare Focus:** 5 projects
- **Analytics/Intelligence:** 6 projects

## 🎨 Design System

### Color Palette
**Dark Theme (Default)**
- Background: `#1a1a2e`
- Card Background: `#16213e`
- Primary: `#0f3460`
- Secondary: `#e94560`
- Text Primary: `#eee`
- Text Secondary: `#aaa`

**Light Theme**
- Background: `#f8f9fa`
- Card Background: `#ffffff`
- Primary: `#0f3460`
- Secondary: `#e94560`
- Text Primary: `#2d3436`
- Text Secondary: `#636e72`

### Typography
- **Font Family:** Inter (Google Fonts)
- **Base Size:** 16px
- **Headings:** 600-700 weight
- **Body:** 400 weight

## 📝 Adding New Projects

Edit `projects-data.js`:

```javascript
{
    name: "Project Name",
    url: "https://project.globaldeets.com/",
    description: "Brief description of what this project does",
    category: "Business", // Business, Creative, Experimental, Development
    status: "Active", // Active, Beta, Maintenance, Archived
    version: "1.0.0",
    tags: ["Tag1", "Tag2", "Tag3"],
    lastUpdated: "2025-11-20",
    repository: "https://github.com/username/repo", // or null
    updates: [
        {
            date: "2025-11-20",
            message: "Latest update description"
        }
    ]
}
```

The landing page will automatically update on refresh.

## 🌐 Deployment

### Option 1: Static Hosting (Recommended)
Upload all files to:
- Netlify
- Vercel
- GitHub Pages
- AWS S3 + CloudFront

### Option 2: Traditional Hosting
Upload to your web server's public directory.

### Domain Setup
Point `www.globaldeets.com` to your hosting provider. All subdomains already exist and are cataloged.

## 📄 Documentation

Comprehensive guides available:
- `GETTING_STARTED.md` - Interactive walkthrough
- `DEVELOPMENT.md` - Developer deep dive
- `STYLE_GUIDE.md` - Design system documentation
- `PROJECT_TEMPLATE.js` - Copy-paste templates
- `QUICK_REFERENCE.js` - Code snippets
- `WORKSPACE_SUMMARY.md` - Complete feature list

## 🔒 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Modern mobile browsers

## 📜 License

All projects are proprietary to GlobalDeets. This portfolio showcases work across multiple domains.

## 🤝 Contributing

To add a new project:
1. Launch the project on a globaldeets.com subdomain
2. Add entry to `projects-data.js`
3. Commit and deploy

## 💡 Project Highlights

**Most Complex:** Neurology Practice Analytics - Predictive demographic modeling, ROI calculator, 12+ language support

**Largest Dataset:** National Health System Intelligence - 433K IRS 990 records

**Most Creative:** Fantasy Penpal - 30+ characters, age-based storytelling

**Best Data Viz:** AI Aimate - Interactive neural networks, knowledge graphs

---

Built with ❤️ by GlobalDeets • Last Updated: November 20, 2025

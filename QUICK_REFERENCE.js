// ============================================
// GLOBALDEETS - QUICK REFERENCE GUIDE
// ============================================

// 1. START DEVELOPMENT
// Run this in terminal:
npm run dev
// Opens http://localhost:5500 with live reload

// ============================================
// 2. ADD A NEW PROJECT
// ============================================
// Edit this file and add to the projects array:

const newProject = {
    name: "Project Name",
    url: "http://yourproject.globaldeets.com/",
    description: "Brief description of what this project does",
    category: "Development", // Options: Development, Creative, Business, Experimental
    status: "Active",        // Options: Active, Beta, Maintenance, Archived
    version: "1.0.0",
    tags: ["tag1", "tag2", "tag3"],
    lastUpdated: "2025-11-20", // YYYY-MM-DD format
    repository: "https://github.com/username/repo", // optional
    updates: [
        {
            date: "2025-11-20",
            message: "Latest update description"
        },
        {
            date: "2025-11-10",
            message: "Previous update"
        }
    ]
};

// ============================================
// 3. PROJECT CATEGORIES
// ============================================
// Development - Blue color - For dev projects
// Creative - Purple color - For creative work
// Business - Green color - For business apps
// Experimental - Yellow color - For experiments

// ============================================
// 4. PROJECT STATUS
// ============================================
// Active - Green badge - Live and maintained
// Beta - Orange badge - Testing phase
// Maintenance - Gray badge - Stable, minimal updates
// Archived - Red badge - No longer active

// ============================================
// 5. KEYBOARD SHORTCUTS
// ============================================
// Ctrl/Cmd + K  - Focus search box
// Ctrl/Cmd + T  - Toggle dark/light theme
// Escape        - Close modal

// ============================================
// 6. NPM SCRIPTS
// ============================================
// npm run dev       - Start development server
// npm run format    - Format all code
// npm run lint      - Check for errors
// npm run lint:fix  - Auto-fix errors
// npm run build     - Format + lint (pre-deploy)

// ============================================
// 7. THEME COLORS (Edit styles.css)
// ============================================
// --primary-color: #2563eb (Main brand color)
// --success-color: #10b981 (Green for success)
// --warning-color: #f59e0b (Orange for warnings)
// --danger-color: #ef4444 (Red for errors)

// ============================================
// 8. FEATURES AVAILABLE
// ============================================
// ✅ Real-time search
// ✅ Category/status filtering
// ✅ Dark/light theme toggle
// ✅ Grid/list view toggle
// ✅ Project detail modals
// ✅ Export to JSON
// ✅ Toast notifications
// ✅ Scroll-to-top button
// ✅ Statistics dashboard
// ✅ PWA support
// ✅ Responsive design
// ✅ Smooth animations

// ============================================
// 9. FILE STRUCTURE
// ============================================
// index.html - Main HTML page
// styles.css - All styling
// app.js - Interactive features
// projects-data.js - YOUR PROJECTS (edit this!)
// manifest.json - PWA configuration
// assets/ - Icons and images

// ============================================
// 10. DEPLOYMENT CHECKLIST
// ============================================
// [ ] Run: npm run build
// [ ] Test in browser
// [ ] Generate PWA icons (see assets/README.md)
// [ ] Upload all files to web host
// [ ] Test on www.globaldeets.com
// [ ] Verify HTTPS is working
// [ ] Test PWA installation
// [ ] Check mobile responsiveness

// ============================================
// NEED HELP?
// ============================================
// README.md - User documentation
// DEVELOPMENT.md - Developer guide
// SETUP_COMPLETE.md - Setup overview
// Browser console (F12) - For debugging

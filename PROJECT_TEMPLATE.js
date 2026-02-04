// ============================================
// PROJECT TEMPLATE - Copy & Paste This!
// ============================================

// Copy this entire object and paste it into the projects array in projects-data.js

{
    // Required Fields
    name: "Your Project Name Here",
    url: "http://yourproject.globaldeets.com/",
    description: "Clear, concise description of what this project does. Aim for 1-2 sentences that explain the value.",
    category: "Development", // MUST BE ONE OF: Development, Creative, Business, Experimental
    status: "Active",        // MUST BE ONE OF: Active, Beta, Maintenance, Archived
    
    // Optional but Recommended
    version: "1.0.0",        // Semantic versioning: major.minor.patch
    tags: ["Tag1", "Tag2", "Tag3"], // Searchable keywords
    lastUpdated: "2025-11-20", // YYYY-MM-DD format - TODAY'S DATE
    
    // Optional
    repository: "https://github.com/username/repo", // Leave empty "" if none
    
    // Optional - Update History
    updates: [
        {
            date: "2025-11-20",
            message: "Most recent update - what changed?"
        },
        {
            date: "2025-11-10",
            message: "Previous update"
        },
        {
            date: "2025-11-01",
            message: "Older update"
        }
        // Keep last 5-10 updates for best display
    ]
},

// ============================================
// FIELD EXPLANATIONS
// ============================================

/*
NAME:
- Short, memorable project name
- Appears as card title and in modal
- Examples: "API Gateway", "Portfolio Site", "E-Commerce Platform"

URL:
- Full URL to your project
- Must start with http:// or https://
- Users will click this to visit
- Examples: "http://api.globaldeets.com/", "https://shop.example.com/"

DESCRIPTION:
- 1-3 sentences explaining what the project does
- Be specific and highlight key features
- Good: "Real-time analytics dashboard with data visualization and reporting"
- Bad: "A dashboard project"

CATEGORY:
- Development (Blue) - Developer tools, APIs, frameworks, libraries
- Creative (Purple) - Design, art, media, entertainment projects
- Business (Green) - Business apps, SaaS, e-commerce, productivity
- Experimental (Yellow) - Prototypes, research, proof of concepts

STATUS:
- Active (Green) - Live, actively maintained, recommended
- Beta (Orange) - Testing phase, may have bugs, actively developing
- Maintenance (Gray) - Stable, minimal updates, still works
- Archived (Red) - No longer maintained, historical reference only

VERSION:
- Use semantic versioning: MAJOR.MINOR.PATCH
  - MAJOR: Breaking changes (2.0.0)
  - MINOR: New features (1.5.0)
  - PATCH: Bug fixes (1.0.3)
- Start at 1.0.0 for first release
- Beta versions can be 0.x.x

TAGS:
- 3-6 keywords that describe the project
- Used for search functionality
- Mix technical and descriptive tags
- Examples: ["React", "TypeScript", "Dashboard", "Real-time"]

LAST UPDATED:
- Date of most recent update
- YYYY-MM-DD format
- Used to calculate "Recent Updates" stat
- Update this whenever you make changes!

REPOSITORY:
- GitHub, GitLab, Bitbucket, etc. URL
- Leave as empty string "" if private or no repo
- Shows "View Repository" button in modal if present

UPDATES:
- Array of recent changes/releases
- Most recent first
- Include date and clear message
- Keep last 5-10 for best display
- Great for showing progress and activity
*/

// ============================================
// REAL EXAMPLES BY CATEGORY
// ============================================

// DEVELOPMENT PROJECT
{
    name: "API Documentation Hub",
    url: "http://docs.globaldeets.com/",
    description: "Interactive API documentation with live examples, code snippets, and authentication playground.",
    category: "Development",
    status: "Active",
    version: "2.1.0",
    tags: ["API", "Documentation", "Developer Tools", "REST"],
    lastUpdated: "2025-11-18",
    repository: "https://github.com/yourusername/api-docs",
    updates: [
        { date: "2025-11-18", message: "Added GraphQL endpoint documentation" },
        { date: "2025-11-05", message: "Improved search functionality" }
    ]
},

// CREATIVE PROJECT
{
    name: "Digital Art Gallery",
    url: "http://gallery.globaldeets.com/",
    description: "Curated collection of digital artwork with interactive 3D viewing and artist profiles.",
    category: "Creative",
    status: "Active",
    version: "1.3.2",
    tags: ["Art", "Gallery", "3D", "Portfolio", "Exhibition"],
    lastUpdated: "2025-11-15",
    repository: "",
    updates: [
        { date: "2025-11-15", message: "Added November collection - 15 new pieces" },
        { date: "2025-11-01", message: "Implemented virtual reality preview mode" }
    ]
},

// BUSINESS PROJECT
{
    name: "Customer Portal",
    url: "http://portal.globaldeets.com/",
    description: "Self-service customer portal for support tickets, billing, and account management.",
    category: "Business",
    status: "Active",
    version: "3.0.1",
    tags: ["CRM", "Support", "Customer Service", "Portal"],
    lastUpdated: "2025-11-19",
    repository: "",
    updates: [
        { date: "2025-11-19", message: "Added live chat support integration" },
        { date: "2025-11-10", message: "Redesigned billing dashboard" },
        { date: "2025-11-01", message: "Improved mobile app compatibility" }
    ]
},

// EXPERIMENTAL PROJECT
{
    name: "WebGL Physics Sandbox",
    url: "http://physics.globaldeets.com/",
    description: "Experimental 3D physics simulation engine built with WebGL and custom physics solver.",
    category: "Experimental",
    status: "Beta",
    version: "0.7.0",
    tags: ["WebGL", "Physics", "3D", "Simulation", "Research"],
    lastUpdated: "2025-11-20",
    repository: "https://github.com/yourusername/physics-sandbox",
    updates: [
        { date: "2025-11-20", message: "Implemented soft body physics" },
        { date: "2025-11-18", message: "Added particle system prototype" },
        { date: "2025-11-12", message: "Testing collision detection improvements" }
    ]
},

// ============================================
// TIPS FOR GREAT PROJECT ENTRIES
// ============================================

/*
1. BE DESCRIPTIVE
   ✅ "AI-powered image recognition API with 95% accuracy"
   ❌ "Image API"

2. KEEP URLS ACCURATE
   - Verify links work before adding
   - Use consistent subdomain pattern
   - Include http:// or https://

3. UPDATE REGULARLY
   - Change lastUpdated when you make changes
   - Add update entries for major changes
   - Remove very old updates (keep recent 5-10)

4. USE MEANINGFUL TAGS
   - Mix technical terms and features
   - Think about what users might search
   - 3-6 tags per project is ideal

5. CHOOSE THE RIGHT STATUS
   - Active = Production ready, recommended
   - Beta = Working but still testing
   - Maintenance = Stable but not actively developed
   - Archived = Historical reference only

6. VERSION NUMBERS MATTER
   - Start at 1.0.0 for first release
   - Increment patch for bug fixes
   - Increment minor for new features
   - Increment major for breaking changes

7. CATEGORY GUIDES COLOR
   - Development = Blue (technical projects)
   - Creative = Purple (art, design, media)
   - Business = Green (business applications)
   - Experimental = Yellow (prototypes, research)
*/

// ============================================
// QUICK START CHECKLIST
// ============================================

/*
[ ] Copy the template above
[ ] Replace "Your Project Name Here" with your project name
[ ] Update the URL to your actual subdomain
[ ] Write a clear, descriptive description
[ ] Choose the correct category
[ ] Set appropriate status
[ ] Add relevant tags (3-6 recommended)
[ ] Set today's date as lastUpdated
[ ] Add repository URL if public (or leave empty)
[ ] Add at least one update entry
[ ] Paste into projects array in projects-data.js
[ ] Save file and watch it appear!
*/

// ============================================
// PASTE THIS INTO projects-data.js
// ============================================

/*
Open projects-data.js and find the projects array:

const projects = [
    // ... existing projects ...
    
    // PASTE YOUR NEW PROJECT HERE
    {
        name: "Your Project",
        url: "http://yourproject.globaldeets.com/",
        // ... etc
    },
    
];
*/

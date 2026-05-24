// GlobalDeets Projects Data
// Real projects crawled from live subdomains

const projects = [
  {
    name: 'Fantasy Penpal',
    url: 'https://fantasy-penpal.globaldeets.com/',
    description:
      'Interactive storytelling platform for young readers featuring magical pen-pal characters across age groups 5-13+. Bite-sized narrative letters building reading confidence with gentle themes of kindness, curiosity, and imagination.',
    category: 'Creative',
    status: 'Active',
    version: '1.0.0',
    tags: ['Storytelling', 'Education', 'Kids', 'Reading'],
    lastUpdated: '2025-11-20',
    repository: null,
    updates: [
      {
        date: '2025-11-20',
        message: 'Launched with 30+ fantasy characters across all age groups',
      },
      {
        date: '2025-11-15',
        message: 'Added bedtime mode and audio narration',
      },
      {
        date: '2025-11-10',
        message: 'Created subscription and support options',
      },
    ],
  },
  {
    name: 'Enterprise Consulting Intelligence',
    url: '#',
    description:
      'Business Development Intelligence Portal with AI-powered market research across Agentic AI, Enterprise Modernization, Healthcare Tech, and Federal sectors. Competitive analysis, strategic playbooks, and pipeline intelligence.',
    category: 'Business',
    status: 'Active',
    version: '1.0.0',
    tags: ['Business Intelligence', 'Sales', 'Strategy', 'AI Research'],
    lastUpdated: '2025-11-20',
    repository: null,
    updates: [
      {
        date: '2025-11-20',
        message: 'Advanced Intel: McKinsey + Gartner cutting-edge research',
      },
      {
        date: '2025-11-15',
        message: 'Added 14 enterprise target profiles with buying signals',
      },
      {
        date: '2025-11-10',
        message: 'Launched predictive opportunities dashboard',
      },
    ],
  },
  {
    name: 'Specialty Medical Practice Analytics',
    url: '#',
    description:
      'Strategic demographic insights and language analytics for a regional neurology practice. Predictive modeling for foreign-born population growth. ROI calculator, market segmentation, competitive analysis across 12+ languages with community partnership network.',
    category: 'Business',
    status: 'Active',
    version: '1.0.0',
    tags: ['Healthcare', 'Analytics', 'ROI', 'Globalization', 'Strategy'],
    lastUpdated: '2025-11-20',
    repository: null,
    updates: [
      {
        date: '2025-11-20',
        message: 'AI-powered strategic recommendations with $124M+ impact',
      },
      {
        date: '2025-11-15',
        message: 'Added interactive ROI calculator and demographic projections',
      },
      {
        date: '2025-11-10',
        message: 'Launched community partnership network analysis',
      },
    ],
  },
  {
    name: 'Manufacturing Ecosystem Hub',
    url: '#',
    description:
      'Strategic partner research hub for a major privately held manufacturer with multi-facility operations. Comprehensive vendor support with facility data, product catalogs, sustainability metrics, and industry ecosystem mapping.',
    category: 'Business',
    status: 'Active',
    version: '1.0.0',
    tags: ['Manufacturing', 'B2B', 'Sustainability', 'Packaging'],
    lastUpdated: '2025-11-20',
    repository: null,
    updates: [
      {
        date: '2025-11-20',
        message: 'Launched vendor support resource portal',
      },
      {
        date: '2025-11-15',
        message: 'Added facility capabilities and geographic data (GeoJSON)',
      },
      {
        date: '2025-11-10',
        message: 'Published sustainability impact metrics (600M lbs recycled)',
      },
    ],
  },
  {
    name: 'Sports Infrastructure Intelligence',
    url: '#',
    description:
      'Executive ecosystem map for a global sports infrastructure leader serving 135+ countries. Features project gallery, spectral analysis, industry certification profiles, and warranty program intelligence. Complete-system integration for sports facilities.',
    category: 'Business',
    status: 'Active',
    version: '1.0.0',
    tags: ['Sports', 'Infrastructure', 'B2B', 'Engineering'],
    lastUpdated: '2025-11-20',
    repository: null,
    updates: [
      {
        date: '2025-11-20',
        message: 'Launched executive profile and vendor alignment portal',
      },
      {
        date: '2025-11-15',
        message: 'Added interactive spectral analysis and uniformity heatmaps',
      },
      {
        date: '2025-11-10',
        message: 'Published strategic positioning and market analysis',
      },
    ],
  },
  {
    name: 'National Healthcare System Intelligence',
    url: '#',
    description:
      'Executive-ready insights into a nationwide healthcare network built entirely from public data. 433K+ records from IRS 990, NPPES, and ProPublica. Revenue tracking, membership analytics, and facility mapping across multiple states. DuckDB analytics, zero-PII, ethical AI with public data transparency.',
    category: 'Business',
    status: 'Active',
    version: '1.0.0',
    tags: ['Healthcare', 'Analytics', 'Big Data', 'Intelligence'],
    lastUpdated: '2025-11-09',
    repository: null,
    updates: [
      {
        date: '2025-11-09',
        message: 'Live data sync from IRS 990 Index (433K filings)',
      },
      {
        date: '2025-11-01',
        message: 'Launched interactive map and entity tracking',
      },
      {
        date: '2025-10-25',
        message: 'Published financial analysis dashboard',
      },
    ],
  },
  {
    name: 'Community Health Network Intelligence',
    url: '#',
    description:
      'Strategic insights and comprehensive data on 72 community health organizations across multiple states. Tracks 171 care sites and annual patient volumes across FQHC, Tribal Health, and Rural Health Clinics with network integration.',
    category: 'Business',
    status: 'Active',
    version: '1.0.0',
    tags: ['Healthcare', 'Analytics', 'Network Analysis', 'FQHC'],
    lastUpdated: '2025-11-20',
    repository: null,
    updates: [
      {
        date: '2025-11-20',
        message: 'Launched network intelligence dashboard',
      },
      {
        date: '2025-11-15',
        message: 'Added geographic distribution and coverage analysis',
      },
    ],
  },
  {
    name: 'Medical Compliance Portal',
    url: 'https://medical.globaldeets.com',
    description:
      'Fluid, visual companion to explore equity-forward compliance, standards, and templates. Role-based access for Executive Leadership, Health Equity, Compliance/Legal (Section 1557, HIPAA, EMTALA), Quality Accreditation, Clinical Operations, and Digital Health initiatives.',
    category: 'Business',
    status: 'Active',
    version: '1.0.0',
    tags: ['Healthcare', 'Compliance', 'Legal', 'Health Equity'],
    lastUpdated: '2025-11-20',
    repository: null,
    updates: [
      {
        date: '2025-11-20',
        message: 'Launched role-based compliance library',
      },
      {
        date: '2025-11-15',
        message: 'Added Section 1557 and CLAS resources',
      },
    ],
  },
  {
    name: 'AI Animate',
    url: 'https://aiaimate.com/',
    description:
      'Journey from backend to frontend of artificial intelligence. RAG-powered knowledge base with transparent uncertainty margins, visual metaphors, and interactive neural network visualizations. Decoding AI science with intentional data sourcing and artistic simplification.',
    category: 'Experimental',
    status: 'Active',
    version: '1.0.0',
    tags: ['AI', 'Education', 'Visualization', 'Research'],
    lastUpdated: '2025-11-20',
    repository: 'https://github.com/weave0/aiaimate',
    updates: [
      {
        date: '2025-11-20',
        message: 'Launched interactive AI knowledge base with RAG search',
      },
      {
        date: '2025-11-15',
        message: 'Added neural network visualizations and knowledge graphs',
      },
      {
        date: '2025-11-10',
        message: 'Published transparent uncertainty framework',
      },
    ],
  },
  {
    name: 'Steve B Tribute',
    url: 'http://steveb.globaldeets.com/',
    description:
      "A surreal, independent artistic tribute celebrating Steve Buscemi's unmistakable screen presence. Features filmography, interactive visualizations, timeline, and network analysis. Data sourced from Wikipedia (CC BY-SA 4.0).",
    category: 'Creative',
    status: 'Active',
    version: '1.0.0',
    tags: ['Art', 'Film', 'Tribute', 'Data Viz'],
    lastUpdated: '2025-11-20',
    repository: null,
    updates: [
      {
        date: '2025-11-20',
        message: 'Launched interactive filmography and network visualization',
      },
      {
        date: '2025-11-15',
        message: 'Added media gallery and timeline',
      },
    ],
  },
  {
    name: 'CultureSherpa',
    url: 'https://www.culturesherpa.org',
    description:
      'An equitable model for viewing and learning about world cultures through academic, scientific, and artistic lenses. Provides balanced, accurate representation of global cultures with scholarly rigor and creative exploration.',
    category: 'Creative',
    status: 'Active',
    version: '1.0.0',
    tags: ['Education', 'Culture', 'Anthropology', 'Global', 'Academic'],
    lastUpdated: '2025-11-20',
    repository: null,
    updates: [
      {
        date: '2025-11-20',
        message: 'Added to GlobalDeets portfolio',
      },
    ],
  },
  {
    name: 'Global Insurance Intelligence Platform',
    url: '#',
    description:
      'Strategic Globalization Intelligence Platform for insurance market expansion. Features real-time market analysis, globalization assessments, multilingual compliance intelligence, and partnership ROI calculators across global addressable markets.',
    category: 'Business',
    status: 'Active',
    version: '1.0.0',
    tags: ['Insurance', 'Globalization', 'Market Intelligence', 'B2B SaaS'],
    lastUpdated: '2025-11-23',
    repository: null,
    updates: [
      {
        date: '2025-11-23',
        message: 'Launched with interactive dashboards and ROI calculator',
      },
      {
        date: '2025-11-20',
        message: 'Added market intelligence for 50+ economies',
      },
      {
        date: '2025-11-15',
        message: 'Integrated Chart.js visualizations and compliance data',
      },
    ],
  },
  // Add more projects below - just copy the structure above
  // Example:
  // {
  //     name: "Project Name",
  //     url: "http://yourproject.globaldeets.com/",
  //     description: "Brief description of what this project does",
  //     category: "Development", // Options: Development, Creative, Business, Experimental
  //     status: "Active", // Options: Active, Beta, Maintenance, Archived
  //     version: "1.0.0",
  //     tags: ["tag1", "tag2", "tag3"],
  //     lastUpdated: "2025-11-20",
  //     repository: "https://github.com/yourusername/projectname",
  //     updates: [
  //         {
  //             date: "2025-11-20",
  //             message: "Latest update description"
  //         },
  //         {
  //             date: "2025-11-10",
  //             message: "Previous update description"
  //         }
  //     ]
  // },
];

// Don't modify anything below this line
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { projects };
}

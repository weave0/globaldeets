#!/usr/bin/env node
/**
 * GlobalDeets Asset Build Script
 * - Crops globe-only from logo → assets/logo-globe.png
 * - Generates all PWA icon sizes (72→512px) from logo-globe
 * - Creates favicon.png at 32px
 * - Extracts all 42 icon categories from the neon sheet → assets/icons/{slug}/section.png
 * - Extracts individual site-critical nav + social icons
 * - Copies landscape + banner to clean URL-safe filenames
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'assets');

// ── helpers ────────────────────────────────────────────────────────────────────
function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function crop(src, dest, region, resizeTo) {
  ensure(path.dirname(dest));
  let pipeline = sharp(src).extract(region);
  if (resizeTo)
    pipeline = pipeline.resize(resizeTo, resizeTo, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    });
  await pipeline.png().toFile(dest);
  console.log(
    '✓',
    path.relative(__dirname, dest),
    `(${region.width}×${region.height}${resizeTo ? ` → ${resizeTo}px` : ''})`
  );
}

async function resizeToSquare(src, dest, size) {
  ensure(path.dirname(dest));
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(dest);
  console.log('✓', path.relative(__dirname, dest), `${size}×${size}`);
}

async function copyNamed(src, dest) {
  ensure(path.dirname(dest));
  await sharp(src).png().toFile(dest);
  console.log('✓', path.relative(__dirname, dest));
}

// ── STEP 1: Globe logo crop ─────────────────────────────────────────────────────
// Logo is 1024×1024 — globe occupies top ~65%, text at bottom ~35%
// We crop a 900×900 region centered on the globe, then pad to 1024×1024
async function buildLogoGlobe() {
  console.log('\n── Globe logo crop ──');
  // Use the dark-background version — neon GD globe on pure black (1254×1254)
  const src = path.join(ROOT, 'Logo Dark Background.png');
  const dest = path.join(ROOT, 'logo-globe.png');
  ensure(path.dirname(dest));

  // Globe mark occupies most of the 1254-px tall image (y=120-1015), text at y=1030-1130
  // Crop just the globe (full 1254px width, top 1020px = captures all globe, excludes text)
  const IMG_SIZE = 1254;
  const cropH = 1020; // captures globe y=0-1015, stops before text at y=1030
  await sharp(src)
    .extract({ left: 0, top: 0, width: IMG_SIZE, height: cropH })
    // Pad bottom to make it square (add 464px black border below)
    .extend({ bottom: IMG_SIZE - cropH, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(dest);
  console.log('✓ assets/logo-globe.png (GD globe mark, 1254×1254 black canvas)');

  // Also save a non-padded horizontal crop for header use
  const destHeader = path.join(ROOT, 'logo-mark.png');
  await sharp(src)
    .extract({ left: 0, top: 0, width: IMG_SIZE, height: cropH })
    .png()
    .toFile(destHeader);
  console.log('✓ assets/logo-mark.png (GD globe mark, 1254×1020, no padding — full globe, no text)');
}

// ── STEP 2: PWA icon sizes ──────────────────────────────────────────────────────
async function buildPwaIcons() {
  console.log('\n── PWA icons ──');
  const src = path.join(ROOT, 'logo-globe.png');
  const sizes = [32, 72, 96, 128, 144, 152, 192, 384, 512];
  for (const sz of sizes) {
    const dest = sz === 32 ? path.join(ROOT, 'favicon.png') : path.join(ROOT, `icon-${sz}.png`);
    await resizeToSquare(src, dest, sz);
  }
  // Also write apple-touch-icon at 180px
  await resizeToSquare(src, path.join(ROOT, 'apple-touch-icon.png'), 180);
}

// ── STEP 3: Banner & landscape ────────────────────────────────────────────────
async function buildBannerAndLandscape() {
  console.log('\n── Banner & landscape ──');
  await copyNamed(path.join(ROOT, 'Banner with GD.png'), path.join(ROOT, 'og-banner.png'));
  await copyNamed(
    path.join(ROOT, 'Neon digital landscape in the void.png'),
    path.join(ROOT, 'neon-landscape.png')
  );
  // Optimized web-size landscape (1280px wide max)
  const dest = path.join(ROOT, 'neon-landscape-web.jpg');
  ensure(path.dirname(dest));
  await sharp(path.join(ROOT, 'Neon digital landscape in the void.png'))
    .resize(1280, null, { withoutEnlargement: true })
    .jpeg({ quality: 88, progressive: true })
    .toFile(dest);
  console.log('✓ assets/neon-landscape-web.jpg (1280px, 88q JPEG)');
}

// ── STEP 4: Icon sheet extraction ──────────────────────────────────────────────
// Sheet: 1402×1122, 5 columns × 9 rows (rows 1–8 standard, row 9 is taller/2-panel)
// MEASURED row starts: row 0=0, row 1=118, rows 2-7 each add 110px + 8px initial offset
// i.e. ROW_Y[n] = n===0 ? 0 : 8 + n*110

const SHEET_W = 1402;
const SHEET_H = 1122;

const COL_W = Math.floor(SHEET_W / 5); // 280
// Row start positions (pixel-measured: row0=118px tall, rows1-7=110px tall)
const ROW_Y = [0, 118, 228, 338, 448, 558, 668, 778];
const ROW_H = [118, 110, 110, 110, 110, 110, 110, 110];
const BTM_Y = 888;  // gap starts here after row 7 (measured)
const BTM_H = SHEET_H - BTM_Y; // 234

// Category definitions: [id, slug, label, gridRow(0-based), gridCol(0-based)]
// Row 9 special: sections 41 & 42 split left/right
const CATEGORIES = [
  [1, 'general', 'General', 0, 0],
  [2, 'user-people', 'User & People', 0, 1],
  [3, 'interface', 'Interface', 0, 2],
  [4, 'actions', 'Actions', 0, 3],
  [5, 'navigation', 'Navigation', 0, 4],
  [6, 'file-document', 'File & Document', 1, 0],
  [7, 'folders', 'Folders', 1, 1],
  [8, 'communication', 'Communication', 1, 2],
  [9, 'dev-code', 'Dev & Code', 1, 3],
  [10, 'design-editing', 'Design & Editing', 1, 4],
  [11, 'media', 'Media & Entertainment', 2, 0],
  [12, 'social-media', 'Social Media', 2, 1],
  [13, 'e-commerce', 'E-Commerce', 2, 2],
  [14, 'finance-business', 'Finance & Business', 2, 3],
  [15, 'analytics-data', 'Analytics & Data', 2, 4],
  [16, 'time-date', 'Time & Date', 3, 0],
  [17, 'location-maps', 'Location & Maps', 3, 1],
  [18, 'weather', 'Weather', 3, 2],
  [19, 'security-privacy', 'Security & Privacy', 3, 3],
  [20, 'devices-hardware', 'Devices & Hardware', 3, 4],
  [21, 'arrows-directions', 'Arrows & Directions', 4, 0],
  [22, 'logistics-shipping', 'Logistics & Shipping', 4, 1],
  [23, 'health-medical', 'Health & Medical', 4, 2],
  [24, 'food-drink', 'Food & Drink', 4, 3],
  [25, 'education-learning', 'Education & Learning', 4, 4],
  [26, 'shopping-retail', 'Shopping & Retail', 5, 0],
  [27, 'sports-fitness', 'Sports & Fitness', 5, 1],
  [28, 'travel-transport', 'Travel & Transport', 5, 2],
  [29, 'home-real-estate', 'Home & Real Estate', 5, 3],
  [30, 'nature-environment', 'Nature & Environment', 5, 4],
  [31, 'file-types', 'File Types', 6, 0],
  [32, 'brands-tech', 'Brands & Technologies', 6, 1],
  [33, 'payment-currency', 'Payment & Currency', 6, 2],
  [34, 'flags', 'Flags', 6, 3],
  [35, 'operating-systems', 'Operating Systems', 6, 4],
  [36, 'apps-platforms', 'Apps & Platforms', 7, 0],
  [37, 'notifications', 'Notifications & Alerts', 7, 1],
  [38, 'ui-elements', 'UI Elements', 7, 2],
  [39, 'miscellaneous', 'Miscellaneous', 7, 3],
  [40, 'energy-power', 'Energy & Power', 7, 4],
];

// Special bottom-row categories (row 9, split halves)
const BTM_CATEGORIES = [
  [
    41,
    'logo-marks',
    'Logo Marks & Symbols',
    { left: 0, top: BTM_Y, width: Math.floor(SHEET_W / 2), height: BTM_H },
  ],
  [
    42,
    'favicon-styles',
    'Favicon Styles',
    {
      left: Math.floor(SHEET_W / 2),
      top: BTM_Y,
      width: SHEET_W - Math.floor(SHEET_W / 2),
      height: BTM_H,
    },
  ],
];

// Within each category block, icons are arranged in a sub-grid:
//   Label row: ~22px from block top
//   Icon area: y=22 to end of block, split into 2 rows
//   Icon columns: 5 per row (col width = COL_W / 5)
const ICON_LABEL_H = 30; // px: label area before icons start (measured: icons at offset +30-33)
const ICON_COLS = 5; // icons per row within each category
const ICON_COL_W = Math.floor(COL_W / ICON_COLS); // ~56px
const ICON_ROW_H = 40; // each icon sub-row height (measured: row0 at +30, row1 at +70)

// Named individual icons to extract from each section
// Format: [outputName, sectionSlug, iconRow(0-1), iconCol(0-4)]
const SITE_ICONS = [
  // ── Nav icons ──
  ['nav-home', 'general', 0, 0],
  ['nav-search', 'general', 0, 1],
  ['nav-settings', 'general', 0, 2],
  ['nav-info', 'general', 0, 3],
  ['nav-help', 'general', 0, 4],
  ['nav-calendar', 'time-date', 0, 0],
  ['nav-clock', 'time-date', 0, 1],
  ['nav-grid', 'interface', 0, 0],
  ['nav-list', 'interface', 0, 1],
  ['nav-window', 'interface', 0, 2],
  ['nav-email', 'communication', 0, 0],
  ['nav-phone', 'communication', 0, 1],
  ['nav-chat', 'communication', 0, 2],
  ['nav-map-pin', 'location-maps', 0, 0],
  ['nav-globe', 'location-maps', 0, 1],
  ['nav-compass', 'location-maps', 0, 2],
  ['nav-chart-bar', 'analytics-data', 0, 0],
  ['nav-chart-line', 'analytics-data', 0, 1],
  ['nav-chart-pie', 'analytics-data', 0, 2],
  ['nav-user', 'user-people', 0, 0],
  ['nav-users', 'user-people', 0, 1],
  ['nav-news', 'file-document', 0, 0],
  ['nav-download', 'actions', 0, 4],
  ['nav-share', 'actions', 0, 3],
  ['nav-close', 'actions', 0, 1],
  ['nav-check', 'actions', 0, 0],
  ['nav-plus', 'actions', 0, 2],
  ['nav-arrow-left', 'arrows-directions', 0, 0],
  ['nav-arrow-right', 'arrows-directions', 0, 1],
  ['nav-arrow-up', 'arrows-directions', 0, 2],
  ['nav-arrow-down', 'arrows-directions', 0, 3],
  ['nav-lock', 'security-privacy', 0, 0],
  ['nav-shield', 'security-privacy', 0, 1],
  // ── Social media icons ──
  ['social-facebook', 'social-media', 0, 0],
  ['social-x', 'social-media', 0, 1],
  ['social-instagram', 'social-media', 0, 2],
  ['social-linkedin', 'social-media', 0, 3],
  ['social-youtube', 'social-media', 0, 4],
  ['social-tiktok', 'social-media', 1, 0],
  ['social-snapchat', 'social-media', 1, 1],
  ['social-whatsapp', 'social-media', 1, 2],
  ['social-discord', 'social-media', 1, 3],
  ['social-reddit', 'social-media', 1, 4],
  // ── Finance / payment ──
  ['pay-visa', 'payment-currency', 0, 0],
  ['pay-mastercard', 'payment-currency', 0, 1],
  ['pay-paypal', 'payment-currency', 0, 2],
  ['pay-stripe', 'payment-currency', 0, 3],
  ['pay-bitcoin', 'payment-currency', 0, 4],
  ['pay-ethereum', 'payment-currency', 1, 0],
  // ── Brands ──
  ['brand-apple', 'brands-tech', 0, 0],
  ['brand-windows', 'brands-tech', 0, 1],
  ['brand-google', 'brands-tech', 0, 2],
  ['brand-microsoft', 'brands-tech', 0, 3],
  ['brand-adobe', 'brands-tech', 0, 4],
  ['brand-intel', 'brands-tech', 1, 0],
  ['brand-amd', 'brands-tech', 1, 1],
  ['brand-nvidia', 'brands-tech', 1, 2],
  // ── Travel ──
  ['travel-plane', 'travel-transport', 0, 0],
  ['travel-globe', 'travel-transport', 0, 1],
  ['travel-car', 'travel-transport', 0, 2],
  ['travel-ship', 'travel-transport', 0, 3],
  ['travel-train', 'travel-transport', 0, 4],
];

function getCategoryRegion(gridRow, gridCol) {
  return {
    left: gridCol * COL_W,
    top: ROW_Y[gridRow],
    width: COL_W,
    height: ROW_H[gridRow],
  };
}

function getIconRegion(catRegion, iconRow, iconCol) {
  return {
    left: catRegion.left + iconCol * ICON_COL_W,
    top: catRegion.top + ICON_LABEL_H + iconRow * ICON_ROW_H,
    width: ICON_COL_W,
    height: ICON_ROW_H,
  };
}

async function buildIconSheet() {
  console.log('\n── Icon sheet: category sections ──');
  const src = path.join(ROOT, 'Neon UI icon reference sheet.png');

  // Extract standard 8-row categories
  for (const [id, slug, label, gridRow, gridCol] of CATEGORIES) {
    const region = getCategoryRegion(gridRow, gridCol);
    const dest = path.join(ROOT, 'icons', slug, 'section.png');
    await crop(src, dest, region);
  }

  // Extract bottom-row special categories (41 & 42)
  console.log('\n── Icon sheet: bottom row (logo-marks, favicon-styles) ──');
  for (const [id, slug, label, region] of BTM_CATEGORIES) {
    const dest = path.join(ROOT, 'icons', slug, 'section.png');
    await crop(src, dest, region);
  }

  // Extract individual site-critical icons
  console.log('\n── Individual site icons ──');
  // Build lookup: slug → category entry
  const catMap = {};
  for (const [id, slug, label, gridRow, gridCol] of CATEGORIES) {
    catMap[slug] = getCategoryRegion(gridRow, gridCol);
  }

  for (const [name, sectionSlug, iconRow, iconCol] of SITE_ICONS) {
    const catRegion = catMap[sectionSlug];
    if (!catRegion) {
      console.warn(`⚠ unknown section: ${sectionSlug}`);
      continue;
    }
    const region = getIconRegion(catRegion, iconRow, iconCol);
    // Clamp to sheet bounds
    if (region.left + region.width > SHEET_W || region.top + region.height > SHEET_H) {
      console.warn(`⚠ out-of-bounds: ${name} (${JSON.stringify(region)})`);
      continue;
    }
    const dest = path.join(ROOT, 'icons', 'site', `${name}.png`);
    await crop(src, dest, region);
  }

  // Extract favicon-style icons individually from section 42
  // Section 42 occupies right half of bottom row
  console.log('\n── Favicon-style icons from section 42 ──');
  const faviconSec = BTM_CATEGORIES[1]; // [42, 'favicon-styles', ...]
  const fRegion = faviconSec[3];
  // Within the favicon section, icons are larger (use the full available height / 2 rows)
  const fLabelH = 22;
  const fIconH = Math.floor((fRegion.height - fLabelH) / 2);
  const fIconW = Math.floor(fRegion.width / 8); // ~87px (estimate 8 per row)

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) {
      const dest = path.join(ROOT, 'icons', 'favicon-styles', `icon-r${row}-c${col}.png`);
      const region = {
        left: fRegion.left + col * fIconW,
        top: fRegion.top + fLabelH + row * fIconH,
        width: fIconW,
        height: fIconH,
      };
      if (region.left + region.width > SHEET_W) break;
      await crop(src, dest, region);
    }
  }
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await buildLogoGlobe();
    await buildPwaIcons();
    await buildBannerAndLandscape();
    await buildIconSheet();
    console.log('\n✅ All assets built successfully!');
    console.log('   Review assets/icons/site/ and assets/icons/favicon-styles/ for icons to use.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();

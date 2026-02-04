#!/usr/bin/env node
/**
 * PNG Icon Generator for GlobalDeets PWA
 * Generates PNG icons from SVG base at all required sizes
 * Requires: node-canvas and node-rsvg for SVG→PNG conversion
 * 
 * Usage: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available (optional, better quality)
let sharp;
try {
  sharp = require('sharp');
} catch(e) {
  console.warn('⚠️  sharp not found. Install with: npm install sharp');
  console.warn('   Falling back to manual conversion instructions.');
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const baseSVG = path.join(__dirname, 'assets', 'icon-base.svg');
const outputDir = path.join(__dirname, 'assets');

async function generateIcons() {
  if (!fs.existsSync(baseSVG)) {
    console.error('❌ Base SVG not found:', baseSVG);
    process.exit(1);
  }

  console.log('🎨 Generating PNG icons from SVG...\n');

  if (sharp) {
    // Use sharp for high-quality conversion
    for (const size of sizes) {
      const outputPath = path.join(outputDir, `icon-${size}.png`);
      try {
        await sharp(baseSVG)
          .resize(size, size)
          .png({ quality: 100, compressionLevel: 9 })
          .toFile(outputPath);
        console.log(`✅ Generated: icon-${size}.png`);
      } catch (e) {
        console.error(`❌ Failed to generate ${size}px icon:`, e.message);
      }
    }
    console.log('\n✨ All icons generated successfully!');
  } else {
    // Provide manual conversion instructions
    console.log('📋 Manual conversion required:\n');
    console.log('Option 1 - Install sharp:');
    console.log('  npm install sharp');
    console.log('  node generate-icons.js\n');
    console.log('Option 2 - Use online converter:');
    console.log('  1. Open https://cloudconvert.com/svg-to-png');
    console.log('  2. Upload: assets/icon-base.svg');
    console.log('  3. Convert to PNG at each size:', sizes.join(', '));
    console.log('  4. Save as: icon-72.png, icon-96.png, etc.\n');
    console.log('Option 3 - Use Inkscape CLI:');
    sizes.forEach(size => {
      console.log(`  inkscape -w ${size} -h ${size} assets/icon-base.svg -o assets/icon-${size}.png`);
    });
    console.log('\nOption 4 - Use ImageMagick:');
    sizes.forEach(size => {
      console.log(`  convert -background none -size ${size}x${size} assets/icon-base.svg assets/icon-${size}.png`);
    });
  }
}

// Screenshot generation instructions
function showScreenshotInstructions() {
  console.log('\n📸 Screenshot conversion:\n');
  console.log('For wide screenshot (1280×720):');
  console.log('  sharp: sharp(assets/screenshot-wide.svg).resize(1280,720).toFile(assets/screenshot-wide.png)');
  console.log('  Or browser: Open assets/screenshot-wide.svg, resize to 1280×720, screenshot\n');
  console.log('For mobile screenshot (750×1334):');
  console.log('  sharp: sharp(assets/screenshot-mobile.svg).resize(750,1334).toFile(assets/screenshot-mobile.png)');
  console.log('  Or browser: Open assets/screenshot-mobile.svg, resize to 750×1334, screenshot\n');
}

// Run
generateIcons().then(() => {
  showScreenshotInstructions();
}).catch(err => {
  console.error('❌ Generation failed:', err);
  process.exit(1);
});

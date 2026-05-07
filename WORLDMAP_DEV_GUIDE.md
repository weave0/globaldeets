# World Map - Local Development Guide

## 🚀 Running Locally (Recommended)

The world map uses Cesium.js which requires a web server (not `file://` protocol). Here are quick ways to run it:

### Option 1: NPM Live Server (Recommended)

```bash
# If you have Node.js installed:
npm run dev
# or
npx live-server --port=5500
```

Then open: http://localhost:5500/worldmap.html

### Option 2: Python HTTP Server

```bash
# Python 3:
python -m http.server 8000

# Python 2:
python -m SimpleHTTPServer 8000
```

Then open: http://localhost:8000/worldmap.html

### Option 3: PHP Built-in Server

```bash
php -S localhost:8000
```

Then open: http://localhost:8000/worldmap.html

### Option 4: VS Code Live Server Extension

1. Install "Live Server" extension by Ritwick Dey
2. Right-click `worldmap.html`
3. Select "Open with Live Server"

## 🐛 Troubleshooting

### CORS Errors (manifest.json)

**Error**: "Access to manifest at 'file://...' has been blocked by CORS policy"

**Solution**: Use one of the local server options above. This error is expected when opening HTML files directly from the file system and won't occur when deployed.

### Cesium Not Loading

**Error**: "Cesium is not defined"

**Solution**:

- Check your internet connection (Cesium loads from CDN)
- Clear browser cache
- Ensure you're using a modern browser (Chrome 90+, Firefox 88+, Safari 14+)

### Webcam Not Playing

**Issue**: Video doesn't load in modal

**Solutions**:

- Some webcams may be temporarily offline
- Click "Open in New Tab" to view at source
- Check browser console for specific errors
- Ensure browser allows iframe embeds

### Performance Issues

**Issue**: Globe is laggy or slow

**Solutions**:

- Close other browser tabs
- Switch to 2D view (toggle button)
- Reduce browser zoom level
- Update graphics drivers
- Try a different browser

## 🎨 Development Tips

### Testing Changes

1. Make edits to worldmap-data.js, worldmap.js, or worldmap.css
2. Refresh browser (Ctrl+F5 for hard refresh)
3. Check browser console for errors

### Adding Webcams

1. Edit `worldmap-data.js`
2. Add entry to `WEBCAM_DATA` array
3. Save and refresh browser
4. Verify marker appears on globe

### Debugging Cesium

```javascript
// In browser console:
viewer.camera.position; // Current camera position
viewer.entities.values; // All entities (webcam markers)
viewer.scene.globe; // Globe properties
```

### Browser DevTools

- **Console**: View errors and logs
- **Network**: Check resource loading
- **Performance**: Monitor FPS and memory
- **Elements**: Inspect DOM and styles

## 📦 Production Deployment

### Cloudflare Pages

The site is already configured for Cloudflare Pages deployment. Just push to GitHub:

```bash
git add .
git commit -m "Add world map feature"
git push origin main
```

Cloudflare will automatically deploy to globaldeets.com

### Manual Deployment

Upload these files to your web server:

- worldmap.html
- worldmap.css
- worldmap.js
- worldmap-data.js
- styles.css (site-wide styles)
- shared/ecosystem-nav.css
- shared/ecosystem-nav.js

### CDN Resources

These are loaded from CDN (ensure internet connection):

- Cesium.js: https://cesium.com/downloads/cesiumjs/releases/1.119/
- Google Fonts: https://fonts.googleapis.com/
- Google Analytics: https://www.googletagmanager.com/

## 🔧 Configuration

### Change Map Imagery

In `worldmap.js`, line ~48:

```javascript
imageryProvider: new Cesium.OpenStreetMapImageryProvider({
  url: 'https://a.tile.openstreetmap.org/',
});
```

Other options:

- Bing Maps (requires API key)
- Mapbox (requires token)
- ESRI World Imagery
- Natural Earth II

### Customize Initial View

In `worldmap.js`, line ~57:

```javascript
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(
    0, // longitude
    30, // latitude
    20000000 // altitude in meters
  ),
});
```

### Adjust Performance

```javascript
// Lower quality for better performance
viewer.scene.globe.maximumScreenSpaceError = 4; // default: 2

// Disable lighting for speed
viewer.scene.globe.enableLighting = false;

// Reduce render scale on mobile
if (window.innerWidth < 768) {
  viewer.resolutionScale = 0.5;
}
```

## 📚 Useful Resources

- [Cesium Documentation](https://cesium.com/learn/cesiumjs-learn/)
- [Cesium Sandcastle](https://sandcastle.cesium.com/) - Interactive examples
- [Cesium Forum](https://community.cesium.com/) - Community support
- [Webcam APIs](https://api.windy.com/webcams/docs) - Find more webcams

## 🆘 Getting Help

### Check Browser Console

Press F12 and look at:

- Console tab for JavaScript errors
- Network tab for failed resource loads

### Common Error Messages

| Error                               | Cause               | Solution                         |
| ----------------------------------- | ------------------- | -------------------------------- |
| "Cesium is not defined"             | CDN not loaded      | Check internet connection        |
| "Viewer is not defined"             | Init failed         | Check console for earlier errors |
| "Cannot read property of undefined" | Data format error   | Verify webcam data structure     |
| "Mixed content blocked"             | HTTP/HTTPS mismatch | Ensure all resources use HTTPS   |

---

**Need more help?** Check the main WORLDMAP_README.md for full documentation.

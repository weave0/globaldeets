# Deploy to www.globaldeets.com

## Quick Deploy Options

### Option 1: Netlify (Easiest - Recommended)

1. **Install Netlify CLI:**
```bash
npm install -g netlify-cli
```

2. **Deploy:**
```bash
netlify deploy --prod
```

Follow prompts to connect your account and select the directory.

**Or use Netlify Drop:**
- Go to https://app.netlify.com/drop
- Drag the entire `Globaldeets` folder
- Set custom domain to `www.globaldeets.com`

### Option 2: Vercel

1. **Install Vercel CLI:**
```bash
npm install -g vercel
```

2. **Deploy:**
```bash
vercel --prod
```

3. **Add custom domain in dashboard:**
- Go to project settings
- Add `www.globaldeets.com`
- Update DNS records as instructed

### Option 3: GitHub Pages

1. **Create GitHub repo:**
```bash
git init
git add .
git commit -m "Initial commit - GlobalDeets portfolio"
git branch -M main
git remote add origin https://github.com/yourusername/globaldeets.git
git push -u origin main
```

2. **Enable GitHub Pages:**
- Go to repo Settings → Pages
- Source: Deploy from branch `main`
- Folder: `/ (root)`

3. **Add custom domain:**
- In Pages settings, add `www.globaldeets.com`
- Create `CNAME` file in root:
```
www.globaldeets.com
```

### Option 4: Traditional Web Hosting (cPanel/FTP)

**Via FTP:**
1. Connect to your hosting via FTP client (FileZilla, etc.)
2. Upload all files to `public_html` or `www` directory
3. Ensure `index.html` is in the root

**Via cPanel File Manager:**
1. Log into cPanel
2. Go to File Manager
3. Navigate to `public_html`
4. Upload all files
5. Extract if zipped

### Option 5: AWS S3 + CloudFront

1. **Create S3 bucket:**
```bash
aws s3 mb s3://www.globaldeets.com
```

2. **Upload files:**
```bash
aws s3 sync . s3://www.globaldeets.com --exclude "node_modules/*" --exclude ".git/*"
```

3. **Configure bucket for static hosting:**
```bash
aws s3 website s3://www.globaldeets.com --index-document index.html
```

4. **Set up CloudFront distribution** for HTTPS and CDN

## DNS Configuration

After deploying, update your DNS records:

**For Netlify/Vercel:**
```
CNAME    www    your-site.netlify.app
```

**For GitHub Pages:**
```
CNAME    www    yourusername.github.io
```

**For Traditional Hosting:**
```
A        @      your-server-ip
CNAME    www    yourdomain.com
```

## Files to Deploy

Include everything EXCEPT:
- ❌ `node_modules/` (not needed in production)
- ❌ `.git/` (version control)
- ❌ `package-lock.json` (optional)
- ❌ `.eslintrc.json` (dev only)
- ❌ `.prettierrc` (dev only)
- ❌ Documentation `.md` files (optional)

Required files:
- ✅ `index.html`
- ✅ `categories.html`
- ✅ `timeline.html`
- ✅ `analytics.html`
- ✅ `styles.css`
- ✅ `app.js`
- ✅ `projects-data.js`
- ✅ `manifest.json`
- ✅ `assets/` folder

## Pre-Deploy Checklist

- [ ] Test all pages locally
- [ ] Verify all project links work
- [ ] Check mobile responsiveness
- [ ] Test dark/light theme toggle
- [ ] Ensure search and filters work
- [ ] Test navigation between pages
- [ ] Verify external CDN links (Google Fonts, Animate.css)

## Post-Deploy Steps

1. **Test the live site:**
   - Visit `www.globaldeets.com`
   - Click through all navigation links
   - Test on mobile device
   - Verify all project links open

2. **Set up SSL/HTTPS:**
   - Most platforms (Netlify/Vercel) auto-provision SSL
   - For traditional hosting, install Let's Encrypt certificate

3. **Configure redirects (optional):**
   - Redirect `globaldeets.com` → `www.globaldeets.com`

4. **Monitor:**
   - Check browser console for errors
   - Test in different browsers (Chrome, Firefox, Safari)

## Update Process

To update your live site after changes:

**Netlify/Vercel:**
```bash
git add .
git commit -m "Update projects"
git push
# Auto-deploys
```

**Traditional hosting:**
- Re-upload changed files via FTP/cPanel

## Performance Optimization (Optional)

After deployment:
- Enable compression (Gzip/Brotli)
- Set cache headers for static assets
- Consider CDN for global performance
- Minify CSS/JS (optional - files are already small)

---

Ready to deploy? Choose your preferred method above!

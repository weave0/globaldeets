// Cloudflare Pages Functions Middleware
// Handles password protection and subdomain routing

// Password for main globaldeets site
const SITE_PASSWORD = "Moose";

// Simple password check
async function checkPassword(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  
  // Skip password check for mediation subdomain
  if (hostname.startsWith('mediation.')) {
    return null; // Allow through
  }
  
  // Check for password cookie
  const cookie = request.headers.get('Cookie');
  if (cookie && cookie.includes('globaldeets_auth=verified')) {
    return null; // Already authenticated
  }
  
  // Check if this is a login attempt
  if (request.method === 'POST') {
    const formData = await request.formData();
    const password = formData.get('password');
    
    if (password === SITE_PASSWORD) {
      // Set auth cookie
      const response = Response.redirect(url.href, 302);
      response.headers.set('Set-Cookie', 'globaldeets_auth=verified; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400');
      return response;
    }
  }
  
  // Show password form
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>GlobalDeets - Access Required</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #0d0d0d;
          color: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .auth-box {
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 2rem;
          border-radius: 8px;
          width: 100%;
          max-width: 400px;
        }
        h1 {
          margin-top: 0;
          font-size: 1.5rem;
        }
        input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid rgba(255,255,255,0.2);
          background: #0d0d0d;
          color: #f5f5f5;
          border-radius: 4px;
          font-size: 1rem;
          margin: 1rem 0;
        }
        button {
          width: 100%;
          padding: 0.75rem;
          background: #d4a574;
          color: #0d0d0d;
          border: none;
          border-radius: 4px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
        }
        button:hover {
          background: #e6b886;
        }
      </style>
    </head>
    <body>
      <div class="auth-box">
        <h1>🔒 GlobalDeets Access</h1>
        <p>This site is password protected.</p>
        <form method="POST">
          <input type="password" name="password" placeholder="Enter password" autofocus required>
          <button type="submit">Access Site</button>
        </form>
      </div>
    </body>
    </html>
  `, {
    status: 401,
    headers: {
      'Content-Type': 'text/html'
    }
  });
}

// Route mediation subdomain to correct folder
async function routeSubdomain(context) {
  const request = context.request;
  const url = new URL(request.url);
  const hostname = url.hostname;
  
  // If mediation subdomain, serve from /mediation/ folder
  if (hostname.startsWith('mediation.')) {
    // Rewrite path to /mediation/
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/mediation/index.html';
    } else if (!url.pathname.startsWith('/mediation/')) {
      url.pathname = '/mediation' + url.pathname;
    }
    
    // Fetch the rewritten URL
    return await fetch(new Request(url, request));
  }
  
  return await context.next();
}

export async function onRequest(context) {
  // Check password first (unless mediation subdomain)
  const passwordResponse = await checkPassword(context.request);
  if (passwordResponse) {
    return passwordResponse;
  }
  
  // Route subdomain
  return await routeSubdomain(context);
}

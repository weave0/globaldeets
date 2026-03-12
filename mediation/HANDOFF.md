# Project Handoff — Minnesota Peace

## Jamie Rigling Family Mediation Website

**Prepared by:** GlobalDeets / GitHub Copilot session
**Date:** March 12, 2026
**Receiving studio:** Good Flippin Design (GFD)
**Repo:** `weave0/globaldeets` → `/mediation/`

---

## 1. What Was Built

A complete single-page static website for **Jamie Rigling, LICSW, LADC** — a solo family mediator listed on the Minnesota Judicial Branch ADR Rule 114 Roster.

Built from scratch as a clean, self-contained `index.html` — no framework, no build step, no dependencies. Ships with a single image asset.

**Local preview path:**

```text
z:\GFD\GFD Dev Projects\Globaldeets\mediation\index.html
```

---

## 2. Asset Inventory

| File | Size | Notes |
| --- | --- | --- |
| `index.html` | ~48 KB | Complete site — all CSS, JS, HTML in one file |
| `JR Logo.jpg` | 150 KB | Brand mark, 960×867px, solid white background, no transparency |
| `Alternative Dispute Resolution (ADR).png` | 577 KB | Reference material, not yet used in site |
| `Additional Intel.png` | 475 KB | Reference material, not yet used in site |

**Note on logo:** The logo is a designed mark with a solid background. All placements use `object-fit: contain` inside a white card frame. Do not apply `border-radius: 50%` or `object-fit: cover` — that crops the mark incorrectly.

---

## 3. Site Structure

| Section ID | Content |
| --- | --- |
| `#home` | Hero — headline, eyebrow credentials, logo, dual CTA |
| `#why-mediation` | 4-card grid — Less Expensive / Faster / Private / Family-Focused |
| `#about` | Bio + credentials card (Rule 114, LICSW, LADC) |
| `#services` | 5 service cards — Divorce, Custody, Parenting Time, Post-Decree, Co-Parent |
| `#veterans` | Dark-background niche section — military family focus, no gimmicks |
| `#process` | 5-step process — Intro Call → Intake → Sessions → Agreement → Court Guidance |
| `#resources` | Links to MN Courts, parenting resources, internal FAQ anchors |
| `#booking` | Live Calendly inline embed |
| `#contact` | Phone, email, location, website |

---

## 4. Brand & Design Tokens

```css
--bg:           #fafaf8   /* warm off-white page background */
--bg-elevated:  #ffffff   /* card / panel backgrounds */
--bg-alt:       #f0ede8   /* alternate section background */
--accent:       #3b6e8f   /* primary brand blue (slate) */
--accent-hover: #2d5a75
--accent-light: #e8f0f5
--warm:         #8b6f4e   /* secondary warm brown */
--warm-light:   #f5f0ea
--text:         #2c2c2c
--text-muted:   #6b6b6b
--border:       rgba(0,0,0,0.08)
```

**Font:** Inter (Google Fonts, weights 300/400/500/600/700)

**TODO for GFD:** Eyedrop hex values from the actual `JR Logo.jpg` to confirm whether `--accent` and `--warm` should be tuned to match the mark. Current palette is a close approximation but was not color-sampled from the file.

---

## 5. Domains

Two domains are registered for this project. The primary is on Cloudflare; the secondary needs a redirect set.

### Primary — `minnesotapeace.com`

- **Registrar:** Cloudflare (weave0 account — Brett Weaver / GFD LLC)
- **Registered:** March 12, 2026 | **Expires:** March 12, 2027
- **Auto-renew:** NOT yet enabled — enable before handoff to Jamie
- **Status:** Registered, DNS not yet pointed to any host
- **Canonical in `index.html`:** Set to `https://minnesotapeace.com/`

### Secondary — `mnfamilymediation.com`

- **Registrar:** NetworkSolutions (Jamie's account)
- **Action needed:** Set a 301 redirect → `https://minnesotapeace.com/` once primary is live
- **Do not let it lapse:** There may be ADR roster links or existing references to it

---

## 6. Deployment — Current Status and Remaining Steps

### What's been done (March 12, 2026)

Three commits pushed to `weave0/globaldeets` main branch:

1. **`791e536`** — Full site rebuild (index.html 48KB + JR Logo.jpg + HANDOFF.md)
2. **`af38f8f`** — CSP fix for `/mediation/*` allowing Calendly embed + Google Fonts
3. **`b6a4ec9`** — Middleware fix: `context.env.ASSETS.fetch()` instead of external `fetch()` to serve mediation subdomain content from Pages static assets

### Current 404 Issue

`mediation.globaldeets.com` DNS resolves correctly (Cloudflare proxy IPs `172.67.180.251`, `104.21.96.130`) but returns **HTTP 404**. The middleware fix above may resolve it after the next Cloudflare Pages deployment completes.

**Diagnosis checklist for GFD:**

1. In Cloudflare Pages dashboard → `globaldeets` project → check **Deployments** tab. Is the latest deployment from commit `b6a4ec9`? If not, trigger a manual deployment.
2. If deploy is current but still 404: open **Functions** tab → verify `functions/_middleware.js` is listed as a function.
3. Test `globaldeets.com/mediation/index.html` directly (after authenticating with site password) to confirm the static file exists in the deployment.
4. If the Asset fetch pattern doesn't work in this Pages version, revert middleware to `return await context.next()` after injecting a rewrite via `context.request` — see Cloudflare Pages Functions v2 docs.

### Next steps — minnesotapeace.com

Once `mediation.globaldeets.com` is serving correctly as a staging URL:

### Attach the custom domain

In the Pages project → **Custom domains → Add domain → `minnesotapeace.com`**

Cloudflare will auto-configure DNS since the domain is registered in the same Cloudflare account.

### Set the 301 redirect for old domain

In Cloudflare → **Rules → Redirect Rules**, add a bulk redirect:

```text
Source: mnfamilymediation.com/*
Target: https://minnesotapeace.com/$1
Type:   301 Permanent
```

---

## 7. Calendly

| Field | Value |
| --- | --- |
| Account URL | `calendly.com/jamieriglingmediation-1` |
| Live event URL | `calendly.com/jamieriglingmediation-1/30min` |
| Event name | 30-Minute Introductory Call |
| Credentials holder | GlobalDeets (developer-created account) |
| Embed in site | Wired into `#booking` section as inline widget |
| Brand color param | `primary_color=3b6e8f` (matches site accent) |

**Jamie's action items:**

- Set availability windows in Calendly dashboard
- Add notification email preferences
- When ready: transfer account via Calendly → Account Settings → Profile

**GFD note:** Account is dev-hosted so Jamie can experience the full booking flow before go-live. Do not delete — transfer ownership when she's ready.

---

## 8. Client — Jamie Rigling

| Field | Value |
| --- | --- |
| Legal entity | Minnesota Family Mediation PLLC |
| Brand name | Minnesota Peace |
| Phone | (507) 383-7088 — replace when Google Voice approved |
| Email | `jamielarsen76@gmail.com` — replace with professional address |
| Location | Maple Grove, MN 55369 |
| Credentials | LICSW, LADC, Rule 114 Qualified Neutral |
| ADR Roster | <https://adrroster.courts.state.mn.us/> |
| Calendly | <https://calendly.com/jamieriglingmediation-1> |
| Client status | New solo practice, employment transition in progress |
| Technical comfort | Wants to learn and control the site — low-code path preferred |

**Client-expressed priorities from session:**

- Wants to serve veterans and military families (niche, not exclusive)
- Needs to "nail down vision" — website itself is helping clarify this
- Wants to control and learn the platform
- Getting intake forms built (not yet integrated)
- Google Voice number pending approval — swap into `#contact` when confirmed
- Professional email address needed — can provision `@minnesotapeace.com` free via Cloudflare Email Routing

---

## 9. Outstanding Items for GFD

| Priority | Item | Notes |
| --- | --- | --- |
| 🔴 High | Resolve `mediation.globaldeets.com` 404 | See Section 6 diagnosis checklist — middleware + deploy verification |
| 🔴 High | Point `minnesotapeace.com` to Pages project | Custom domain in Cloudflare Pages dashboard |
| 🔴 High | Enable auto-renew on `minnesotapeace.com` | Expires March 2027 — Cloudflare Domain Registration settings |
| ✅ Done | Push updated `index.html` + logo to GitHub | Commits `791e536`, `af38f8f`, `b6a4ec9` on March 12, 2026 |
| ✅ Done | CSP rules for Calendly + Google Fonts | `/mediation/*` override in `_headers` |
| ✅ Done | Middleware fix for subdomain routing | `ASSETS.fetch()` in `functions/_middleware.js` |
| 🟡 Med | Set 301 redirect `mnfamilymediation.com` → primary | Cloudflare Redirect Rules |
| 🟡 Med | Replace phone when Google Voice approved | Update `#contact` section and `tel:` href |
| 🟡 Med | Replace Gmail with professional email | Free via Cloudflare Email Routing |
| 🟡 Med | Color-sample logo and tune CSS accent tokens | Eyedrop `JR Logo.jpg` primary colors |
| 🟢 Low | Integrate intake forms when built | Jamie building separately |
| 🟢 Low | Add professional headshot of Jamie | About section — significantly improves trust signals |
| 🟢 Low | Create OG social share image | No `og:image` currently — 1200×630 branded card |
| 🟢 Low | Add analytics | Cloudflare Web Analytics — free, one-line embed |
| 🟢 Low | Transfer Calendly account to Jamie | When she is ready to take ownership |

---

## 10. What to Tell Jamie

> The site is built and ready to deploy. Your Calendly booking page is live and wired in.
> Once we point the domain, `minnesotapeace.com` will be a fully functional professional
> mediation website with real online scheduling.
>
> **Your three next steps:**
>
> 1. Log into Calendly and set your available hours for intro calls.
> 2. Send us your Google Voice number when it's approved — we will swap it in.
> 3. Let us know when you want a professional email — we can set up `@minnesotapeace.com`
>    at no extra cost through Cloudflare.
>
> Everything else is in our hands.

---

*Handoff prepared March 12, 2026 — Repo: `weave0/globaldeets /mediation/`*

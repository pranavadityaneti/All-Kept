# Website: policy and support pages on www.allkept.app — design

Date: 11 September 2026 · Approved by Pranav in chat, 11 Sep 2026 · Approach A (Next.js on Vercel, all pages static)

## Goal

Serve the privacy policy, terms of service, data-deletion page and a new support page at
`https://www.allkept.app/…`, hosted on Vercel and deployed from git, so the app, Meta's app
dashboard and both store listings can point at the company domain instead of GitHub Pages.
The landing page is a black-and-white placeholder; the real landing page is a later, separate
project.

## Decisions already made

- Play developer account is an organisation; availability is United States and India.
- The privacy and terms text in `docs/privacy.html` and `docs/terms.html` (values confirmed by
  Pranav on 10 Sep, presentation finalised 11 Sep) is the approved content and is carried over
  verbatim.
- The email waitlist on the old `website` branch, and its Cloudflare D1 database, are dropped.
- Nothing from the old `website` branch's `apps/website` is reused.

## Where it lives, how it ships

- Path: `apps/website` on `main`. Built on a new branch `website-pages` in a worktree at
  `.worktrees/website-pages`; pull request to `main`; merge is the production deploy.
- Package name `@allkept/website`, a workspace member via the root `apps/*` workspaces —
  the same arrangement `apps/admin` already deploys with on Vercel.
- Vercel project (created by Pranav): Root Directory `apps/website`, framework Next.js
  (auto-detected), production branch `main`, domains `www.allkept.app` (primary) and
  `allkept.app` (redirects to www). Every push to the PR gets a preview URL.

## Stack

- `next`, `react`, `react-dom`, TypeScript. Nothing else at runtime.
- No Tailwind, no component kit, no database, no analytics, no cookies, no external fonts and no
  third-party scripts. The privacy policy states there are none on the site; the pages must
  render fully inside an in-app browser. System font stack, as in `docs/privacy.html`.
- One hand-written `app/globals.css` carrying the house style already in `docs/privacy.html`
  (light ground `#F6F7FA`, ink `#14161C`, accent `#6D46F2`, `.note`, `.toc`, tables, `.stamp`,
  print rules). Legal-page styles are scoped under `.legal`.
- All routes are statically rendered at build time; no server code, no API routes.

## Routes and files

```
apps/website/
  package.json            @allkept/website — scripts: dev, build (next build), start, typecheck (tsc --noEmit)
  tsconfig.json, next.config.ts (default), next-env.d.ts, .gitignore (.next, node_modules)
  app/layout.tsx          <html lang="en">, metadata (title template "%s · Allkept"), SiteHeader, SiteFooter
  app/globals.css
  app/page.tsx            placeholder home
  app/privacy/page.tsx    <LegalPage> for content/privacy.html
  app/terms/page.tsx      <LegalPage> for content/terms.html
  app/delete/page.tsx     <LegalPage> for content/delete.html
  app/support/page.tsx    support page (JSX, new copy)
  components/SiteHeader.tsx   the word "Allkept", links to /
  components/SiteFooter.tsx   Privacy · Terms · Delete your data · Support · hi@allkept.app
  components/LegalPage.tsx    reads content/<name>.html at build time, renders it inside the shell
  content/privacy.html, content/terms.html, content/delete.html   extracted article fragments
  scripts/extract-content.mjs   one-time extraction from docs/, kept for re-runs
  scripts/check-links.mjs       post-build check of internal links and anchors
```

## Privacy, terms, delete — verbatim by construction

- `scripts/extract-content.mjs` reads `docs/privacy.html`, `docs/terms.html`, `docs/delete.html`,
  takes the article's inner HTML (everything between the page's own nav and footer), and writes
  it to `content/<name>.html`. The only rewrites are cross-links: `index.html` → `/`,
  `privacy.html` → `/privacy`, `terms.html` → `/terms`, `delete.html` → `/delete`,
  `testers.html` → `/support`. In-page anchors (`#section`) are unchanged.
- `LegalPage` renders the fragment with `dangerouslySetInnerHTML`. The fragments are our own
  static files, not user input, so this is safe; it is what keeps the text byte-identical.
- The extraction is verified by script: the visible text of each `content/*.html` equals the
  visible text of the corresponding article in `docs/`, ignoring whitespace.
- After this ships, the website copies are the source of truth. The `docs/` copies stay until the
  follow-up that turns them into redirects.

## Support page (new copy)

- **Support** — Allkept keeps the things you save on social platforms in one searchable library.
- **Get help** — email hi@allkept.app, or open Settings → Send feedback in the app.
- **How to save** — send any post to @allkeptapp in an Instagram message · share a link to Allkept
  from any app · tap + and paste a link · connect a public YouTube playlist · bring in older
  Instagram saves from your Meta data export.
- **Your account and data** — delete everything from Settings → "Delete account and everything in
  it", or see Delete your data. Links to the privacy policy and terms.
- **Company** — MECA Engineering Solutions (OPC) Private Limited, Bengaluru, India.
- No response-time promise.

## Placeholder home page

White page, black text: "Allkept" and "Everything you save, in one place." with the shared
footer. No images, no launch date. Replaced whole by the real landing page later.

## Verification (definition of done)

1. `npm run build` in `apps/website` succeeds; `npm run typecheck` is clean.
2. `scripts/check-links.mjs` over `.next` output (or a static export) finds every internal link
   and `#anchor` target present.
3. Extracted text equals source text (script, not eye).
4. Each of the five pages rendered in the in-app browser and screenshotted; no console errors.
5. Zero external network requests from any page (checked in the browser's network log).

## Follow-ups (separate tasks, after the domain is live)

1. Switch the app's privacy/terms links in `apps/mobile/app/(tabs)/settings.tsx` to
   `https://www.allkept.app/privacy` and `/terms` — JS-only, ships over the air.
2. Update Meta app dashboard URLs (privacy, terms, data deletion) — Pranav.
3. Update `docs/store-submission.html` URLs (privacy, support, marketing).
4. Turn `docs/privacy.html`, `terms.html`, `delete.html`, `testers.html` into meta-refresh
   redirects to www.allkept.app.
5. Retire the old `website` worktree and branch.

## Out of scope

The real landing page and its artwork, the waitlist, cookie or consent banners, analytics,
tablet/desktop app screenshots on the site.

# Website policy and support pages — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js site at `apps/website` that serves `/`, `/privacy`, `/terms`, `/delete` and `/support` as static HTML, deployable on Vercel at www.allkept.app, with the privacy/terms/delete text carried over verbatim from `docs/`.

**Architecture:** One Next.js App Router project, `output: "export"` so every page is plain HTML at build time and no server code can creep in. The three legal pages render HTML fragments extracted by script from the approved `docs/` files; a shared `LegalPage` component wraps them. Header and footer live in the root layout. Verification is scripted: text equality against the source, and an internal link/anchor check over the built output.

**Tech Stack:** next 16.3.4, react 19.2.3, TypeScript ~6.0.3 (matching `apps/mobile` and `apps/admin`), plain CSS. No other dependencies.

Spec: `docs/superpowers/specs/2026-09-11-website-policy-pages-design.md`.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/website/package.json` | `@allkept/website`; scripts `dev`, `build`, `typecheck`, `extract`, `verify:content`, `check:links` |
| `apps/website/tsconfig.json` | extends `tsconfig.base.json`; Next-specific overrides |
| `apps/website/next.config.ts` | `output: "export"` |
| `apps/website/.gitignore` | `.next/`, `out/`, `next-env.d.ts`, `*.tsbuildinfo` |
| `apps/website/app/globals.css` | house style from `docs/privacy.html`, site nav/footer, home page |
| `apps/website/app/layout.tsx` | `<html>`, metadata, `.wrap`, `SiteHeader`, `SiteFooter` |
| `apps/website/app/page.tsx` | placeholder home |
| `apps/website/app/{privacy,terms,delete}/page.tsx` | one `LegalPage` each, with page title |
| `apps/website/app/support/page.tsx` | support copy (JSX) |
| `apps/website/components/SiteHeader.tsx` | wordmark + links |
| `apps/website/components/SiteFooter.tsx` | links + mailto |
| `apps/website/components/LegalPage.tsx` | reads `content/<name>.html` at build time, renders it |
| `apps/website/content/{privacy,terms,delete}.html` | generated fragments — committed, source of truth after launch |
| `apps/website/scripts/extract-content.mjs` | `docs/` → `content/`, link rewrite only |
| `apps/website/scripts/verify-content.mjs` | text equality + link hygiene |
| `apps/website/scripts/check-links.mjs` | link/anchor check over `out/` |

---

### Task 1: Worktree and a baseline fingerprint for the mobile app

Adding a workspace changes the root lockfile. `ERRORS.md` records a build broken by a `node_modules` layout change, so we measure the mobile app's native fingerprint before and after.

**Files:** none created.

- [ ] **Step 1: Create the branch and worktree from `main`**

Run (from `/Users/pranavaditya/projects/allkept`):
```bash
git worktree add .worktrees/website-pages -b website-pages main
```
Expected: `Preparing worktree (new branch 'website-pages')` and `HEAD is now at 371e673 …` (or later).

- [ ] **Step 2: Install the workspace exactly as locked**

Run:
```bash
cd .worktrees/website-pages && source ~/.nvm/nvm.sh && npm ci
```
Expected: ends with `added N packages` and no `ERR!` lines.

- [ ] **Step 3: Record the mobile fingerprint**

Run:
```bash
cd .worktrees/website-pages/apps/mobile && source ~/.nvm/nvm.sh && npx --yes @expo/fingerprint@latest fingerprint:generate . | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hash))' | tee /tmp/fp-before.txt
```
Expected: one 40-character hash printed and saved.

---

### Task 2: Project skeleton

**Files:**
- Create: `apps/website/package.json`
- Create: `apps/website/tsconfig.json`
- Create: `apps/website/next.config.ts`
- Create: `apps/website/.gitignore`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@allkept/website",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "extract": "node scripts/extract-content.mjs",
    "verify:content": "node scripts/verify-content.mjs",
    "check:links": "node scripts/check-links.mjs"
  },
  "dependencies": {
    "next": "16.3.4",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@types/node": "^22.19.19",
    "@types/react": "~19.2.4",
    "@types/react-dom": "~19.2.3",
    "typescript": "~6.0.3"
  }
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "resolveJsonModule": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next", "out"]
}
```

- [ ] **Step 3: `next.config.ts`**

```ts
import type { NextConfig } from "next";

// Five static pages and nothing to render on request. A static export makes that a build-time
// guarantee: any server-only feature would fail the build instead of quietly shipping.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
```

- [ ] **Step 4: `.gitignore`**

```
.next/
out/
next-env.d.ts
*.tsbuildinfo
```

- [ ] **Step 5: Install and re-measure the fingerprint**

Run:
```bash
cd .worktrees/website-pages && source ~/.nvm/nvm.sh && npm install && cd apps/mobile && npx --yes @expo/fingerprint@latest fingerprint:generate . | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hash))' | tee /tmp/fp-after.txt && diff /tmp/fp-before.txt /tmp/fp-after.txt && echo "fingerprint unchanged"
```
Expected: `fingerprint unchanged`. If `diff` prints anything, STOP and report — the mobile app's native inputs moved.

- [ ] **Step 6: Commit**

```bash
cd .worktrees/website-pages && git add apps/website package-lock.json && git commit -m "website: Next.js skeleton for the policy pages site"
```

---

### Task 3: Extract the approved text from `docs/`

**Files:**
- Create: `apps/website/scripts/extract-content.mjs`
- Create: `apps/website/scripts/verify-content.mjs`
- Generate: `apps/website/content/privacy.html`, `terms.html`, `delete.html`

- [ ] **Step 1: Write the verifier first (it is the test)**

`apps/website/scripts/verify-content.mjs`:
```js
// Proves content/*.html carries the approved docs/ text verbatim: the visible text of each fragment
// equals the visible text of the matching docs/ article, whitespace aside. Also refuses any link
// that is not a site route, an in-page anchor, http(s) or mailto — a leftover "privacy.html" would
// 404 on the site.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, "../../../docs");
const content = path.resolve(here, "../content");

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const between = (html, a, b) => {
  const start = html.indexOf(a);
  const end = html.indexOf(b, start);
  if (start < 0 || end < 0) throw new Error(`could not find ${a} … ${b}`);
  return html.slice(start + a.length, end);
};

// What each fragment must equal, read from the docs/ page it came from.
const expectedText = {
  privacy: (s) => text(between(s, "</nav>", "<footer>")),
  terms: (s) => text(between(s, "</nav>", "<footer>")),
  // delete.html has no nav or footer; its closing "last updated" line is page chrome, not content.
  delete: (s) => text(between(s, "<body>", "</body>").replace(/<p><small>Allkept · last updated [^<]*<\/small><\/p>/, "")),
};

let failed = false;
for (const [name, expect] of Object.entries(expectedText)) {
  const expected = expect(readFileSync(path.join(docs, `${name}.html`), "utf8"));
  const raw = readFileSync(path.join(content, `${name}.html`), "utf8");
  // The stamp on delete.html is added by the extractor, so it is not part of the comparison.
  const actual = text(name === "delete" ? raw.replace(/<p class="stamp">[^<]*<\/p>/, "") : raw);
  if (actual !== expected) {
    failed = true;
    let i = 0;
    while (i < actual.length && actual[i] === expected[i]) i++;
    console.error(`${name}: text differs at character ${i}\n  expected: …${expected.slice(Math.max(0, i - 40), i + 60)}…\n  actual:   …${actual.slice(Math.max(0, i - 40), i + 60)}…`);
  }
  const bad = [...raw.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).filter((h) => !/^(\/|#|https?:|mailto:)/.test(h));
  if (bad.length) {
    failed = true;
    console.error(`${name}: links that would not resolve on the site: ${bad.join(", ")}`);
  }
}
console.log(failed ? "content verification FAILED" : "content verified: privacy, terms, delete match docs/ verbatim");
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail (no content yet)**

Run:
```bash
cd .worktrees/website-pages/apps/website && node scripts/verify-content.mjs
```
Expected: an `ENOENT … content/privacy.html` error, exit code 1.

- [ ] **Step 3: Write the extractor**

`apps/website/scripts/extract-content.mjs`:
```js
// Lifts the approved policy text out of docs/ into content/. Re-runnable. The text is carried over
// verbatim; the only edits are cross-page links, which point at site routes instead of .html files.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, "../../../docs");
const out = path.resolve(here, "../content");
mkdirSync(out, { recursive: true });

const LINKS = [
  ['href="index.html"', 'href="/"'],
  ['href="privacy.html"', 'href="/privacy"'],
  ['href="terms.html"', 'href="/terms"'],
  ['href="delete.html"', 'href="/delete"'],
  ['href="testers.html"', 'href="/support"'],
];
const rewriteLinks = (html) => LINKS.reduce((s, [from, to]) => s.split(from).join(to), html);

const between = (html, a, b, file) => {
  const start = html.indexOf(a);
  const end = html.indexOf(b, start);
  if (start < 0 || end < 0) throw new Error(`${file}: could not find ${a} … ${b}`);
  return html.slice(start + a.length, end);
};

// privacy.html and terms.html: the article is everything between the page's own nav and footer.
for (const name of ["privacy", "terms"]) {
  const src = readFileSync(path.join(docs, `${name}.html`), "utf8");
  const article = between(src, "</nav>", "<footer>", `${name}.html`).trim();
  writeFileSync(path.join(out, `${name}.html`), rewriteLinks(article) + "\n");
}

// delete.html has no nav or footer. Its closing "last updated" line is page chrome: it becomes the
// stamp under the heading, the way the other two pages carry theirs.
{
  const src = readFileSync(path.join(docs, "delete.html"), "utf8");
  const body = between(src, "<body>", "</body>", "delete.html");
  const stamp = body.match(/<p><small>Allkept · last updated ([^·<]+)·[^<]*<\/small><\/p>/);
  if (!stamp) throw new Error("delete.html: last-updated line not found");
  const article = body
    .replace(stamp[0], "")
    .replace("<h1>Delete Your Data</h1>", `<h1>Delete Your Data</h1>\n<p class="stamp">Last updated ${stamp[1].trim()}</p>`)
    .trim();
  writeFileSync(path.join(out, "delete.html"), rewriteLinks(article) + "\n");
}

console.log("content/ written from docs/: privacy, terms, delete");
```

- [ ] **Step 4: Run the extractor, then the verifier**

Run:
```bash
cd .worktrees/website-pages/apps/website && node scripts/extract-content.mjs && node scripts/verify-content.mjs
```
Expected:
```
content/ written from docs/: privacy, terms, delete
content verified: privacy, terms, delete match docs/ verbatim
```

- [ ] **Step 5: Eyeball the fragment edges**

Run:
```bash
cd .worktrees/website-pages/apps/website && head -3 content/privacy.html && echo … && tail -2 content/privacy.html && echo && cat content/delete.html
```
Expected: privacy starts with `<h1>Privacy Policy</h1>` then the stamp, ends with the last section's closing tag (no `<footer>`); delete shows the h1, the stamp line, the intro paragraph, the two-item list and the closing paragraph, with no `<small>` line.

- [ ] **Step 6: Commit**

```bash
cd .worktrees/website-pages && git add apps/website/scripts apps/website/content && git commit -m "website: the approved policy text, extracted from docs/ and verified verbatim"
```

---

### Task 4: Styles, layout, header, footer

**Files:**
- Create: `apps/website/app/globals.css`
- Create: `apps/website/app/layout.tsx`
- Create: `apps/website/components/SiteHeader.tsx`
- Create: `apps/website/components/SiteFooter.tsx`

- [ ] **Step 1: `app/globals.css`** — the house style from `docs/privacy.html`, plus site nav/footer and the home page. No external fonts or stylesheets: the pages must render fully inside an in-app browser.

```css
/* House style carried over from docs/privacy.html. Light ground, painted explicitly. No external fonts
   and no external stylesheets: these pages must render identically inside an in-app browser. */
:root{
  --bg:#F6F7FA; --surface:#FFFFFF; --surface-alt:#EEF0F6; --line:#DFE3EC;
  --ink:#14161C; --muted:#5F6675; --accent:#6D46F2; --accent-soft:#EDE8FF;
  --warn:#8A5200; --warn-bg:#FFF6E6; --warn-line:#F0D9A8;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font:400 16px/1.62 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:760px; margin:0 auto; padding:0 20px 72px}

.site-nav{display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; padding:24px 0 8px}
.mark{font-weight:700; letter-spacing:-.02em; font-size:17px; color:var(--ink); text-decoration:none}
.site-nav .links{display:flex; gap:18px; font-size:14px; flex-wrap:wrap}
.site-nav a{color:var(--muted); text-decoration:none}
.site-nav a:hover{color:var(--ink)}

h1{font-size:clamp(28px,5vw,38px); line-height:1.1; letter-spacing:-.03em; margin:26px 0 6px}
.stamp{color:var(--muted); font-size:14px; margin:0 0 22px}
h2{font-size:21px; letter-spacing:-.015em; margin:38px 0 10px; padding-top:14px; border-top:1px solid var(--line)}
h3{font-size:16.5px; margin:24px 0 6px; letter-spacing:-.01em}
p,li{font-size:15.5px}
ul,ol{padding-left:22px}
li{margin:5px 0}
a{color:var(--accent)}
strong{font-weight:600}
code{background:var(--surface-alt); border:1px solid var(--line); border-radius:4px; padding:1px 5px; font-size:13.5px}
.caps{font-size:14.5px; letter-spacing:.01em}

.note{
  background:var(--warn-bg); border:1px solid var(--warn-line); border-left:4px solid var(--warn);
  border-radius:10px; padding:14px 16px; margin:20px 0; color:var(--warn); font-size:15px;
}
.note strong{color:var(--warn)}
.note p{margin:0 0 8px; font-size:15px}
.note p:last-child{margin:0}

.callout{background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:16px 18px; margin:18px 0}
.callout p:first-child,.callout ul:first-child{margin-top:0}
.callout p:last-child,.callout ul:last-child{margin-bottom:0}

.toc{background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:16px 20px; margin:24px 0}
.toc h2{border:0; margin:0 0 8px; padding:0; font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted)}
.toc ol{margin:0; padding-left:20px; columns:2; column-gap:28px}
.toc li{margin:3px 0; break-inside:avoid; font-size:14.5px}
.toc a{text-decoration:none}
.toc a:hover{text-decoration:underline}
@media (max-width:620px){ .toc ol{columns:1} }

.scroll{overflow-x:auto; -webkit-overflow-scrolling:touch; margin:16px 0; border:1px solid var(--line); border-radius:12px; background:var(--surface)}
table{border-collapse:collapse; width:100%; min-width:520px; font-size:14.5px}
th,td{text-align:left; vertical-align:top; padding:10px 14px; border-bottom:1px solid var(--line)}
th{background:var(--surface-alt); font-weight:600; font-size:13.5px}
tr:last-child td{border-bottom:0}

.site-footer{border-top:1px solid var(--line); margin-top:44px; padding-top:20px; color:var(--muted); font-size:13.5px}
.site-footer a{color:var(--muted)}
.site-footer .l{display:flex; gap:16px; flex-wrap:wrap; margin-top:8px}

/* Placeholder home: the wordmark and one line, nothing else, until the real landing page lands. */
.home{padding:96px 0 48px}
.home h1{font-size:clamp(40px,9vw,64px); margin:0 0 10px}
.home p{font-size:19px; color:var(--muted); margin:0}

@media print{
  :root{--bg:#fff; --surface:#fff; --surface-alt:#f4f4f4; --accent:#000; --accent-soft:#fff}
  body{font-size:10.5pt; line-height:1.45}
  .wrap{max-width:none; padding:0}
  .site-nav,.toc{display:none}
  h1{font-size:22pt}
  h2{font-size:13pt; page-break-after:avoid; border-top:1px solid #ccc}
  h3{font-size:11.5pt; page-break-after:avoid}
  p,li,table{font-size:10pt}
  table,.scroll,.note,.callout{page-break-inside:avoid}
  .scroll{overflow:visible; border:0}
  table{min-width:0; border:1px solid #ccc}
  a{color:#000; text-decoration:none}
  a[href^="http"]::after,a[href^="mailto"]::after{content:" (" attr(href) ")"; font-size:8.5pt; color:#555}
}
```

- [ ] **Step 2: `components/SiteHeader.tsx`**

```tsx
import Link from "next/link";

export function SiteHeader() {
  return (
    <nav className="site-nav" aria-label="Site">
      <Link className="mark" href="/">Allkept</Link>
      <span className="links">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/delete">Delete your data</Link>
        <Link href="/support">Support</Link>
      </span>
    </nav>
  );
}
```

- [ ] **Step 3: `components/SiteFooter.tsx`**

```tsx
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>Allkept · MECA Engineering Solutions (OPC) Private Limited</span>
      <span className="l">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/delete">Delete your data</Link>
        <Link href="/support">Support</Link>
        <a href="mailto:hi@allkept.app">hi@allkept.app</a>
      </span>
    </footer>
  );
}
```

- [ ] **Step 4: `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.allkept.app"),
  title: { default: "Allkept", template: "%s · Allkept" },
  description: "Everything you save, in one place.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd .worktrees/website-pages && git add apps/website/app apps/website/components && git commit -m "website: house style, layout, header and footer"
```

---

### Task 5: The five pages

**Files:**
- Create: `apps/website/components/LegalPage.tsx`
- Create: `apps/website/app/page.tsx`
- Create: `apps/website/app/privacy/page.tsx`, `apps/website/app/terms/page.tsx`, `apps/website/app/delete/page.tsx`
- Create: `apps/website/app/support/page.tsx`

- [ ] **Step 1: `components/LegalPage.tsx`** — a server component; the file read happens once, at build time, because every route is statically exported.

```tsx
import { readFileSync } from "node:fs";
import path from "node:path";

export type LegalName = "privacy" | "terms" | "delete";

// The fragments in content/ are our own static files extracted from the approved docs/ pages and
// verified verbatim by scripts/verify-content.mjs. Rendering them as HTML is what keeps the text
// byte-identical to what Pranav approved; nothing user-supplied ever reaches this component.
export function LegalPage({ name }: { name: LegalName }) {
  const html = readFileSync(path.join(process.cwd(), "content", `${name}.html`), "utf8");
  return <article className="legal" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

- [ ] **Step 2: `app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <section className="home">
      <h1>Allkept</h1>
      <p>Everything you save, in one place.</p>
    </section>
  );
}
```

- [ ] **Step 3: `app/privacy/page.tsx`**

```tsx
import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <LegalPage name="privacy" />;
}
```

- [ ] **Step 4: `app/terms/page.tsx`**

```tsx
import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return <LegalPage name="terms" />;
}
```

- [ ] **Step 5: `app/delete/page.tsx`**

```tsx
import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = { title: "Delete Your Data" };

export default function DeletePage() {
  return <LegalPage name="delete" />;
}
```

- [ ] **Step 6: `app/support/page.tsx`** — the copy approved in the spec.

```tsx
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <article className="legal">
      <h1>Support</h1>
      <p className="stamp">Allkept keeps the things you save on social platforms in one searchable library.</p>

      <h2 id="help">Get help</h2>
      <p>
        Email <a href="mailto:hi@allkept.app">hi@allkept.app</a>, or open <strong>Settings → Send feedback</strong> in the app.
      </p>

      <h2 id="save">How to save</h2>
      <ul>
        <li>Send any post to <strong>@allkeptapp</strong> in an Instagram message.</li>
        <li>Share a link to Allkept from any app.</li>
        <li>Tap <strong>+</strong> and paste a link.</li>
        <li>Connect a public YouTube playlist.</li>
        <li>Bring in older Instagram saves from your Meta data export.</li>
      </ul>

      <h2 id="data">Your account and data</h2>
      <p>
        Delete everything from <strong>Settings → Delete account and everything in it</strong>, or see{" "}
        <Link href="/delete">Delete your data</Link>. Read the <Link href="/privacy">privacy policy</Link> and the{" "}
        <Link href="/terms">terms of service</Link>.
      </p>

      <h2 id="company">Company</h2>
      <p>MECA Engineering Solutions (OPC) Private Limited, Bengaluru, India.</p>
    </article>
  );
}
```

- [ ] **Step 7: Build and type-check**

Run:
```bash
cd .worktrees/website-pages/apps/website && source ~/.nvm/nvm.sh && npm run build && npm run typecheck && ls out
```
Expected: `next build` lists `/`, `/privacy`, `/terms`, `/delete`, `/support` (and `/_not-found`) as static (○), no errors; `tsc` prints nothing; `out` contains `index.html privacy.html terms.html delete.html support.html 404.html _next`.

- [ ] **Step 8: Commit**

```bash
cd .worktrees/website-pages && git add apps/website/app apps/website/components && git commit -m "website: home, privacy, terms, delete and support pages"
```

---

### Task 6: Link check over the built site

**Files:**
- Create: `apps/website/scripts/check-links.mjs`

- [ ] **Step 1: Write the checker**

```js
// After `next build` (static export), every internal link and every #anchor in out/**/*.html must
// resolve to a page and an id that exist. Store forms and the app will link into these pages;
// a broken table-of-contents anchor is the kind of thing nobody notices until a reviewer does.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../out");

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (p.endsWith(".html")) yield p;
  }
}

const pages = new Map(); // route -> { ids, links }
for (const file of htmlFiles(out)) {
  const html = readFileSync(file, "utf8");
  const rel = path.relative(out, file).split(path.sep).join("/");
  const route = rel === "index.html" ? "/" : "/" + rel.replace(/\/index\.html$/, "").replace(/\.html$/, "");
  pages.set(route, {
    ids: new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
    links: [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]),
  });
}

let failed = false;
for (const [route, { links }] of pages) {
  for (const href of links) {
    if (/^(https?:|mailto:)/.test(href) || href.startsWith("/_next/")) continue;
    const [pathPart, hash] = href.split("#");
    const target = pathPart === "" ? route : pathPart.replace(/\/$/, "") || "/";
    const page = pages.get(target);
    if (!page) { console.error(`${route}: links to a page that does not exist: ${href}`); failed = true; continue; }
    if (hash && !page.ids.has(hash)) { console.error(`${route}: links to a missing anchor: ${href}`); failed = true; }
  }
}
console.log(`${pages.size} pages checked${failed ? "" : "; every internal link and anchor resolves"}`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it**

Run:
```bash
cd .worktrees/website-pages/apps/website && node scripts/check-links.mjs
```
Expected: `6 pages checked; every internal link and anchor resolves` (the six are `/`, `/privacy`, `/terms`, `/delete`, `/support`, `/404`). Any failure names the page and the href — fix the source, rebuild, re-run.

- [ ] **Step 3: Commit**

```bash
cd .worktrees/website-pages && git add apps/website/scripts/check-links.mjs && git commit -m "website: link and anchor check over the static export"
```

---

### Task 7: Render every page in the browser

**Files:** none.

- [ ] **Step 1: Serve the export**

Run (background):
```bash
cd .worktrees/website-pages/apps/website && python3 -m http.server 4173 --directory out
```

- [ ] **Step 2: Open each page in the Browser pane and screenshot**

Open `http://localhost:4173/`, `/privacy.html`, `/terms.html`, `/delete.html`, `/support.html`. For each: the header and footer are present, the table of contents links jump to sections, tables scroll inside their box on a narrow viewport (use the mobile preset for privacy), no console errors, and the network log shows requests only to `localhost:4173` — no fonts, no third-party hosts.

- [ ] **Step 3: Stop the server**

---

### Task 8: Hand-off

**Files:**
- Modify: `SESSION_LOG.md` (session entry), `forlater.md` (follow-ups from the spec), `docs/store-submission.html` (URLs stay on GitHub Pages until the domain is live — no change yet)

- [ ] **Step 1: Record in `SESSION_LOG.md`** what was built, the commits, and the two things Pranav does next: create the Vercel project (Root Directory `apps/website`, production branch `main`, domains `www.allkept.app` primary + `allkept.app` redirect) and say when to open the PR.

- [ ] **Step 2: Queue the follow-ups in `forlater.md`** (one item each, all blocked on "domain live"): app links → www.allkept.app (OTA); Meta dashboard URLs; store worksheet URLs; GitHub Pages redirects; retire the old `website` worktree and branch.

- [ ] **Step 3: Stop.** Do not push or open the PR without Pranav's explicit yes.

---

## Self-review against the spec

- Routes `/`, `/privacy`, `/terms`, `/delete`, `/support` — Tasks 5 and 6. Shared header/footer — Task 4.
- Verbatim text by extraction + scripted verification — Task 3 (verifier written before the extractor).
- No Tailwind, kit, database, analytics, external fonts — Task 2 dependencies and Task 4 CSS; confirmed in Task 7's network check.
- Static at build time — `output: "export"` (Task 2), confirmed by `ls out` (Task 5).
- Vercel settings and PR flow — Task 8 hand-off; Vercel project creation is Pranav's.
- Mobile app unaffected by the lockfile change — fingerprint guard, Tasks 1 and 2.
- Follow-ups and out-of-scope items — Task 8 queues them; nothing in this plan touches the mobile app, Meta or the stores.
- Names used consistently: `LegalPage`/`LegalName`, `SiteHeader`, `SiteFooter`, `content/<name>.html`, scripts `extract-content.mjs` / `verify-content.mjs` / `check-links.mjs`.

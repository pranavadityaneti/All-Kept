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

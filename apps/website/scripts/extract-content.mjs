// Lifts the approved policy text out of docs/ into content/. Re-runnable. The text is carried over
// verbatim; the only edits are cross-page links, which point at site routes instead of .html files.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, "../../../docs");
const out = path.resolve(here, "../content");
mkdirSync(out, { recursive: true });

// Matched as prefixes so that "privacy.html#push" becomes "/privacy#push", not a dead link.
const LINKS = [
  ['href="index.html', 'href="/'],
  ['href="privacy.html', 'href="/privacy'],
  ['href="terms.html', 'href="/terms'],
  ['href="delete.html', 'href="/delete'],
  ['href="testers.html', 'href="/support'],
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

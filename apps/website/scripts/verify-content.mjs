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

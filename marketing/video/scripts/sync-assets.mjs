// Fills public/ (git-ignored) with what Remotion's staticFile() serves: the ad's own assets
// copied over, and the category marks generated from the app's current source so the tiles in
// the ad match the tiles in the app.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const out = resolve(here, "../public");

const copies = [];
// Everything the ad draws lives under marketing/video/assets — photos, emoji, platform marks,
// brand — each folder with its provenance. Nothing here reads from the app or another package.
for (const dir of ["photos", "emoji", "platforms", "brand"]) {
  for (const f of readdirSync(resolve(here, `../assets/${dir}`)).filter((f) => /\.(jpg|png)$/.test(f))) {
    copies.push([`marketing/video/assets/${dir}/${f}`, `${dir}/${f}`]);
  }
}

for (const [from, to] of copies) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(repo, from), dest);
}
console.log(`synced ${copies.length} assets into public/`);

// Category marks: the app's own Streamline SVGs (apps/mobile/lib/mark-svgs.ts, CC BY 4.0 — see
// apps/mobile/assets/marks/LICENSE.md), drawn in each category's own pair from category-marks.ts.
// The palette file is read as text because its relative imports don't resolve under plain Node;
// the parse is strict so a change in that file's shape fails here rather than rendering wrong.
const { MARK_SVGS } = await import(join(repo, "apps/mobile/lib/mark-svgs.ts"));
const marksSource = readFileSync(join(repo, "apps/mobile/lib/category-marks.ts"), "utf8");
const CATEGORY_APP_NAMES = ["Food & recipes", "Travel & places", "Fitness & health", "Design & inspiration", "Tech & tools"];
const marks = {};
for (const name of CATEGORY_APP_NAMES) {
  const key = marksSource.match(new RegExp(`"${name}": "([a-z0-9-]+)"`))?.[1];
  const pal = marksSource.match(new RegExp(`"${name}": \\{ card: "(#[0-9A-Fa-f]{6})", ink: "(#[0-9A-Fa-f]{6})", wash: "(#[0-9A-Fa-f]{6})" \\}`));
  if (!key || !pal || !MARK_SVGS[key]) throw new Error(`category-marks.ts: could not read mark + palette for "${name}"`);
  const [, card, ink, wash] = pal;
  const body = MARK_SVGS[key].replaceAll("{ink}", ink).replaceAll("{wash}", wash);
  mkdirSync(join(out, "marks"), { recursive: true });
  writeFileSync(join(out, "marks", `${key}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${body}</svg>`);
  marks[name] = { key, card, ink, wash };
}
writeFileSync(resolve(here, "../src/marks.generated.json"), JSON.stringify(marks, null, 2) + "\n");
console.log(`generated ${Object.keys(marks).length} category marks`);

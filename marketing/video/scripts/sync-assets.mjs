// Copies the few PNGs the ad needs from the app and the shared platform package
// into public/ (git-ignored), so Remotion's staticFile() can serve them and the
// source of truth stays where it already lives.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const out = resolve(here, "../public");

// Category tiles + every icon a card can wear (see src/cards.ts). Kept as a plain list so this
// script stays dependency-free; tsc will not catch a drift, the render will (missing image).
const EMOJI = [
  "cooking", "airplane", "flexed_biceps", "artist_palette", "laptop",
  "running_shoe", "world_map", "pizza", "paintbrush", "light_bulb", "potted_plant", "camera",
  "hot_beverage", "lotus", "sun", "hammer_and_wrench", "house_with_garden", "bed", "robot",
  "luggage", "beach_with_umbrella", "bicycle", "ticket", "fire", "automobile",
];

const copies = [
  ...EMOJI.map((n) => [
    `apps/mobile/assets/emoji/${n}.png`,
    `emoji/${n}.png`,
  ]),
  ...["instagram", "tiktok", "youtube", "reddit", "facebook", "pinterest"].map((n) => [
    `packages/platform-assets/assets/${n}.png`,
    `platforms/${n}.png`,
  ]),
  // x-light is the black glyph, for a light surface (our badge is white).
  ["packages/platform-assets/assets/x-light.png", "platforms/x.png"],
  ["apps/mobile/assets/brand/lockup.png", "brand/lockup.png"],
  ["apps/mobile/assets/brand/lockup-on-white.png", "brand/lockup-on-white.png"],
  ["docs/marketing/creative-assets/brand/mark.png", "brand/mark.png"],
];

// Photos are this project's own (assets/photos, Pexels, provenance in sources.json).
for (const f of readdirSync(resolve(here, "../assets/photos")).filter((f) => f.endsWith(".jpg"))) {
  copies.push([`marketing/video/assets/photos/${f}`, `photos/${f}`]);
}

for (const [from, to] of copies) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(repo, from), dest);
}
console.log(`synced ${copies.length} assets into public/`);

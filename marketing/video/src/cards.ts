import type { Country } from "./props";

export type Platform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "reddit"
  | "x"
  | "facebook"
  | "pinterest"
  | "web";

/** Familiar post shapes. The card takes the shape its platform is known for. */
export type Ratio = "1:1" | "4:5" | "9:16" | "16:9" | "2:3";

/** A made-up save. Nothing here is a real post, creator or brand. */
export type SaveCard = {
  title: string;
  platform: Platform;
  ratio: Ratio;
  /** File name in apps/mobile/assets/emoji — used when there is no photo, and as the fallback. */
  icon: string;
  /** Base name in assets/photos (Pexels, see sources.json). Absent on text-style cards (X). */
  photo?: string;
  /** Which tile it flies to in the sort scene. Must match a category name in props. */
  category: string;
  /** Hue for the card's colour field, 0–360. */
  hue: number;
  /** Shown as a duration chip on video shapes. */
  duration?: string;
};

const shared: SaveCard[] = [
  { title: "10-min core, no gym", platform: "instagram", ratio: "9:16", icon: "flexed_biceps", photo: "core-workout", category: "Fitness", hue: 18, duration: "0:47" },
  { title: "Minimal desk setup", platform: "youtube", ratio: "16:9", icon: "laptop", photo: "minimal-desk", category: "Design", hue: 210, duration: "12:04" },
  { title: "Sourdough, finally", platform: "tiktok", ratio: "9:16", icon: "cooking", photo: "sourdough", category: "Food", hue: 36, duration: "0:58" },
  { title: "Leg day at home", platform: "facebook", ratio: "4:5", icon: "running_shoe", photo: "leg-day", category: "Fitness", hue: 6 },
  { title: "Kyoto in 3 days", platform: "youtube", ratio: "16:9", icon: "world_map", photo: "kyoto", category: "Travel", hue: 340, duration: "18:31" },
  { title: "Perfect omelette", platform: "tiktok", ratio: "9:16", icon: "pizza", photo: "omelette", category: "Food", hue: 48, duration: "0:32" },
  { title: "Type pairing basics", platform: "pinterest", ratio: "2:3", icon: "paintbrush", photo: "type-pairing", category: "Design", hue: 260 },
  { title: "Mac shortcuts I use", platform: "x", ratio: "16:9", icon: "light_bulb", category: "Tech", hue: 190 },
  { title: "Balcony garden 101", platform: "instagram", ratio: "1:1", icon: "potted_plant", photo: "balcony-garden", category: "Travel", hue: 120 },
  { title: "Logo grid trick", platform: "instagram", ratio: "4:5", icon: "artist_palette", photo: "logo-grid", category: "Design", hue: 285 },
  { title: "Phone-only vlog kit", platform: "web", ratio: "16:9", icon: "camera", photo: "vlog-kit", category: "Tech", hue: 200 },
  { title: "Cold brew ratio", platform: "reddit", ratio: "1:1", icon: "hot_beverage", photo: "cold-brew", category: "Food", hue: 28 },
  { title: "Mobility routine", platform: "youtube", ratio: "16:9", icon: "lotus", photo: "mobility", category: "Fitness", hue: 160, duration: "9:12" },
  { title: "Lisbon hidden café", platform: "instagram", ratio: "9:16", icon: "sun", photo: "lisbon", category: "Travel", hue: 30, duration: "0:21" },
  { title: "Keyboard for coding", platform: "reddit", ratio: "4:5", icon: "hammer_and_wrench", photo: "keyboard", category: "Tech", hue: 220 },
  { title: "Interior moodboard", platform: "pinterest", ratio: "2:3", icon: "house_with_garden", photo: "interior", category: "Design", hue: 95 },
  { title: "Stretch before bed", platform: "facebook", ratio: "1:1", icon: "bed", photo: "bed", category: "Fitness", hue: 250 },
  { title: "AI tools this week", platform: "x", ratio: "16:9", icon: "robot", category: "Tech", hue: 175 },
  { title: "Packing list, 7 days", platform: "web", ratio: "16:9", icon: "luggage", photo: "packing", category: "Travel", hue: 15 },
];

const india: SaveCard[] = [
  { title: "Best pasta in Bandra", platform: "instagram", ratio: "9:16", icon: "pizza", photo: "pasta-in", category: "Food", hue: 14, duration: "0:29" },
  { title: "Weekend in Goa", platform: "instagram", ratio: "4:5", icon: "beach_with_umbrella", photo: "goa", category: "Travel", hue: 195 },
  { title: "Hampi on a budget", platform: "youtube", ratio: "16:9", icon: "bicycle", photo: "hampi", category: "Travel", hue: 40, duration: "14:20" },
  { title: "Dal, the slow way", platform: "tiktok", ratio: "9:16", icon: "cooking", photo: "dal", category: "Food", hue: 44, duration: "1:02" },
  { title: "Jaipur in one day", platform: "pinterest", ratio: "2:3", icon: "ticket", photo: "jaipur", category: "Travel", hue: 350 },
  { title: "Filter coffee at home", platform: "facebook", ratio: "1:1", icon: "hot_beverage", photo: "filter-coffee", category: "Food", hue: 24 },
];

const us: SaveCard[] = [
  { title: "Best pasta in Brooklyn", platform: "instagram", ratio: "9:16", icon: "pizza", photo: "pasta-us", category: "Food", hue: 14, duration: "0:29" },
  { title: "Weekend in Joshua Tree", platform: "tiktok", ratio: "9:16", icon: "sun", photo: "joshua-tree", category: "Travel", hue: 32, duration: "0:44" },
  { title: "Austin taco crawl", platform: "tiktok", ratio: "9:16", icon: "fire", photo: "tacos", category: "Food", hue: 8, duration: "0:51" },
  { title: "Pacific Coast road trip", platform: "youtube", ratio: "16:9", icon: "automobile", photo: "pch", category: "Travel", hue: 205, duration: "22:10" },
  { title: "Smash burger at home", platform: "facebook", ratio: "1:1", icon: "cooking", photo: "burger", category: "Food", hue: 20 },
  { title: "Chicago in 48 hours", platform: "pinterest", ratio: "2:3", icon: "world_map", photo: "chicago", category: "Travel", hue: 230 },
];

export const cardsFor = (country: Country): SaveCard[] =>
  interleave(shared, country === "in" ? india : us);

/** Mix the country cards through the shared ones so the pile isn't front-loaded. */
const interleave = (a: SaveCard[], b: SaveCard[]): SaveCard[] => {
  const out: SaveCard[] = [];
  const step = Math.max(1, Math.floor(a.length / b.length));
  let bi = 0;
  a.forEach((card, i) => {
    out.push(card);
    if (i % step === step - 1 && bi < b.length) out.push(b[bi++] as SaveCard);
  });
  while (bi < b.length) out.push(b[bi++] as SaveCard);
  return out;
};

/** Every emoji any card can ask for — the asset sync copies exactly these. */
export const ICONS_USED = Array.from(new Set([...shared, ...india, ...us].map((c) => c.icon)));

/**
 * The marks — Streamline Plump Flat, the free set, CC BY 4.0 — drawn on category cards, filter
 * chips, the picker, the paywall's list and the person's own category list. Flat, two-tone: one
 * light and one dark shade of a single hue, so a mark takes its category's colours rather than
 * bringing its own. This half is rules only and imports no pictures, so it can be tested; the
 * pictures themselves are in mark-svgs.ts, generated from this file's key list by
 * scripts/marks.mjs, so a key here is a picture that exists and nothing is spelled twice by hand.
 *
 * The fifteen built-ins map to one mark each; a category of your own stores the key it chose. Two
 * older vocabularies are still honoured: the Fluent emoji keys the second version stored, and the
 * Ionicons glyph names the first one did. Each maps to the nearest mark, so nobody's choice is lost.
 */
import { CATEGORIES } from "@allkept/contracts";
import { mix, tint } from "./categories";
import { MARK_SVGS } from "./mark-svgs";

/** Where the marks come from; Settings credits it, as CC BY 4.0 asks. */
export const STREAMLINE_URL = "https://streamlinehq.com";

export const MARK_KEYS = [
  "ai-science-robot", "airplane-enabled", "bag", "bag-suitcase-4", "ball", "balloon", "beach", "bicycle-bike",
  "book-1", "bookmark", "burger", "bus", "cake-slice", "calendar-mark", "camera-1", "candle", "chat-bubble-text-square",
  "chef-toque-hat", "cherries", "coffee-mug", "controller-1", "diamond-1", "dog-1", "dumbell", "earpods", "earth-1",
  "file-folder", "film-slate", "fish", "flash-1", "fork-knife", "gift", "graduation-cap", "home-1", "hot-air-balloon",
  "hot-spring", "hotel-bed-5", "ice-cream-2", "laptop", "leaf-protect", "lightbulb", "lipstick", "magic-wand-1",
  "map-fold", "module", "money-cash-bill-1", "moon-stars", "multiple-stars", "music-note-2", "news-paper",
  "open-umbrella", "padlock-key", "paint-palette", "paintbrush-2", "pet-paw", "piggy-bank", "potted-flower",
  "sail-ship", "scissors", "screen-1", "shipping-box-1", "shopping-basket-1", "smiley-laughing-1", "sofa",
  "star-circle", "star-medal", "steps-1", "strawberry", "suitcase-rolling", "sun", "tablet-capsule", "tag-alt",
  "telescope", "theater-mask", "ticket-1", "tool-box", "treasure-chest", "tree-1", "user-feedback-heart",
  "user-multiple-accounts", "user-podcast", "watch-1", "waving-hand", "wine",
] as const;

export type MarkKey = (typeof MARK_KEYS)[number];

export const DEFAULT_MARK: MarkKey = "shipping-box-1";

const KNOWN = new Set<string>(MARK_KEYS);
export const isMarkKey = (value: string): value is MarkKey => KNOWN.has(value);

const BUILT_IN: Record<string, MarkKey> = {
  "Food & recipes": "fork-knife",
  "Fitness & health": "dumbell",
  "Travel & places": "airplane-enabled",
  "Learning & how-to": "book-1",
  "Tech & tools": "laptop",
  "Money & career": "money-cash-bill-1",
  "Design & inspiration": "paint-palette",
  "Style & fashion": "bag",
  "Beauty & self-care": "lipstick",
  "Home & living": "sofa",
  "Entertainment": "film-slate",
  "Humour & memes": "smiley-laughing-1",
  "News & opinion": "news-paper",
  // Two people, not the heart: the heart is the mark people reach for when they make a category of
  // their own ("Love Quotes"), and a built-in must not wear what a person's own category wears.
  "Life & relationships": "user-multiple-accounts",
  "Other": "file-folder",
  "Fashion & shopping": "bag",
  "Quotes & motivation": "user-feedback-heart",
  "People & personal": "user-multiple-accounts",
};

/** The Fluent emoji keys the second version stored. Each maps to the nearest mark rather than to the default. */
const EMOJI: Record<string, MarkKey> = {
  airplane: "airplane-enabled", artist_palette: "paint-palette", automobile: "bus", balloon: "balloon",
  beach_with_umbrella: "beach", bed: "hotel-bed-5", bicycle: "bicycle-bike", blossom: "potted-flower", bookmark: "bookmark",
  books: "book-1", briefcase: "bag-suitcase-4", calendar: "calendar-mark", camera: "camera-1", cat_face: "pet-paw",
  clapper_board: "film-slate", cooking: "chef-toque-hat", dog_face: "dog-1", dress: "bag", face_with_tears_of_joy: "smiley-laughing-1",
  fire: "flash-1", flexed_biceps: "dumbell", gem_stone: "diamond-1", graduation_cap: "graduation-cap", guitar: "music-note-2",
  hammer_and_wrench: "tool-box", headphone: "earpods", hot_beverage: "coffee-mug", house_with_garden: "home-1", key: "padlock-key",
  label: "tag-alt", laptop: "laptop", leaf_fluttering_in_wind: "leaf-protect", light_bulb: "lightbulb", lipstick: "lipstick",
  lotus: "hot-spring", luggage: "suitcase-rolling", microphone: "user-podcast", money_bag: "piggy-bank", musical_note: "music-note-2",
  nail_polish: "lipstick", newspaper: "news-paper", package: "shipping-box-1", paintbrush: "paintbrush-2", party_popper: "balloon",
  paw_prints: "pet-paw", pill: "tablet-capsule", pizza: "burger", popcorn: "ticket-1", potted_plant: "potted-flower",
  puzzle_piece: "module", red_heart: "user-feedback-heart", ring: "diamond-1", robot: "ai-science-robot", rocket: "hot-air-balloon",
  running_shoe: "steps-1", sailboat: "sail-ship", shopping_cart: "shopping-basket-1", snowflake: "ice-cream-2", soccer_ball: "ball",
  sparkles: "multiple-stars", speech_balloon: "chat-bubble-text-square", star: "star-circle", sun: "sun", television: "screen-1",
  ticket: "ticket-1", trophy: "star-medal", two_hearts: "user-feedback-heart", umbrella: "open-umbrella", video_game: "controller-1",
  watch: "watch-1", wine_glass: "wine", world_map: "map-fold", wrapped_gift: "gift", yellow_heart: "user-feedback-heart",
};

/** The Ionicons glyph names the first version stored, by way of the emoji each became, so the two histories agree. */
const GLYPH_TO_EMOJI: Record<string, keyof typeof EMOJI> = {
  "bookmark-outline": "bookmark", "heart-outline": "red_heart", "star-outline": "star", "gift-outline": "wrapped_gift",
  "musical-notes-outline": "musical_note", "camera-outline": "camera", "book-outline": "books", "cafe-outline": "hot_beverage",
  "car-outline": "automobile", "paw-outline": "paw_prints", "football-outline": "soccer_ball", "game-controller-outline": "video_game",
  "leaf-outline": "leaf_fluttering_in_wind", "flame-outline": "fire", "bulb-outline": "light_bulb", "cart-outline": "shopping_cart",
  "calendar-outline": "calendar", "chatbubble-outline": "speech_balloon", "construct-outline": "hammer_and_wrench", "earth-outline": "world_map",
  "flower-outline": "blossom", "medkit-outline": "pill", "pricetag-outline": "label", "rocket-outline": "rocket", "ticket-outline": "ticket",
  "umbrella-outline": "umbrella", "wine-outline": "wine_glass", "boat-outline": "sailboat", "bed-outline": "bed", "brush-outline": "paintbrush",
  "diamond-outline": "gem_stone", "key-outline": "key", "map-outline": "world_map", "mic-outline": "microphone", "pizza-outline": "pizza",
  "ribbon-outline": "trophy", "tv-outline": "television", "watch-outline": "watch",
};
const LEGACY: Record<string, MarkKey> = { ...EMOJI, ...Object.fromEntries(Object.entries(GLYPH_TO_EMOJI).map(([g, e]) => [g, EMOJI[e]!])) };

/** The two older vocabularies, for the tests that guard the mappings. */
export const LEGACY_GLYPHS: readonly string[] = Object.keys(GLYPH_TO_EMOJI);
export const LEGACY_EMOJI: readonly string[] = Object.keys(EMOJI);

/** The marks a person can choose for a category of their own, in the order the picker shows them. */
export const PICKER_MARKS: readonly MarkKey[] = [
  "bookmark", "star-circle", "tag-alt", "gift", "balloon", "calendar-mark", "camera-1", "music-note-2", "controller-1",
  "screen-1", "theater-mask", "ticket-1", "graduation-cap", "lightbulb", "chat-bubble-text-square", "user-podcast",
  "burger", "chef-toque-hat", "cake-slice", "coffee-mug", "wine", "ice-cream-2", "strawberry", "cherries",
  "beach", "suitcase-rolling", "map-fold", "earth-1", "hot-air-balloon", "sail-ship", "bus", "bicycle-bike",
  "home-1", "hotel-bed-5", "potted-flower", "tree-1", "candle", "hot-spring", "sun", "moon-stars",
  "user-feedback-heart", "waving-hand", "pet-paw", "dog-1", "fish", "steps-1", "ball", "star-medal", "tablet-capsule",
  "piggy-bank", "shopping-basket-1", "diamond-1", "watch-1", "scissors", "paintbrush-2", "magic-wand-1",
  "tool-box", "padlock-key", "module", "ai-science-robot", "telescope", "multiple-stars", "treasure-chest",
];

/** The stored value of a category of your own — new key, old emoji key, or older glyph name — as a mark. */
export function markFor(stored: string | null | undefined): MarkKey {
  if (!stored) return DEFAULT_MARK;
  if (isMarkKey(stored)) return stored;
  return LEGACY[stored] ?? DEFAULT_MARK;
}

export const builtInMark = (category: string): MarkKey => BUILT_IN[category] ?? DEFAULT_MARK;

/** The mark for a category: the chosen one for a category of your own, else the built-in's. */
export function categoryMark(category: string, chosen?: string | null): MarkKey {
  return chosen ? markFor(chosen) : builtInMark(category);
}

/**
 * A category's colours: the card's pastel, and the pair the mark is drawn in — `ink` the dark
 * shade, `wash` the light one. Fifteen, hand-tuned, one per built-in. A category of your own takes
 * one of the same fifteen by its name, so two of your own rarely match and the same name looks the
 * same on every device. These are the light theme's; darkPalette() reads them for the dark one.
 */
export interface MarkPalette { card: string; ink: string; wash: string }

const PALETTES: Record<string, MarkPalette> = {
  "Food & recipes": { card: "#FFE7C2", ink: "#B25A00", wash: "#F5A623" },
  "Fitness & health": { card: "#DFF5E4", ink: "#137A3A", wash: "#5ECB7A" },
  "Travel & places": { card: "#DCEFFF", ink: "#1C5FCC", wash: "#7FB8F5" },
  "Learning & how-to": { card: "#FFF4C2", ink: "#8A6A00", wash: "#F2C94C" },
  "Tech & tools": { card: "#E3E6FF", ink: "#3C43B8", wash: "#8F95F0" },
  "Money & career": { card: "#DFF7EE", ink: "#0F7A5A", wash: "#5BCBA3" },
  "Design & inspiration": { card: "#F3E3FF", ink: "#7A2FC0", wash: "#C48CF2" },
  "Style & fashion": { card: "#FFE0EE", ink: "#B8256F", wash: "#F28BBE" },
  "Beauty & self-care": { card: "#FFE3E0", ink: "#C43A2C", wash: "#F3908A" },
  "Home & living": { card: "#EAF2D9", ink: "#5B7A12", wash: "#A9C75A" },
  "Entertainment": { card: "#E0E8FF", ink: "#2743B3", wash: "#7E93F0" },
  "Humour & memes": { card: "#FFF0C7", ink: "#A05E00", wash: "#F5B840" },
  "News & opinion": { card: "#E6ECF2", ink: "#2E4A66", wash: "#8AA7C2" },
  "Life & relationships": { card: "#FFE1E7", ink: "#B8203F", wash: "#F07C93" },
  "Other": { card: "#ECEAF3", ink: "#4A4560", wash: "#A39FB8" },
};
const WHEEL: readonly MarkPalette[] = CATEGORIES.map((c) => PALETTES[c]!);

/** The accent's own pair: the picker before a name is typed, and lists that belong to no category. */
export const DEFAULT_PALETTE: MarkPalette = { card: "#EFEBFE", ink: "#6D46F2", wash: "#B9A6F9" };

/** Small and stable: the same name lands on the same palette on every device, and nearby names on different ones. */
function hashOf(name: string): number {
  let h = 2166136261;
  for (const ch of name.toLowerCase().trim()) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export function categoryPalette(category: string): MarkPalette {
  const own = PALETTES[category];
  if (own) return own;
  const key = category.trim();
  if (!key) return DEFAULT_PALETTE;
  return WHEEL[hashOf(key) % WHEEL.length]!;
}

/**
 * The same palette in the dark theme: the card is the ink tinted into the dark surface, and the
 * mark swaps its weights — the light shade becomes the body, a mid tone the accent — so it reads
 * on a dark card the way the light one reads on a pastel.
 */
export function darkPalette(light: MarkPalette, surface = "#1C1B22"): MarkPalette {
  return { card: mix(light.ink, surface, 0.72), ink: light.wash, wash: mix(light.wash, light.ink, 0.45) };
}

/** A translucent wash of a palette, for a chip or a row that only hints at the category. */
export const paletteTint = (palette: MarkPalette, alpha: number): string => tint(palette.ink, alpha);

/**
 * The mark as an image source: an SVG with the pair filled in, on a 48-unit box. Base64 rather
 * than percent-encoded, because Android's image loader takes data URIs in that form only; the
 * bodies are plain ASCII, so btoa is enough.
 */
export function svgUri(mark: MarkKey, palette: Pick<MarkPalette, "ink" | "wash">): string {
  const body = MARK_SVGS[mark].replaceAll("{ink}", palette.ink).replaceAll("{wash}", palette.wash);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${body}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

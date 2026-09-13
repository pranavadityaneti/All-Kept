/**
 * The marks — Microsoft Fluent Emoji, 3D style, MIT — drawn on category cards, filter chips, the
 * picker, and interest pills. This half is rules only and imports no images, so it can be tested;
 * the pictures themselves are in mark-images.ts, and both files are generated from the same
 * directory listing, so a key here is a file that exists and nothing is spelled twice by hand.
 *
 * The fifteen built-ins map to one mark each; a category of your own stores the key it chose; the
 * line-glyph names the first version stored map to the nearest mark, so nobody's choice was lost.
 */

export const MARK_KEYS = [
  "airplane",
  "artist_palette",
  "automobile",
  "balloon",
  "beach_with_umbrella",
  "bed",
  "bicycle",
  "blossom",
  "bookmark",
  "books",
  "briefcase",
  "calendar",
  "camera",
  "cat_face",
  "clapper_board",
  "cooking",
  "dog_face",
  "dress",
  "face_with_tears_of_joy",
  "fire",
  "flexed_biceps",
  "gem_stone",
  "graduation_cap",
  "guitar",
  "hammer_and_wrench",
  "headphone",
  "hot_beverage",
  "house_with_garden",
  "key",
  "label",
  "laptop",
  "leaf_fluttering_in_wind",
  "light_bulb",
  "lipstick",
  "lotus",
  "luggage",
  "microphone",
  "money_bag",
  "musical_note",
  "nail_polish",
  "newspaper",
  "package",
  "paintbrush",
  "party_popper",
  "paw_prints",
  "pill",
  "pizza",
  "popcorn",
  "potted_plant",
  "puzzle_piece",
  "red_heart",
  "ring",
  "robot",
  "rocket",
  "running_shoe",
  "sailboat",
  "shopping_cart",
  "snowflake",
  "soccer_ball",
  "sparkles",
  "speech_balloon",
  "star",
  "sun",
  "television",
  "ticket",
  "trophy",
  "two_hearts",
  "umbrella",
  "video_game",
  "watch",
  "wine_glass",
  "world_map",
  "wrapped_gift",
  "yellow_heart",
] as const;

export type MarkKey = (typeof MARK_KEYS)[number];

export const DEFAULT_MARK: MarkKey = "package";

const KNOWN = new Set<string>(MARK_KEYS);
export const isMarkKey = (value: string): value is MarkKey => KNOWN.has(value);

const BUILT_IN: Record<string, MarkKey> = {
  "Food & recipes": "cooking",
  "Fitness & health": "flexed_biceps",
  "Travel & places": "airplane",
  "Learning & how-to": "books",
  "Tech & tools": "laptop",
  "Money & career": "briefcase",
  "Design & inspiration": "artist_palette",
  "Style & fashion": "dress",
  "Beauty & self-care": "sparkles",
  "Home & living": "house_with_garden",
  "Entertainment": "clapper_board",
  "Humour & memes": "face_with_tears_of_joy",
  "News & opinion": "newspaper",
  "Life & relationships": "yellow_heart",
  "Other": "package",
  "Fashion & shopping": "dress",
  "Quotes & motivation": "yellow_heart",
  "People & personal": "yellow_heart",
};

/** The first version stored Ionicons glyph names. Each maps to the nearest mark rather than to the default. */
const LEGACY: Record<string, MarkKey> = {
  "bookmark-outline": "bookmark",
  "heart-outline": "red_heart",
  "star-outline": "star",
  "gift-outline": "wrapped_gift",
  "musical-notes-outline": "musical_note",
  "camera-outline": "camera",
  "book-outline": "books",
  "cafe-outline": "hot_beverage",
  "car-outline": "automobile",
  "paw-outline": "paw_prints",
  "football-outline": "soccer_ball",
  "game-controller-outline": "video_game",
  "leaf-outline": "leaf_fluttering_in_wind",
  "flame-outline": "fire",
  "bulb-outline": "light_bulb",
  "cart-outline": "shopping_cart",
  "calendar-outline": "calendar",
  "chatbubble-outline": "speech_balloon",
  "construct-outline": "hammer_and_wrench",
  "earth-outline": "world_map",
  "flower-outline": "blossom",
  "medkit-outline": "pill",
  "pricetag-outline": "label",
  "rocket-outline": "rocket",
  "ticket-outline": "ticket",
  "umbrella-outline": "umbrella",
  "wine-outline": "wine_glass",
  "boat-outline": "sailboat",
  "bed-outline": "bed",
  "brush-outline": "paintbrush",
  "diamond-outline": "gem_stone",
  "key-outline": "key",
  "map-outline": "world_map",
  "mic-outline": "microphone",
  "pizza-outline": "pizza",
  "ribbon-outline": "trophy",
  "tv-outline": "television",
  "watch-outline": "watch",
};

/** The glyph names the first version could store, for the test that guards the mapping. */
export const LEGACY_GLYPHS: readonly string[] = Object.keys(LEGACY);

/** The marks a person can choose for a category of their own, in the order the picker shows them. */
export const PICKER_MARKS: readonly MarkKey[] = [
  "automobile",
  "balloon",
  "beach_with_umbrella",
  "bed",
  "bicycle",
  "blossom",
  "bookmark",
  "calendar",
  "camera",
  "cat_face",
  "dog_face",
  "fire",
  "gem_stone",
  "graduation_cap",
  "guitar",
  "hammer_and_wrench",
  "headphone",
  "hot_beverage",
  "key",
  "label",
  "leaf_fluttering_in_wind",
  "light_bulb",
  "lipstick",
  "lotus",
  "luggage",
  "microphone",
  "money_bag",
  "musical_note",
  "nail_polish",
  "paintbrush",
  "party_popper",
  "paw_prints",
  "pill",
  "pizza",
  "popcorn",
  "potted_plant",
  "puzzle_piece",
  "red_heart",
  "ring",
  "robot",
  "rocket",
  "running_shoe",
  "sailboat",
  "shopping_cart",
  "snowflake",
  "soccer_ball",
  "speech_balloon",
  "star",
  "sun",
  "television",
  "ticket",
  "trophy",
  "two_hearts",
  "umbrella",
  "video_game",
  "watch",
  "wine_glass",
  "world_map",
  "wrapped_gift",
];

/**
 * The mark for a stored value — a key, an old glyph name, or anything else — never nothing: a
 * value we do not recognise draws the default rather than an empty tile.
 */
export function markFor(stored: string | null | undefined): MarkKey {
  if (!stored) return DEFAULT_MARK;
  if (isMarkKey(stored)) return stored;
  return LEGACY[stored] ?? DEFAULT_MARK;
}

/** A built-in category's mark, by its stored name. Unknown names get the default. */
export const builtInMark = (category: string): MarkKey => BUILT_IN[category] ?? DEFAULT_MARK;

/** The picture to draw for a category: its own chosen mark when it has one, else the built-in's. */
export const categoryMark = (category: string, chosen?: string | null): MarkKey =>
  chosen ? markFor(chosen) : builtInMark(category);

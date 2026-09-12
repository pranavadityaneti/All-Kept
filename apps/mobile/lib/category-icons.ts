/**
 * The marks a person can give a category they invent.
 *
 * A curated few rather than all 1,357 glyphs in the font: a wall of icons is a worse choice than a
 * short list, and every one here has to read at 28px on a small tile. Nothing is stored but the
 * name — no upload, no image, no bundle growth.
 */
import type { Glyph } from "./icon-names";

export const CATEGORY_ICONS = [
  "bookmark-outline", "heart-outline", "star-outline", "gift-outline", "musical-notes-outline",
  "camera-outline", "book-outline", "cafe-outline", "car-outline", "paw-outline",
  "football-outline", "game-controller-outline", "leaf-outline", "flame-outline", "bulb-outline",
  "cart-outline", "calendar-outline", "chatbubble-outline", "construct-outline", "earth-outline",
  "flower-outline", "medkit-outline", "pricetag-outline", "rocket-outline", "ticket-outline",
  "umbrella-outline", "wine-outline", "boat-outline", "bed-outline", "brush-outline",
  "diamond-outline", "key-outline", "map-outline", "mic-outline", "pizza-outline",
  "ribbon-outline", "tv-outline", "watch-outline",
] as const satisfies readonly Glyph[];

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const DEFAULT_CATEGORY_ICON: CategoryIcon = "bookmark-outline";

const OFFERED = new Set<string>(CATEGORY_ICONS);

/**
 * What to draw for a stored value.
 *
 * A name that is not one we offer would render as nothing at all — the font simply has no glyph —
 * so a row written by an older client, or a list we later trim, falls back to a mark rather than to
 * an empty tile.
 */
export const categoryIcon = (stored: string | null | undefined): CategoryIcon =>
  stored && OFFERED.has(stored) ? (stored as CategoryIcon) : DEFAULT_CATEGORY_ICON;

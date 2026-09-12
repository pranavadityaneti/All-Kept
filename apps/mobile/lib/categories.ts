/**
 * A category's own mark and hue, for the tile that has no picture to show and for the filter chips.
 *
 * The fifteen used to carry a hand-drawn PNG each — nineteen files, 1.5 MB of bundle. That does not
 * survive categories a person invents: every new name would need a new drawing, and until one
 * existed the tile fell back to Other's artwork and was indistinguishable from Other itself. The
 * marks below come from a font already in the bundle, so a category costs its name and nothing more.
 */
import type { Glyph } from "./icon-names";

export interface CategoryStyle { icon: Glyph; hue: string }

const HUE = "#6D46F2";

const OTHER: CategoryStyle = { icon: "ellipsis-horizontal-circle-outline", hue: HUE };

const STYLES: Record<string, CategoryStyle> = {
  "Food & recipes": { icon: "restaurant-outline", hue: HUE },
  // A heart beside a save reads as "liked", which this is not; a barbell says fitness and nothing else.
  "Fitness & health": { icon: "barbell-outline", hue: HUE },
  "Travel & places": { icon: "airplane-outline", hue: HUE },
  "Learning & how-to": { icon: "school-outline", hue: HUE },
  "Tech & tools": { icon: "hardware-chip-outline", hue: HUE },
  "Money & career": { icon: "briefcase-outline", hue: HUE },
  "Design & inspiration": { icon: "color-palette-outline", hue: HUE },
  "Style & fashion": { icon: "shirt-outline", hue: HUE },
  "Beauty & self-care": { icon: "sparkles-outline", hue: HUE },
  "Home & living": { icon: "home-outline", hue: HUE },
  "Entertainment": { icon: "play-circle-outline", hue: HUE },
  "Humour & memes": { icon: "happy-outline", hue: HUE },
  "News & opinion": { icon: "newspaper-outline", hue: HUE },
  "Life & relationships": { icon: "people-outline", hue: HUE },
  "Other": OTHER,

  // Keep old values visually stable until every persisted query has refreshed after the migration.
  "Fashion & shopping": { icon: "shirt-outline", hue: HUE },
  "Quotes & motivation": { icon: "people-outline", hue: HUE },
  "People & personal": { icon: "people-outline", hue: HUE },

  // What the database calls a save it has no category for. Named here so those tiles get a mark of
  // their own rather than Other's, which would read as a category rather than a state.
  "Sorting": { icon: "hourglass-outline", hue: HUE },
  "Uncategorized": { icon: "help-circle-outline", hue: HUE },
  "Needs attention": { icon: "alert-circle-outline", hue: HUE },
};

/** Anything unrecognised still gets a mark, so a category a person just invented never renders blank. */
export const categoryStyle = (name: string): CategoryStyle => STYLES[name] ?? OTHER;

/** `#rrggbb` at a given opacity, for a tint that sits over either theme's surface. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

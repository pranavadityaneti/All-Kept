/**
 * How each category looks: its own mark and its own hue.
 *
 * A borrowed picture from whichever save happened to be newest told you nothing about the category
 * and changed under you as you saved. A fixed mark is recognisable at a glance and stays put.
 *
 * The hue is used translucent for the tile and solid for the mark, so one pair of values works on a
 * light ground and a dark one without a second palette.
 */
export interface CategoryStyle { icon: string; hue: string }

const OTHER: CategoryStyle = { icon: "ellipsis-horizontal-circle-outline", hue: "#6B7280" };

const STYLES: Record<string, CategoryStyle> = {
  "Food & recipes": { icon: "restaurant-outline", hue: "#E4762A" },
  "Fitness & health": { icon: "barbell-outline", hue: "#2E9E6B" },
  "Travel & places": { icon: "airplane-outline", hue: "#2F8FD6" },
  "Learning & how-to": { icon: "school-outline", hue: "#6D46F2" },
  "Tech & tools": { icon: "hardware-chip-outline", hue: "#4B5BD6" },
  "Money & career": { icon: "briefcase-outline", hue: "#1F9D8F" },
  "Design & inspiration": { icon: "color-palette-outline", hue: "#D6459B" },
  "Fashion & shopping": { icon: "shirt-outline", hue: "#C13B6B" },
  "Entertainment": { icon: "film-outline", hue: "#8B4FE0" },
  "Humour & memes": { icon: "happy-outline", hue: "#E0A32A" },
  "Quotes & motivation": { icon: "chatbox-ellipses-outline", hue: "#C4622F" },
  "News & opinion": { icon: "newspaper-outline", hue: "#5A6A80" },
  "People & personal": { icon: "people-outline", hue: "#D65A5A" },
  "Other": OTHER,
};

/** Anything unrecognised still gets a mark, so a new category never renders as a blank. */
export const categoryStyle = (name: string): CategoryStyle => STYLES[name] ?? OTHER;

/** `#rrggbb` at a given opacity, for a tint that sits over either theme's surface. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

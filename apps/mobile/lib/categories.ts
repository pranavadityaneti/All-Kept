/**
 * Stable category artwork for the home grid, plus compact marks for filter chips.
 * A category should stay visually recognisable as a person's latest saves change.
 */
export interface CategoryStyle { icon: string; hue: string; artwork: number }

const OTHER: CategoryStyle = {
  icon: "ellipsis-horizontal-circle-outline",
  hue: "#6B7280",
  artwork: require("../assets/categories/other.png"),
};

const STYLES: Record<string, CategoryStyle> = {
  "Food & recipes": { icon: "restaurant-outline", hue: "#E4762A", artwork: require("../assets/categories/food.png") },
  "Fitness & health": { icon: "heart-outline", hue: "#2E9E6B", artwork: require("../assets/categories/wellness.png") },
  "Travel & places": { icon: "airplane-outline", hue: "#2F8FD6", artwork: require("../assets/categories/travel.png") },
  "Learning & how-to": { icon: "school-outline", hue: "#6D46F2", artwork: require("../assets/categories/learn.png") },
  "Tech & tools": { icon: "hardware-chip-outline", hue: "#4B5BD6", artwork: require("../assets/categories/tech.png") },
  "Money & career": { icon: "briefcase-outline", hue: "#1F9D8F", artwork: require("../assets/categories/career.png") },
  "Design & inspiration": { icon: "color-palette-outline", hue: "#D6459B", artwork: require("../assets/categories/design.png") },
  "Style & fashion": { icon: "shirt-outline", hue: "#C13B6B", artwork: require("../assets/categories/style.png") },
  "Beauty & self-care": { icon: "sparkles-outline", hue: "#C75C8F", artwork: require("../assets/categories/beauty.png") },
  "Home & living": { icon: "home-outline", hue: "#82704E", artwork: require("../assets/categories/home.png") },
  "Entertainment": { icon: "play-circle-outline", hue: "#8B4FE0", artwork: require("../assets/categories/entertainment.png") },
  "Humour & memes": { icon: "happy-outline", hue: "#E0A32A", artwork: require("../assets/categories/memes.png") },
  "News & opinion": { icon: "newspaper-outline", hue: "#5A6A80", artwork: require("../assets/categories/news.png") },
  "Life & relationships": { icon: "people-outline", hue: "#D65A5A", artwork: require("../assets/categories/life.png") },
  "Other": OTHER,

  // Keep old values visually stable until every persisted query has refreshed after the migration.
  "Fashion & shopping": { icon: "shirt-outline", hue: "#C13B6B", artwork: require("../assets/categories/style.png") },
  "Quotes & motivation": { icon: "people-outline", hue: "#D65A5A", artwork: require("../assets/categories/life.png") },
  "People & personal": { icon: "people-outline", hue: "#D65A5A", artwork: require("../assets/categories/life.png") },
};

/** Anything unrecognised still gets a mark, so a new category never renders as a blank. */
export const categoryStyle = (name: string): CategoryStyle => STYLES[name] ?? OTHER;

/** `#rrggbb` at a given opacity, for a tint that sits over either theme's surface. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

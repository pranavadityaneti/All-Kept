/**
 * Stable category artwork for the home grid, plus compact marks for filter chips.
 * A category should stay visually recognisable as a person's latest saves change.
 */
export interface CategoryStyle { icon: string; hue: string; artwork: number; tileLayout?: "minimal" }

const OTHER: CategoryStyle = {
  icon: "ellipsis-horizontal-circle-outline",
  hue: "#6D46F2",
  artwork: require("../assets/categories/other-minimal.png"),
  tileLayout: "minimal",
};

const STYLES: Record<string, CategoryStyle> = {
  "Food & recipes": { icon: "restaurant-outline", hue: "#6D46F2", artwork: require("../assets/categories/food-minimal-dark-purple-v5.png"), tileLayout: "minimal" },
  "Fitness & health": { icon: "heart-outline", hue: "#6D46F2", artwork: require("../assets/categories/wellness-minimal.png"), tileLayout: "minimal" },
  "Travel & places": { icon: "airplane-outline", hue: "#6D46F2", artwork: require("../assets/categories/travel-minimal.png"), tileLayout: "minimal" },
  "Learning & how-to": { icon: "school-outline", hue: "#6D46F2", artwork: require("../assets/categories/learn-minimal.png"), tileLayout: "minimal" },
  "Tech & tools": { icon: "hardware-chip-outline", hue: "#6D46F2", artwork: require("../assets/categories/tech-minimal.png"), tileLayout: "minimal" },
  "Money & career": { icon: "briefcase-outline", hue: "#6D46F2", artwork: require("../assets/categories/career-minimal.png"), tileLayout: "minimal" },
  "Design & inspiration": { icon: "color-palette-outline", hue: "#6D46F2", artwork: require("../assets/categories/design-minimal.png"), tileLayout: "minimal" },
  "Style & fashion": { icon: "shirt-outline", hue: "#6D46F2", artwork: require("../assets/categories/style-minimal.png"), tileLayout: "minimal" },
  "Beauty & self-care": { icon: "sparkles-outline", hue: "#6D46F2", artwork: require("../assets/categories/beauty-minimal.png"), tileLayout: "minimal" },
  "Home & living": { icon: "home-outline", hue: "#6D46F2", artwork: require("../assets/categories/home-minimal.png"), tileLayout: "minimal" },
  "Entertainment": { icon: "play-circle-outline", hue: "#6D46F2", artwork: require("../assets/categories/entertainment-minimal.png"), tileLayout: "minimal" },
  "Humour & memes": { icon: "happy-outline", hue: "#6D46F2", artwork: require("../assets/categories/memes-minimal.png"), tileLayout: "minimal" },
  "News & opinion": { icon: "newspaper-outline", hue: "#6D46F2", artwork: require("../assets/categories/news-minimal.png"), tileLayout: "minimal" },
  "Life & relationships": { icon: "people-outline", hue: "#6D46F2", artwork: require("../assets/categories/life-minimal.png"), tileLayout: "minimal" },
  "Other": OTHER,

  // Keep old values visually stable until every persisted query has refreshed after the migration.
  "Fashion & shopping": { icon: "shirt-outline", hue: "#6D46F2", artwork: require("../assets/categories/style-minimal.png"), tileLayout: "minimal" },
  "Quotes & motivation": { icon: "people-outline", hue: "#6D46F2", artwork: require("../assets/categories/life-minimal.png"), tileLayout: "minimal" },
  "People & personal": { icon: "people-outline", hue: "#6D46F2", artwork: require("../assets/categories/life-minimal.png"), tileLayout: "minimal" },
};

/** Anything unrecognised still gets a mark, so a new category never renders as a blank. */
export const categoryStyle = (name: string): CategoryStyle => STYLES[name] ?? OTHER;

/** `#rrggbb` at a given opacity, for a tint that sits over either theme's surface. */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

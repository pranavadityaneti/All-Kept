export type Country = "in" | "us";

export type Category = {
  /** Label shown on the tile. */
  name: string;
  /** Base name in apps/mobile/assets/emoji (no extension) — the app's own 3D icons. */
  icon: string;
};

export type WaitlistAdProps = {
  country: Country;
  headline: string;
  subline: string;
  searchTerm: string;
  categories: Category[];
};

const CATEGORIES: Category[] = [
  { name: "Food", icon: "cooking" },
  { name: "Travel", icon: "airplane" },
  { name: "Fitness", icon: "flexed_biceps" },
  { name: "Design", icon: "artist_palette" },
  { name: "Tech", icon: "laptop" },
];

export const IN_PROPS: WaitlistAdProps = {
  country: "in",
  headline: "2,000 saves.",
  subline: "Good luck finding one.",
  searchTerm: "café",
  categories: CATEGORIES,
};

export const US_PROPS: WaitlistAdProps = {
  country: "us",
  headline: "2,000 saves.",
  subline: "Good luck finding one.",
  searchTerm: "pasta",
  categories: CATEGORIES,
};

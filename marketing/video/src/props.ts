export type Country = "in" | "us";

export type Category = {
  /** The name cards file under (src/cards.ts). */
  name: string;
  /** The app's own category name — keys the mark and palette generated from apps/mobile. */
  app: string;
  /** What the tile prints — the app's short label for that category. */
  label: string;
};

export type WaitlistAdProps = {
  country: Country;
  headline: string;
  subline: string;
  searchTerm: string;
  categories: Category[];
};

const CATEGORIES: Category[] = [
  { name: "Food", app: "Food & recipes", label: "Food" },
  { name: "Travel", app: "Travel & places", label: "Travel" },
  { name: "Fitness", app: "Fitness & health", label: "Wellness" },
  { name: "Design", app: "Design & inspiration", label: "Design" },
  { name: "Tech", app: "Tech & tools", label: "Tech" },
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

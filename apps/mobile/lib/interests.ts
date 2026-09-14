/**
 * Explore interests: what a person keeps saving, counted from what the sorting already found.
 *
 * You file a save into a category; an interest files itself. The classifier names the people,
 * brands, products, places, recipes and tools in every save, and an interest is a name that keeps
 * turning up. This file holds the rules for which of those names make the row and in what order;
 * the query that counts them is user_interests() and the hook is in home.ts. Kept free of runtime
 * imports so the rules can be tested without a renderer.
 */
import { CATEGORIES, ENTITY_ICONS, isEntityIcon, type EntityIcon } from "@allkept/contracts";
import { categoryDisplayName } from "./category-names";
import type { Glyph } from "./icon-names";

/** Every mark the sorting may choose is a glyph the font has: a name that is not is a build error here, never a blank chip. */
ENTITY_ICONS satisfies readonly Glyph[];
import { RESERVED_NAMES } from "./user-categories";

/** What user_interests() returns, one row per name. */
export interface InterestRow {
  name: string;
  kind: string;
  n: number;
  last_saved_at: string;
  crossed_at: string | null;
  category: string | null;
  /** The mark the sorting chose for the name; null until the sweeper's icon pass has been round. Absent from a server that predates it. */
  icon?: string | null;
}

export interface Interest {
  name: string;
  kind: string;
  n: number;
  lastSavedAt: string;
  crossedAt: string | null;
  category: string | null;
  /** The mark the sorting chose, when it is one the font has. */
  icon: EntityIcon | null;
  score: number;
}

/** Saves a name needs before it is an interest. One reel about Minecraft is not an interest; three are. */
export const INTEREST_FLOOR = 3;
/** Interests needed before the row appears. One lonely pill reads as a broken row. */
export const MIN_TO_SHOW = 3;
/** How long an interest that crossed the floor is marked new. */
export const NEW_FOR_DAYS = 7;
/** A save today doubles a name's weight; this many days out it adds nothing. */
const RECENCY_DAYS = 90;

/**
 * Names that can never be interests, however often they are saved. Platforms, because "Instagram"
 * is not an interest when every save came from there. Category names in either spelling, the
 * person's own categories, and the state labels, because an interest that reads like a category
 * makes the two rows look like the same thing twice, and the whole distinction collapses.
 */
const PLATFORMS = ["instagram", "youtube", "tiktok", "reddit", "x", "twitter", "web", "note", "notes", "links", "facebook", "threads", "pinterest", "whatsapp"];

const fold = (value: string): string => value.trim().toLowerCase();

function blocked(taken: readonly string[]): Set<string> {
  return new Set([
    ...PLATFORMS,
    ...CATEGORIES.flatMap((c) => [fold(c), fold(categoryDisplayName(c))]),
    ...RESERVED_NAMES.map(fold),
    ...taken.map(fold),
  ]);
}

const daysSince = (iso: string, now: Date): number => Math.max(0, (now.getTime() - new Date(iso).getTime()) / 86_400_000);

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** "claude" is a whole word of "claude code"; "java" is not a whole word of "javascript". */
const wordOf = (short: string, long: string): boolean => new RegExp(`(^|\\s)${escape(short)}(\\s|$)`).test(long);

/**
 * One thread, not two. "Claude" and "Claude Code" are the same interest, and so are "Ariana" and
 * "Ariana Grande": where one name is a whole word of the other, the two fold into one. The name
 * saved more often keeps the label — it is the spelling the person uses — and takes the other's
 * count, the more recent save, the earlier crossing, and the mark when it has none of its own.
 * Folded before the floor is applied, so two halves of one thread can make an interest between them.
 */
export function mergeThreads(rows: readonly InterestRow[]): InterestRow[] {
  const ordered = [...rows].sort((a, b) => b.n - a.n || a.name.length - b.name.length);
  const groups: InterestRow[] = [];
  for (const r of ordered) {
    const key = fold(r.name);
    const home = groups.find((g) => { const k = fold(g.name); return k === key || wordOf(k, key) || wordOf(key, k); });
    if (!home) { groups.push({ ...r }); continue; }
    home.n += r.n;
    if (r.last_saved_at > home.last_saved_at) home.last_saved_at = r.last_saved_at;
    if (r.crossed_at && (!home.crossed_at || r.crossed_at < home.crossed_at)) home.crossed_at = r.crossed_at;
    if (!home.icon && r.icon) home.icon = r.icon;
  }
  return groups;
}

/**
 * The interests to show, best first.
 *
 * The floor is applied here, after folding: the query is asked for one below it so that two halves
 * of one thread can make an interest between them, and a one-off can still never surface. Weight is the count, doubled for a save today and unboosted
 * three months out, so last month's thread outranks last year's without a big count ever losing to
 * a small recent one. The limit is taken after suppression, so a blocked name costs nothing.
 */
export function rankInterests(rows: readonly InterestRow[], options: { taken: readonly string[]; now: Date; limit?: number }): Interest[] {
  const { taken, now, limit = 12 } = options;
  const never = blocked(taken);
  return mergeThreads(rows.filter((r) => !never.has(fold(r.name))))
    .filter((r) => r.n >= INTEREST_FLOOR)
    .map((r) => ({
      name: r.name.trim(),
      kind: r.kind,
      n: r.n,
      lastSavedAt: r.last_saved_at,
      crossedAt: r.crossed_at,
      category: r.category,
      icon: isEntityIcon(r.icon) ? r.icon : null,
      score: r.n * (1 + Math.max(0, 1 - daysSince(r.last_saved_at, now) / RECENCY_DAYS)),
    }))
    .sort((a, b) => b.score - a.score || b.lastSavedAt.localeCompare(a.lastSavedAt))
    .slice(0, limit);
}

/** Crossed the floor within the last week — the moment that shows this is something Allkept noticed. */
export const isNewInterest = (interest: Pick<Interest, "crossedAt">, now: Date): boolean =>
  !!interest.crossedAt && daysSince(interest.crossedAt, now) <= NEW_FOR_DAYS;

export const showInterests = (interests: readonly Interest[]): boolean => interests.length >= MIN_TO_SHOW;

/**
 * A colour and a mark per kind of thing, so a person and a place never look alike in the row. The
 * marks are filled glyphs drawn in the pill's own colour — the way a calendar chip carries a
 * calendar and a location chip an arrow — never an outline, which would read as a button.
 */
const LOOKS: Record<string, { hue: string; glyph: Glyph }> = {
  person: { hue: "#D63B6E", glyph: "person-circle" },
  brand: { hue: "#2F6FED", glyph: "pricetag" },
  product: { hue: "#E58A1F", glyph: "cube" },
  place: { hue: "#1FA36B", glyph: "navigate" },
  recipe: { hue: "#C64B2A", glyph: "restaurant" },
  tool: { hue: "#6D46F2", glyph: "construct" },
  other: { hue: "#5F6675", glyph: "sparkles" },
};

/**
 * The brand marks the icon font carries, keyed by the name as people write it: "Node.js", "node js"
 * and "NodeJS" are one key, and a few names differ from the glyph's own ("Linux" is the penguin).
 * Only ever a whole name — "Google" wears the logo, "Google Maps" does not, and "Chrome Hearts" is
 * a fashion label — and only as a brand or a tool: a product called Windows may be the ones in a
 * house, and a recipe called Apple is never the company. Typed against the font, so a misspelt
 * glyph is a compile error rather than a blank chip.
 */
const LOGOS = {
  alipay: "logo-alipay", amazon: "logo-amazon", android: "logo-android", angular: "logo-angular", apple: "logo-apple",
  appstore: "logo-apple-appstore", appleappstore: "logo-apple-appstore", awsamplify: "logo-amplify",
  behance: "logo-behance", bitbucket: "logo-bitbucket", bitcoin: "logo-bitcoin", chrome: "logo-chrome", googlechrome: "logo-chrome",
  codepen: "logo-codepen", css: "logo-css3", css3: "logo-css3", deviantart: "logo-deviantart", discord: "logo-discord",
  docker: "logo-docker", dribbble: "logo-dribbble", dropbox: "logo-dropbox", electron: "logo-electron", facebook: "logo-facebook",
  figma: "logo-figma", firebase: "logo-firebase", firefox: "logo-firefox", flickr: "logo-flickr", foursquare: "logo-foursquare",
  github: "logo-github", gitlab: "logo-gitlab", google: "logo-google", googleplay: "logo-google-playstore",
  googleplaystore: "logo-google-playstore", playstore: "logo-google-playstore", hackernews: "logo-hackernews",
  html: "logo-html5", html5: "logo-html5", instagram: "logo-instagram", javascript: "logo-javascript", laravel: "logo-laravel",
  linkedin: "logo-linkedin", linux: "logo-tux", markdown: "logo-markdown", mastodon: "logo-mastodon", medium: "logo-medium",
  microsoft: "logo-microsoft", microsoftedge: "logo-edge", node: "logo-nodejs", nodejs: "logo-nodejs", npm: "logo-npm",
  paypal: "logo-paypal", pinterest: "logo-pinterest", playstation: "logo-playstation", python: "logo-python", react: "logo-react",
  reactjs: "logo-react", reddit: "logo-reddit", rss: "logo-rss", sass: "logo-sass", skype: "logo-skype", slack: "logo-slack",
  snapchat: "logo-snapchat", soundcloud: "logo-soundcloud", stackoverflow: "logo-stackoverflow", steam: "logo-steam",
  tableau: "logo-tableau", threads: "logo-threads", tiktok: "logo-tiktok", tumblr: "logo-tumblr", twitch: "logo-twitch",
  twitter: "logo-twitter", venmo: "logo-venmo", vercel: "logo-vercel", vimeo: "logo-vimeo", vk: "logo-vk", vue: "logo-vue",
  vuejs: "logo-vue", wechat: "logo-wechat", whatsapp: "logo-whatsapp", windows: "logo-windows", wordpress: "logo-wordpress",
  x: "logo-x", xbox: "logo-xbox", xing: "logo-xing", yahoo: "logo-yahoo", youtube: "logo-youtube",
} as const satisfies Record<string, Glyph>;

/** Lowercase letters and digits only, so the spelling on the pill never decides whether it wears a logo. */
const logoKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const WEARS_LOGO = new Set(["brand", "tool"]);

/**
 * How an interest is drawn: its kind's colour, and the most specific mark known for it — the brand's
 * own logo where the font has one, else the mark the sorting chose for the name (film for IMDb),
 * else the kind's mark. The wash stays the kind's whatever the mark: the mark says what the thing
 * is, the colour what sort of thing. A kind the classifier has not been taught yet is drawn like
 * "other", never blank.
 */
export function interestStyle(interest: Pick<Interest, "name" | "kind" | "icon">): { hue: string; glyph: Glyph } {
  const look = LOOKS[interest.kind] ?? LOOKS["other"]!;
  const logo = WEARS_LOGO.has(interest.kind) ? (LOGOS as Record<string, Glyph>)[logoKey(interest.name)] : undefined;
  return { hue: look.hue, glyph: logo ?? interest.icon ?? look.glyph };
}

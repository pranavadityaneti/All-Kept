/**
 * Explore interests: what a person keeps saving, counted from what the sorting already found.
 *
 * You file a save into a category; an interest files itself. The classifier names the people,
 * brands, products, places, recipes and tools in every save, and an interest is a name that keeps
 * turning up. This file holds the rules for which of those names make the row and in what order;
 * the query that counts them is user_interests() and the hook is in home.ts. Kept free of runtime
 * imports so the rules can be tested without a renderer.
 */
import { CATEGORIES } from "@allkept/contracts";
import { categoryDisplayName } from "./category-names";
import type { Glyph } from "./icon-names";
import { RESERVED_NAMES } from "./user-categories";

/** What user_interests() returns, one row per name. */
export interface InterestRow {
  name: string;
  kind: string;
  n: number;
  last_saved_at: string;
  crossed_at: string | null;
  category: string | null;
}

export interface Interest {
  name: string;
  kind: string;
  n: number;
  lastSavedAt: string;
  crossedAt: string | null;
  category: string | null;
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
 * count, the more recent save, and the earlier crossing. Folded before the floor is applied, so two
 * halves of one thread can make an interest between them.
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

/** A kind the classifier has not been taught yet is drawn like "other", never blank. */
export const interestStyle = (kind: string): { hue: string; glyph: Glyph } => LOOKS[kind] ?? LOOKS["other"]!;

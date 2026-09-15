import { useQuery } from "@tanstack/react-query";
import { isEntityIcon, type CategorySummaryResponse } from "@allkept/contracts";
import type { Filters } from "./filter-groups";
import { mergeThreads, neverAnInterest, type Interest, type InterestRow } from "./interests";
import { supabase } from "./supabase";

/**
 * The Library's header when one category is open: what it holds, and what it is about.
 *
 * The facts — how many, mostly what, what the sorter thought they were for — and the names that keep
 * turning up come from the server's count of the category; the themes are written once by the
 * sorting model and kept there. This file holds the rules for wording and for which names show; the
 * card draws them. Kept free of renderer imports so the rules can be tested.
 */

/** The one category the summary is for, when the filters name exactly one and nothing else. */
export function shouldShowSummary(filters: Filters): string | null {
  const alone = filters.categories.length === 1 && filters.platforms.length === 0 && filters.shapes.length === 0 && filters.flags.length === 0;
  return alone ? filters.categories[0]! : null;
}

const SHAPE_WORD: Record<string, string> = { vertical: "reels", wide: "videos", post: "posts", link: "links", note: "notes", profile: "profiles", story: "stories", other: "other" };
const INTENT_WORD: Record<string, string> = { watch: "to watch", try: "to try", buy: "to buy", go: "to go", read: "to read" };

/**
 * "77 saves · 43 to watch · 13 to try". The shape only when there is a clear majority ("mostly
 * reels", "all videos"), the top two intents, and never an intent a single save carries in a large
 * category — a stray guess is not a headline.
 */
export function factsFor(summary: Pick<CategorySummaryResponse, "count" | "shapes" | "intents">): string {
  const parts = [`${summary.count} ${summary.count === 1 ? "save" : "saves"}`];
  const shapes = Object.entries(summary.shapes).sort((a, b) => b[1] - a[1]);
  const top = shapes[0];
  if (top && summary.count >= 2) {
    const share = top[1] / summary.count;
    const word = SHAPE_WORD[top[0]] ?? top[0];
    if (share === 1) parts.push(`all ${word}`);
    else if (share >= 0.6) parts.push(`mostly ${word}`);
  }
  const intents = Object.entries(summary.intents)
    .filter(([intent, n]) => INTENT_WORD[intent] && (n >= 2 || summary.count <= 9))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  for (const [intent, n] of intents) parts.push(`${n} ${INTENT_WORD[intent]}`);
  return parts.join(" · ");
}

/**
 * The names worth a chip: a thread's spellings folded into one, platforms and category names kept
 * out, the three most saved. Drawn as interest chips, so they carry the same marks and open search.
 */
export function headerNames(summary: Pick<CategorySummaryResponse, "names">, taken: readonly string[]): Interest[] {
  const rows: InterestRow[] = summary.names.map((n) => ({ name: n.name, kind: n.kind, n: n.n, last_saved_at: "", crossed_at: null, category: null, icon: n.icon }));
  return mergeThreads(rows)
    .filter((r) => !neverAnInterest(r.name, taken))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((r) => ({ name: r.name.trim(), kind: r.kind, n: r.n, lastSavedAt: r.last_saved_at, crossedAt: null, category: null, icon: isEntityIcon(r.icon) ? r.icon : null, score: r.n }));
}

export const categorySummaryKey = (category: string) => ["category-summary", category] as const;

/** The server's answer for one category. Fresh for a few minutes; the themes behind it are kept for an hour or until the category changes. */
export function useCategorySummary(category: string | null, enabled: boolean) {
  return useQuery({
    queryKey: categorySummaryKey(category ?? ""),
    enabled: enabled && !!category,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CategorySummaryResponse> => {
      const { data, error } = await supabase.functions.invoke<CategorySummaryResponse>("category-summary", { body: { category } });
      if (error || !data) throw new Error(error ? String(error.message ?? error) : "no summary");
      return data;
    },
  });
}

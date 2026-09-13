import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { INTEREST_FLOOR, type InterestRow } from "./interests";
import { toItem, type LibraryItem } from "./library";

const RECENT = 12;

type Row = Record<string, unknown>;

/**
 * The newest saves, for the row at the top of the home screen.
 *
 * `platforms` is part of the key, so each selection is cached and returning to one is instant. The
 * key still begins with "recent-saves", which is what invalidateLibrary matches on, so a new save
 * refreshes every cached selection rather than only the one on screen.
 */
export function useRecentSaves(enabled: boolean, platforms: string[] = []) {
  return useQuery({
    queryKey: ["recent-saves", [...platforms].sort()],
    enabled,
    queryFn: async (): Promise<LibraryItem[]> => {
      const { data, error } = await supabase.rpc("library_query_v2", { platforms: platforms.length ? platforms : null, categories: null, before: null, lim: RECENT });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map(toItem);
    },
  });
}

/**
 * How many saves each category took in the last thirty days — what "saves to regularly" means for
 * the two wide cards. Keyed as "category-activity", which invalidateLibrary matches.
 */
export function useCategoryActivity(enabled: boolean) {
  return useQuery({
    queryKey: ["category-activity"],
    enabled,
    queryFn: async (): Promise<{ category: string; n: number }[]> => {
      const { data, error } = await supabase.rpc("category_activity", { p_days: 30 });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { category: string; n: number | string }[]).map((r) => ({ category: r.category, n: Number(r.n) }));
    },
  });
}

/**
 * What the person keeps saving, counted by the database from the entities the sorting found.
 *
 * Keyed as "interests", which invalidateLibrary matches, so a save that tips a name over the floor
 * shows up without a restart. The rules for which names make the row live in interests.ts; this
 * only fetches.
 */
export function useInterests(enabled: boolean) {
  return useQuery({
    queryKey: ["interests"],
    enabled,
    queryFn: async (): Promise<InterestRow[]> => {
      // One below the floor, so "Claude" at two and "Claude Code" at two can fold into one interest
      // of four; the app applies the real floor after merging.
      const { data, error } = await supabase.rpc("user_interests", { p_min: INTEREST_FLOOR - 1, p_limit: 60 });
      if (error) throw new Error(error.message);
      return (data ?? []) as InterestRow[];
    },
  });
}

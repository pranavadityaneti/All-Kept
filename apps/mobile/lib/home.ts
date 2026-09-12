import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
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
 * The picture each category wears: the newest save under it that has a thumbnail.
 *
 * Keyed as "category-covers", which invalidateLibrary matches, so saving something that becomes a
 * category's newest picture changes the tile without a restart. A category with nothing pictured
 * inside it is simply absent from the map and falls back to its own mark.
 */
export function useCategoryCovers(enabled: boolean) {
  return useQuery({
    queryKey: ["category-covers"],
    enabled,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.rpc("category_covers");
      if (error) throw new Error(error.message);
      const covers: Record<string, string> = {};
      for (const row of (data ?? []) as { category: string; thumbnail_path: string }[]) {
        if (row.category && row.thumbnail_path) covers[row.category] = row.thumbnail_path;
      }
      return covers;
    },
  });
}

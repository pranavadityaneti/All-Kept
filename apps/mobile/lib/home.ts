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

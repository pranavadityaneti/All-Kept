import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { toItem, type LibraryItem } from "./library";

const RECENT = 12;

type Row = Record<string, unknown>;

/** The newest saves, for the row at the top of the home screen. */
export function useRecentSaves(enabled: boolean) {
  return useQuery({
    queryKey: ["recent-saves"],
    enabled,
    queryFn: async (): Promise<LibraryItem[]> => {
      const { data, error } = await supabase.rpc("library_query_v2", { platforms: null, categories: null, before: null, lim: RECENT });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map(toItem);
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { LibraryItem } from "./library";

const RECENT = 12;

type Row = Record<string, unknown>;

const toItem = (r: Row): LibraryItem => ({
  id: String(r["id"]), platform: String(r["platform"]), kind: String(r["kind"]), status: String(r["status"]),
  title: (r["title"] as string | null) ?? null, text: (r["text"] as string | null) ?? null,
  authorName: (r["author_name"] as string | null) ?? null, authorHandle: (r["author_handle"] as string | null) ?? null,
  canonicalUrl: (r["canonical_url"] as string | null) ?? null, sourceUrl: (r["source_url"] as string | null) ?? null,
  thumbnailPath: (r["thumbnail_path"] as string | null) ?? null, lastSavedAt: String(r["last_saved_at"]),
  saveCount: Number(r["save_count"] ?? 1), category: (r["category"] as string | null) ?? null,
  tags: Array.isArray(r["tags"]) ? (r["tags"] as string[]) : [], summary: (r["summary"] as string | null) ?? null,
});

/** The newest saves, for the row at the top of the home screen. */
export function useRecentSaves(enabled: boolean) {
  return useQuery({
    queryKey: ["recent-saves"],
    enabled,
    queryFn: async (): Promise<LibraryItem[]> => {
      const { data, error } = await supabase.rpc("library_query", { q: null, platforms: null, categories: null, before: null, lim: RECENT });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map(toItem);
    },
  });
}

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";

export interface LibraryItem {
  id: string;
  platform: string;
  kind: string;
  status: string;
  title: string | null;
  text: string | null;
  authorName: string | null;
  authorHandle: string | null;
  canonicalUrl: string | null;
  sourceUrl: string | null;
  thumbnailPath: string | null;
  lastSavedAt: string;
  saveCount: number;
  category: string | null;
  tags: string[];
  summary: string | null;
}

export interface Filters { platforms: string[]; categories: string[] }
export const NO_FILTERS: Filters = { platforms: [], categories: [] };

const PAGE = 30;
type Row = Record<string, unknown>;

const toItem = (r: Row): LibraryItem => ({
  id: String(r["id"]),
  platform: String(r["platform"]),
  kind: String(r["kind"]),
  status: String(r["status"]),
  title: (r["title"] as string | null) ?? null,
  text: (r["text"] as string | null) ?? null,
  authorName: (r["author_name"] as string | null) ?? null,
  authorHandle: (r["author_handle"] as string | null) ?? null,
  canonicalUrl: (r["canonical_url"] as string | null) ?? null,
  sourceUrl: (r["source_url"] as string | null) ?? null,
  thumbnailPath: (r["thumbnail_path"] as string | null) ?? null,
  lastSavedAt: String(r["last_saved_at"]),
  saveCount: Number(r["save_count"] ?? 1),
  category: (r["category"] as string | null) ?? null,
  tags: Array.isArray(r["tags"]) ? (r["tags"] as string[]) : [],
  summary: (r["summary"] as string | null) ?? null,
});

async function fetchPage(q: string | null, filters: Filters, before: string | null): Promise<{ items: LibraryItem[]; nextCursor: string | null }> {
  const { data, error } = await supabase.rpc("library_query", {
    q,
    platforms: filters.platforms.length ? filters.platforms : null,
    categories: filters.categories.length ? filters.categories : null,
    before,
    lim: PAGE,
  });
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as Row[]).map(toItem);
  // Search returns one ranked page; the grid pages by the oldest save on the page.
  const nextCursor = !q && items.length === PAGE ? items[items.length - 1]!.lastSavedAt : null;
  return { items, nextCursor };
}

export function useLibrary(filters: Filters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["library", filters],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPage(null, filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useSearch(q: string, filters: Filters, enabled: boolean) {
  const term = q.trim();
  return useQuery({
    queryKey: ["search", term, filters],
    enabled: enabled && term.length > 0,
    queryFn: async () => (await fetchPage(term, filters, null)).items,
  });
}

export interface Facets { platforms: { value: string; n: number }[]; categories: { value: string; n: number }[] }

export function useFacets(enabled: boolean) {
  return useQuery({
    queryKey: ["facets"],
    enabled,
    queryFn: async (): Promise<Facets> => {
      const { data, error } = await supabase.rpc("library_facets");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { facet: string; value: string; n: number }[];
      const pick = (facet: string) => rows.filter((r) => r.facet === facet).map((r) => ({ value: r.value, n: Number(r.n) })).sort((a, b) => b.n - a.n);
      return { platforms: pick("platform"), categories: pick("category") };
    },
  });
}

/** Saves arrive while the app is open, and sorting finishes a few seconds after that, so watch both tables. */
export function useLibraryRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      void queryClient.invalidateQueries({ queryKey: ["facets"] });
    };
    const channel = supabase
      .channel("library")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "item_ai" }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, queryClient]);
}

import { useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import type { ClassificationStatus } from "@allkept/contracts";
import { supabase } from "./supabase";

export interface LibraryItem {
  id: string;
  platform: string;
  kind: string;
  status: string;
  classificationStatus?: ClassificationStatus;
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

export const toItem = (r: Row): LibraryItem => ({
  id: String(r["id"]),
  platform: String(r["platform"]),
  kind: String(r["kind"]),
  status: String(r["status"]),
  classificationStatus: r["classification_status"] as ClassificationStatus,
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

interface LibraryCursor { savedAt: string; id: string }

async function fetchPage(filters: Filters, before: LibraryCursor | null): Promise<{ items: LibraryItem[]; nextCursor: LibraryCursor | null }> {
  const { data, error } = await supabase.rpc("library_query_v2", {
    platforms: filters.platforms.length ? filters.platforms : null,
    categories: filters.categories.length ? filters.categories : null,
    before,
    lim: PAGE,
  });
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as Row[]).map(toItem);
  // Include the ID so saves with the same timestamp are never skipped.
  const nextCursor = items.length === PAGE ? { savedAt: items[items.length - 1]!.lastSavedAt, id: items[items.length - 1]!.id } : null;
  return { items, nextCursor };
}

export function useLibrary(filters: Filters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["library", "v2", filters],
    enabled,
    initialPageParam: null as LibraryCursor | null,
    queryFn: ({ pageParam }) => fetchPage(filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}

interface SearchCursor extends LibraryCursor { score: number; embedding: number[] | null }
interface SearchPage { items: LibraryItem[]; nextCursor: SearchCursor | null; mode: "hybrid" | "keyword" }

export function useSearch(q: string, filters: Filters, enabled: boolean) {
  const term = q.trim();
  return useInfiniteQuery({
    queryKey: ["search", "v2", term, filters],
    enabled: enabled && term.length > 0,
    initialPageParam: null as SearchCursor | null,
    queryFn: async ({ pageParam, signal }): Promise<SearchPage> => {
      const { data, error } = await supabase.functions.invoke<{ items: Row[]; nextCursor: SearchCursor | null; mode: SearchPage["mode"] }>("search-library", {
        body: { q: term, ...filters, cursor: pageParam }, signal,
      });
      if (error || !data) throw new Error("Could not search your library. Please try again.");
      return { ...data, items: data.items.map(toItem) };
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Every list that shows saves. One place, so a change to a save can never refresh some of them and miss others. */
export const LIBRARY_KEYS = [["library"], ["facets"], ["recent-saves"], ["search"], ["item"]] as const;

export function invalidateLibrary(queryClient: QueryClient): void {
  for (const key of LIBRARY_KEYS) void queryClient.invalidateQueries({ queryKey: key });
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

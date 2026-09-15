import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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
  /** When the person asked to be reminded of this save, if they did; past or future. */
  remindAt?: string | null;
  /** When the person marked the save done, if they did. */
  doneAt?: string | null;
  /** The place the save names, once the server has found it on a map; the card wears a pin for it. */
  placeName?: string | null;
}

// The groups themselves live in filter-groups.ts, which stays free of runtime imports.
export { FILTER_GROUPS, NO_FILTERS, countFilters, type Facet, type Facets, type Filters } from "./filter-groups";
import type { Facet, Facets, Filters } from "./filter-groups";

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
  remindAt: (r["remind_at"] as string | null) ?? null,
  doneAt: (r["done_at"] as string | null) ?? null,
  placeName: (r["place_name"] as string | null) ?? null,
});

interface LibraryCursor { savedAt: string; id: string }

async function fetchPage(filters: Filters, before: LibraryCursor | null): Promise<{ items: LibraryItem[]; nextCursor: LibraryCursor | null }> {
  const { data, error } = await supabase.rpc("library_query_v7", {
    platforms: filters.platforms.length ? filters.platforms : null,
    categories: filters.categories.length ? filters.categories : null,
    shapes: filters.shapes.length ? filters.shapes : null,
    flags: filters.flags.length ? filters.flags : null,
    intents: filters.intents.length ? filters.intents : null,
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
    queryKey: ["library", "v6", filters],
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
    queryKey: ["search", "v3", term, filters],
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

/** The saves whose reminder has fired in the last thirty days, for the Notifications screen. Keyed under "library", which invalidateLibrary matches. */
export function useFiredReminders(enabled: boolean) {
  return useQuery({
    queryKey: ["library", "reminded"],
    enabled,
    queryFn: async (): Promise<LibraryItem[]> => {
      const { data, error } = await supabase.rpc("library_query_v7", { flags: ["reminded"], lim: 50 });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map(toItem);
    },
  });
}

/** The saves marked done, newest first, for the Notifications screen. */
export function useDoneSaves(enabled: boolean) {
  return useQuery({
    queryKey: ["library", "done"],
    enabled,
    queryFn: async (): Promise<LibraryItem[]> => {
      const { data, error } = await supabase.rpc("library_query_v7", { flags: ["done"], lim: 50 });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map(toItem);
    },
  });
}

/** Every list that shows saves. One place, so a change to a save can never refresh some of them and miss others. */
export const LIBRARY_KEYS = [["library"], ["facets"], ["recent-saves"], ["search"], ["item"], ["category-activity"], ["interests"]] as const;

export function invalidateLibrary(queryClient: QueryClient): void {
  for (const key of LIBRARY_KEYS) void queryClient.invalidateQueries({ queryKey: key });
}

/**
 * What the library can be narrowed by, and the categories a person made.
 *
 * The two are merged here, in one query, because four of the five places that list categories read
 * exactly this — the home grid, the filter sheet, the sheet's button, and search. A category with
 * nothing in it yet is counted zero rather than left out, which is what lets somebody set up
 * "Wedding" before saving anything to it.
 */
export function useFacets(enabled: boolean) {
  return useQuery({
    queryKey: ["facets"],
    enabled,
    queryFn: async (): Promise<Facets> => {
      const [counted, own] = await Promise.all([
        supabase.rpc("library_facets_v3"),
        supabase.from("user_categories").select("name,icon").order("name"),
      ]);
      if (counted.error) throw new Error(counted.error.message);
      // The counts are the library; a person's own list is additive. If that read fails — offline
      // for a moment, a grant not yet in place — the grid and the filters still describe every save
      // they have, and only categories holding nothing go missing. Failing the whole query instead
      // would blank the category grid, the filter sheet and search at once.
      const mine = own.error ? [] : ((own.data ?? []) as { name: string; icon: string }[]);
      const rows = (counted.data ?? []) as { kind: string; value: string; n: number }[];
      // A flag is only counted where it holds, so one that matches nothing never becomes a control
      // that does nothing — and appears on its own the day it starts meaning something.
      const pick = (kind: string): Facet =>
        rows.filter((r) => r.kind === kind && r.value).map((r) => ({ value: r.value, n: Number(r.n) })).sort((a, b) => b.n - a.n);
      return {
        platforms: pick("platform"),
        categories: mergeOwnCategories(pick("category"), mine),
        shapes: pick("shape"),
        flags: pick("flag"),
        intents: pick("intent"),
      };
    },
  });
}

/** A category of your own is marked as yours wherever it appears, with the mark you chose for it. */
export function mergeOwnCategories(counted: Facet, mine: readonly { name: string; icon: string }[]): Facet {
  const icons = new Map(mine.map((r) => [r.name, r.icon]));
  const named = counted.map((c) => (icons.has(c.value) ? { ...c, icon: icons.get(c.value), mine: true } : c));
  // Appended rather than sorted in: the counted ones are ordered by size, and a category holding
  // nothing belongs after them however recently it was made.
  const empty = mine
    .filter((r) => !named.some((c) => c.value === r.name))
    .map((r) => ({ value: r.name, n: 0, icon: r.icon, mine: true }));
  return [...named, ...empty];
}

/** The categories this person made, in the order the list shows them. */
export const ownCategories = (facets: Facets | undefined): Facet => (facets?.categories ?? []).filter((c) => c.mine);

function useCategoryMutation<T>(run: (input: T) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: () => invalidateLibrary(queryClient) });
}

export function useCreateCategory(userId: string | null) {
  return useCategoryMutation<{ name: string; icon: string }>(async ({ name, icon }) => {
    if (!userId) throw new Error("not signed in");
    const { error } = await supabase.from("user_categories").insert({ user_id: userId, name, icon });
    if (error) throw new Error(error.message);
  });
}

/**
 * Changing a category: the name through the function that moves the saves with it, the mark by an
 * ordinary update, because nothing else refers to the mark. Renamed first, so the mark is set on
 * the name the row now has.
 */
export function useEditCategory() {
  return useCategoryMutation<{ from: string; name: string; icon: string }>(async ({ from, name, icon }) => {
    if (name !== from) {
      const { error } = await supabase.rpc("rename_user_category", { p_name: from, p_new_name: name });
      if (error) throw new Error(error.message);
    }
    const { error } = await supabase.from("user_categories").update({ icon }).eq("name", name);
    if (error) throw new Error(error.message);
  });
}

export function useDeleteCategory() {
  return useCategoryMutation<string>(async (name) => {
    const { error } = await supabase.rpc("delete_user_category", { p_name: name });
    if (error) throw new Error(error.message);
  });
}

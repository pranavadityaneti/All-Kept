import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReprocessItemResponse } from "@allkept/contracts";
import { parseAttachedLink } from "./attach-link";
import { supabase } from "./supabase";

export interface ItemDetail {
  id: string;
  platform: string;
  kind: string;
  status: string;
  title: string | null;
  text: string | null;
  note: string | null;
  authorName: string | null;
  authorHandle: string | null;
  canonicalUrl: string | null;
  sourceUrl: string | null;
  thumbnailPath: string | null;
  lastSavedAt: string;
  saveCount: number;
  category: string | null;
  modelCategory: string | null;
  tags: string[];
  summary: string | null;
}

const SELECT = "id,platform,kind,status,title,text,note,author_name,author_handle,canonical_url,source_url,thumbnail_path,last_saved_at,save_count,item_ai(category,user_category,tags,summary)";

type Row = Record<string, unknown>;

function toDetail(r: Row): ItemDetail {
  const ai = (r["item_ai"] ?? null) as Row | null;
  return {
    id: String(r["id"]),
    platform: String(r["platform"]),
    kind: String(r["kind"]),
    status: String(r["status"]),
    title: (r["title"] as string | null) ?? null,
    text: (r["text"] as string | null) ?? null,
    note: (r["note"] as string | null) ?? null,
    authorName: (r["author_name"] as string | null) ?? null,
    authorHandle: (r["author_handle"] as string | null) ?? null,
    canonicalUrl: (r["canonical_url"] as string | null) ?? null,
    sourceUrl: (r["source_url"] as string | null) ?? null,
    thumbnailPath: (r["thumbnail_path"] as string | null) ?? null,
    lastSavedAt: String(r["last_saved_at"]),
    saveCount: Number(r["save_count"] ?? 1),
    category: ((ai?.["user_category"] as string | null) ?? (ai?.["category"] as string | null)) ?? null,
    modelCategory: (ai?.["category"] as string | null) ?? null,
    tags: Array.isArray(ai?.["tags"]) ? (ai!["tags"] as string[]) : [],
    summary: (ai?.["summary"] as string | null) ?? null,
  };
}

export function useItem(id: string) {
  return useQuery({
    queryKey: ["item", id],
    queryFn: async (): Promise<ItemDetail | null> => {
      const { data, error } = await supabase.from("items").select(SELECT).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toDetail(data as Row) : null;
    },
  });
}

/** The link a card opens: the canonical permalink, else whatever was shared. */
export const openableUrl = (item: ItemDetail): string | null => item.canonicalUrl ?? item.sourceUrl;

function useItemMutation<T>(id: string, run: (input: T) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["item", id] });
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      void queryClient.invalidateQueries({ queryKey: ["facets"] });
    },
  });
}

/** A correction is stored beside the model's answer, never over it, so we can measure how often it is wrong. */
export function useSetCategory(id: string, userId: string | null) {
  return useItemMutation<string>(id, async (category) => {
    if (!userId) throw new Error("not signed in");
    const { error } = await supabase.from("item_ai").upsert({ item_id: id, user_id: userId, user_category: category }, { onConflict: "item_id" });
    if (error) throw new Error(error.message);
  });
}

export function useSetNote(id: string) {
  return useItemMutation<string>(id, async (note) => {
    const { error } = await supabase.from("items").update({ note: note.trim() || null }).eq("id", id);
    if (error) throw new Error(error.message);
  });
}

/** Deletes the row first, then the thumbnail: an orphaned file is harmless, a card with a missing image is not. */
export function useDeleteItem(id: string, thumbnailPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw new Error(error.message);
      if (thumbnailPath) await supabase.storage.from("thumbs").remove([thumbnailPath]).catch(() => undefined);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      void queryClient.invalidateQueries({ queryKey: ["facets"] });
    },
  });
}

export class DuplicateLinkError extends Error {
  constructor() { super("You have already saved that link."); }
}

export function useAttachLink(id: string, expectPlatform?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pasted: string): Promise<ReprocessItemResponse> => {
      const link = parseAttachedLink(pasted, expectPlatform);
      const { error } = await supabase
        .from("items")
        .update({
          platform: link.platform, kind: link.kind, source_url: link.sourceUrl, canonical_url: link.canonicalUrl,
          external_id: link.externalId, needs_expansion: link.needsExpansion, status: "pending", enrich_attempts: 0, next_attempt_at: null,
        })
        .eq("id", id);
      if (error) throw error.code === "23505" ? new DuplicateLinkError() : new Error(error.message);

      const { data, error: e2 } = await supabase.functions.invoke<ReprocessItemResponse>("reprocess-item", { body: { itemId: id } });
      if (e2) throw new Error(e2.message);
      return data ?? { status: "pending", category: null };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["item", id] });
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      void queryClient.invalidateQueries({ queryKey: ["facets"] });
    },
  });
}

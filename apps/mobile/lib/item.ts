import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClassificationStatus, ReprocessItemResponse } from "@allkept/contracts";
import { parseAttachedLink } from "./attach-link";
import { invalidateLibrary } from "./library";
import { supabase } from "./supabase";
import { forgetThumbnail } from "./thumbnails";

export interface ItemDetail {
  id: string;
  platform: string;
  kind: string;
  status: string;
  classificationStatus?: ClassificationStatus;
  title: string | null;
  text: string | null;
  note: string | null;
  authorName: string | null;
  authorHandle: string | null;
  canonicalUrl: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  thumbnailPath: string | null;
  lastSavedAt: string;
  saveCount: number;
  category: string | null;
  modelCategory: string | null;
  tags: string[];
  summary: string | null;
  /** The publisher, for a link from a site we have no platform name for. */
  siteName: string | null;
  /** The video's shape as width ÷ height, when enrichment managed to learn it. A Short is 0.563. */
  aspect: number | null;
  /** False when the provider refuses to play this in a frame. Absent means nothing is known. */
  embeddable: boolean | null;
}

const SELECT = "id,platform,kind,status,classification_status,title,text,note,author_name,author_handle,canonical_url,source_url,external_id,thumbnail_path,last_saved_at,save_count,media_meta,item_ai(category,user_category,tags,summary)";

type Row = Record<string, unknown>;

/** Only a real, positive number counts. Anything else means we never learned the shape. */
function readAspect(meta: Record<string, unknown> | null): number | null {
  const a = meta?.["aspect"];
  return typeof a === "number" && Number.isFinite(a) && a > 0 ? a : null;
}

function toDetail(r: Row): ItemDetail {
  const ai = (r["item_ai"] ?? null) as Row | null;
  const meta = (r["media_meta"] ?? null) as Record<string, unknown> | null;
  return {
    id: String(r["id"]),
    platform: String(r["platform"]),
    kind: String(r["kind"]),
    status: String(r["status"]),
    classificationStatus: r["classification_status"] as ClassificationStatus,
    title: (r["title"] as string | null) ?? null,
    text: (r["text"] as string | null) ?? null,
    note: (r["note"] as string | null) ?? null,
    authorName: (r["author_name"] as string | null) ?? null,
    authorHandle: (r["author_handle"] as string | null) ?? null,
    canonicalUrl: (r["canonical_url"] as string | null) ?? null,
    sourceUrl: (r["source_url"] as string | null) ?? null,
    externalId: (r["external_id"] as string | null) ?? null,
    thumbnailPath: (r["thumbnail_path"] as string | null) ?? null,
    lastSavedAt: String(r["last_saved_at"]),
    saveCount: Number(r["save_count"] ?? 1),
    category: ((ai?.["user_category"] as string | null) ?? (ai?.["category"] as string | null)) ?? null,
    modelCategory: (ai?.["category"] as string | null) ?? null,
    tags: Array.isArray(ai?.["tags"]) ? (ai!["tags"] as string[]) : [],
    summary: (ai?.["summary"] as string | null) ?? null,
    siteName: (meta?.["site_name"] as string | null) ?? null,
    aspect: readAspect(meta),
    embeddable: typeof meta?.["embeddable"] === "boolean" ? (meta["embeddable"] as boolean) : null,
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
      invalidateLibrary(queryClient);
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
      invalidateLibrary(queryClient);
    },
  });
}

export class DuplicateLinkError extends Error {
  constructor() { super("You have already saved that link."); }
}

export function useAttachLink(id: string, expectPlatform?: string, thumbnailPath?: string | null) {
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
      forgetThumbnail(thumbnailPath); // the picture behind this path has just been replaced
      void queryClient.invalidateQueries({ queryKey: ["item", id] });
      invalidateLibrary(queryClient);
    },
  });
}

/** Retries the failed stage. Concurrent requests share the database classification lease. */
export function useRetrySorting(id: string) {
  return useItemMutation<void>(id, async () => {
    const { error } = await supabase.functions.invoke<ReprocessItemResponse>("reprocess-item", { body: { itemId: id, retry: true } });
    if (error) throw new Error("Could not retry. Please try again.");
  });
}

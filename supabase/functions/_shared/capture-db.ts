// Supabase-backed dependencies for the capture module.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { CaptureDeps, ExistingItem } from "./capture.ts";

type ItemRow = { id: string; platform: ExistingItem["platform"]; kind: ExistingItem["kind"]; canonical_url: string | null; status: ExistingItem["status"] };
const SELECT = "id, platform, kind, canonical_url, status";
const toExisting = (r: ItemRow): ExistingItem => ({ id: r.id, platform: r.platform, kind: r.kind, canonicalUrl: r.canonical_url, status: r.status });

export function captureDeps(db: SupabaseClient): CaptureDeps {
  return {
    now: () => new Date(),
    async findCapture(userId, sourceKind, sourceEventId) {
      const { data: cap, error } = await db.from("captures").select("item_id, deduplicated").eq("user_id", userId).eq("source_kind", sourceKind).eq("source_event_id", sourceEventId).maybeSingle();
      if (error) throw error;
      if (!cap) return null;
      const { data: item, error: e2 } = await db.from("items").select(SELECT).eq("id", cap.item_id).eq("user_id", userId).maybeSingle();
      if (e2) throw e2;
      return item ? { item: toExisting(item as ItemRow), deduplicated: cap.deduplicated as boolean } : null;
    },
    async findExisting(userId, identity) {
      let q = db.from("items").select(SELECT).eq("user_id", userId);
      if (identity.externalId) q = q.eq("platform", identity.platform).eq("external_id", identity.externalId);
      else if (identity.canonicalUrl) q = q.is("external_id", null).eq("canonical_url", identity.canonicalUrl);
      else return null;
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data ? toExisting(data as ItemRow) : null;
    },
    async insertItem(row) {
      const { data, error } = await db.from("items").insert(row).select("id").single();
      if (error) {
        const identity = error.code === "23505" && (error.message.includes("items_user_external_uidx") || error.message.includes("items_user_canonical_uidx"));
        return { ok: false, conflict: identity ? "identity" : "other", message: `${error.code ?? ""} ${error.message}`.trim() };
      }
      return { ok: true, id: (data as { id: string }).id };
    },
    async bumpSave(itemId, userId, at) {
      const { error } = await db.rpc("bump_item_save", { p_item_id: itemId, p_user_id: userId, p_note: null, p_at: at.toISOString() });
      if (error) throw error;
    },
    async recordCapture(rec) {
      const { error } = await db.from("captures").upsert(
        { user_id: rec.userId, source_kind: rec.sourceKind, source_event_id: rec.sourceEventId, item_id: rec.itemId, deduplicated: rec.deduplicated },
        { onConflict: "user_id,source_kind,source_event_id", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
  };
}

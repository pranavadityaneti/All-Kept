// A short link can only be told apart from a save we already hold after it has been expanded. By
// then a placeholder row exists. This folds that placeholder into the original the way capture()
// treats a duplicate it can see up front: one more save of the original, nothing left behind.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ItemIdentity } from "./contracts.ts";
import { captureDeps } from "./capture-db.ts";

export interface DuplicateDeps {
  findExisting(userId: string, identity: ItemIdentity): Promise<{ id: string } | null>;
  bumpSave(itemId: string, userId: string, at: Date): Promise<void>;
  /** Moves the door's idempotency record to the original. Must run before the placeholder is deleted: captures cascade with their item. */
  repointCaptures(fromItemId: string, toItemId: string): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
}

/** Returns the original's id, or null when no original could be found (the placeholder is then left to the caller). */
export async function foldDuplicate(placeholder: { id: string; user_id: string; saved_at: string }, identity: ItemIdentity, deps: DuplicateDeps): Promise<string | null> {
  const original = await deps.findExisting(placeholder.user_id, identity);
  if (!original || original.id === placeholder.id) return null;
  const parsed = new Date(placeholder.saved_at);
  await deps.bumpSave(original.id, placeholder.user_id, Number.isFinite(parsed.getTime()) ? parsed : new Date());
  await deps.repointCaptures(placeholder.id, original.id);
  await deps.deleteItem(placeholder.id);
  return original.id;
}

export function duplicateDeps(db: SupabaseClient): DuplicateDeps {
  const c = captureDeps(db);
  return {
    findExisting: (userId, identity) => c.findExisting(userId, identity),
    bumpSave: (itemId, userId, at) => c.bumpSave(itemId, userId, at),
    async repointCaptures(from, to) {
      const { error } = await db.from("captures").update({ item_id: to, deduplicated: true }).eq("item_id", from);
      if (error) throw error;
    },
    async deleteItem(id) {
      const { error } = await db.from("items").delete().eq("id", id);
      if (error) throw error;
    },
  };
}

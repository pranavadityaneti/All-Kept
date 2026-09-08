// The capture module: every door (Instagram DM, YouTube playlist, later the share sheet) turns a save into an item through this.
import { normalize } from "./normalize.ts";
import type { Kind, Platform } from "./normalize.ts";
import type { CaptureInput, CaptureResult, ItemIdentity, ItemStatus, SourceKind } from "./contracts.ts";

export interface ExistingItem {
  id: string;
  platform: Platform;
  kind: Kind;
  canonicalUrl: string | null;
  status: ItemStatus;
}

/** Column names match public.items. */
export interface NewItemRow {
  user_id: string;
  source_id: string;
  source_event_id: string;
  platform: Platform;
  kind: Kind;
  source_url: string | null;
  canonical_url: string | null;
  external_id: string | null;
  needs_expansion: boolean;
  title: string | null;
  text: string | null;
  note: string | null;
  thumbnail_url_remote: string | null;
  captured_via: SourceKind | "share";
  status: ItemStatus;
  saved_at: string;
  last_saved_at: string;
  raw: Record<string, unknown>;
}

export type InsertResult = { ok: true; id: string } | { ok: false; conflict: "identity" | "other"; message?: string };

export interface CaptureRecord {
  userId: string;
  sourceKind: SourceKind | "share";
  sourceEventId: string;
  itemId: string;
  deduplicated: boolean;
}

export interface CaptureDeps {
  now(): Date;
  findCapture(userId: string, sourceKind: SourceKind | "share", sourceEventId: string): Promise<{ item: ExistingItem; deduplicated: boolean } | null>;
  findExisting(userId: string, identity: ItemIdentity): Promise<ExistingItem | null>;
  insertItem(row: NewItemRow): Promise<InsertResult>;
  bumpSave(itemId: string, userId: string, at: Date): Promise<void>;
  recordCapture(rec: CaptureRecord): Promise<void>;
}

export class CaptureError extends Error {}

const result = (item: ExistingItem, deduplicated: boolean): CaptureResult => ({
  itemId: item.id, deduplicated, status: item.status, platform: item.platform, kind: item.kind,
});

export async function capture(input: CaptureInput, deps: CaptureDeps): Promise<CaptureResult> {
  // Exact idempotency per door event: a redelivered message returns the original answer.
  const prior = await deps.findCapture(input.userId, input.sourceKind, input.sourceEventId);
  if (prior) return result(prior.item, prior.deduplicated);

  const now = deps.now();
  const savedMs = Date.parse(input.savedAt);
  const savedAt = Number.isFinite(savedMs) && savedMs <= now.getTime() ? new Date(savedMs) : now;

  const link = input.sharedUrl || input.sharedText ? normalize({ url: input.sharedUrl ?? null, text: input.sharedText ?? null }) : null;
  const platform: Platform = input.platform ?? link?.platform ?? "note";
  const kind: Kind = input.kind ?? link?.kind ?? "text";
  const identity: ItemIdentity = {
    platform,
    externalId: input.externalId ?? link?.externalId ?? null,
    canonicalUrl: link?.canonicalUrl ?? null,
  };

  const finishDuplicate = async (existing: ExistingItem): Promise<CaptureResult> => {
    await deps.bumpSave(existing.id, input.userId, savedAt);
    await deps.recordCapture({ userId: input.userId, sourceKind: input.sourceKind, sourceEventId: input.sourceEventId, itemId: existing.id, deduplicated: true });
    return result(existing, true);
  };

  if (identity.externalId || identity.canonicalUrl) {
    const existing = await deps.findExisting(input.userId, identity);
    if (existing) return finishDuplicate(existing);
  }

  const status: ItemStatus = input.noLink ? "no_link" : "pending";
  const isNote = platform === "note";
  const row: NewItemRow = {
    user_id: input.userId,
    source_id: input.sourceId,
    source_event_id: input.sourceEventId,
    platform,
    kind,
    source_url: link?.sourceUrl ?? null,
    canonical_url: identity.canonicalUrl,
    external_id: identity.externalId,
    needs_expansion: link?.needsExpansion ?? false,
    title: input.title ?? null,
    text: input.caption ?? (isNote ? link?.text ?? null : null),
    note: !isNote && link?.text && link.text !== link.sourceUrl ? link.text : null, // the user's own words around a link
    thumbnail_url_remote: input.snapshotUrl ?? null,
    captured_via: input.sourceKind,
    status,
    saved_at: savedAt.toISOString(),
    last_saved_at: savedAt.toISOString(),
    raw: { input: { ...input, sharedText: input.sharedText ? "[stored in text/note]" : undefined } },
  };

  const ins = await deps.insertItem(row);
  if (!ins.ok) {
    if (ins.conflict === "identity") {
      const existing = await deps.findExisting(input.userId, identity);
      if (existing) return finishDuplicate(existing);
    }
    throw new CaptureError(ins.message ?? "could not store the item");
  }
  await deps.recordCapture({ userId: input.userId, sourceKind: input.sourceKind, sourceEventId: input.sourceEventId, itemId: ins.id, deduplicated: false });
  return { itemId: ins.id, deduplicated: false, status, platform, kind };
}

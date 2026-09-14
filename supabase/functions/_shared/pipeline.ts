// Runs enrichment and classification for one item against the database. Used by the webhook (right after capture), the poller and the sweeper.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { enrich, type EnrichableItem, type EnrichResult } from "./enrich.ts";
import { duplicateDeps, foldDuplicate } from "./duplicate.ts";
import type { ItemIdentity } from "./contracts.ts";
import { PROMPT_VERSION, type ClassifyDeps, type ModelUsage } from "./classify.ts";
import { runClassification, type ClassificationClaim } from "./classification-worker.ts";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import type { Picture } from "./classify.ts";
import { compose, notify, type PushDeps, type PushReason } from "./push.ts";

export interface PipelineDeps {
  fetch: typeof fetch;
  /** null until a model key is configured (see classifiers.ts): enrichment still runs, classification reports a configuration failure. */
  classifier: ClassifyDeps | null;
  /** The cheaper tier for an imported back catalogue. Falls back to `classifier` when absent. */
  bulkClassifier?: ClassifyDeps | null;
  log(message: string, meta?: Record<string, unknown>): void;
}

/** Instagram serves post images up to about 3 MB; larger sources are skipped with a reason rather than stored. */
export const MAX_STORED_THUMB_BYTES = 4_000_000;
/** How many times an item's remote thumbnail is fetched before we stop trying (the first try counts). */
export const MAX_SNAPSHOT_ATTEMPTS = 4;

/** USD per million tokens, list prices. Keys match the model id or its prefix (vendors append dates). Checked against both vendors' pricing pages on 8 Sep 2026. */
export const PRICES_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "gpt-5.6-sol": { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 0 },
  "gpt-5.6-terra": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0 },
};

/** Cost of one call, or null when usage is missing or the model is not in the table (no guessing). */
export function costUsd(model: string, u: ModelUsage | null): number | null {
  if (!u) return null;
  const key = Object.keys(PRICES_PER_MTOK).find((k) => model === k || model.startsWith(k + "-"));
  if (!key) return null;
  const p = PRICES_PER_MTOK[key]!;
  const usd = (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** Stores the image at `url` as the item's thumbnail and returns the storage path. Throws with a short reason whenever nothing was stored. */
export async function snapshotTo(db: SupabaseClient, fetchImpl: typeof fetch, userId: string, itemId: string, url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; AllkeptBot/0.1)" } });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim();
    if (!type.startsWith("image/")) throw new Error(`not an image: ${type.slice(0, 40)}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_STORED_THUMB_BYTES) throw new Error(`too large: ${declared} bytes`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("empty body");
    if (bytes.byteLength > MAX_STORED_THUMB_BYTES) throw new Error(`too large: ${bytes.byteLength} bytes`);
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/heic" ? "heic" : "jpg";
    const path = `${userId}/${itemId}.${ext}`;
    const { error } = await db.storage.from("thumbs").upload(path, bytes, { contentType: type, upsert: true });
    if (error) throw new Error(`upload: ${String(error.message ?? error).slice(0, 120)}`);
    return path;
  } finally {
    clearTimeout(t);
  }
}

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** The picture types both sorting models take. A HEIC thumbnail, which the bucket allows, is not sent. */
const MODEL_PICTURE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Above this the request grows past what the models accept once base64 has added a third. */
const MAX_MODEL_PICTURE_BYTES = 3_500_000;
const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

/**
 * The save's stored picture, for the sorting model: read from the private bucket with the service
 * role and handed over as bytes inside the request, so no link to it is ever minted. Null when it
 * cannot go — a type the models refuse, too large, or unreadable — and the save is sorted from its
 * words; the reason is logged, never thrown.
 */
export async function pictureForModel(db: SupabaseClient, path: string, log: PipelineDeps["log"]): Promise<Picture | null> {
  const { data, error } = await db.storage.from("thumbs").download(path);
  if (error || !data) { log("pipeline: picture unreadable, sorting from words", { path, reason: reasonOf(error ?? "no data") }); return null; }
  const declared = (data.type || "").split(";")[0]!.trim();
  const mediaType = MODEL_PICTURE_TYPES.has(declared) ? declared : (TYPE_BY_EXT[path.split(".").pop()?.toLowerCase() ?? ""] ?? "");
  if (!mediaType) { log("pipeline: picture type not for the model, sorting from words", { path, type: declared }); return null; }
  if (data.size > MAX_MODEL_PICTURE_BYTES) { log("pipeline: picture too large for the model, sorting from words", { path, bytes: data.size }); return null; }
  return { mediaType, base64: encodeBase64(await data.arrayBuffer()) };
}

/**
 * A settled card with no picture at all whose page said "not now" — Instagram's login wall in place
 * of the post — and whose time to ask again has come. A held address is the snapshot pass's
 * business, not this one's; pending and failed saves have their own path.
 */
export function previewRetryDue(row: { status: string; thumbnail_path: string | null; thumbnail_url_remote: string | null; next_attempt_at: string | null }, now: Date): boolean {
  if (row.status !== "ready" && row.status !== "preview_unavailable") return false;
  if (row.thumbnail_path || row.thumbnail_url_remote || !row.next_attempt_at) return false;
  return new Date(row.next_attempt_at).getTime() <= now.getTime();
}

/** When the sweeper should look at this save again: a failure's ladder, a settled card's preview retry, or never. */
export function nextAttemptAfter(r: EnrichResult, now: Date): string | null {
  const ms = r.status === "failed" ? r.retryAfterMs : r.retryPreviewAfterMs;
  return ms && ms > 0 ? new Date(now.getTime() + ms).toISOString() : null;
}

/** The database side of sending a push, kept next to the only place that builds it. */
function pushDeps(db: SupabaseClient, deps: PipelineDeps): PushDeps {
  return {
    fetch: deps.fetch,
    async preferences(userId) {
      const { data } = await db.from("profiles").select("notify_enabled,notify_sorted,notify_attention").eq("user_id", userId).maybeSingle();
      const row = data as { notify_enabled: boolean; notify_sorted: boolean; notify_attention: boolean } | null;
      return row ? { enabled: row.notify_enabled, sorted: row.notify_sorted, attention: row.notify_attention } : null;
    },
    async tokens(userId) {
      const { data } = await db.from("device_push_tokens").select("token,platform").eq("user_id", userId).is("failed_at", null);
      return (data ?? []) as { token: string; platform: string }[];
    },
    async markDead(token, reason) {
      await db.from("device_push_tokens").update({ failed_at: new Date().toISOString(), fail_reason: reason.slice(0, 120) }).eq("token", token);
    },
    log: deps.log,
  };
}

/**
 * Tells the owner their save has settled, once and only once.
 *
 * The mark is claimed before anything is sent, by updating push_sent_at where it is still null: the
 * sweeper runs this same pipeline over the same item again and again, and two workers can be inside
 * it at the same moment. Claiming first means a send that then fails is silently dropped rather
 * than retried — which is the right way round. Nobody has ever been annoyed by one notification
 * they did not get; they are annoyed by the same one four times.
 *
 * Never throws. A notification is the least important thing here.
 */
async function announce(db: SupabaseClient, deps: PipelineDeps, itemId: string, category: string | null): Promise<void> {
  try {
    const { data } = await db.from("items").select("user_id,status,title,push_sent_at").eq("id", itemId).maybeSingle();
    const row = data as { user_id: string; status: string; title: string | null; push_sent_at: string | null } | null;
    if (!row || row.push_sent_at) return;

    // Only a settled save is worth a notification. "pending" is still working and "failed" is still
    // being retried up the ladder — telling someone about either is telling them about nothing.
    const reason: PushReason | null =
      row.status === "ready" ? "sorted"
        : row.status === "no_link" || row.status === "preview_unavailable" ? "attention"
        : null;
    if (!reason) return;

    const { data: claimed } = await db.from("items")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", itemId).is("push_sent_at", null).select("id");
    if (!claimed || claimed.length === 0) return; // somebody else got there first

    const { title, body } = compose(reason, { title: row.title, category });
    await notify(row.user_id, reason, { title, body, itemId }, pushDeps(db, deps));
  } catch (e) {
    deps.log("pipeline: announce failed", { item: itemId, detail: reasonOf(e) });
  }
}

/** Enriches (if pending/failed/no_link without thumbnail) and claims due classification work. Returns the category when known. */
export async function runPipeline(db: SupabaseClient, itemId: string, deps: PipelineDeps, retryClassification = false): Promise<string | null> {
  const { data: item, error } = await db.from("items").select("id, user_id, platform, kind, status, source_url, canonical_url, external_id, needs_expansion, title, text, note, author_name, thumbnail_url_remote, thumbnail_path, enrich_attempts, next_attempt_at, media_meta, captured_via, saved_at").eq("id", itemId).maybeSingle();
  if (error) throw error;
  if (!item) return null;
  const it = item as EnrichableItem & { note: string | null; next_attempt_at: string | null; media_meta: Record<string, unknown> | null; captured_via: string; saved_at: string };

  // A settled card asked to look for its preview again is enriched again: the patch only ever fills
  // what is missing, so what the card already has stays.
  let needsEnrich = it.status === "pending" || it.status === "failed" || previewRetryDue(it, new Date());
  // A card whose remote image was not stored yet (first try for no-link posts, or a failed fetch) gets a bounded number of further tries.
  // preview_unavailable is included deliberately: a provider that describes nothing — TikTok answers
  // 400 for every photo post — can still have a picture, found by the phone from the page itself.
  // Whether we may store an address we already hold has nothing to do with who gave us the preview.
  const canHoldPicture = it.status === "ready" || it.status === "no_link" || it.status === "preview_unavailable";
  const needsSnapshot = !needsEnrich && canHoldPicture && !it.thumbnail_path && !!it.thumbnail_url_remote && it.enrich_attempts < MAX_SNAPSHOT_ATTEMPTS;
  if (needsSnapshot) {
    const meta: Record<string, unknown> = { ...(it.media_meta ?? {}) };
    let path: string | null = null;
    let notAPicture = false;
    try {
      path = await snapshotTo(db, deps.fetch, it.user_id, it.id, it.thumbnail_url_remote!);
      delete meta["snapshot_error"];
    } catch (e) {
      meta["snapshot_error"] = reasonOf(e);
      // The address was never a picture (a video post's video file): it comes off the save, and
      // enrichment runs now to find the post's poster instead of this pass trying the file again.
      notAPicture = String(meta["snapshot_error"]).startsWith("not an image");
      deps.log("pipeline: snapshot failed", { item: itemId, attempt: it.enrich_attempts + 1, reason: meta["snapshot_error"] });
    }
    const { error: e4 } = await db.from("items").update({ ...(path ? { thumbnail_path: path } : {}), ...(notAPicture ? { thumbnail_url_remote: null } : {}), enrich_attempts: it.enrich_attempts + 1, media_meta: meta }).eq("id", itemId);
    if (e4) throw e4;
    it.enrich_attempts += 1;
    if (path) it.thumbnail_path = path;
    if (notAPicture) { it.thumbnail_url_remote = null; needsEnrich = true; }
  }
  if (needsEnrich) {
    // The same key the playlist door uses. Absent, a video's shape is simply not learned.
    const youtubeKey = Deno.env.get("YOUTUBE_API_KEY")?.trim();
    const r = await enrich(it, {
      fetch: deps.fetch,
      snapshot: (u, i, url) => snapshotTo(db, deps.fetch, u, i, url),
      log: deps.log,
      ...(youtubeKey ? { youtubeKey } : {}),
    });
    const patch: Record<string, unknown> = { ...r.patch, status: r.status, enrich_attempts: it.enrich_attempts + 1, next_attempt_at: nextAttemptAfter(r, new Date()) };
    if (r.error) patch["media_meta"] = { ...(r.patch.media_meta ?? {}), last_error: r.error };
    const { error: e2 } = await db.from("items").update(patch).eq("id", itemId);
    if (e2) {
      if (e2.code === "23505") { // the expanded link turned out to be an item we already hold
        const identity: ItemIdentity = { platform: r.patch.platform ?? it.platform, externalId: r.patch.external_id ?? null, canonicalUrl: r.patch.canonical_url ?? null };
        const original = await foldDuplicate({ id: itemId, user_id: it.user_id, saved_at: it.saved_at }, identity, duplicateDeps(db));
        if (original) { deps.log("pipeline: duplicate after expansion folded into the original", { item: itemId, original }); return null; }
        await db.from("items").update({ status: "failed", next_attempt_at: null, media_meta: { last_error: "duplicate after expansion" } }).eq("id", itemId);
        deps.log("pipeline: duplicate after expansion, original not found", { item: itemId });
        return null;
      }
      throw e2;
    }
    if (r.status === "failed") return null;
    Object.assign(it, r.patch, { status: r.status });
  }

  // Whether this person lets the classifier read their saves at all. Read here rather than trusted
  // from the app: the switch is a promise about what leaves the system, so the check belongs at the
  // point where it would leave. A missing profile row is treated as consent, because that is the
  // behaviour every existing save was captured under and the column defaults to true.
  const { data: prefRow } = await db.from("profiles").select("ai_sorting_enabled").eq("user_id", it.user_id).maybeSingle();
  if ((prefRow as { ai_sorting_enabled?: boolean } | null)?.ai_sorting_enabled === false) {
    deps.log("pipeline: classification declined by preference", { item: itemId });
    await announce(db, deps, itemId, null);
    return null;
  }

  // A whole back catalogue is worth classifying, but not at the everyday price.
  const classifier = it.captured_via === "import" ? (deps.bulkClassifier ?? deps.classifier) : deps.classifier;
  const category = await runClassification({
    classifier,
    async claim(retry) {
      const { data, error } = await db.rpc("claim_item_classification", { p_item_id: itemId, p_retry: retry });
      if (error) throw error;
      return data as ClassificationClaim | null;
    },
    async finish(claim, result, retryable) {
      const { data, error } = await db.rpc("finish_item_classification", {
        p_item_id: itemId, p_lease: claim.lease, p_revision: claim.revision,
        p_output: result.output ? { ...result.output, prompt_version: PROMPT_VERSION } : null,
        p_error: result.error, p_model: result.model,
        p_usage: { ...(result.usage ?? {}), cost_usd: costUsd(result.model, result.usage) }, p_retryable: retryable,
      });
      if (error) throw error;
      if (!result.output) deps.log("pipeline: classification failed", { item: itemId, attempt: claim.attempt, retryable });
      return data === true;
    },
    async category() {
      const { data, error } = await db.from("item_ai").select("category,user_category").eq("item_id", itemId).maybeSingle();
      if (error) throw error;
      return (data?.user_category ?? data?.category ?? null) as string | null;
    },
    picture: (path) => pictureForModel(db, path, deps.log),
  }, retryClassification);

  await announce(db, deps, itemId, category);
  return category;
}

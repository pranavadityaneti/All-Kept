// Runs enrichment and classification for one item against the database. Used by the webhook (right after capture), the poller and the sweeper.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { enrich, type EnrichableItem } from "./enrich.ts";
import { PROMPT_VERSION, type ClassifyDeps, type ModelUsage } from "./classify.ts";
import { runClassification, type ClassificationClaim } from "./classification-worker.ts";

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

/** Enriches (if pending/failed/no_link without thumbnail) and claims due classification work. Returns the category when known. */
export async function runPipeline(db: SupabaseClient, itemId: string, deps: PipelineDeps, retryClassification = false): Promise<string | null> {
  const { data: item, error } = await db.from("items").select("id, user_id, platform, kind, status, source_url, canonical_url, external_id, needs_expansion, title, text, note, author_name, thumbnail_url_remote, thumbnail_path, enrich_attempts, media_meta, captured_via").eq("id", itemId).maybeSingle();
  if (error) throw error;
  if (!item) return null;
  const it = item as EnrichableItem & { note: string | null; media_meta: Record<string, unknown> | null; captured_via: string };

  const needsEnrich = it.status === "pending" || it.status === "failed";
  // A card whose remote image was not stored yet (first try for no-link posts, or a failed fetch) gets a bounded number of further tries.
  const needsSnapshot = !needsEnrich && (it.status === "ready" || it.status === "no_link") && !it.thumbnail_path && !!it.thumbnail_url_remote && it.enrich_attempts < MAX_SNAPSHOT_ATTEMPTS;
  if (needsSnapshot) {
    const meta: Record<string, unknown> = { ...(it.media_meta ?? {}) };
    let path: string | null = null;
    try {
      path = await snapshotTo(db, deps.fetch, it.user_id, it.id, it.thumbnail_url_remote!);
      delete meta["snapshot_error"];
    } catch (e) {
      meta["snapshot_error"] = reasonOf(e);
      deps.log("pipeline: snapshot failed", { item: itemId, attempt: it.enrich_attempts + 1, reason: meta["snapshot_error"] });
    }
    const { error: e4 } = await db.from("items").update({ ...(path ? { thumbnail_path: path } : {}), enrich_attempts: it.enrich_attempts + 1, media_meta: meta }).eq("id", itemId);
    if (e4) throw e4;
    if (path) it.thumbnail_path = path;
  }
  if (needsEnrich) {
    const r = await enrich(it, { fetch: deps.fetch, snapshot: (u, i, url) => snapshotTo(db, deps.fetch, u, i, url), log: deps.log });
    const patch: Record<string, unknown> = { ...r.patch, status: r.status, enrich_attempts: it.enrich_attempts + 1, next_attempt_at: null };
    if (r.status === "failed") patch["next_attempt_at"] = r.retryAfterMs && r.retryAfterMs > 0 ? new Date(Date.now() + r.retryAfterMs).toISOString() : null;
    if (r.error) patch["media_meta"] = { ...(r.patch.media_meta ?? {}), last_error: r.error };
    const { error: e2 } = await db.from("items").update(patch).eq("id", itemId);
    if (e2) {
      if (e2.code === "23505") { // the expanded link turned out to be an item we already hold
        await db.from("items").update({ status: "failed", next_attempt_at: null, media_meta: { last_error: "duplicate after expansion" } }).eq("id", itemId);
        deps.log("pipeline: duplicate after expansion", { item: itemId });
        return null;
      }
      throw e2;
    }
    if (r.status === "failed") return null;
    Object.assign(it, r.patch, { status: r.status });
  }

  // A whole back catalogue is worth classifying, but not at the everyday price.
  const classifier = it.captured_via === "import" ? (deps.bulkClassifier ?? deps.classifier) : deps.classifier;
  return runClassification({
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
  }, retryClassification);
}

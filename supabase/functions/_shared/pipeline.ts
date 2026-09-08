// Runs enrichment and classification for one item against the database. Used by the webhook (right after capture), the poller and the sweeper.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { enrich, type EnrichableItem } from "./enrich.ts";
import { classify, PROMPT_VERSION, type ClassifyDeps } from "./classify.ts";

export interface PipelineDeps {
  fetch: typeof fetch;
  /** null until an Anthropic key is configured: enrichment still runs, classification waits for the sweeper. */
  classifier: ClassifyDeps | null;
  log(message: string, meta?: Record<string, unknown>): void;
}

const MAX_THUMB_BYTES = 2_000_000;
const PRICE_PER_MTOK = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }; // claude-opus-5 list prices, USD

function costUsd(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | null): number | null {
  if (!u) return null;
  const usd = (u.input_tokens * PRICE_PER_MTOK.input + u.output_tokens * PRICE_PER_MTOK.output + (u.cache_read_input_tokens ?? 0) * PRICE_PER_MTOK.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE_PER_MTOK.cacheWrite) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

async function snapshotTo(db: SupabaseClient, fetchImpl: typeof fetch, userId: string, itemId: string, url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; AllkeptBot/0.1)" } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim();
    if (!type.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_THUMB_BYTES) return null;
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/heic" ? "heic" : "jpg";
    const path = `${userId}/${itemId}.${ext}`;
    const { error } = await db.storage.from("thumbs").upload(path, bytes, { contentType: type, upsert: true });
    return error ? null : path;
  } finally {
    clearTimeout(t);
  }
}

/** Enriches (if pending/failed/no_link without thumbnail) and classifies (if not yet classified). Returns the category when known. */
export async function runPipeline(db: SupabaseClient, itemId: string, deps: PipelineDeps): Promise<string | null> {
  const { data: item, error } = await db.from("items").select("id, user_id, platform, kind, status, source_url, canonical_url, external_id, needs_expansion, title, text, note, author_name, thumbnail_url_remote, thumbnail_path, enrich_attempts").eq("id", itemId).maybeSingle();
  if (error) throw error;
  if (!item) return null;
  const it = item as EnrichableItem & { note: string | null };

  const needsEnrich = it.status === "pending" || it.status === "failed" || (it.status === "no_link" && !it.thumbnail_path && !!it.thumbnail_url_remote);
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

  const { data: ai } = await db.from("item_ai").select("category, user_category").eq("item_id", itemId).maybeSingle();
  if (ai) return (ai.user_category ?? ai.category) as string | null;
  if (!deps.classifier) return null;

  const c = await classify({ platform: it.platform, kind: it.kind, url: it.canonical_url ?? it.source_url, title: it.title, text: it.text, author: it.author_name, note: it.note }, deps.classifier);
  const row: Record<string, unknown> = c.output
    ? { item_id: itemId, user_id: it.user_id, ...c.output, model: c.model, prompt_version: PROMPT_VERSION, usage: { ...(c.usage ?? {}), cost_usd: costUsd(c.usage) }, ai_error: null }
    : { item_id: itemId, user_id: it.user_id, model: c.model, prompt_version: PROMPT_VERSION, usage: c.usage, ai_error: c.error };
  const { error: e3 } = await db.from("item_ai").upsert(row, { onConflict: "item_id" });
  if (e3) throw e3;
  if (!c.output) deps.log("pipeline: classification failed", { item: itemId, error: c.error });
  return c.output?.category ?? null;
}

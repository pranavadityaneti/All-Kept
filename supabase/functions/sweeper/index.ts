// Retries enrichment and classification for items that are due. Called by pg_cron every 5 minutes with a shared secret.
import { adminClient, env } from "../_shared/supabase.ts";
import { MAX_SNAPSHOT_ATTEMPTS, runPipeline } from "../_shared/pipeline.ts";
import { classifierFromEnv } from "../_shared/classifiers.ts";
import { embedder, indexSearchBatch } from "../_shared/embeddings.ts";
import { json, readJson } from "../_shared/http.ts";
import { singleItemRequest } from "./single.ts";

const BATCH = 50;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!secret || secret !== env("INTERNAL_SECRET")) return new Response("forbidden", { status: 403 });
  try {
    const db = adminClient();
    const choice = classifierFromEnv();
    const deps = { fetch, classifier: choice?.deps ?? null, bulkClassifier: classifierFromEnv(undefined, { bulk: true })?.deps ?? null, log: (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? {}) };
    // One item, right now, for a door that captured it elsewhere. Answered when the item is done.
    const single = singleItemRequest(await readJson(req));
    if (single) {
      const region = Deno.env.get("SB_REGION") ?? null;
      try {
        const category = await runPipeline(db, single.itemId, deps, single.retry);
        const { data: after } = await db.from("items").select("status").eq("id", single.itemId).maybeSingle();
        const status = typeof after?.status === "string" ? after.status : null;
        console.log("sweeper: single item", { item: single.itemId, status, region });
        return json({ item: single.itemId, status, category, region });
      } catch (e) {
        console.error("sweeper: single item failed", { item: single.itemId, region, error: String(e).slice(0, 200) });
        return new Response("internal error", { status: 500 });
      }
    }
    const nowIso = new Date().toISOString();
    const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
    // 1. Items still to enrich: pending or failed with a due retry, older than 2 minutes (the webhook path handles fresh ones).
    const { data: due, error } = await db.from("items").select("id").or(`status.eq.pending,and(status.eq.failed,next_attempt_at.lte.${nowIso})`).lt("created_at", twoMinAgo).order("created_at", { ascending: true }).limit(BATCH);
    if (error) throw error;
    // 2. Classification work that is queued, due for retry, or has an expired lease.
    const { data: unclassified, error: e2 } = await db.rpc("items_without_ai", { lim: BATCH });
    if (e2) throw e2;
    // 3. Cards whose remote image was not stored (too large, timeout, CDN error): retry while the signed link is fresh, a bounded number of times.
    const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data: noThumb, error: e3 } = await db.from("items").select("id").in("status", ["ready", "no_link"]).is("thumbnail_path", null).not("thumbnail_url_remote", "is", null).lt("enrich_attempts", MAX_SNAPSHOT_ATTEMPTS).gt("created_at", dayAgo).lt("created_at", twoMinAgo).limit(BATCH);
    if (e3) throw e3;
    const ids = [...new Set([...(due ?? []).map((r) => r.id as string), ...((unclassified ?? []) as { id: string }[]).map((r) => r.id), ...(noThumb ?? []).map((r) => r.id as string)])];
    let ok = 0, failed = 0;
    // Stop taking new work before the Edge Function wall-time limit. Unstarted rows stay due.
    const deadline = Date.now() + 80_000;
    let cursor = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cursor < ids.length && Date.now() < deadline) {
        const id = ids[cursor++]!;
        try { await runPipeline(db, id, deps); ok++; } catch (e) { failed++; console.error("sweeper: item failed", { id, error: String(e).slice(0, 200) }); }
      }
    }));
    let indexed = 0;
    const embeddingKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    if (embeddingKey) {
      try { indexed = await indexSearchBatch(db, embedder(embeddingKey)); }
      catch { console.error("sweeper: search indexing failed; leases will expire for retry"); }
    }
    return json({ indexed, due: (due ?? []).length, unclassified: (unclassified ?? []).length, no_thumbnail: (noThumb ?? []).length, processed: ok, failed, classifier: choice?.model ?? null });
  } catch (e) {
    console.error("sweeper failed", e);
    return new Response("internal error", { status: 500 });
  }
});

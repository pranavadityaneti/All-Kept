// Retries enrichment and classification for items that are due. Called by pg_cron every 5 minutes with a shared secret.
import { adminClient, env } from "../_shared/supabase.ts";
import { runPipeline } from "../_shared/pipeline.ts";
import { classifierFromEnv } from "../_shared/classifiers.ts";
import { json } from "../_shared/http.ts";

const BATCH = 50;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!secret || secret !== env("INTERNAL_SECRET")) return new Response("forbidden", { status: 403 });
  try {
    const db = adminClient();
    const choice = classifierFromEnv();
    const deps = { fetch, classifier: choice?.deps ?? null, log: (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? {}) };
    const nowIso = new Date().toISOString();
    const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
    // 1. Items still to enrich: pending or failed with a due retry, older than 2 minutes (the webhook path handles fresh ones).
    const { data: due, error } = await db.from("items").select("id").in("status", ["pending", "failed"]).or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`).lt("created_at", twoMinAgo).order("created_at", { ascending: true }).limit(BATCH);
    if (error) throw error;
    // 2. Items enriched but never classified (for example captured before the key existed).
    const { data: unclassified, error: e2 } = await db.rpc("items_without_ai", { lim: BATCH });
    if (e2) throw e2;
    const ids = [...new Set([...(due ?? []).map((r) => r.id as string), ...((unclassified ?? []) as { id: string }[]).map((r) => r.id)])];
    let ok = 0, failed = 0;
    for (const id of ids) {
      try { await runPipeline(db, id, deps); ok++; } catch (e) { failed++; console.error("sweeper: item failed", { id, error: String(e).slice(0, 200) }); }
    }
    return json({ due: (due ?? []).length, unclassified: (unclassified ?? []).length, processed: ok, failed, classifier: choice?.model ?? null });
  } catch (e) {
    console.error("sweeper failed", e);
    return new Response("internal error", { status: 500 });
  }
});

// POST: enriches and classifies one item the caller owns, right now. The app calls this after someone
// pastes the missing link onto a no-link post, so the card fills in while they are looking at it.
import { adminClient, env, userIdFromRequest } from "../_shared/supabase.ts";
import { enqueueItem } from "../_shared/enqueue.ts";
import { apiError, json, readJson } from "../_shared/http.ts";
import { classifierFromEnv } from "../_shared/classifiers.ts";
import { runPipeline } from "../_shared/pipeline.ts";
import type { ReprocessItemResponse } from "../_shared/contracts.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return apiError("bad_request", "POST only");
    const userId = await userIdFromRequest(req);
    if (!userId) return apiError("unauthorized", "invalid or missing token");
    const body = await readJson(req);
    const itemId = typeof body?.["itemId"] === "string" ? body["itemId"] : "";
    if (!UUID.test(itemId)) return apiError("bad_request", "itemId must be a uuid");

    const db = adminClient();
    // Service role bypasses row-level security, so ownership is checked here before anything runs.
    const { data: owned, error } = await db.from("items").select("id,status").eq("id", itemId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!owned) return apiError("not_found", "no such item");

    const retry = body?.["retry"] === true;
    if (retry && owned.status === "failed") {
      const { error: resetError } = await db.from("items").update({ status: "pending", enrich_attempts: 0, next_attempt_at: null }).eq("id", itemId).eq("user_id", userId).eq("status", "failed");
      if (resetError) throw resetError;
    }
    const log = (message: string, meta?: Record<string, unknown>) => console.log(message, meta ?? {});
    const hop = await enqueueItem(itemId, { retry }, { fetch, env, log });
    let category: string | null;
    if (hop.ok) category = hop.category;
    else {
      // The person is looking at the card; an answer now, from here, beats none. The log makes a broken hop visible.
      log("reprocess-item: hop failed, running in-process", { item: itemId, reason: hop.reason });
      category = await runPipeline(db, itemId, { fetch, classifier: classifierFromEnv()?.deps ?? null, bulkClassifier: classifierFromEnv(undefined, { bulk: true })?.deps ?? null, log }, retry);
    }

    const { data: after } = await db.from("items").select("status,classification_status").eq("id", itemId).maybeSingle();
    const body2: ReprocessItemResponse = { status: (after?.status ?? "pending") as ReprocessItemResponse["status"], category, classificationStatus: after?.classification_status };
    return json(body2);
  } catch (e) {
    console.error("reprocess-item failed", e);
    return apiError("internal", "could not refresh this item");
  }
});

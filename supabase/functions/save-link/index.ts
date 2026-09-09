import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { capture } from "../_shared/capture.ts";
import { captureDeps } from "../_shared/capture-db.ts";
import { classifierFromEnv } from "../_shared/classifiers.ts";
import { runPipeline } from "../_shared/pipeline.ts";
import { apiError } from "../_shared/http.ts";
import { handleSaveLink } from "./handler.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  try {
    const db = adminClient();
    return await handleSaveLink(req, {
      userId: userIdFromRequest,
      capture: (input) => capture(input, captureDeps(db)),
      enqueue(itemId) {
        const work = runPipeline(db, itemId, {
          fetch, classifier: classifierFromEnv()?.deps ?? null,
          log: (message, meta) => console.log(message, meta ?? {}),
        }).catch(() => console.error("save-link: enrichment deferred to sweeper"));
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime?.waitUntil(work);
      },
    });
  } catch {
    return apiError("internal", "Could not save the link. Please try again.");
  }
});

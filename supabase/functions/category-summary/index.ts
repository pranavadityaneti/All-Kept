// POST { category }: what a category holds and what it is about, for the Library's header when
// one category is open. The facts come from the database; the themes are written by the sorting
// model once and kept, under the person's "Sort saves automatically" switch. See handler.ts.
import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError } from "../_shared/http.ts";
import { classifierFromEnv } from "../_shared/classifiers.ts";
import { handleCategorySummary, type StoredSummary, type SummarySource } from "./handler.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
/** The categories being written on this instance; a second ask for one meanwhile is answered from the store. */
const inFlight = new Set<string>();

Deno.serve(async (req) => {
  try {
    const db = adminClient();
    // Naming what a category is about takes no more than the cheaper tier, where there is one.
    const choice = classifierFromEnv(undefined, { bulk: true }) ?? classifierFromEnv();
    return await handleCategorySummary(req, {
      userId: userIdFromRequest,
      // Service role bypasses row-level security, so every read below is scoped by the caller's id.
      async source(userId, category) {
        const { data, error } = await db.rpc("category_summary_source", { p_user: userId, p_category: category });
        if (error) throw error;
        return data as SummarySource;
      },
      async sortingEnabled(userId) {
        const { data } = await db.from("profiles").select("ai_sorting_enabled").eq("user_id", userId).maybeSingle();
        // A missing profile row is treated as consent, as the pipeline does: that is what every save was sorted under.
        return (data as { ai_sorting_enabled?: boolean } | null)?.ai_sorting_enabled !== false;
      },
      async stored(userId, category) {
        const { data, error } = await db.from("category_summaries").select("fingerprint,themes,updated_at").eq("user_id", userId).eq("category", category).maybeSingle();
        if (error) throw error;
        return (data as StoredSummary | null) ?? null;
      },
      async write(userId, category, fingerprint, themes, model) {
        const { error } = await db.from("category_summaries").upsert({ user_id: userId, category, fingerprint, themes, model, updated_at: new Date().toISOString() }, { onConflict: "user_id,category" });
        if (error) throw error;
      },
      call: choice ? choice.deps.call : null,
      // The response has gone by the time the model answers; the runtime keeps the instance alive for the work.
      defer: (work) => { if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(work); else void work; },
      inFlight,
      now: () => new Date(),
      log: (m, meta) => console.log(m, meta ?? {}),
    });
  } catch (e) {
    console.error("category-summary failed", e);
    return apiError("internal", "could not summarise that category");
  }
});

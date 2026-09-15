import { adminClient, env } from "../_shared/supabase.ts";
import { pushDeps } from "../_shared/pipeline.ts";
import { notify } from "../_shared/push.ts";
import { safeFetch } from "../_shared/safe-address.ts";
import { handleBillingWebhook } from "./handler.ts";

// The only writer of public.subscriptions. RevenueCat calls this on every change to a purchase.
Deno.serve(async (req) => {
  const db = adminClient();
  try {
    return await handleBillingWebhook(req, {
      secret: env("REVENUECAT_WEBHOOK_SECRET"),
      now: () => new Date(),
      async recordEvent(id, type, appUserId, payload) {
        const { data, error } = await db.from("billing_events")
          .upsert({ id, type, app_user_id: appUserId, payload }, { onConflict: "id", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        return (data ?? []).length > 0;
      },
      async userExists(userId) {
        const { data } = await db.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
        return !!data;
      },
      async upsertSubscription(row) {
        const { error } = await db.from("subscriptions").upsert({ ...row, updated_at: row.last_event_at }, { onConflict: "user_id,product_id" });
        if (error) throw error;
      },
      async transfer(from, to) {
        const { error } = await db.from("subscriptions").update({ user_id: to, updated_at: new Date().toISOString() }).in("user_id", from);
        if (error) throw error;
      },
      async entitled(userId) {
        const { data, error } = await db.rpc("entitled", { p_user_id: userId });
        if (error) throw error;
        return data === true;
      },
      async notify(userId, news, message) {
        const log = (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? {});
        const outcome = await notify(userId, "billing", message, pushDeps(db, { fetch: safeFetch(fetch), log }));
        log("billing: push", { user: userId, news, ...outcome });
      },
      log: (m, meta) => console.log(m, meta ?? {}),
    });
  } catch (e) {
    console.log("billing: failed", { error: String(e).slice(0, 200) });
    return new Response("error", { status: 500 });
  }
});

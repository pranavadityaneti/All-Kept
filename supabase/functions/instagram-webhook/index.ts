import { createClient } from "npm:@supabase/supabase-js@2";
import { handle } from "./handler.ts";
import type { EventRow } from "./handler.ts";
import { processEvent, type LinkedSource, type ProcessDeps } from "./process.ts";
import { capture } from "../_shared/capture.ts";
import { captureDeps } from "../_shared/capture-db.ts";
import { instagramClient } from "../_shared/instagram.ts";
import { runPipeline } from "../_shared/pipeline.ts";
import { classifierFromEnv } from "../_shared/classifiers.ts";
import { TIMED_OUT, within } from "../_shared/timing.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const log = (message: string, meta?: Record<string, unknown>) => console.log(message, meta ?? {});

function toSource(r: { id: string; user_id: string; external_id: string; handle: string | null; meta: Record<string, unknown> | null }): LinkedSource {
  return { id: r.id, userId: r.user_id, igsid: r.external_id, handle: r.handle, repliesEnabled: r.meta?.["replies"] !== false };
}

Deno.serve(async (req) => {
  try {
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const ig = instagramClient(env("INSTAGRAM_ACCESS_TOKEN"));
    const cdeps = captureDeps(db);

    const pdeps: ProcessDeps = {
      now: () => new Date(),
      async findSourceByIgsid(igsid) {
        const { data, error } = await db.from("connected_sources").select("id, user_id, external_id, handle, meta").eq("kind", "instagram_dm").eq("external_id", igsid).eq("status", "active").maybeSingle();
        if (error) throw error;
        return data ? toSource(data) : null;
      },
      async consumeLinkCode(code, now) {
        const { data, error } = await db.from("link_codes").update({ used_at: now.toISOString() }).eq("code", code).is("used_at", null).gt("expires_at", now.toISOString()).select("user_id").maybeSingle();
        if (error) throw error;
        return data ? { userId: data.user_id as string } : null;
      },
      async upsertSource(userId, igsid, handle) {
        const { data, error } = await db.from("connected_sources").upsert(
          { kind: "instagram_dm", external_id: igsid, user_id: userId, handle, status: "active", last_seen_at: new Date().toISOString() },
          { onConflict: "kind,external_id" },
        ).select("id, user_id, external_id, handle, meta").single();
        if (error) throw error;
        return toSource(data);
      },
      async setRepliesEnabled(sourceId, enabled) {
        const { data } = await db.from("connected_sources").select("meta").eq("id", sourceId).single();
        const meta = { ...((data?.meta as Record<string, unknown>) ?? {}), replies: enabled };
        const { error } = await db.from("connected_sources").update({ meta }).eq("id", sourceId);
        if (error) throw error;
      },
      lookupProfile: (igsid) => ig.profile(igsid),
      capture: (input) => capture(input, cdeps),
      async deleteItemByEvent(userId, sourceEventId) {
        const { data } = await db.from("captures").select("item_id").eq("user_id", userId).eq("source_kind", "instagram_dm").eq("source_event_id", sourceEventId).maybeSingle();
        if (!data) return false;
        const { error } = await db.from("items").delete().eq("id", data.item_id).eq("user_id", userId);
        if (error) throw error;
        return true;
      },
      async recentReply(igsid, kind, since) {
        const { data } = await db.from("replies").select("id").eq("igsid", igsid).eq("kind", kind).gte("created_at", since.toISOString()).limit(1);
        return (data ?? []).length > 0;
      },
      async sendReply(igsid, text, meta) {
        const now = new Date();
        const { data: row, error } = await db.from("replies").insert({
          user_id: meta.userId, source_id: meta.sourceId, igsid, item_id: meta.itemId, text, kind: meta.kind, due_at: now.toISOString(), not_after: meta.notAfter.toISOString(),
        }).select("id").single();
        if (error) throw error;
        if (now > meta.notAfter) { await db.from("replies").update({ error: "outside reply window" }).eq("id", row.id); return; }
        const sent = await ig.sendText(igsid, text);
        await db.from("replies").update(sent.ok ? { sent_at: new Date().toISOString() } : { error: sent.error }).eq("id", row.id);
        if (!sent.ok) log("instagram: reply failed", { kind: meta.kind, error: sent.error });
      },
      async waitForCategory(itemId, timeoutMs) {
        // Enrich and classify right now; the reply carries the category if it lands within the wait. Past the wait the work
        // continues (kept alive for the runtime) and the sweeper covers anything that still slips through.
        const work = runPipeline(db, itemId, { fetch, classifier: classifierFromEnv()?.deps ?? null, bulkClassifier: classifierFromEnv(undefined, { bulk: true })?.deps ?? null, log })
          .catch((e) => { log("instagram: pipeline failed", { item: itemId, error: String(e).slice(0, 200) }); return null; });
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(work);
        const result = await within(work, timeoutMs);
        if (result === TIMED_OUT) { log("instagram: category not ready within wait", { item: itemId, timeoutMs }); return null; }
        return result;
      },
      async latestNoLink(userId, since) {
        const { data, error } = await db.from("items").select("id").eq("user_id", userId).eq("platform", "instagram").eq("status", "no_link")
          .gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        return data ? { id: data.id as string } : null;
      },
      async attachLink(itemId, userId, link) {
        // The same write the app makes when a link is pasted on the card itself. Guarded on the status
        // so two pastes in quick succession cannot both land.
        const { error } = await db.from("items").update({
          platform: link.platform, kind: link.kind, source_url: link.sourceUrl, canonical_url: link.canonicalUrl,
          external_id: link.externalId, needs_expansion: link.needsExpansion, status: "pending", enrich_attempts: 0, next_attempt_at: null,
        }).eq("id", itemId).eq("user_id", userId).eq("status", "no_link");
        if (error) { if (error.code === "23505") return "duplicate"; throw error; }
        return "attached";
      },
      log,
    };

    const processAll = async (rows: EventRow[]) => {
      for (const row of rows) {
        try {
          const out = await processEvent(row, pdeps);
          log("instagram: processed", { event: row.event_id.slice(0, 24), action: out.action, items: out.itemIds?.length ?? 0 });
        } catch (e) {
          console.error("instagram: processing failed", { event: row.event_id.slice(0, 24), error: String(e) });
        }
      }
    };

    return await handle(req, {
      verifyToken: env("META_VERIFY_TOKEN"),
      appSecrets: [Deno.env.get("META_APP_SECRET") ?? "", Deno.env.get("INSTAGRAM_APP_SECRET") ?? ""],
      async store(rows: EventRow[]) {
        const { error } = await db.from("message_events").upsert(rows, { onConflict: "source_kind,event_id", ignoreDuplicates: true });
        return { error: error ? `${error.code ?? ""} ${error.message}`.trim() : null };
      },
      onStored(rows) {
        const work = processAll(rows);
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(work); // respond to Meta now, keep working
        else return work;
      },
    });
  } catch (e) {
    console.error("instagram-webhook: unexpected failure", e);
    return new Response("internal error", { status: 500 });
  }
});

// Reads every playlist that is due and captures whatever is new. Called by pg_cron with a shared
// secret, the same way the sweeper is.
import { adminClient, env } from "../_shared/supabase.ts";
import { capture, PaymentRequiredError } from "../_shared/capture.ts";
import { captureDeps } from "../_shared/capture-db.ts";
import { json } from "../_shared/http.ts";
import { needsFullRead, nextPollAt, toCaptures, MIN_INTERVAL_MS, type Source } from "./poll.ts";
import { playlistCount, playlistEntries, YoutubeError } from "./youtube-api.ts";

/** Playlists per run. The cron fires often enough that a backlog drains quickly. */
const BATCH = 20;

interface SourceRow { id: string; user_id: string; external_id: string; poll_after: string | null; meta: Record<string, unknown> | null
  paused_reason: string | null;
}

/** How many saves this playlist has put in the library so far. */
async function countItems(db: ReturnType<typeof adminClient>, sourceId: string): Promise<number> {
  const { count } = await db.from("items").select("id", { count: "exact", head: true }).eq("source_id", sourceId);
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!secret || secret !== env("INTERNAL_SECRET")) return new Response("forbidden", { status: 403 });

  const key = Deno.env.get("YOUTUBE_API_KEY")?.trim();
  if (!key) return json({ polled: 0, captured: 0, skipped: "no YOUTUBE_API_KEY" });

  const db = adminClient();
  const cdeps = captureDeps(db);
  const now = new Date();
  const log = (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? {});

  const { data, error } = await db.from("connected_sources")
    .select("id, user_id, external_id, poll_after, meta, paused_reason")
    .eq("kind", "youtube_playlist").eq("status", "active")
    .or(`poll_after.is.null,poll_after.lte.${now.toISOString()}`)
    .order("poll_after", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) throw error;

  let polled = 0, captured = 0, gone = 0;

  for (const row of (data ?? []) as SourceRow[]) {
    const meta = row.meta ?? {};
    const source: Source = {
      id: row.id, userId: row.user_id, playlistId: row.external_id,
      // Written only after a read that actually captured; never by register.
      syncedCount: typeof meta["syncedCount"] === "number" ? meta["syncedCount"] : null,
    };
    const previousInterval = typeof meta["intervalMs"] === "number" ? meta["intervalMs"] : null;

    try {
      // A source paused for want of a subscription is not read from YouTube again until the person
      // is entitled once more — a read-only check, so it never counts as a save. Resumed silently.
      if (row.paused_reason === "payment_required") {
        const { data: ok } = await db.rpc("entitled", { p_user_id: row.user_id });
        if (ok !== true) {
          await db.from("connected_sources").update({ last_polled_at: now.toISOString(), poll_after: nextPollAt(now, previousInterval, false).toISOString(), updated_at: now.toISOString() }).eq("id", row.id);
          continue;
        }
        await db.from("connected_sources").update({ paused_reason: null, paused_at: null, updated_at: now.toISOString() }).eq("id", row.id);
      }

      const count = await playlistCount(source.playlistId, key);

      if (count === null) {
        // Made private or deleted. Not an error and not the person's fault, so the row is kept and
        // marked rather than removed; the app can offer to reconnect it.
        await db.from("connected_sources").update({ status: "unreadable", last_polled_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", row.id);
        gone++;
        continue;
      }

      let found = 0;
      if (needsFullRead(source.syncedCount, count)) {
        // Counted from the library either side of the read, not from capture's own flag: re-capturing
        // a playlist entry correctly returns the original card, and with it the original's flag, so
        // every entry would look new on every re-read and the backoff would never engage.
        const before = await countItems(db, row.id);
        const entries = await playlistEntries(source.playlistId, key);
        let paused = false;
        for (const input of toCaptures(source, entries, now)) {
          try { await capture(input, cdeps); }
          catch (e) {
            // The next video would be the twenty-sixth save. Stop this playlist and say why, rather
            // than dropping its videos one by one; the Settings row reads the reason.
            if (!(e instanceof PaymentRequiredError)) throw e;
            await db.from("connected_sources").update({ paused_reason: "payment_required", paused_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", row.id);
            paused = true;
            break;
          }
        }
        found = Math.max(0, (await countItems(db, row.id)) - before);
        if (paused) log("youtube-poll: playlist paused, subscription needed", { source: row.id });
      }

      const at = nextPollAt(now, previousInterval, found > 0);
      await db.from("connected_sources").update({
        last_polled_at: now.toISOString(),
        ...(found > 0 ? { last_seen_at: now.toISOString() } : {}),
        poll_after: at.toISOString(),
        meta: { ...meta, videos: count, syncedCount: count, intervalMs: Math.max(MIN_INTERVAL_MS, at.getTime() - now.getTime()) },
        updated_at: now.toISOString(),
      }).eq("id", row.id);

      polled++;
      captured += found;
    } catch (e) {
      const status = e instanceof YoutubeError ? e.status : 0;
      log("youtube-poll: playlist failed", { source: row.id, status, error: String(e).slice(0, 200) });
      // A quota or rate error is about us, not this playlist, so stop the run rather than spend the
      // rest of the batch collecting the same failure.
      if (status === 403 || status === 429) break;
      await db.from("connected_sources").update({
        last_polled_at: now.toISOString(),
        poll_after: nextPollAt(now, previousInterval, false).toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", row.id);
    }
  }

  return json({ polled, captured, gone });
});

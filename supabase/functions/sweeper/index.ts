// Retries enrichment and classification for items that are due. Called by pg_cron every 5 minutes with a shared secret.
import { adminClient, env } from "../_shared/supabase.ts";
import { MAX_SNAPSHOT_ATTEMPTS, runPipeline } from "../_shared/pipeline.ts";
import { PROMPT_VERSION } from "../_shared/classify.ts";
import { classifierFromEnv } from "../_shared/classifiers.ts";
import { embedder, indexSearchBatch } from "../_shared/embeddings.ts";
import { runIconPass, type IconRow } from "../_shared/entity-icons.ts";
import { resolveVenue, runPlacesPass, venueQuery, type Venue } from "../_shared/places.ts";
import { providersFromEnv } from "../_shared/place-providers.ts";
import { describeVideo, runDescriptionPass } from "../_shared/youtube-descriptions.ts";
import { json, readJson } from "../_shared/http.ts";
import { lookupRequest, singleItemRequest } from "./single.ts";
import { safeFetch } from "../_shared/safe-address.ts";

const BATCH = 50;
/** Settled saves put back for sorting per sweep when the sorter has moved on: a prompt change drains a library over sweeps, never in one. */
const RESORT_BATCH = 20;
/** Venues looked up per sweep: a few, since each is a call to Apple or Google and a venue is rare. */
const PLACES_BATCH = 10;
/** YouTube saves asked for their description per sweep: one Data API unit each; a library of them drains in a few sweeps. */
const DESCRIPTIONS_BATCH = 20;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!secret || secret !== env("INTERNAL_SECRET")) return new Response("forbidden", { status: 403 });
  try {
    const db = adminClient();
    const choice = classifierFromEnv();
    const deps = { fetch: safeFetch(fetch), classifier: choice?.deps ?? null, bulkClassifier: classifierFromEnv(undefined, { bulk: true })?.deps ?? null, log: (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? {}) };
    const body = await readJson(req);
    // What the places services make of one venue: each provider's candidates and the pick, for checking coverage.
    const lookup = lookupRequest(body);
    if (lookup) {
      const providers = providersFromEnv((n) => Deno.env.get(n), safeFetch(fetch));
      const ask = async (p: ((q: string) => Promise<unknown>) | null) => { if (!p) return "not configured"; try { return await p(venueQuery(lookup)); } catch (e) { return `error: ${String(e).slice(0, 120)}`; } };
      const [apple, google] = await Promise.all([ask(providers.apple), ask(providers.google)]);
      const picked = await resolveVenue(lookup, { apple: providers.apple ?? (async () => []), google: providers.google });
      return json({ query: venueQuery(lookup), apple, google, picked });
    }
    // One item, right now, for a door that captured it elsewhere. Answered when the item is done.
    const single = singleItemRequest(body);
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
    // 3. Cards whose remote image was not stored (too large, timeout, CDN error), and those whose
    //    picture the phone found for a provider that would not describe the post at all: retry while
    //    the signed link is fresh, a bounded number of times.
    const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data: noThumb, error: e3 } = await db.from("items").select("id").in("status", ["ready", "no_link", "preview_unavailable"]).is("thumbnail_path", null).not("thumbnail_url_remote", "is", null).lt("enrich_attempts", MAX_SNAPSHOT_ATTEMPTS).gt("created_at", dayAgo).lt("created_at", twoMinAgo).limit(BATCH);
    if (e3) throw e3;
    // 4. Settled cards with no picture at all whose page said "not now" — Instagram's login wall in
    //    place of the post — and whose time to ask again has come. Bounded by the retry ladder.
    const { data: previewDue, error: e4 } = await db.from("items").select("id").in("status", ["ready", "preview_unavailable"]).is("thumbnail_path", null).is("thumbnail_url_remote", null).lte("next_attempt_at", nowIso).limit(BATCH);
    if (e4) throw e4;
    const ids = [...new Set([...(due ?? []).map((r) => r.id as string), ...((unclassified ?? []) as { id: string }[]).map((r) => r.id), ...(noThumb ?? []).map((r) => r.id as string), ...(previewDue ?? []).map((r) => r.id as string)])];
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
    // 5. A mark of its own for every named thing the sorting found: one model call for a batch of
    //    names, written onto the saves that carry them. Never fails the sweep.
    let icons: { rows: number; names: number; saved: number } | null = null;
    if (choice) {
      try {
        icons = await runIconPass({
          async rows(limit) {
            const { data, error } = await db.rpc("item_ai_missing_icons", { lim: limit });
            if (error) throw error;
            return (data ?? []) as IconRow[];
          },
          // Naming what sort of thing "IMDb" is takes no more than the cheaper tier, where there is one.
          call: (deps.bulkClassifier ?? choice.deps).call,
          async save(itemId, entities) {
            const { error } = await db.from("item_ai").update({ entities }).eq("item_id", itemId);
            if (error) throw error;
          },
          log: deps.log,
        });
      } catch (e) { console.error("sweeper: icon pass failed", { error: String(e).slice(0, 200) }); }
    }
    // 6. Settled saves the sorter would now answer differently — the prompt moved on, a picture it
    //    never tried, a summary not in the reader's language — go back in the queue for the next
    //    sweep, a bounded batch at a time, only where a sorter is configured to take them.
    let resorted = 0;
    if (choice) {
      const { data, error: e6 } = await db.rpc("requeue_stale_classifications", { p_prompt_version: PROMPT_VERSION, lim: RESORT_BATCH });
      if (e6) console.error("sweeper: re-sort pass failed", { error: String(e6.message ?? e6).slice(0, 200) });
      else resorted = (data ?? []).length;
      if (resorted > 0) deps.log("sweeper: re-sort queued", { count: resorted, prompt: PROMPT_VERSION });
    }
    // 7. A venue the sorter wrote becomes a place: looked up once, Apple first, Google when Apple has
    //    nothing that matches; a miss is remembered for a month. Only where a provider is configured.
    let places: { rows: number; resolved: number; unresolved: number; failed: number } | null = null;
    const providers = providersFromEnv((n) => Deno.env.get(n), safeFetch(fetch));
    if (providers.apple || providers.google) {
      try {
        places = await runPlacesPass({
          async rows(limit) {
            const { data, error } = await db.rpc("venues_to_resolve", { lim: limit });
            if (error) throw error;
            return ((data ?? []) as { item_id: string; venue: Venue }[]).map((r) => ({ itemId: r.item_id, venue: r.venue }));
          },
          resolve: (venue) => resolveVenue(venue, { apple: providers.apple ?? (async () => []), google: providers.google }),
          async save(itemId, result) {
            if (result.place) {
              const p = result.place;
              const { error } = await db.rpc("place_resolved", {
                p_item_id: itemId, p_provider: p.provider, p_provider_id: p.providerId, p_name: p.name, p_address: p.address, p_locality: p.locality,
                p_lat: p.lat, p_lng: p.lng, p_category: p.category, p_hours: p.hours, p_status: p.status, p_url: p.url,
              });
              if (error) throw error;
            } else if (result.reason === "providers unreachable") {
              // Nothing to record: the row is asked again next sweep, when the providers may be back.
              return;
            } else {
              const { error } = await db.from("item_ai").update({ place_tried_at: new Date().toISOString(), place_miss: result.reason }).eq("item_id", itemId);
              if (error) throw error;
            }
          },
          log: deps.log,
        }, PLACES_BATCH);
        if (places.rows > 0) deps.log("sweeper: places", places);
      } catch (e) { console.error("sweeper: places pass failed", { error: String(e).slice(0, 200) }); }
    }
    // 8. YouTube saves that arrived before enrichment asked for the description: asked once each.
    //    A description written as the save's text re-sorts it through the database's own trigger.
    let descriptions: { rows: number; described: number; empty: number; failed: number } | null = null;
    const youtubeKey = Deno.env.get("YOUTUBE_API_KEY")?.trim();
    if (youtubeKey) {
      try {
        descriptions = await runDescriptionPass({
          async rows(limit) {
            const { data, error } = await db.from("items").select("id,external_id").eq("platform", "youtube").in("status", ["ready", "preview_unavailable"])
              .or("text.is.null,text.eq.").not("external_id", "is", null).is("media_meta->description_asked", null).order("created_at", { ascending: false }).limit(limit);
            if (error) throw error;
            return ((data ?? []) as { id: string; external_id: string }[]).map((r) => ({ itemId: r.id, videoId: r.external_id }));
          },
          describe: (videoId) => describeVideo(videoId, youtubeKey, safeFetch(fetch)),
          async save(itemId, description) {
            const { data: row, error: e1 } = await db.from("items").select("media_meta").eq("id", itemId).single();
            if (e1) throw e1;
            const media_meta = { ...((row?.media_meta as Record<string, unknown> | null) ?? {}), description_asked: new Date().toISOString() };
            const { error } = await db.from("items").update(description ? { text: description, media_meta } : { media_meta }).eq("id", itemId);
            if (error) throw error;
          },
          log: deps.log,
        }, DESCRIPTIONS_BATCH);
        if (descriptions.rows > 0) deps.log("sweeper: descriptions", descriptions);
      } catch (e) { console.error("sweeper: description pass failed", { error: String(e).slice(0, 200) }); }
    }
    return json({ indexed, due: (due ?? []).length, unclassified: (unclassified ?? []).length, no_thumbnail: (noThumb ?? []).length, preview_due: (previewDue ?? []).length, icons, resorted, places, descriptions, processed: ok, failed, classifier: choice?.model ?? null });
  } catch (e) {
    console.error("sweeper failed", e);
    return new Response("internal error", { status: 500 });
  }
});

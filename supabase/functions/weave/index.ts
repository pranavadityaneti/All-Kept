// POST { action: "towns" | "understand" | "plan", … }: an itinerary woven from the caller's saves, with the
// user's own JWT — checked here (userIdFromRequest), not at the gateway, so the server's own
// "resume" (a worker handing a job on, and the minute's check) can reach it with the internal secret.
import { adminClient, env, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError } from "../_shared/http.ts";
import type { WeaveKind } from "../_shared/contracts.ts";
import { providersFromEnv } from "../_shared/place-providers.ts";
import { holidaysBetween, typicalWeather } from "../_shared/weave/context.ts";
import { CLAUDE_PLAN_MODEL, CLAUDE_UNDERSTAND_MODEL, jobFromCall, OPENAI_MODEL, PLAN_OPTIONS, UNDERSTAND_OPTIONS, weaveJobOpenAI, weaveModel } from "../_shared/weave/model.ts";
import { safeFetch } from "../_shared/safe-address.ts";
import type { OpeningPeriod } from "../_shared/weave/skeleton.ts";
import { handleWeave, ORPHAN_MS, type JobState, type Suggestion, type WeaveRecord, type WeaveSaveRow } from "./handler.ts";

/** The runtime's hook for work that outlives the answer: the worker stays up for it (400 s on the Pro plan). */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** When this worker began: its life is counted from here, however many requests it has answered since. */
const BORN = Date.now();

/** What to ask Google for when the saves leave a gap of a kind in a town. */
const SUGGESTION_QUERY: Record<WeaveKind, string | null> = {
  food: "best local restaurant", coffee: "specialty coffee cafe", nightlife: "bar", culture: "temple museum or historic neighbourhood",
  cityscape: "viewpoint or scenic walk", nature: "park garden or nature spot", adventure: "outdoor activity", shopping: "market or shopping street", stay: null, other: null,
};

Deno.serve(async (req) => {
  const db = adminClient();
  const fetchSafe = safeFetch(fetch);
  // OpenAI, which this server runs on; Claude only where an OpenAI key is absent and an Anthropic one is set.
  const openaiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  // Which OpenAI model each stage speaks to: the sorter's own unless a secret names another (WEAVE_PLAN_MODEL=gpt-6-astra, say).
  const understandModel = Deno.env.get("WEAVE_UNDERSTAND_MODEL")?.trim() || OPENAI_MODEL;
  const planModel = Deno.env.get("WEAVE_PLAN_MODEL")?.trim() || OPENAI_MODEL;
  const models = openaiKey
    ? { understand: weaveJobOpenAI(openaiKey, understandModel, UNDERSTAND_OPTIONS, fetchSafe), plan: weaveJobOpenAI(openaiKey, planModel, PLAN_OPTIONS, fetchSafe), names: { understand: understandModel, plan: planModel } }
    : anthropicKey
    ? { understand: jobFromCall(weaveModel(anthropicKey, CLAUDE_UNDERSTAND_MODEL, UNDERSTAND_OPTIONS)), plan: jobFromCall(weaveModel(anthropicKey, CLAUDE_PLAN_MODEL, PLAN_OPTIONS)), names: { understand: CLAUDE_UNDERSTAND_MODEL, plan: CLAUDE_PLAN_MODEL } }
    : null;
  if (!models) return apiError("unavailable", "The itinerary is not configured on this server.");
  const providers = providersFromEnv((n) => Deno.env.get(n), fetchSafe);
  const log = (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? {});
  try {
    return await handleWeave(req, {
      userId: userIdFromRequest,
      internal(r) {
        const secret = r.headers.get("x-internal-secret") ?? "";
        return secret.length > 0 && secret === env("INTERNAL_SECRET");
      },
      async entitled(userId) {
        const { data, error } = await db.rpc("entitled", { p_user_id: userId });
        if (error) throw error;
        return data === true;
      },
      async language(userId) {
        const { data } = await db.from("profiles").select("language").eq("user_id", userId).maybeSingle();
        return ((data as { language?: string | null } | null)?.language ?? "en").slice(0, 8);
      },
      async saves(userId, towns) {
        const { data, error } = await db.rpc("weave_saves", { p_user_id: userId, p_towns: towns });
        if (error) throw error;
        return ((data ?? []) as Record<string, unknown>[]).map((r): WeaveSaveRow => {
          const p = r["place"] as Record<string, unknown> | null;
          return {
            id: String(r["id"]), title: (r["title"] as string | null) ?? null, url: (r["url"] as string | null) ?? null,
            category: (r["category"] as string | null) ?? null, summary: (r["summary"] as string | null) ?? null,
            tags: Array.isArray(r["tags"]) ? (r["tags"] as string[]) : [], names: Array.isArray(r["names"]) ? (r["names"] as string[]).filter((n) => typeof n === "string") : [],
            screenText: (r["screen_text"] as string | null) ?? null, note: (r["note"] as string | null) ?? null, town: String(r["town"]),
            saveCount: Number(r["save_count"] ?? 1), reminded: r["reminded"] === true, visited: r["visited"] === true, savedAt: String(r["saved_at"]),
            place: p && typeof p["lat"] === "number" && typeof p["lng"] === "number" ? {
              name: String(p["name"] ?? ""), status: (p["status"] as string | null) ?? null, lat: p["lat"], lng: p["lng"], address: (p["address"] as string | null) ?? null,
              periods: Array.isArray(p["periods"]) ? (p["periods"] as OpeningPeriod[]) : null,
              utcOffsetMinutes: typeof p["utcOffsetMinutes"] === "number" ? p["utcOffsetMinutes"] : null,
              rating: typeof p["rating"] === "number" ? p["rating"] : typeof p["rating"] === "string" ? Number(p["rating"]) : null,
              ratingCount: typeof p["ratingCount"] === "number" ? p["ratingCount"] : null, priceLevel: (p["priceLevel"] as string | null) ?? null,
            } : null,
          };
        });
      },
      understand: models.understand,
      plan: models.plan,
      models: models.names,
      async suggest(town, kind): Promise<Suggestion | null> {
        const words = SUGGESTION_QUERY[kind];
        if (!words || !providers.google) return null;
        const candidates = (await providers.google(`${words} in ${town}`)).filter((c) => c.status !== "CLOSED_PERMANENTLY" && c.status !== "CLOSED_TEMPORARILY");
        // The crowd's word decides: a rating weighed by how many gave it.
        const best = candidates.map((c) => ({ c, score: (c.rating ?? 0) * Math.log10((c.ratingCount ?? 0) + 10) })).sort((a, b) => b.score - a.score)[0]?.c;
        if (!best) return null;
        const { data, error } = await db.from("places").upsert({
          provider: best.provider, provider_id: best.providerId, name: best.name, address: best.address, locality: best.locality ?? town, lat: best.lat, lng: best.lng,
          category: best.category, hours: best.hours, status: best.status, url: best.url, periods: best.periods, utc_offset_minutes: best.utcOffsetMinutes,
          rating: best.rating, rating_count: best.ratingCount, price_level: best.priceLevel, resolved_at: new Date().toISOString(),
        }, { onConflict: "provider,provider_id" }).select("id").single();
        if (error) throw error;
        return { placeId: String(data.id), name: best.name, place: { lat: best.lat, lng: best.lng, address: best.address, periods: best.periods, utcOffsetMinutes: best.utcOffsetMinutes, rating: best.rating, ratingCount: best.ratingCount, priceLevel: best.priceLevel } };
      },
      holidays: (countries, from, to) => holidaysBetween(countries, from, to, fetchSafe),
      weather: (towns, from, to) => typicalWeather(towns, from, to, fetchSafe),
      async create(userId, row) {
        const { data, error } = await db.from("weaves").insert({ user_id: userId, ...row }).select("id").single();
        if (error) throw error;
        return String(data.id);
      },
      async update(id, patch) {
        const { error } = await db.from("weaves").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      },
      async settle(id, patch, expect) {
        // One statement: Postgres re-reads the row under its lock, so of two writers expecting the same row, one wins.
        let q = db.from("weaves").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
        q = expect.jobId === null ? q.is("job", null) : q.eq("job->>id", expect.jobId);
        if (expect.updatedAt !== undefined) q = q.eq("updated_at", expect.updatedAt);
        const { data, error } = await q.select("id");
        if (error) throw error;
        return (data ?? []).length > 0;
      },
      get: (userId, id) => readWeave(db, id, userId),
      load: (id) => readWeave(db, id, null),
      async orphans() {
        const { data, error } = await db.from("weaves").select("id").not("job", "is", null).in("status", ["reading", "planning"])
          .lt("updated_at", new Date(Date.now() - ORPHAN_MS).toISOString()).limit(10);
        if (error) throw error;
        return (data ?? []).map((r) => String(r.id));
      },
      async resume(weaveId) {
        // A worker that is itself ending says so (503); the next ask may reach a fresh one. Three tries fit in a hand-on's time.
        let last = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1_000));
          try {
            const res = await fetch(`${env("SUPABASE_URL")}/functions/v1/weave`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-internal-secret": env("INTERNAL_SECRET"), "x-region": "ap-southeast-1" },
              body: JSON.stringify({ action: "resume", weaveId }),
              signal: AbortSignal.timeout(10_000),
            });
            await res.body?.cancel().catch(() => undefined);
            if (res.ok) return;
            last = `resume answered ${res.status}`;
          } catch (e) { last = String(e).slice(0, 200); }
        }
        throw new Error(last);
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log,
      // The reading and the arranging go on after the 202; without the hook (tests, an older runtime) they run in the request.
      defer: (work) => { if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(work); else void work; },
      now: () => Date.now(),
      bornAt: BORN,
    });
  } catch (e) {
    console.error("weave failed", e);
    return apiError("internal", "the itinerary could not be made");
  }
});

/** A weave's row as the handler reads it — the caller's own, or any for the server's own work. */
async function readWeave(db: ReturnType<typeof adminClient>, id: string, userId: string | null): Promise<WeaveRecord | null> {
  let q = db.from("weaves").select("id,user_id,towns,profile,brief,skeleton,plan,status,version,updated_at,job").eq("id", id);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r["id"]), userId: String(r["user_id"]), towns: (r["towns"] as string[] | null) ?? null, profile: (r["profile"] as WeaveRecord["profile"]) ?? null,
    brief: (r["brief"] as WeaveRecord["brief"]) ?? null, skeleton: (r["skeleton"] as WeaveRecord["skeleton"]) ?? null, plan: (r["plan"] as WeaveRecord["plan"]) ?? null,
    status: String(r["status"]), version: Number(r["version"] ?? 1), updatedAt: String(r["updated_at"]),
    job: (r["job"] as JobState | null) ?? null,
  };
}

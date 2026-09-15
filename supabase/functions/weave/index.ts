// POST { action: "towns" | "understand" | "plan", … }: an itinerary woven from the caller's saves. The user's own JWT.
import { adminClient, env, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError } from "../_shared/http.ts";
import type { WeaveKind } from "../_shared/contracts.ts";
import { providersFromEnv } from "../_shared/place-providers.ts";
import { holidaysBetween, typicalWeather } from "../_shared/weave/context.ts";
import { PLAN_MODEL, PLAN_OPTIONS, UNDERSTAND_MODEL, UNDERSTAND_OPTIONS, weaveModel } from "../_shared/weave/model.ts";
import { safeFetch } from "../_shared/safe-address.ts";
import type { OpeningPeriod } from "../_shared/weave/skeleton.ts";
import { handleWeave, type Suggestion, type WeaveRecord, type WeaveSaveRow } from "./handler.ts";

/** What to ask Google for when the saves leave a gap of a kind in a town. */
const SUGGESTION_QUERY: Record<WeaveKind, string | null> = {
  food: "best local restaurant", coffee: "specialty coffee cafe", nightlife: "bar", culture: "temple museum or historic neighbourhood",
  cityscape: "viewpoint or scenic walk", nature: "park garden or nature spot", adventure: "outdoor activity", shopping: "market or shopping street", stay: null, other: null,
};

Deno.serve(async (req) => {
  const db = adminClient();
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!anthropicKey) return apiError("unavailable", "The itinerary is not configured on this server.");
  const fetchSafe = safeFetch(fetch);
  const providers = providersFromEnv((n) => Deno.env.get(n), fetchSafe);
  const log = (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? {});
  try {
    return await handleWeave(req, {
      userId: userIdFromRequest,
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
      understand: weaveModel(anthropicKey, UNDERSTAND_MODEL, UNDERSTAND_OPTIONS),
      plan: weaveModel(anthropicKey, PLAN_MODEL, PLAN_OPTIONS),
      models: { understand: UNDERSTAND_MODEL, plan: PLAN_MODEL },
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
      async get(userId, id) {
        const { data, error } = await db.from("weaves").select("id,towns,profile,brief,skeleton,plan,status,version").eq("id", id).eq("user_id", userId).maybeSingle();
        if (error) throw error;
        return (data as WeaveRecord | null) ?? null;
      },
      log,
    });
  } catch (e) {
    console.error("weave failed", e);
    return apiError("internal", "the itinerary could not be made");
  }
});

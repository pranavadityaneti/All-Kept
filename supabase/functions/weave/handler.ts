// Weave — the itinerary: understand, select, arrange.
//
// Three asks. "towns": the towns a person's saves name, with counts, for the picker. "understand":
// the saves in the chosen towns read into a profile, kept as a new weave. "plan": the profile as
// edited and the brief turned into a plan — the select stage chooses, gaps become labelled
// suggestions, the season and the occasions are fetched, the skeleton is computed, the model
// arranges, the validator refuses what does not hold together (one retry with the problems named),
// and the plan is kept. Pure; the caller's id, the saves, the models, the lookups, the store are
// injected. See internal/superpowers/specs/2026-09-16-weave-itinerary-design.md.
import type { ModelResult, ModelUsage } from "../_shared/classify.ts";
import type { WeaveBrief, WeaveKind, WeavePlan, WeaveProfile } from "../_shared/contracts.ts";
import { WEAVE_KINDS } from "../_shared/contracts.ts";
import { apiError, json, readJson } from "../_shared/http.ts";
import { costUsd } from "../_shared/pipeline.ts";
import type { Holiday } from "../_shared/weave/context.ts";
import { PLAN_PROMPT, PLAN_SCHEMA, planMessage, validatePlan, type Skeleton, type SkeletonStop } from "../_shared/weave/plan.ts";
import { allot, selectStops, type WeaveSave } from "../_shared/weave/select.ts";
import { buildSkeleton, dateAfter, type ChosenStop, type PlaceFacts } from "../_shared/weave/skeleton.ts";
import { PROFILE_SCHEMA, UNDERSTAND_PROMPT, understandingMessage, validateProfile } from "../_shared/weave/understand.ts";

export type WeaveCall = (system: string, user: string, schema: Record<string, unknown>) => Promise<ModelResult>;

/** A save as the function reads it from the database. */
export interface WeaveSaveRow {
  id: string; title: string | null; url: string | null; category: string | null; summary: string | null; tags: string[]; names: string[];
  screenText: string | null; note: string | null; town: string; saveCount: number; reminded: boolean; visited: boolean; savedAt: string;
  place: (PlaceFacts & { name: string; status: string | null }) | null;
}

export interface WeaveRecord {
  id: string; towns: string[] | null; profile: WeaveProfile | null; brief: WeaveBrief | null;
  skeleton: Skeleton | null; plan: WeavePlan | null; status: string; version: number;
}

/** A place found for a gap, not from the saves. */
export interface Suggestion { placeId: string; name: string; place: PlaceFacts }

export interface WeaveDeps {
  userId(req: Request): Promise<string | null>;
  entitled(userId: string): Promise<boolean>;
  language(userId: string): Promise<string>;
  saves(userId: string, towns: string[] | null): Promise<WeaveSaveRow[]>;
  understand: WeaveCall;
  plan: WeaveCall;
  models: { understand: string; plan: string };
  suggest(town: string, kind: WeaveKind, country: string | null): Promise<Suggestion | null>;
  holidays(countries: string[], from: string, to: string): Promise<Holiday[]>;
  weather(towns: { name: string; lat: number; lng: number }[], from: string, to: string): Promise<string[]>;
  create(userId: string, row: Record<string, unknown>): Promise<string>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  get(userId: string, id: string): Promise<WeaveRecord | null>;
  log(message: string, meta?: Record<string, unknown>): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_DAYS = 21;
/** Suggestions never outnumber a fifth of the stops. */
export const SUGGESTION_SHARE = 0.2;

const isStr = (v: unknown): v is string => typeof v === "string";
const strings = (v: unknown, max = 80): string[] => (Array.isArray(v) ? [...new Set(v.filter(isStr).map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= max))] : []);

/** The kind a save is for: the mix's own evidence first, then the category and the tags. */
export function kindOf(save: Pick<WeaveSaveRow, "id" | "category" | "tags">, profile: WeaveProfile): WeaveKind {
  for (const m of profile.mix) if (m.evidence.includes(save.id)) return m.kind;
  const tags = save.tags.map((t) => t.toLowerCase());
  const has = (...words: string[]) => tags.some((t) => words.some((w) => t.includes(w)));
  if (has("cafe", "café", "coffee", "matcha", "bakery")) return "coffee";
  if (has("dive", "scuba", "snorkel", "hike", "hiking", "surf", "bungee", "trek", "kayak")) return "adventure";
  if (has("bar", "club", "nightlife", "night-market")) return "nightlife";
  if (has("hotel", "resort", "stay", "hostel", "ryokan")) return "stay";
  if (has("shopping", "market", "shop")) return "shopping";
  if (save.category === "Food & recipes") return "food";
  if (save.category === "Travel & places") return has("temple", "shrine", "museum", "history") ? "culture" : has("beach", "park", "nature", "waterfall", "mountain") ? "nature" : "cityscape";
  return "other";
}

/** The brief as given, made whole from the profile where the person left a gap. */
export function readBrief(body: unknown, profile: WeaveProfile): WeaveBrief | { error: string } {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const days = typeof b["days"] === "number" && Number.isInteger(b["days"]) && b["days"] >= 1 && b["days"] <= MAX_DAYS ? b["days"] : 7;
  const startDate = isStr(b["startDate"]) && /^\d{4}-\d{2}-\d{2}$/.test(b["startDate"]) && !Number.isNaN(Date.parse(b["startDate"])) ? b["startDate"] : null;
  const known = new Map(profile.towns.map((t) => [t.name.toLowerCase(), t]));
  let nights = Array.isArray(b["nights"])
    ? (b["nights"] as unknown[]).flatMap((n) => {
      const o = n as Record<string, unknown>;
      const town = isStr(o["town"]) ? known.get(o["town"].trim().toLowerCase())?.name : undefined;
      const count = typeof o["nights"] === "number" ? Math.max(0, Math.round(o["nights"])) : 0;
      return town && count > 0 ? [{ town, nights: count }] : [];
    })
    : [];
  if (nights.length === 0) {
    if (profile.towns.length === 0) return { error: "no towns to plan for" };
    // Proportional to what the saves say, whole and at least one each, summing to the days.
    const shares = allot(days, profile.towns.map((t) => ({ key: t.name, share: Math.max(1, t.nights) })));
    nights = profile.towns.map((t) => ({ town: t.name, nights: Math.max(1, shares[t.name] ?? 1) }));
  }
  const total = nights.reduce((a, n) => a + n.nights, 0);
  if (total !== days) {
    // The person's split and their day count disagree: the split is scaled to the days, whole, at least one.
    const scaled = allot(days, nights.map((n) => ({ key: n.town, share: n.nights })));
    nights = nights.map((n) => ({ town: n.town, nights: Math.max(1, scaled[n.town] ?? 1) }));
    while (nights.reduce((a, n) => a + n.nights, 0) > days && nights.some((n) => n.nights > 1)) nights.sort((a, b) => b.nights - a.nights)[0]!.nights -= 1;
    if (nights.reduce((a, n) => a + n.nights, 0) !== days) return { error: `${days} days cannot be split among ${nights.length} towns` };
  }
  const time = (v: unknown): string | null => (isStr(v) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
  const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T | null): T | null => (isStr(v) && (options as readonly string[]).includes(v) ? (v as T) : fallback);
  const bases = Array.isArray(b["bases"])
    ? (b["bases"] as unknown[]).flatMap((x) => { const o = x as Record<string, unknown>; const town = isStr(o["town"]) ? known.get(o["town"].trim().toLowerCase())?.name : undefined; return town ? [{ town, name: isStr(o["name"]) && o["name"].trim() ? o["name"].trim().slice(0, 80) : null }] : []; })
    : [];
  return {
    days, startDate, nights, arrival: time(b["arrival"]), departure: time(b["departure"]), bases,
    group: oneOf(b["group"], ["solo", "couple", "family", "friends"] as const, profile.group),
    pace: oneOf(b["pace"], ["relaxed", "full"] as const, "relaxed")!,
    transport: oneOf(b["transport"], ["walk_cab", "car", "transit"] as const, "walk_cab")!,
    budget: oneOf(b["budget"], ["low", "mid", "high"] as const, null),
    must: strings(b["must"]), skip: strings(b["skip"]), note: isStr(b["note"]) && b["note"].trim() ? b["note"].trim().slice(0, 500) : null,
  };
}

/** The mean of the placed stops in a town: where the weather is asked for. */
function centreOf(town: string, stops: ChosenStop[]): { name: string; lat: number; lng: number } | null {
  const placed = stops.filter((s) => s.town === town && s.place);
  if (placed.length === 0) return null;
  return { name: town, lat: placed.reduce((a, s) => a + s.place!.lat, 0) / placed.length, lng: placed.reduce((a, s) => a + s.place!.lng, 0) / placed.length };
}

export async function handleWeave(req: Request, deps: WeaveDeps): Promise<Response> {
  if (req.method !== "POST") return apiError("bad_request", "POST only");
  const userId = await deps.userId(req);
  if (!userId) return apiError("unauthorized", "Sign in first.");
  const body = await readJson(req);
  const action = body?.["action"];

  if (action === "towns") {
    const saves = await deps.saves(userId, null);
    const counts = new Map<string, { saves: number; placed: number }>();
    for (const s of saves) {
      const c = counts.get(s.town) ?? { saves: 0, placed: 0 };
      c.saves++; if (s.place) c.placed++;
      counts.set(s.town, c);
    }
    return json({ towns: [...counts.entries()].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.saves - a.saves) });
  }

  if (action === "understand") {
    if (!(await deps.entitled(userId))) return apiError("payment_required", "An itinerary needs a subscription.");
    const towns = strings(body?.["towns"]);
    const saves = await deps.saves(userId, towns.length > 0 ? towns : null);
    if (saves.length === 0) return apiError("bad_request", "No saves name a place there yet.");
    const r = await deps.understand(UNDERSTAND_PROMPT, understandingMessage(saves.map((s) => ({
      id: s.id, category: s.category, summary: s.summary, tags: s.tags, names: s.names, screenText: s.screenText, note: s.note, town: s.town, saveCount: s.saveCount, reminded: s.reminded, visited: s.visited,
    }))), PROFILE_SCHEMA as unknown as Record<string, unknown>);
    if (r.error || r.refused || !r.output) { deps.log("weave: understand failed", { user: userId, error: r.error ?? "refused" }); return apiError("unavailable", "Couldn't read your saves just now. Try again in a moment."); }
    const profile = validateProfile(r.output, new Set(saves.map((s) => s.id)));
    if (!profile) return apiError("unavailable", "Couldn't make sense of your saves. Try again in a moment.");
    // Only towns the saves actually name: the model may echo one it was told of but has nothing for.
    const named = new Set(saves.map((s) => s.town));
    profile.towns = profile.towns.filter((t) => named.has(t.name));
    for (const name of named) if (!profile.towns.some((t) => t.name === name)) profile.towns.push({ name, country: null, saves: saves.filter((s) => s.town === name).length, nights: 1 });
    const cost = costUsd(r.model, r.usage) ?? 0;
    const weaveId = await deps.create(userId, { towns: towns.length > 0 ? towns : null, profile, status: "profiled", model_understand: r.model, usage: { understand: r.usage }, cost_usd: cost });
    return json({ weaveId, profile, saves: saves.length });
  }

  if (action === "plan") {
    if (!(await deps.entitled(userId))) return apiError("payment_required", "An itinerary needs a subscription.");
    const weaveId = isStr(body?.["weaveId"]) ? body["weaveId"] : "";
    if (!UUID.test(weaveId)) return apiError("bad_request", "weaveId is required");
    const record = await deps.get(userId, weaveId);
    if (!record?.profile) return apiError("not_found", "no such weave");
    const allSaves = await deps.saves(userId, record.towns);
    const ids = new Set(allSaves.map((s) => s.id));
    // The profile as edited by the person, made safe the same way as the model's.
    const profile = validateProfile(body?.["profile"] ?? record.profile, ids) ?? record.profile;
    const brief = readBrief(body?.["brief"], profile);
    if ("error" in brief) return apiError("bad_request", brief.error);

    const saves: WeaveSave[] = allSaves.map((s) => ({
      id: s.id, kind: kindOf(s, profile), town: s.town, placed: !!s.place, saveCount: s.saveCount, noted: !!s.note?.trim(), reminded: s.reminded,
      done: s.visited, specific: !!s.screenText?.trim() || s.names.length > 0, savedAt: s.savedAt,
    }));
    const selection = selectStops(saves, profile, brief);
    if (selection.chosen.length === 0) return apiError("bad_request", "Nothing to plan with in those towns yet.");
    await deps.update(weaveId, { status: "planning", brief });

    const rows = new Map(allSaves.map((s) => [s.id, s]));
    const mustIds = new Set([...profile.must.map((m) => m.id), ...brief.must]);
    const chosen: ChosenStop[] = selection.chosen.map((s) => {
      const row = rows.get(s.id)!;
      return {
        id: s.id, source: "save", name: row.place?.name ?? row.title?.trim() ?? row.names[0] ?? "A saved place", kind: s.kind, town: s.town ?? row.town,
        about: row.summary, tags: row.tags, screen: row.screenText, note: row.note, must: mustIds.has(s.id), savedTimes: s.saveCount, place: row.place,
      };
    });
    // Gaps become suggestions — labelled, about a fifth of the stops at most (one, on a trip of a few), never for a stay or "other".
    const cap = Math.ceil(selection.chosen.length * SUGGESTION_SHARE);
    const suggested = new Set<string>();
    const countries = new Map(profile.towns.map((t) => [t.name, t.country]));
    for (const gap of selection.gaps) {
      if (gap.kind === "stay" || gap.kind === "other") continue;
      for (let i = 0; i < gap.want && suggested.size < cap; i++) {
        const found = await deps.suggest(gap.town, gap.kind, countries.get(gap.town) ?? null).catch(() => null);
        if (!found || suggested.has(found.placeId)) break;
        suggested.add(found.placeId);
        chosen.push({ id: `s:${found.placeId}`, source: "suggested", name: found.name, kind: gap.kind, town: gap.town, about: null, tags: [], screen: null, note: null, must: false, savedTimes: 0, place: found.place });
      }
    }

    // The season and the occasions, only with dates.
    let holidays: Holiday[] = [], weather: string[] = [];
    if (brief.startDate) {
      const to = dateAfter(brief.startDate, brief.days - 1)!;
      const codes = [...new Set(brief.nights.map((n) => countries.get(n.town)).filter((c): c is string => !!c))];
      const centres = brief.nights.map((n) => centreOf(n.town, chosen)).filter((c): c is NonNullable<typeof c> => !!c);
      [holidays, weather] = await Promise.all([
        codes.length > 0 ? deps.holidays(codes, brief.startDate, to).catch(() => [] as Holiday[]) : Promise.resolve([] as Holiday[]),
        centres.length > 0 ? deps.weather(centres, brief.startDate, to).catch(() => [] as string[]) : Promise.resolve([] as string[]),
      ]);
    }
    const bases = brief.nights.map((n) => ({ town: n.town, name: brief.bases.find((b) => b.town === n.town)?.name ?? chosen.find((s) => s.town === n.town && s.kind === "stay")?.name ?? null }));
    const skeleton = buildSkeleton(chosen, brief, selection.slots, { bases, holidays, weather });

    const language = await deps.language(userId).catch(() => "en");
    const usage: ModelUsage[] = [];
    let cost = 0;
    let problems: string[] = [];
    let result: { plan: WeavePlan; problems: string[] } | null = null;
    let model = deps.models.plan;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await deps.plan(PLAN_PROMPT, planMessage(brief, profile, skeleton, language, problems), PLAN_SCHEMA as unknown as Record<string, unknown>);
      if (r.usage) { usage.push(r.usage); cost += costUsd(r.model, r.usage) ?? 0; }
      model = r.model;
      if (r.error || r.refused || !r.output) {
        deps.log("weave: plan failed", { weave: weaveId, attempt, error: r.error ?? "refused" });
        await deps.update(weaveId, { status: "failed", error: r.error ?? "refused", usage: { plan: usage }, cost_usd: cost });
        return apiError("unavailable", "Couldn't make the plan just now. Try again in a moment.");
      }
      result = validatePlan(r.output, skeleton, [...mustIds]);
      if (!result) { problems = ["the answer was not a plan"]; continue; }
      if (result.problems.length === 0) break;
      problems = result.problems;
      deps.log("weave: plan sent back", { weave: weaveId, attempt, problems: problems.slice(0, 6) });
    }
    if (!result || result.problems.length > 0) {
      await deps.update(weaveId, { status: "failed", error: (result?.problems ?? problems).join("; ").slice(0, 600), skeleton, usage: { plan: usage }, cost_usd: cost });
      return apiError("unprocessable", "Couldn't make a plan that holds together. Try fewer days, a wider pace, or fewer towns.");
    }
    await deps.update(weaveId, { status: "planned", brief, profile, skeleton, plan: result.plan, model_plan: model, usage: { plan: usage }, cost_usd: cost });
    const stops: (SkeletonStop & { title: string | null; url: string | null })[] = skeleton.stops.map((s) => ({ ...s, title: rows.get(s.id)?.title ?? null, url: rows.get(s.id)?.url ?? null }));
    const leftOut = selection.leftOut.map((l) => ({ ...l, title: rows.get(l.id)?.title ?? null }));
    return json({ weaveId, plan: result.plan, stops, leftOut, brief, cost });
  }

  return apiError("bad_request", "action must be towns, understand or plan");
}

/** The kinds a suggestion may be asked for, for anyone wiring the lookup. */
export const SUGGESTABLE: readonly WeaveKind[] = WEAVE_KINDS.filter((k) => k !== "stay" && k !== "other");

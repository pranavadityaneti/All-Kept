// Weave — the itinerary: understand, select, arrange.
//
// Three asks. "towns": the towns a person's saves name, with counts, for the picker. "understand":
// the saves in the chosen towns read into a profile, kept as a new weave. "plan": the profile as
// edited and the brief turned into a plan — the select stage chooses, gaps become labelled
// suggestions, the season and the occasions are fetched, the skeleton is computed, the model
// arranges, the validator refuses what does not hold together (one retry with the problems named),
// and the plan is kept.
//
// Understanding and planning are jobs, not answers (§11 of the spec): a phone stops waiting at
// 60 s and the gateway at 150 s, and a plan takes minutes. Both asks answer 202 at once with the
// weave's id and go on after the answer; the row is the truth the app watches — reading →
// profiled, planning → planned, or failed with the words the person is shown.
//
// A model's thinking can outlast a worker (400 s; a 32-stop week was cut off at 240 s on 2 Oct), so
// the model works as a background job at the provider and the row keeps the job (`job`): this
// worker looks at it every few seconds, and when it is nearly out of time it hands the job to a
// fresh worker ("resume", with the server's own secret). The minute's check hands on any job no
// worker is looking at — one whose worker died. Two workers may come to look at one job (a hand-on
// and the minute's check crossing); every write that ends or moves a job is made only if the row
// still holds that job, so the first to write wins and the other stops. A request a phone may send
// twice carries an id (`requestId`), and the same id is answered with what it started, never
// started again.
// Pure; the caller's id, the saves, the models, the lookups, the store, the clock and the deferral
// are injected.
// See internal/superpowers/specs/2026-09-16-weave-itinerary-design.md.
import type { ModelResult, ModelUsage } from "../_shared/classify.ts";
import type { WeaveJob } from "../_shared/weave/model.ts";
import type { WeaveBrief, WeaveKind, WeavePlan, WeaveProfile } from "../_shared/contracts.ts";
import { WEAVE_KINDS } from "../_shared/contracts.ts";
import { apiError, json, readJson } from "../_shared/http.ts";
import { costUsd } from "../_shared/pipeline.ts";
import type { Holiday } from "../_shared/weave/context.ts";
import { PLAN_PROMPT, PLAN_SCHEMA, planMessage, validatePlan, type Skeleton, type SkeletonStop } from "../_shared/weave/plan.ts";
import { allot, selectStops, type WeaveSave } from "../_shared/weave/select.ts";
import { buildSkeleton, dateAfter, type ChosenStop, type PlaceFacts } from "../_shared/weave/skeleton.ts";
import { PROFILE_SCHEMA, UNDERSTAND_PROMPT, understandingMessage, validateProfile } from "../_shared/weave/understand.ts";

/** A save as the function reads it from the database. */
export interface WeaveSaveRow {
  id: string; title: string | null; url: string | null; category: string | null; summary: string | null; tags: string[]; names: string[];
  screenText: string | null; note: string | null; town: string; saveCount: number; reminded: boolean; visited: boolean; savedAt: string;
  place: (PlaceFacts & { name: string; status: string | null }) | null;
}

export interface WeaveRecord {
  id: string; userId: string; towns: string[] | null; profile: WeaveProfile | null; brief: WeaveBrief | null;
  skeleton: Skeleton | null; plan: WeavePlan | null; status: string; version: number; updatedAt: string;
  /** The model job in progress, if any. */
  job: JobState | null;
  /** The request id the current plan was asked with, so a repeat of it is told what it started. */
  planRequestId: string | null;
}

/** What a weave's row keeps of its model job, so whichever worker looks at it next can finish it. */
export interface JobState {
  stage: "understand" | "plan";
  /** The provider's id for the job. */
  id: string;
  /** 0, or 1 for the plan's one retry with the problems named. */
  attempt: number;
  /** When this job was asked for (ms): its own clock, across workers. A retry starts its own. */
  startedAt: number;
  usage: ModelUsage[];
  cost: number;
  understand?: { saveIds: string[]; towns: { name: string; saves: number }[] };
  plan?: { mustIds: string[]; stops: Record<string, { title: string | null; url: string | null }>; leftOut: { id: string; reason: string; title: string | null }[]; language: string };
}

/** Thrown by `create` when the request id already started a weave: the caller answers with that one. */
export class DuplicateRequest extends Error {}

/** A place found for a gap, not from the saves. */
export interface Suggestion { placeId: string; name: string; place: PlaceFacts }

export interface WeaveDeps {
  userId(req: Request): Promise<string | null>;
  /** The request carries the server's own secret: a worker handing a job on, or the minute's check. */
  internal(req: Request): boolean;
  entitled(userId: string): Promise<boolean>;
  language(userId: string): Promise<string>;
  saves(userId: string, towns: string[] | null): Promise<WeaveSaveRow[]>;
  understand: WeaveJob;
  plan: WeaveJob;
  models: { understand: string; plan: string };
  suggest(town: string, kind: WeaveKind, country: string | null): Promise<Suggestion | null>;
  holidays(countries: string[], from: string, to: string): Promise<Holiday[]>;
  weather(towns: { name: string; lat: number; lng: number }[], from: string, to: string): Promise<string[]>;
  create(userId: string, row: Record<string, unknown>): Promise<string>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  /**
   * Writes the patch only if the row is still as expected — holding the job `jobId` (none, for
   * null), and, with `updatedAt`, untouched since it was read. True when it was written; false
   * when the row has moved on, and the writer must stop.
   */
  settle(id: string, patch: Record<string, unknown>, expect: { jobId: string | null; updatedAt?: string }): Promise<boolean>;
  /** The caller's own weave. */
  get(userId: string, id: string): Promise<WeaveRecord | null>;
  /** Any weave, for the server's own work on it. */
  load(id: string): Promise<WeaveRecord | null>;
  /** The weave a request id already started, if any. */
  byRequest(userId: string, requestId: string): Promise<{ id: string; status: string } | null>;
  /** Weaves whose job no worker is looking at: silent for ORPHAN_MS. */
  orphans(): Promise<string[]>;
  /** Hands a weave's job to a fresh worker. */
  resume(weaveId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  log(message: string, meta?: Record<string, unknown>): void;
  /** Work that goes on after the answer is sent; the runtime keeps the worker alive for it. */
  defer(work: Promise<void>): void;
  /** The wall clock, in ms: a worker hands its job on before its life is out. */
  now(): number;
  /** When this worker began (ms). Its life runs from here, not from this request: a worker answers many. */
  bornAt: number;
  /** How often a running job touches its row, so a job whose worker died is told from one still at work. Tests shorten it. */
  heartbeatMs?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_DAYS = 21;
/** Suggestions never outnumber a fifth of the stops. */
export const SUGGESTION_SHARE = 0.2;
/** A Pro-plan worker lives this long from when it begins, however many requests it answers. */
export const WORKER_LIFE_MS = 400_000;
/** With this little of its life left, a worker hands its job to a fresh one. */
export const HANDOFF_MS = 45_000;
/** What a worker keeps of its life for writing what it found, when the model answers in the asking. */
export const WRITE_MARGIN_MS = 15_000;
/** How often a worker looks at its job. */
export const POLL_MS = 5_000;
/** A job that has not answered in this long is not going to: it is stopped and the person told. */
export const JOB_MAX_MS = 15 * 60_000;
/** A job whose row has been silent this long — three heartbeats missed — has no worker looking at it; the minute's check hands it on. */
export const ORPHAN_MS = 60_000;
/**
 * A running job touches its row this often (updated_at moves), and at once when a worker takes it
 * up. A row silent for ORPHAN_MS has no worker looking at it, and the minute's check hands its job
 * on — within ORPHAN_MS and a minute, so under STALE_MS; one silent for STALE_MS was not picked up
 * even so. The app keeps the same clock: it stops waiting at STALE_MS of silence, and the next
 * "plan" on such a row takes it over.
 */
export const HEARTBEAT_MS = 20_000;
export const STALE_MS = 150_000;

/** What the person is told when a weave fails, by reason; the technical reason goes in `error`, for us. */
export const SAID = {
  read: "Couldn't read your saves just now. Try again in a moment.",
  sense: "Couldn't make sense of your saves. Try again in a moment.",
  plan: "Couldn't make the plan just now. Try again in a moment.",
  holds: "Couldn't make a plan that holds together. Try fewer days, a wider pace, or fewer towns.",
  crashed: "The itinerary could not be made. Try again in a moment.",
  busy: "Still weaving the last plan. Give it a minute.",
  slow: "This took far longer than it should. Try again in a moment.",
} as const;

const isStr = (v: unknown): v is string => typeof v === "string";
/** An ask's id, when it carries one the way the app makes them. */
const requestIdOf = (body: Record<string, unknown> | null): string | null => {
  const v = body?.["requestId"];
  return isStr(v) && /^[A-Za-z0-9_-]{8,100}$/.test(v) ? v : null;
};
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

/** The ms this worker has left. */
const lifeLeft = (deps: WeaveDeps) => WORKER_LIFE_MS - (deps.now() - deps.bornAt);

export async function handleWeave(req: Request, deps: WeaveDeps): Promise<Response> {
  if (req.method !== "POST") return apiError("bad_request", "POST only");
  const body = await readJson(req);
  const action = body?.["action"];

  // The server's own ask: a worker handing its job on, or the minute's check for jobs no worker is looking at.
  if (action === "resume") {
    if (!deps.internal(req)) return new Response("forbidden", { status: 403 });
    // A worker near its own end — perhaps the very one handing on — takes nothing: the asker tries another.
    if (lifeLeft(deps) < 2 * HANDOFF_MS) return new Response("this worker is ending", { status: 503 });
    const given = isStr(body?.["weaveId"]) && UUID.test(body["weaveId"]) ? [body["weaveId"]] : null;
    const ids = given ?? await deps.orphans();
    for (const id of ids) deps.defer(guarded(deps, id, (run) => drive(deps, id, run)));
    return json({ resumed: ids.length }, 202);
  }

  const userId = await deps.userId(req);
  if (!userId) return apiError("unauthorized", "Sign in first.");

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
    // The same ask again — a phone repeating a request that got no answer: what it started is the answer.
    const requestId = requestIdOf(body);
    const seen = requestId ? await deps.byRequest(userId, requestId) : null;
    if (seen) return json({ weaveId: seen.id, status: seen.status }, 202);
    const towns = strings(body?.["towns"]);
    const saves = await deps.saves(userId, towns.length > 0 ? towns : null);
    if (saves.length === 0) return apiError("bad_request", "No saves name a place there yet.");
    let weaveId: string;
    try {
      weaveId = await deps.create(userId, { towns: towns.length > 0 ? towns : null, status: "reading", ...(requestId ? { request_id: requestId } : {}) });
    } catch (e) {
      // The same ask arriving twice at once: the second finds the first.
      const first = e instanceof DuplicateRequest && requestId ? await deps.byRequest(userId, requestId) : null;
      if (first) return json({ weaveId: first.id, status: first.status }, 202);
      throw e;
    }
    deps.defer(guarded(deps, weaveId, (run) => startUnderstand(deps, weaveId, saves, run)));
    return json({ weaveId, status: "reading" }, 202);
  }

  if (action === "plan") {
    if (!(await deps.entitled(userId))) return apiError("payment_required", "An itinerary needs a subscription.");
    const weaveId = isStr(body?.["weaveId"]) ? body["weaveId"] : "";
    if (!UUID.test(weaveId)) return apiError("bad_request", "weaveId is required");
    const record = await deps.get(userId, weaveId);
    if (!record?.profile) return apiError("not_found", "no such weave");
    // The same ask again — a phone repeating a request that got no answer: the plan it started is the answer.
    const requestId = requestIdOf(body);
    if (requestId && record.planRequestId === requestId) return json({ weaveId, status: record.status }, 202);
    // One weaving at a time; a row no worker has touched for STALE_MS is taken over.
    if (record.status === "planning" && deps.now() - Date.parse(record.updatedAt) < STALE_MS) return apiError("conflict", SAID.busy);
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
    // Only if the row is as it was read: two asks at once start one plan, and the other is told it is busy.
    const taken = await deps.settle(weaveId, { status: "planning", brief, profile, error: null, message: null, result: null, job: null, plan_request_id: requestId }, { jobId: record.job?.id ?? null, updatedAt: record.updatedAt });
    if (!taken) return apiError("conflict", SAID.busy);
    // A job left behind on a row taken over is stopped, not left to be paid for unread.
    if (record.job?.id) await jobOf(deps, record.job).cancel(record.job.id).catch(() => undefined);
    deps.defer(guarded(deps, weaveId, (run) => startPlan(deps, userId, weaveId, run, allSaves, profile, brief, selection)));
    return json({ weaveId, status: "planning" }, 202);
  }

  return apiError("bad_request", "action must be towns, understand or plan");
}

const jobOf = (deps: WeaveDeps, job: Pick<JobState, "stage">): WeaveJob => (job.stage === "plan" ? deps.plan : deps.understand);

/** The model job this worker is on, as far as it knows: the one a crash stops, and the only one whose row it may fail. */
interface Run { job: Pick<JobState, "stage" | "id"> | null }

/**
 * A job's failure is written on the row, never left as a row that reads or plans for ever — and its
 * model job is stopped. The row is touched at once and then on the heartbeat while the work runs.
 * A crash fails the row only while it still holds this worker's job (or none, before one was
 * asked): never a job another worker has since taken up.
 */
async function guarded(deps: WeaveDeps, weaveId: string, work: (run: Run) => Promise<void>): Promise<void> {
  const run: Run = { job: null };
  const touch = () => { deps.update(weaveId, {}).catch(() => undefined); };
  touch();
  const beat = setInterval(touch, deps.heartbeatMs ?? HEARTBEAT_MS);
  try { await work(run); }
  catch (e) {
    deps.log("weave: crashed", { weave: weaveId, error: String(e).slice(0, 300) });
    if (run.job?.id) await jobOf(deps, run.job).cancel(run.job.id).catch(() => undefined);
    await deps.settle(weaveId, { status: "failed", error: String(e).slice(0, 600), message: SAID.crashed, job: null }, { jobId: run.job?.id ?? null }).catch(() => undefined);
  } finally { clearInterval(beat); }
}

/** The understanding, after the answer: the saves read into a profile by the model, as a job. */
async function startUnderstand(deps: WeaveDeps, weaveId: string, saves: WeaveSaveRow[], run: Run): Promise<void> {
  const towns = new Map<string, number>();
  for (const s of saves) towns.set(s.town, (towns.get(s.town) ?? 0) + 1);
  const job: JobState = {
    stage: "understand", id: "", attempt: 0, startedAt: deps.now(), usage: [], cost: 0,
    understand: { saveIds: saves.map((s) => s.id), towns: [...towns.entries()].map(([name, n]) => ({ name, saves: n })) },
  };
  await ask(deps, weaveId, job, understandingMessage(saves.map((s) => ({
    id: s.id, category: s.category, summary: s.summary, tags: s.tags, names: s.names, screenText: s.screenText, note: s.note, town: s.town, saveCount: s.saveCount, reminded: s.reminded, visited: s.visited,
  }))), run, null);
}

/** The arranging, after the answer: suggestions for the gaps, the season, the skeleton — then the model, as a job. */
async function startPlan(
  deps: WeaveDeps, userId: string, weaveId: string, run: Run, allSaves: WeaveSaveRow[], profile: WeaveProfile, brief: WeaveBrief, selection: ReturnType<typeof selectStops>,
): Promise<void> {
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
  // What finishing needs, kept with the job: whichever worker reads the answer has it.
  const job: JobState = {
    stage: "plan", id: "", attempt: 0, startedAt: deps.now(), usage: [], cost: 0,
    plan: {
      mustIds: [...mustIds], language,
      stops: Object.fromEntries(skeleton.stops.map((s) => [s.id, { title: rows.get(s.id)?.title ?? null, url: rows.get(s.id)?.url ?? null }])),
      leftOut: selection.leftOut.map((l) => ({ ...l, title: rows.get(l.id)?.title ?? null })),
    },
  };
  // Kept while the row is still this ask's — no job on it yet; one taken over since is left alone.
  if (!(await deps.settle(weaveId, { skeleton }, { jobId: null }))) return;
  await ask(deps, weaveId, job, planMessage(brief, profile, skeleton, language, []), run, null);
}

/**
 * Asks the stage's model and keeps the job on the row in place of `from` (the job it follows, or
 * none) — then looks at it; or finishes at once, when the answer came with the asking. If the row
 * has moved on meanwhile (another worker wrote first, or the person asked again), the new job is
 * stopped and this worker stops.
 */
async function ask(deps: WeaveDeps, weaveId: string, job: JobState, message: string, run: Run, from: string | null): Promise<void> {
  const model = jobOf(deps, job);
  // A model that answers in the asking must answer while this worker can still write it down.
  const budget = Math.max(1_000, lifeLeft(deps) - WRITE_MARGIN_MS);
  const asked = job.stage === "plan"
    ? await model.start(PLAN_PROMPT, message, PLAN_SCHEMA as unknown as Record<string, unknown>, budget)
    : await model.start(UNDERSTAND_PROMPT, message, PROFILE_SCHEMA as unknown as Record<string, unknown>, budget);
  if ("result" in asked) return finish(deps, weaveId, job, from, asked.result, run);
  // The job's own clock starts with its asking: a retry has the same patience as the first.
  const kept: JobState = { ...job, id: asked.id, startedAt: deps.now() };
  let held: boolean;
  try { held = await deps.settle(weaveId, { job: kept }, { jobId: from }); }
  catch (e) { await model.cancel(asked.id).catch(() => undefined); throw e; }
  if (!held) {
    deps.log("weave: row moved on before the job was kept; stopped it", { weave: weaveId, stage: job.stage });
    await model.cancel(asked.id).catch(() => undefined);
    return;
  }
  run.job = kept;
  return drive(deps, weaveId, run);
}

/**
 * Looks at the row's job every few seconds until it has answered, then finishes it. Stops a job that
 * has gone on far too long; with this worker's life nearly out, hands the job to a fresh worker
 * (and should that fail, the minute's check finds the job silent and hands it on). A look that
 * fails — the database or the provider a moment away — is looked at again on the next turn.
 */
async function drive(deps: WeaveDeps, weaveId: string, run: Run): Promise<void> {
  for (;;) {
    const record = await deps.load(weaveId).catch((e) => { deps.log("weave: look failed", { weave: weaveId, error: String(e).slice(0, 200) }); return undefined; });
    if (record !== undefined) {
      const job = record?.job;
      // Finished, taken over, or never a job: nothing to look at.
      if (!record || !job?.id || (record.status !== "reading" && record.status !== "planning")) return;
      run.job = job;
      const answer = await jobOf(deps, job).check(job.id);
      if (answer) return finish(deps, weaveId, job, job.id, answer, run);
      if (deps.now() - job.startedAt > JOB_MAX_MS) {
        await jobOf(deps, job).cancel(job.id).catch(() => undefined);
        deps.log("weave: job gave up", { weave: weaveId, stage: job.stage });
        await deps.settle(weaveId, { status: "failed", error: `no answer in ${JOB_MAX_MS / 60_000} minutes`, message: SAID.slow, job: null, cost_usd: job.cost }, { jobId: job.id });
        return;
      }
    }
    if (lifeLeft(deps) < HANDOFF_MS) {
      deps.log("weave: handing on", { weave: weaveId });
      await deps.resume(weaveId).catch((e) => deps.log("weave: hand-on failed; the minute's check will", { weave: weaveId, error: String(e).slice(0, 200) }));
      return;
    }
    await deps.sleep(POLL_MS);
  }
}

/**
 * The answer read: the profile kept, the plan kept — or sent back once with its problems, or the
 * failure said. Each is written only while the row still holds the job answered (`from`).
 */
async function finish(deps: WeaveDeps, weaveId: string, job: JobState, from: string | null, r: ModelResult, run: Run): Promise<void> {
  const usage = r.usage ? [...job.usage, r.usage] : job.usage;
  const cost = job.cost + (r.usage ? costUsd(r.model, r.usage) ?? 0 : 0);
  const write = (patch: Record<string, unknown>) => deps.settle(weaveId, { ...patch, job: null }, { jobId: from });

  if (job.stage === "understand") {
    const known = job.understand!;
    const spent = { model_understand: r.model, usage: { understand: usage[usage.length - 1] ?? null }, cost_usd: cost };
    if (r.error || r.refused || !r.output) {
      deps.log("weave: understand failed", { weave: weaveId, error: r.error ?? "refused" });
      await write({ status: "failed", error: r.error ?? "refused", message: SAID.read, ...spent });
      return;
    }
    const profile = validateProfile(r.output, new Set(known.saveIds));
    if (!profile) {
      deps.log("weave: understand made no profile", { weave: weaveId });
      await write({ status: "failed", error: "the answer was not a profile", message: SAID.sense, ...spent });
      return;
    }
    // Only towns the saves actually name: the model may echo one it was told of but has nothing for.
    const named = new Set(known.towns.map((t) => t.name));
    profile.towns = profile.towns.filter((t) => named.has(t.name));
    for (const t of known.towns) if (!profile.towns.some((p) => p.name === t.name)) profile.towns.push({ name: t.name, country: null, saves: t.saves, nights: 1 });
    await write({ status: "profiled", profile, result: { profile, saves: known.saveIds.length }, ...spent });
    return;
  }

  const kept = job.plan!;
  const spent = { model_plan: r.model, usage: { plan: usage }, cost_usd: cost };
  if (r.error || r.refused || !r.output) {
    deps.log("weave: plan failed", { weave: weaveId, attempt: job.attempt, error: r.error ?? "refused" });
    await write({ status: "failed", error: r.error ?? "refused", message: SAID.plan, ...spent });
    return;
  }
  const record = await deps.load(weaveId);
  // Another worker finished this job first, or the person asked again: theirs stands.
  if ((record?.job?.id ?? null) !== from) return;
  if (!record?.skeleton || !record.brief || !record.profile) throw new Error("the plan's skeleton, brief or profile is missing from its row");
  const result = validatePlan(r.output, record.skeleton, kept.mustIds);
  if (result && result.problems.length === 0) {
    const stops = record.skeleton.stops.map((s) => ({ ...s, title: kept.stops[s.id]?.title ?? null, url: kept.stops[s.id]?.url ?? null }));
    await write({ status: "planned", plan: result.plan, result: { plan: result.plan, stops, leftOut: kept.leftOut, brief: record.brief, cost }, ...spent });
    return;
  }
  const problems = result ? result.problems : ["the answer was not a plan"];
  if (job.attempt === 0) {
    deps.log("weave: plan sent back", { weave: weaveId, problems: problems.slice(0, 6) });
    return ask(deps, weaveId, { ...job, id: "", attempt: 1, usage, cost }, planMessage(record.brief, record.profile, record.skeleton, kept.language, problems), run, from);
  }
  await write({ status: "failed", error: problems.join("; ").slice(0, 600), message: SAID.holds, ...spent });
}

/** The kinds a suggestion may be asked for, for anyone wiring the lookup. */
export const SUGGESTABLE: readonly WeaveKind[] = WEAVE_KINDS.filter((k) => k !== "stay" && k !== "other");

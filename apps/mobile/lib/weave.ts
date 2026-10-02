import { useQuery } from "@tanstack/react-query";
import type { WeaveBrief, WeaveKind, WeavePlan, WeaveProfile } from "@allkept/contracts";
import { WEAVE_KINDS } from "@allkept/contracts";
import { hoursLine, type OpeningPeriod } from "./hours";
import { serverSaid } from "./function-error";
import { httpStatus } from "./paywall";
import { supabase } from "./supabase";
import { dayValue, describeDay, describeRange, describeTime, timeValue } from "./when";

export type { WeaveBrief, WeaveKind, WeavePlan, WeaveProfile };
export { WEAVE_KINDS };

/** The kinds in a person's words. */
export const KIND_LABEL: Record<WeaveKind, string> = {
  food: "Food", coffee: "Coffee", nightlife: "Nightlife", culture: "Culture", cityscape: "City views", nature: "Nature", adventure: "Adventure", shopping: "Shopping", stay: "Stays", other: "Other",
};

/** A stop as the plan screen draws it: the skeleton's facts, and the save behind it. */
export interface PlanStop {
  id: string; source: "save" | "suggested"; name: string; kind: WeaveKind; town: string; area: string | null; address: string | null;
  lat: number; lng: number; openByDay: ("open" | "closed" | "unknown")[]; rating: number | null; ratingCount: number | null; priceLevel: string | null;
  about: string | null; tags: string[]; screen: string | null; note: string | null; must: boolean; savedTimes: number; near: { id: string; km: number }[];
  title: string | null; url: string | null;
}

export interface WeaveTowns { towns: { name: string; saves: number; placed: number }[] }
/** The server's answer to "understand" and "plan": the weave's id, and the work goes on — the row is watched for the rest. */
export interface WeaveStarted { weaveId: string; status: "reading" | "planning" }
export interface WeaveUnderstood { profile: WeaveProfile; saves: number }
export interface WeavePlanned { plan: WeavePlan; stops: PlanStop[]; leftOut: { id: string; reason: string; title: string | null }[]; brief: WeaveBrief; cost: number }

/** The server's refusal, with its code, so the screen can open the paywall or say why. */
export class WeaveRefused extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("weave", { body });
  if (error) {
    const said = await serverSaid(error);
    const status = httpStatus(error);
    // No status at all: no answer came back. Seen on 2 Oct, that was the phone reusing a connection
    // the server had already closed — the person's own connection was fine, so it isn't blamed; a
    // second try goes out on a fresh one.
    const code = said?.code ?? (status === 402 ? "payment_required" : status === undefined ? "unreachable" : "internal");
    const message = said?.error ?? (status === undefined ? "Couldn't reach Allkept just now. Try again in a moment." : "Something went wrong.");
    throw new WeaveRefused(code, message);
  }
  if (!data) throw new WeaveRefused("internal", "The server did not answer.");
  return data;
}

export const weaveTowns = () => call<WeaveTowns>({ action: "towns" });
export const weaveUnderstand = (towns: string[]) => call<WeaveStarted>({ action: "understand", towns });
export const weavePlan = (weaveId: string, profile: WeaveProfile, brief: Partial<WeaveBrief>) => call<WeaveStarted>({ action: "plan", weaveId, profile, brief });

export function useWeaveTowns(enabled: boolean) {
  return useQuery({ queryKey: ["weave-towns"], queryFn: weaveTowns, enabled });
}

/**
 * A trip's row as the app reads it (spec §11): the stage it is at, what was asked (the towns, the
 * brief), what the server wrote for the app, what the person is told when it failed, and when it
 * began and last moved. Every Plan a trip screen is drawn from this row, so a trip left mid-read or
 * mid-plan picks up where it is — by its id, from anywhere.
 */
export interface WeaveRecord {
  id: string; status: "reading" | "profiled" | "planning" | "planned" | "failed"; towns: string[] | null;
  profile: WeaveProfile | null; brief: WeaveBrief | null; result: unknown; message: string | null; createdAt: string; updatedAt: string;
}

/** The app looks at a running trip's row this often. */
const LOOK_MS = 3000;
/** A running job touches its row every 20 s; one silent for this long belongs to a worker that died — the same clock the server keeps. */
export const STALE_MS = 90_000;
const STALLED = "This stopped partway through. Nothing was planned; try again.";

async function readRecord(weaveId: string): Promise<WeaveRecord | null> {
  const { data, error } = await supabase.from("weaves").select("id,status,towns,profile,brief,result,message,created_at,updated_at").eq("id", weaveId).maybeSingle();
  if (error) throw new WeaveRefused("internal", error.message);
  if (!data) return null;
  const r = data as { id: string; status: WeaveRecord["status"]; towns: string[] | null; profile: WeaveProfile | null; brief: WeaveBrief | null; result: unknown; message: string | null; created_at: string; updated_at: string };
  return { id: r.id, status: r.status, towns: r.towns, profile: r.profile, brief: r.brief, result: r.result, message: r.message, createdAt: r.created_at, updatedAt: r.updated_at };
}

/** A trip's row, looked at again every few seconds while its job runs and left alone once it has stopped. */
export const weaveKey = (weaveId: string) => ["weave", weaveId] as const;
export function useWeave(weaveId: string | null) {
  return useQuery({
    queryKey: weaveKey(weaveId ?? ""),
    queryFn: () => readRecord(weaveId!),
    enabled: !!weaveId,
    // Looked at again only while the job runs: a row gone silent past the heartbeat is a stopped job, said as such, not watched for ever.
    refetchInterval: (query) => { const r = query.state.data; return r && (r.status === "reading" || r.status === "planning") && Date.now() - Date.parse(r.updatedAt) <= STALE_MS ? LOOK_MS : false; },
  });
}

/**
 * A trip as Your trips lists it: light columns only — the days from its brief, and one of its saves
 * to picture it by (the first the read counted towards its biggest kind) — never the plan itself.
 */
export interface TripSummary {
  id: string; status: WeaveRecord["status"]; towns: string[] | null; days: number | null; message: string | null;
  createdAt: string; updatedAt: string; pictureId: string | null;
}
export const tripsKey = ["weave-trips"] as const;
async function readTrips(): Promise<TripSummary[]> {
  const { data, error } = await supabase.from("weaves")
    .select("id,status,towns,days:brief->days,message,created_at,updated_at,picture:profile->mix->0->evidence->>0")
    .order("created_at", { ascending: false }).limit(30);
  if (error) throw new WeaveRefused("internal", error.message);
  return (data ?? []).map((r) => {
    const row = r as { id: string; status: WeaveRecord["status"]; towns: string[] | null; days: unknown; message: string | null; created_at: string; updated_at: string; picture: string | null };
    return { id: row.id, status: row.status, towns: row.towns, days: typeof row.days === "number" ? row.days : null, message: row.message, createdAt: row.created_at, updatedAt: row.updated_at, pictureId: row.picture };
  });
}
const live = (t: Pick<TripSummary, "status" | "updatedAt">, now: number) => (t.status === "reading" || t.status === "planning") && now - Date.parse(t.updatedAt) <= STALE_MS;
/** The person's trips, newest first; looked at again while one of them is still being read or woven. */
export function useTrips(enabled: boolean) {
  return useQuery({ queryKey: tripsKey, queryFn: readTrips, enabled, refetchInterval: (query) => ((query.state.data ?? []).some((t) => live(t, Date.now())) ? 5000 : false) });
}

const PACE_WORD: Record<WeaveBrief["pace"], string> = { relaxed: "Relaxed", full: "Full days" };
const TRANSPORT_WORD: Record<WeaveBrief["transport"], string> = { walk_cab: "walking and cabs", car: "by car", transit: "by transit" };
/** A plan's choices in one line, for the card while it is woven: "Relaxed · walking and cabs · Tue 6 – Mon 12 Oct". */
export function briefLine(brief: Pick<WeaveBrief, "days" | "startDate" | "pace" | "transport">, now: Date): string {
  return [PACE_WORD[brief.pace], TRANSPORT_WORD[brief.transport], brief.startDate ? describeRange(brief.startDate, brief.days, now) : null].filter(Boolean).join(" · ");
}

/**
 * When this phone asked for a plan, by trip, for the clock on the planning card: the row keeps no
 * start time for a plan, so the clock shows only when it is known, never a guess.
 */
const planAsked = new Map<string, number>();
export const markPlanAsked = (weaveId: string): void => { planAsked.set(weaveId, Date.now()); };
export const planAskedAt = (weaveId: string): number | null => planAsked.get(weaveId) ?? null;

type Place = WeaveTowns["towns"][number];
/**
 * The places to pick from, with the ones holding a single save kept under "More places" — once
 * there are more than six places and at least two with more saves, so a short list stays whole.
 */
export function foldPlaces(towns: Place[]): { main: Place[]; more: Place[] } {
  const big = towns.filter((t) => t.saves > 1);
  if (towns.length <= 6 || big.length < 2) return { main: towns, more: [] };
  return { main: big, more: towns.filter((t) => t.saves <= 1) };
}

/** What was picked, summed for the line above the button: "2 places · 22 saves". */
export function pickSummary(towns: Place[], picked: Set<string>): { saves: number; line: string } {
  const chosen = towns.filter((t) => picked.has(t.name));
  const saves = chosen.reduce((a, t) => a + t.saves, 0);
  if (chosen.length === 0) return { saves: 0, line: "Pick at least one place" };
  return { saves, line: `${chosen.length} ${chosen.length === 1 ? "place" : "places"} · ${saves} ${saves === 1 ? "save" : "saves"}` };
}

/** The longest plan the server makes, in days. */
export const MAX_PLAN_DAYS = 21;
/**
 * Said before anything is read (and paid for): every place in a plan gets a day or more, so more
 * places than days can't all be visited. Past the longest plan it can't be planned at all.
 */
export function tooManyPlaces(count: number): { blocking: boolean; text: string } | null {
  if (count > MAX_PLAN_DAYS) return { blocking: true, text: `${count} places is more than the longest plan (${MAX_PLAN_DAYS} days) can visit. Pick ${MAX_PLAN_DAYS} or fewer.` };
  if (count > 7) return { blocking: false, text: `${count} places need at least ${count} days — every place gets a day or more. Pick fewer, or plan ${count} days or longer.` };
  return null;
}

/** A trip named by its places, the way a person says them: "Seoul & Busan", "Seoul, Tokyo & 3 more". */
export function tripTitle(towns: string[] | null): string {
  if (!towns || towns.length === 0) return "Everywhere you've saved";
  if (towns.length === 1) return towns[0]!;
  if (towns.length <= 3) return `${towns.slice(0, -1).join(", ")} & ${towns[towns.length - 1]}`;
  return `${towns.slice(0, 2).join(", ")} & ${towns.length - 2} more`;
}

/** "0:42", "12:05": how long a job has run. */
export const runningFor = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** Where a trip is, in words with a tone — the words carry the state, so the colour is never the only sign. */
export function tripStatus(t: Pick<TripSummary, "status" | "createdAt" | "updatedAt">, now: number): { tone: "accent" | "good" | "bad"; text: string } {
  const stopped = { tone: "bad" as const, text: "Couldn't finish — tap to try again" };
  if ((t.status === "reading" || t.status === "planning") && !live(t, now)) return stopped;
  switch (t.status) {
    case "reading": return { tone: "accent", text: `Reading your saves · ${runningFor(now - Date.parse(t.createdAt))}` };
    case "profiled": return { tone: "accent", text: "Ready to plan" };
    case "planning": return { tone: "accent", text: "Weaving your plan…" };
    case "planned": {
      const made = new Date(t.updatedAt);
      const today = dayValue(made) === dayValue(new Date(now));
      return { tone: "good", text: `Ready · made ${today ? `today, ${describeTime(timeValue(made))}` : describeDay(dayValue(made), new Date(now))}` };
    }
    default: return stopped;
  }
}

/** Where a trip is, as a screen draws it. */
export type WeaveStage =
  | { kind: "loading" } | { kind: "missing" }
  | { kind: "reading"; since: number }
  | { kind: "profiled"; profile: WeaveProfile; saves: number }
  | { kind: "planning" }
  | { kind: "planned"; planned: WeavePlanned }
  | { kind: "failed"; during: "read" | "plan"; message: string; stalled: boolean };

/**
 * A trip's row read as a stage: undefined while it loads, null when there is no such trip. A failure
 * is the server's own words, at the read or the plan by whether a brief was given; a running job
 * whose row has gone silent past the worker's heartbeat is a failure to try again, not a wait.
 */
export function weaveStage(record: WeaveRecord | null | undefined, now: number): WeaveStage {
  if (record === undefined) return { kind: "loading" };
  if (record === null) return { kind: "missing" };
  const during = record.brief ? "plan" : "read";
  const silent = now - Date.parse(record.updatedAt) > STALE_MS;
  switch (record.status) {
    case "reading": return silent ? { kind: "failed", during, message: STALLED, stalled: true } : { kind: "reading", since: Date.parse(record.createdAt) };
    case "planning": return silent ? { kind: "failed", during, message: STALLED, stalled: true } : { kind: "planning" };
    case "profiled": {
      const found = record.result as Partial<WeaveUnderstood> | null;
      return { kind: "profiled", profile: found?.profile ?? record.profile!, saves: found?.saves ?? 0 };
    }
    case "planned": return { kind: "planned", planned: record.result as WeavePlanned };
    default: return { kind: "failed", during, message: record.message ?? "Something went wrong.", stalled: false };
  }
}

/** More or less of a kind: its share moved by half, the rest folded back to one, nothing below a sliver. */
export function shiftMix(profile: WeaveProfile, kind: WeaveKind, direction: "more" | "less"): WeaveProfile {
  const mix = profile.mix.map((m) => ({ ...m, share: m.kind === kind ? Math.max(0.02, m.share * (direction === "more" ? 1.5 : 0.67)) : m.share }));
  const total = mix.reduce((a, m) => a + m.share, 0);
  return { ...profile, mix: mix.map((m) => ({ ...m, share: Math.round((m.share / total) * 1000) / 1000 })) };
}

/** A town's nights moved by one, never below one. */
export function setNights(nights: { town: string; nights: number }[], town: string, delta: number): { town: string; nights: number }[] {
  return nights.map((n) => (n.town === town ? { ...n, nights: Math.max(1, n.nights + delta) } : n));
}

/**
 * What would make the dates unusable, said plainly; null when they can be planned. Said rather than
 * dropped: a value the plan quietly ignores is a plan the person thinks used it.
 */
export function whenProblem(when: { days: number; startDate: string | null; arrival: string | null; departure: string | null }, now: Date): string | null {
  if (when.startDate && when.startDate < dayValue(now)) return "That start date has passed. Pick today or a day after.";
  // "HH:MM" strings compare as times do.
  if (when.days === 1 && when.arrival && when.departure && when.departure <= when.arrival) return "On a one-day trip, leaving has to be after arriving.";
  return null;
}

/** Days split among towns in proportion to the profile's nights, whole and at least one each, summing to the days. */
export function splitDays(days: number, towns: { name: string; nights: number }[]): { town: string; nights: number }[] {
  if (towns.length === 0) return [];
  const sum = towns.reduce((a, t) => a + Math.max(1, t.nights), 0);
  const exact = towns.map((t) => ({ town: t.name, exact: (days * Math.max(1, t.nights)) / sum }));
  const out = exact.map((e) => ({ town: e.town, nights: Math.max(1, Math.floor(e.exact)) }));
  let given = out.reduce((a, n) => a + n.nights, 0);
  const order = [...exact].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)));
  for (let i = 0; given < days && i < order.length; i++, given++) out.find((n) => n.town === order[i]!.town)!.nights += 1;
  while (given > days && out.some((n) => n.nights > 1)) { out.sort((a, b) => b.nights - a.nights)[0]!.nights -= 1; given--; }
  return out;
}

/** The share of the trip as a person reads it: "45%". */
export const percent = (share: number): string => `${Math.round(share * 100)}%`;

const SLOT_WORD: Record<string, string> = { morning: "Morning", late_morning: "Late morning", lunch: "Lunch", afternoon: "Afternoon", evening: "Evening", night: "Night" };
export const slotWord = (slot: string): string => SLOT_WORD[slot] ?? slot;

/** "4.6 · 2,100 reviews · $$": the crowd's word in one line, or nothing. */
export function crowdLine(stop: Pick<PlanStop, "rating" | "ratingCount" | "priceLevel">): string | null {
  const parts: string[] = [];
  if (stop.rating !== null) parts.push(stop.ratingCount ? `${stop.rating.toFixed(1)} · ${stop.ratingCount.toLocaleString("en-US")} reviews` : stop.rating.toFixed(1));
  const price = { PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" }[stop.priceLevel ?? ""];
  if (price) parts.push(price);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Whether a stop is open on a day of the plan — the hours line when the place's periods are known, else the skeleton's word. */
export function stopHours(stop: PlanStop, dayIndex: number, periods: OpeningPeriod[] | null, utcOffsetMinutes: number | null, now: Date): string | null {
  const word = stop.openByDay[dayIndex];
  if (word === "closed") return "Closed that day";
  if (word === "unknown") return "Hours unknown — check before you go";
  return periods ? hoursLine(periods, utcOffsetMinutes, now) : null;
}

/** The plan as text a person can send: the overview, then each day with its stops, then what to book. */
export function planText(plan: WeavePlan, stops: PlanStop[], title: string): string {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const lines = [title, "", plan.overview];
  for (const day of plan.days) {
    lines.push("", `Day ${day.day}${day.date ? ` · ${day.date}` : ""} · ${day.town} — ${day.theme}`);
    day.stops.forEach((s, i) => {
      const stop = byId.get(s.id);
      lines.push(`${i + 1}. ${slotWord(s.slot)}: ${stop?.name ?? s.id}${stop?.source === "suggested" ? " (suggested — not from your saves)" : ""}`);
      if (stop?.address) lines.push(`   ${stop.address}`);
      if (s.why) lines.push(`   ${s.why}`);
      if (s.tip) lines.push(`   Tip: ${s.tip}`);
      if (s.warning) lines.push(`   ${s.warning}`);
      if (stop?.url) lines.push(`   From: ${stop.url}`);
    });
    if (day.notes) lines.push(`   ${day.notes}`);
  }
  if (plan.bookAhead.length > 0) {
    lines.push("", "Book ahead:");
    for (const b of plan.bookAhead) lines.push(`- ${byId.get(b.id)?.name ?? b.id}: ${b.what} — ${b.why}`);
  }
  lines.push("", "Made with Allkept from the posts you saved.");
  return lines.join("\n");
}

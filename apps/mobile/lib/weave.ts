import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import type { WeaveBrief, WeaveKind, WeavePlan, WeaveProfile } from "@allkept/contracts";
import { WEAVE_KINDS } from "@allkept/contracts";
import { hoursLine, type OpeningPeriod } from "./hours";
import { serverSaid } from "./function-error";
import { httpStatus } from "./paywall";
import { supabase } from "./supabase";
import { dayValue } from "./when";

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

/** The last weave begun, kept on the phone for an hour so a plan begun and left is still reachable. */
const LAST_KEY = "allkept.weave.last";
const RECENT_MS = 60 * 60_000;
export const rememberWeave = (weaveId: string): void => { AsyncStorage.setItem(LAST_KEY, JSON.stringify({ weaveId, at: Date.now() })).catch(() => undefined); };
/** The remembered weave's id while it is recent; nothing for anything older, missing or malformed. */
export function recentWeave(stored: string | null, now: number): string | null {
  if (!stored) return null;
  try {
    const v = JSON.parse(stored) as { weaveId?: unknown; at?: unknown };
    return typeof v.weaveId === "string" && typeof v.at === "number" && now - v.at <= RECENT_MS ? v.weaveId : null;
  } catch { return null; }
}
export function useRecentWeave() {
  return useQuery({ queryKey: ["weave-last"], queryFn: async () => recentWeave(await AsyncStorage.getItem(LAST_KEY).catch(() => null), Date.now()), staleTime: 0, gcTime: 0 });
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

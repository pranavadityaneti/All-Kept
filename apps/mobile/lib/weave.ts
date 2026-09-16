import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import type { WeaveBrief, WeaveKind, WeavePlan, WeaveProfile } from "@allkept/contracts";
import { WEAVE_KINDS } from "@allkept/contracts";
import { hoursLine, type OpeningPeriod } from "./hours";
import { serverSaid } from "./function-error";
import { httpStatus } from "./paywall";
import { supabase } from "./supabase";

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
    // No status at all: the request never reached the function — no network, or the phone gave up waiting.
    const code = said?.code ?? (status === 402 ? "payment_required" : status === undefined ? "unreachable" : "internal");
    const message = said?.error ?? (status === undefined ? "Couldn't reach Allkept. Check your connection and try again." : "Something went wrong.");
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

/** The weave's row as the app reads it: the stage it is at, what the server wrote for the app, what the person is told on failure, and when it last moved. */
export interface WeaveRow { status: string; result: unknown; message: string | null; updatedAt: string }

/** The app looks at its row this often while a stage runs. */
const LOOK_MS = 3000;
/** A running job touches its row every 20 s; one silent for this long belongs to a worker that died — the same clock the server keeps. */
export const STALE_MS = 90_000;
/** The longest the app waits for each stage, past which it stops looking. */
export const DEADLINE_MS = { profiled: 5 * 60_000, planned: 8 * 60_000 } as const;
const TOO_LONG = "This is taking longer than it should. Try again in a moment.";

async function readRow(weaveId: string): Promise<WeaveRow | null> {
  const { data, error } = await supabase.from("weaves").select("status,result,message,updated_at").eq("id", weaveId).maybeSingle();
  if (error) throw new WeaveRefused("internal", error.message);
  if (!data) return null;
  const r = data as { status: string; result: unknown; message: string | null; updated_at: string };
  return { status: r.status, result: r.result, message: r.message, updatedAt: r.updated_at };
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Waits for a stage of the weave by watching its row (spec §11): "profiled" after "Read my saves",
 * "planned" after "Make a plan". Hands back what the server wrote for the app, or refuses with the
 * server's own words when the stage failed, with "timeout" when the row has stopped moving or the
 * deadline has passed, and with "aborted" when the screen has gone. The reader, the clock and
 * the sleep are injectable for tests.
 */
export async function waitForWeave<T>(
  weaveId: string, want: "profiled" | "planned",
  deps: { read?: (weaveId: string) => Promise<WeaveRow | null>; now?: () => number; sleep?: (ms: number) => Promise<void>; deadlineMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const read = deps.read ?? readRow, now = deps.now ?? Date.now, sleep = deps.sleep ?? pause;
  const deadline = now() + (deps.deadlineMs ?? DEADLINE_MS[want]);
  for (;;) {
    if (deps.signal?.aborted) throw new WeaveRefused("aborted", "Stopped waiting.");
    const row = await read(weaveId);
    if (!row) throw new WeaveRefused("not_found", "This plan isn't there any more. Make it again from \"Plan a trip\" on the map.");
    if (row.status === want) return row.result as T;
    if (row.status === "failed") throw new WeaveRefused("failed", row.message ?? "Something went wrong.");
    if (now() - Date.parse(row.updatedAt) > STALE_MS || now() >= deadline) throw new WeaveRefused("timeout", TOO_LONG);
    await sleep(LOOK_MS);
  }
}

/** The plan for a weave: waited for on the row, then kept for the session. The plan screen opens on the id alone. */
export const planKey = (weaveId: string) => ["weave-plan", weaveId] as const;
export function usePlanned(weaveId: string) {
  return useQuery({ queryKey: planKey(weaveId), queryFn: ({ signal }) => waitForWeave<WeavePlanned>(weaveId, "planned", { signal }), enabled: weaveId.length > 0, staleTime: Infinity, gcTime: 60 * 60_000, retry: false });
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

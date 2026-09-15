import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { WeaveBrief, WeaveKind, WeavePlan, WeaveProfile } from "@allkept/contracts";
import { WEAVE_KINDS } from "@allkept/contracts";
import { hoursLine, type OpeningPeriod } from "./hours";
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
export interface WeaveUnderstood { weaveId: string; profile: WeaveProfile; saves: number }
export interface WeavePlanned { weaveId: string; plan: WeavePlan; stops: PlanStop[]; leftOut: { id: string; reason: string; title: string | null }[]; brief: WeaveBrief; cost: number }

/** The server's refusal, with its code, so the screen can open the paywall or say why. */
export class WeaveRefused extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("weave", { body });
  if (error) {
    const context: unknown = (error as { context?: unknown })?.context;
    let code = httpStatus(error) === 402 ? "payment_required" : "internal", message = "Something went wrong.";
    if (context instanceof Response) {
      try { const said = (await context.clone().json()) as { error?: unknown; code?: unknown }; if (typeof said.error === "string") message = said.error; if (typeof said.code === "string") code = said.code; } catch { /* not JSON */ }
    }
    throw new WeaveRefused(code, message);
  }
  if (!data) throw new WeaveRefused("internal", "The server did not answer.");
  return data;
}

export const weaveTowns = () => call<WeaveTowns>({ action: "towns" });
export const weaveUnderstand = (towns: string[]) => call<WeaveUnderstood>({ action: "understand", towns });
export const weavePlan = (weaveId: string, profile: WeaveProfile, brief: Partial<WeaveBrief>) => call<WeavePlanned>({ action: "plan", weaveId, profile, brief });

export function useWeaveTowns(enabled: boolean) {
  return useQuery({ queryKey: ["weave-towns"], queryFn: weaveTowns, enabled });
}

/** A plan made this session, kept in the query cache so the plan screen can open it by id without carrying it through the route. */
export const planKey = (weaveId: string) => ["weave-plan", weaveId] as const;
export const keepPlan = (queryClient: QueryClient, made: WeavePlanned): void => { queryClient.setQueryData(planKey(made.weaveId), made); };
export function useKeptPlan(weaveId: string) {
  const queryClient = useQueryClient();
  return queryClient.getQueryData<WeavePlanned>(planKey(weaveId)) ?? null;
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

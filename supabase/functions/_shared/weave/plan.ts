// Plan: arrange and explain.
//
// The model is handed the brief, the profile as edited, and a skeleton computed by the select and
// context stages — the chosen stops with their facts, whether each is open on each day of the
// trip, how far each is from its neighbours, the areas, the base in each town, the days with their
// towns and their room, the holidays, the weather — and asked to arrange them into days under the
// realism rules, citing the saves. It answers in a strict schema; the validator refuses what does
// not hold together and names the problems for one retry. Nothing invented survives it. Pure; the
// model is injected. See internal/superpowers/specs/2026-09-16-weave-itinerary-design.md.
import { WEAVE_KINDS, type WeaveBrief, type WeaveKind, type WeavePlan, type WeaveProfile, type WeaveSlot, type WeaveStop } from "../contracts.ts";

export const SLOTS: readonly WeaveSlot[] = ["morning", "late_morning", "lunch", "afternoon", "evening", "night"];

/** A stop as the plan stage sees it: the facts, and whether it is open on each day of the trip. */
export interface SkeletonStop {
  /** A save's id, or "s:<placeId>" for a suggestion not from the saves. */
  id: string;
  source: "save" | "suggested";
  name: string;
  kind: WeaveKind;
  town: string;
  /** The neighbourhood the select stage grouped it into; null when it stands alone. */
  area: string | null;
  address: string | null;
  lat: number;
  lng: number;
  /** One entry per day of the trip: open, closed, or unknown when the place has no hours. */
  openByDay: ("open" | "closed" | "unknown")[];
  rating: number | null;
  ratingCount: number | null;
  priceLevel: string | null;
  /** What the reel said, in the sorter's words; the words on screen; the person's note. */
  about: string | null;
  tags: string[];
  screen: string | null;
  note: string | null;
  must: boolean;
  savedTimes: number;
  /** The five nearest chosen stops, with the distance in kilometres. */
  near: { id: string; km: number }[];
}

export interface Skeleton {
  days: { day: number; date: string | null; town: string; slots: number; transit: boolean; weekday: string | null }[];
  stops: SkeletonStop[];
  bases: { town: string; name: string | null }[];
  holidays: { date: string; name: string; country: string }[];
  /** One line per town: "Kyoto, 6–12 Oct: typically 13–22 °C, some rain." */
  weather: string[];
}

export const PLAN_PROMPT = `You plan a trip from the places a person saved from social media, arranged by their own mix.
You are given the brief, what their saves say, and a skeleton: the chosen stops with facts — where, what kind, the address, whether each is open on each day of the trip, its rating and how many rated it, its price level, what the saved post said, the five nearest other stops with the distance — grouped by area, the base in each town, the days with their town and how many stops each has room for, the public holidays in the dates, and the typical weather.
Arrange, don't add: use only the stops given, by their ids, each at most once; cite the saved posts for every claim about a stop; where a stop is marked suggested, say so in its warning, in these words: "Suggested — not from your saves"; say "check before you go" where the hours are unknown; never claim a booking, a price or availability.
Order by geography and by the day's rhythm — coffee early, sights, a proper meal at lunch and in the evening, a viewpoint at golden hour, an evening free every third day — within each day's room; one area a day; one big activity a day (a dive, a hike is the day); a light first day and last day; nothing on a day a place is closed; a holiday noted where it changes the day; the weather noted where it changes what to wear or do; festivals and seasonal things you know of named as "usually held around …, check this year's dates", never as fact.
Honour the style and the group. Put what needs booking in bookAhead with why. Put every chosen stop you could not place in leftOut with the reason — a must-do only for a reason you name. Say your assumptions plainly.
Write in the reader's language, in plain words, without marketing words. Answer in the schema.`;

const stopSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    slot: { type: "string", enum: [...SLOTS] },
    why: { type: "string" },
    cites: { type: "array", items: { type: "string" } },
    tip: { type: ["string", "null"] },
    warning: { type: ["string", "null"] },
  },
  required: ["id", "slot", "why", "cites", "tip", "warning"],
  additionalProperties: false,
} as const;

/** The strict shape the model answers in; the validator reads exactly these fields. */
export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    days: { type: "array", items: { type: "object", properties: {
      day: { type: "integer" }, date: { type: ["string", "null"] }, town: { type: "string" }, theme: { type: "string" },
      stops: { type: "array", items: stopSchema }, notes: { type: ["string", "null"] },
    }, required: ["day", "date", "town", "theme", "stops", "notes"], additionalProperties: false } },
    bookAhead: { type: "array", items: { type: "object", properties: { id: { type: "string" }, what: { type: "string" }, why: { type: "string" } }, required: ["id", "what", "why"], additionalProperties: false } },
    leftOut: { type: "array", items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"], additionalProperties: false } },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: ["overview", "days", "bookAhead", "leftOut", "assumptions"],
  additionalProperties: false,
} as const;

/** The user message: the brief, the profile and the skeleton as JSON, and — on a retry — the problems to fix. */
export function planMessage(brief: WeaveBrief, profile: WeaveProfile, skeleton: Skeleton, language: string, problems: string[] = []): string {
  const parts = [`write in: ${language}`, `brief: ${JSON.stringify(brief)}`, `what the saves say: ${JSON.stringify(profile)}`, `skeleton: ${JSON.stringify(skeleton)}`];
  if (problems.length > 0) parts.push(`Your last plan did not hold together. Fix these and answer again:\n- ${problems.join("\n- ")}`);
  return parts.join("\n\n");
}

export const SUGGESTED_LABEL = "Suggested — not from your saves";
const isStr = (v: unknown): v is string => typeof v === "string";
const clip = (v: unknown, n: number): string => (isStr(v) ? v.trim().slice(0, n) : "");

/**
 * The plan, made safe, and the problems that make it unfit — empty when it holds together. Rules:
 * every stop given and at most once; the days the brief's days, in order, each in its town and
 * within its room; nothing on a day a place is closed; every must placed or explained; a suggested
 * stop labelled as such whatever the model wrote; cites only saves that were given.
 */
export function validatePlan(v: unknown, skeleton: Skeleton, must: string[]): { plan: WeavePlan; problems: string[] } | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const stops = new Map(skeleton.stops.map((s) => [s.id, s]));
  const knownSaves = new Set(skeleton.stops.filter((s) => s.source === "save").map((s) => s.id));
  const problems: string[] = [];
  const used = new Set<string>();

  const daysRaw = Array.isArray(o["days"]) ? (o["days"] as Record<string, unknown>[]) : [];
  if (daysRaw.length !== skeleton.days.length) problems.push(`the trip has ${skeleton.days.length} days; you gave ${daysRaw.length}`);
  const days = daysRaw.slice(0, skeleton.days.length).map((d, i) => {
    const expected = skeleton.days[i]!;
    const town = clip(d["town"], 80) || expected.town;
    if (town !== expected.town) problems.push(`day ${expected.day} is in ${expected.town}, not ${town}`);
    const stopsRaw = Array.isArray(d["stops"]) ? (d["stops"] as Record<string, unknown>[]) : [];
    const dayStops: WeaveStop[] = [];
    for (const s of stopsRaw) {
      const id = isStr(s["id"]) ? s["id"] : "";
      const stop = stops.get(id);
      if (!stop) { problems.push(`day ${expected.day}: "${id}" is not one of the stops given`); continue; }
      if (used.has(id)) { problems.push(`day ${expected.day}: ${stop.name} (${id}) is placed twice`); continue; }
      used.add(id);
      if (stop.openByDay[i] === "closed") problems.push(`day ${expected.day}: ${stop.name} (${id}) is closed that day`);
      const cites = Array.isArray(s["cites"]) ? [...new Set((s["cites"] as unknown[]).filter(isStr).filter((c) => knownSaves.has(c)))] : [];
      let warning = clip(s["warning"], 300) || null;
      if (stop.source === "suggested" && !(warning ?? "").startsWith(SUGGESTED_LABEL)) warning = warning ? `${SUGGESTED_LABEL}. ${warning}` : SUGGESTED_LABEL;
      if (stop.openByDay[i] === "unknown" && !/check before you go/i.test(warning ?? "")) warning = warning ? `${warning} Check before you go.` : "Hours unknown — check before you go.";
      dayStops.push({
        id, slot: isStr(s["slot"]) && (SLOTS as readonly string[]).includes(s["slot"]) ? (s["slot"] as WeaveSlot) : "afternoon",
        why: clip(s["why"], 600), cites, tip: clip(s["tip"], 300) || null, warning,
      });
    }
    if (dayStops.length > expected.slots) problems.push(`day ${expected.day} has room for ${expected.slots} stops; you placed ${dayStops.length}`);
    return { day: expected.day, date: expected.date, town: expected.town, theme: clip(d["theme"], 120), stops: dayStops, notes: clip(d["notes"], 600) || null };
  });

  const leftOutRaw = Array.isArray(o["leftOut"]) ? (o["leftOut"] as Record<string, unknown>[]) : [];
  const leftOut = leftOutRaw.flatMap((l) => (isStr(l["id"]) && stops.has(l["id"]) && !used.has(l["id"]) ? [{ id: l["id"], reason: clip(l["reason"], 300) }] : []));
  const explained = new Set(leftOut.map((l) => l.id));
  for (const s of skeleton.stops) {
    if (used.has(s.id) || explained.has(s.id)) continue;
    if (s.must || must.includes(s.id)) problems.push(`${s.name} (${s.id}) is a must-do and is neither placed nor explained in leftOut`);
    else leftOut.push({ id: s.id, reason: "did not fit the days" });
  }
  const bookRaw = Array.isArray(o["bookAhead"]) ? (o["bookAhead"] as Record<string, unknown>[]) : [];
  const bookAhead = bookRaw.flatMap((b) => (isStr(b["id"]) && stops.has(b["id"]) ? [{ id: b["id"], what: clip(b["what"], 200), why: clip(b["why"], 300) }] : []));
  const assumptions = Array.isArray(o["assumptions"]) ? (o["assumptions"] as unknown[]).filter(isStr).map((a) => a.trim().slice(0, 300)).filter((a) => a.length > 0).slice(0, 12) : [];
  return { plan: { overview: clip(o["overview"], 1200), days, bookAhead, leftOut, assumptions }, problems };
}

/** The kinds a stop may be, for anyone building a skeleton. */
export const KINDS: readonly WeaveKind[] = WEAVE_KINDS;

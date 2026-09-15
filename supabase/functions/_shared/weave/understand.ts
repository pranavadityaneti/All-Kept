// Understand: what the saves say this person wants from the trip.
//
// Before anything is planned, the whole pile is read — the sorter's summary, tags and names, the
// words on screen, the person's note, how often it was saved, whether it was reminded or visited —
// and the model writes a profile with the saves as evidence: the mix of kinds, the towns and the
// nights each deserves, the saves the person clearly means, the style to honour, who seems to be
// going, and the saves that count for nothing. Shown to the person and edited before a plan is
// made, since a wrong profile would have been a wrong plan. Pure; the model is injected.
// See internal/superpowers/specs/2026-09-16-weave-itinerary-design.md.
import { WEAVE_KINDS, type WeaveGroup, type WeaveKind, type WeaveProfile } from "../contracts.ts";

/** A save as the understanding stage reads it. Only derived fields and the person's own note — never a caption's full text. */
export interface SaveForUnderstanding {
  id: string;
  category: string | null;
  summary: string | null;
  tags: string[];
  names: string[];
  screenText: string | null;
  note: string | null;
  /** The town the save's place or venue names, when known. */
  town: string | null;
  saveCount: number;
  reminded: boolean;
  visited: boolean;
}

/** More saves than this are more than a trip; the newest are read. */
export const MAX_SAVES = 300;

export const UNDERSTAND_PROMPT = `You read the posts a person saved before a trip and say what they add up to.
Each post carries what it was about, its tags, the places and things it named, the words on its screen, the person's own note, the town it belongs to when known, how many times it was saved, whether it was set as a reminder, and whether it was marked visited.
Answer in the schema, judging from the posts alone:
- mix: the kinds of thing the person is after, each with its share of the trip (the shares sum to one) and the ids of the posts that show it. Kinds: food (eating), coffee (cafés), nightlife, culture (temples, museums, neighbourhoods, markets for their own sake), cityscape (views, walks, skylines), nature, adventure (a dive, a hike, a ride), shopping, stay (hotels), other. Thirty cafés mean coffee is a large share; three dive reels mean adventure is there and small.
- towns: every town the posts belong to, with its country as a two-letter code (KR, JP), how many posts and how many nights it deserves, in proportion to the posts, at least one. Never a town the posts do not name.
- must: the posts the person clearly means — saved more than once, given a note, set as a reminder — each with the reason in a few words.
- style: a few words the plan should honour, drawn from how the posts read — "hidden-gem captions, few landmarks", "big names and famous dishes".
- group: solo, couple, family or friends when the posts say so (children's things, "date night", "with the boys"); null when they do not.
- budgetWords: the posts' own words about money when there are any ("splurge", "cheap eats"); null otherwise.
- unsure: the ids of posts that are ads, montages or too unclear to place — they count for nothing.
Never invent a place, a wish or a town the posts do not show. Keep every id exactly as given.`;

/** The strict shape the model answers in; the validator reads exactly these fields. */
export const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    mix: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: [...WEAVE_KINDS] }, share: { type: "number" }, evidence: { type: "array", items: { type: "string" } } }, required: ["kind", "share", "evidence"], additionalProperties: false } },
    towns: { type: "array", items: { type: "object", properties: { name: { type: "string" }, country: { type: ["string", "null"] }, saves: { type: "integer" }, nights: { type: "integer" } }, required: ["name", "country", "saves", "nights"], additionalProperties: false } },
    must: { type: "array", items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"], additionalProperties: false } },
    style: { type: "string" },
    group: { type: ["string", "null"], enum: ["solo", "couple", "family", "friends", null] },
    budgetWords: { type: ["string", "null"] },
    unsure: { type: "array", items: { type: "string" } },
  },
  required: ["mix", "towns", "must", "style", "group", "budgetWords", "unsure"],
  additionalProperties: false,
} as const;

/** The saves as the model reads them: one compact line each, the newest first, bounded. */
export function understandingMessage(saves: SaveForUnderstanding[]): string {
  const lines = saves.slice(0, MAX_SAVES).map((s) => JSON.stringify({
    id: s.id, category: s.category, about: s.summary, tags: s.tags.slice(0, 5), names: s.names.slice(0, 6),
    screen: s.screenText ? s.screenText.slice(0, 120) : undefined, note: s.note ? s.note.slice(0, 200) : undefined, town: s.town ?? undefined,
    savedTimes: s.saveCount > 1 ? s.saveCount : undefined, reminded: s.reminded || undefined, visited: s.visited || undefined,
  }));
  return `${lines.length} posts:\n${lines.join("\n")}`;
}

const isStr = (v: unknown): v is string => typeof v === "string";
const MAX_WORDS_CHARS = 200;

/**
 * The model's profile, made safe: only ids that were given, shares folded to sum to one with empty
 * kinds dropped, nights whole and at least one, towns and ids without repeats. Null when there is
 * no mix at all — a profile that says nothing is not shown.
 */
export function validateProfile(v: unknown, knownIds: Set<string>): WeaveProfile | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const ids = (list: unknown): string[] => Array.isArray(list) ? [...new Set(list.filter(isStr).filter((id) => knownIds.has(id)))] : [];
  const mixRaw = Array.isArray(o["mix"]) ? (o["mix"] as Record<string, unknown>[]) : [];
  const seenKinds = new Set<string>();
  const mix = mixRaw.flatMap((m) => {
    const kind = m["kind"];
    const share = typeof m["share"] === "number" && Number.isFinite(m["share"]) ? Math.max(0, m["share"]) : 0;
    if (!isStr(kind) || !(WEAVE_KINDS as readonly string[]).includes(kind) || seenKinds.has(kind) || share <= 0) return [];
    seenKinds.add(kind);
    return [{ kind: kind as WeaveKind, share, evidence: ids(m["evidence"]) }];
  });
  const total = mix.reduce((a, m) => a + m.share, 0);
  if (mix.length === 0 || total <= 0) return null;
  for (const m of mix) m.share = Math.round((m.share / total) * 1000) / 1000;
  const townsRaw = Array.isArray(o["towns"]) ? (o["towns"] as Record<string, unknown>[]) : [];
  const seenTowns = new Set<string>();
  const towns = townsRaw.flatMap((t) => {
    const name = isStr(t["name"]) ? t["name"].trim() : "";
    if (!name || seenTowns.has(name.toLowerCase())) return [];
    seenTowns.add(name.toLowerCase());
    const saves = typeof t["saves"] === "number" ? Math.max(0, Math.round(t["saves"])) : 0;
    const nights = typeof t["nights"] === "number" ? Math.max(1, Math.round(t["nights"])) : 1;
    const country = isStr(t["country"]) && /^[A-Za-z]{2}$/.test(t["country"].trim()) ? t["country"].trim().toUpperCase() : null;
    return [{ name, country, saves, nights }];
  });
  const mustRaw = Array.isArray(o["must"]) ? (o["must"] as Record<string, unknown>[]) : [];
  const seenMust = new Set<string>();
  const must = mustRaw.flatMap((m) => {
    const id = m["id"];
    if (!isStr(id) || !knownIds.has(id) || seenMust.has(id)) return [];
    seenMust.add(id);
    return [{ id, reason: isStr(m["reason"]) ? m["reason"].trim().slice(0, MAX_WORDS_CHARS) : "" }];
  });
  const group = isStr(o["group"]) && ["solo", "couple", "family", "friends"].includes(o["group"]) ? (o["group"] as WeaveGroup) : null;
  return {
    mix, towns, must,
    style: isStr(o["style"]) ? o["style"].trim().slice(0, MAX_WORDS_CHARS) : "",
    group,
    budgetWords: isStr(o["budgetWords"]) && o["budgetWords"].trim() ? o["budgetWords"].trim().slice(0, MAX_WORDS_CHARS) : null,
    unsure: ids(o["unsure"]).filter((id) => !seenMust.has(id)),
  };
}

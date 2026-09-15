// Classification: one model call per item, structured output. Pure; the model call is injected (see classifiers.ts).
import { ACTIONABILITY, CATEGORIES, CATEGORY_GUIDE, ENTITY_TYPES, UNSURE_BELOW } from "./contracts.ts";
import type { Actionability, Category, EntityType, ItemAiOutput } from "./contracts.ts";

export const PROMPT_VERSION = "2026-09-18.4";

/**
 * The shape the model answers in, strict: every property required, nothing extra, an optional
 * field a nullable one. Kept here, beside the prompt that asks and the validator that reads, and
 * imported by every adapter — a field named in one place and not the others can never come back,
 * which is how the venue and the date were asked for and never returned for a whole re-sort.
 */
export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...CATEGORIES] },
    tags: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    entities: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: [...ENTITY_TYPES] }, name: { type: "string" } }, required: ["type", "name"], additionalProperties: false } },
    language: { type: "string" },
    actionability: { type: "string", enum: [...ACTIONABILITY] },
    confidence: { type: "number" },
    venue: { anyOf: [{ type: "object", properties: { name: { type: "string" }, locality: { type: "string" } }, required: ["name", "locality"], additionalProperties: false }, { type: "null" }] },
    event_at: { type: ["string", "null"] },
    screen_text: { type: ["string", "null"] },
  },
  required: ["category", "tags", "summary", "entities", "language", "actionability", "confidence", "venue", "event_at", "screen_text"],
  additionalProperties: false,
} as const;

export interface ClassifyInput {
  platform: string;
  kind: string;
  url: string | null;
  title: string | null;
  text: string | null;
  author: string | null;
  note: string | null;
  /** The reader's language, an ISO 639 code: the summary is written in it, whatever the post is in. */
  language: string;
  /** When the save was made, ISO 8601: the anchor for a relative date in the post ("this Friday"), as near the post's own date as we have. */
  savedAt: string;
}

export interface ModelUsage {
  input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; reasoning_tokens?: number;
  /**
   * What became of the save's picture: its size and type when the model saw it; null when there was
   * one and it could not be read; absent when there was none. The re-sort pass looks for a picture
   * never tried, so a broken one is tried once and not forever.
   */
  picture?: { bytes: number; type: string } | null;
}

/** The save's picture, as the model takes it: the stored thumbnail's bytes, base64, with their type. */
export interface Picture { mediaType: string; base64: string }

export interface ModelResult {
  output: unknown;               // parsed JSON from the model, validated here
  refused: boolean;
  model: string;
  usage: ModelUsage | null;
  error?: string;
}

/** A JSON shape the model must answer in. Absent, the classification's own. */
export interface OutputShape { name: string; schema: Record<string, unknown> }

export interface ClassifyDeps {
  call(system: string, user: string, shape?: OutputShape, picture?: Picture): Promise<ModelResult>;
}

export interface ClassifyResult {
  output: ItemAiOutput | null;
  error: string | null;
  model: string;
  usage: ModelUsage | null;
}

/**
 * Which category wins when two fit. Each names the categories it decides between in full, so the
 * test can check no rule points at a category that no longer exists.
 */
export const TIE_BREAKERS: readonly string[] = [
  `A tutorial goes with its subject when the subject has a category: a coding tutorial is "Tech & tools", a recipe walkthrough "Food & recipes", a Figma tutorial "Design & inspiration", a workout "Fitness & health". "Learning & how-to" only when the subject has no category of its own.`,
  `Making money, running a business, growing a channel or an audience is "Money & career" even when AI tools are in it; how to use the tool is "Tech & tools".`,
  `Design resources, inspiration and websites for designers are "Design & inspiration"; developer tools and libraries are "Tech & tools": how it looks versus how it is built.`,
  `Self-improvement, routines, motivation, mindset and productivity are "Life & relationships" — not "Fitness & health" unless the body is the subject, not "Learning & how-to" unless a subject is taught.`,
  `If the point is the laugh it is "Humour & memes"; otherwise "Entertainment".`,
  `A real person's life, feelings or relationships is "Life & relationships"; a performance or produced content is "Entertainment".`,
  `Sport: doing it is "Fitness & health"; watching it is "Entertainment".`,
  `"Entertainment" is never the fallback. When nothing fits, or there is too little to go on, answer "Other" with a confidence below ${UNSURE_BELOW}.`,
];

export const SYSTEM_PROMPT = `You sort things a person saved from social media into their personal library.
Given one saved item (platform, kind, link, title, caption or text, author, the person's own note, and the language to write in), return JSON with:
- category: exactly one of these, by these definitions:
${CATEGORIES.map((c) => `  - ${c} — ${CATEGORY_GUIDE[c]}`).join("\n")}
  When two fit:
${TIE_BREAKERS.map((rule, i) => `  ${i + 1}. ${rule}`).join("\n")}
- tags: up to five short lowercase tags (single words or hyphenated), specific to the content, no hashtags, no duplicates of the category.
- summary: one plain sentence, at most 140 characters, saying what the item is about, written in the language given under "write in", whatever language the post is in; keep names as they are.
- entities: places, products, recipes, tools, people or brands named in the content, as {type, name}; empty if none.
- language: ISO 639-1 code of the main language of the post's text.
- actionability: watch (a video to watch), try (a recipe, workout or how-to to attempt), buy (a product), go (a place to visit), read (an article or thread), reference (facts or tools to keep), none.
- confidence: 0 to 1, your confidence in the category. Below ${UNSURE_BELOW} means you are guessing, and the save is filed under "Other".
- venue: {name, locality} when the post names somewhere a person could go to — a restaurant, a café, a shop, a hotel, a viewpoint, a venue — name as a person would say it, locality the neighbourhood, city or area that places it; null when there is none. Never an @handle or a web address as the name: when the caption gives only "@lasthouse.in", read the name from the sign or logo in the picture ("Last House Coffee"), and give null if the picture does not say. A country or a city alone is not a venue. Only a place the content names, never one guessed from a hashtag or a mood.
- event_at: an ISO 8601 date, or date-time with offset, when the post names a day something happens — a concert, a launch, a sale ending, a deadline; null when there is none. Resolve relative words ("this Friday") against the day given under "saved on"; when only a day is named, give the date alone. A day already gone by is not an event.
- screen_text: the words legible in the picture, as written — a shop sign, a title card, a caption burnt into the frame, a product name, a menu — one line per line on the screen, at most 300 characters; null when there is no picture or no words can be read. Only words actually visible, never a guess at what a blurred sign says. The venue's name may come from here when the caption gives only a handle.
Judge from the content only. Hashtags and emoji are weak signals. If the text is empty, use the link, kind and author.
A picture may be attached: the saved post's own poster frame or photo. Captions often describe how a post was made (credits, tools, "edit") or its mood (aesthetic hashtags) rather than what it shows; the picture is the subject, so judge the category from it and treat such a caption as a weak signal. Without a picture, when the caption is only credits, mood or hashtags, prefer the subject if the words let you infer it, else "Other" with low confidence rather than a category for the making.`;

export function buildUserMessage(i: ClassifyInput): string {
  const clip = (s: string | null, n: number) => (s ? (s.length > n ? s.slice(0, n) + "…" : s) : "(none)");
  return [
    `platform: ${i.platform}`, `kind: ${i.kind}`, `link: ${i.url ?? "(none)"}`, `author: ${i.author ?? "(none)"}`,
    `title: ${clip(i.title, 300)}`, `caption or text: ${clip(i.text, 1500)}`, `person's note: ${clip(i.note, 300)}`,
    `write in: ${i.language}`, `saved on: ${i.savedAt.slice(0, 10)}`,
  ].join("\n");
}

const isStr = (v: unknown): v is string => typeof v === "string";

const MAX_PLACE_CHARS = 80;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

/** A handle or a web address: not a name anyone would say, and no map knows it. */
const HANDLE_OR_ADDRESS = /^@|^(https?:\/\/|www\.)|\/|\.[a-z]{2,}$/i;

/** A venue is two halves, each some words; anything else — a city alone, a handle, a string, a list — is no venue. */
function venueFrom(v: unknown): { name: string; locality: string } | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const name = isStr(o["name"]) ? o["name"].trim() : "";
  const locality = isStr(o["locality"]) ? o["locality"].trim() : "";
  const fits = (s: string) => s.length >= 2 && s.length <= MAX_PLACE_CHARS;
  return fits(name) && fits(locality) && !HANDLE_OR_ADDRESS.test(name) ? { name, locality } : null;
}

const MAX_SCREEN_CHARS = 300;
/** The words on the screen as written: trimmed, runs of spaces folded, the lines kept, bounded; anything else is none. */
function screenTextFrom(v: unknown): string | null {
  if (!isStr(v)) return null;
  const text = v.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return text.length > 0 ? text.slice(0, MAX_SCREEN_CHARS) : null;
}

/** A date the clock can read, still to come: a day already gone is history, and a bare word ("Friday") is a guess. */
function eventFrom(v: unknown, now: Date): string | null {
  if (!isStr(v) || !ISO_DATE.test(v.trim())) return null;
  const at = Date.parse(v.trim());
  if (!Number.isFinite(at)) return null;
  // A day named without a time is the whole day; it has gone only once the day after has begun.
  const dayEnd = v.trim().length === 10 ? at + 86_400_000 : at;
  return dayEnd > now.getTime() ? v.trim() : null;
}

/** Validates and normalises the model's JSON; returns null when it cannot be trusted. */
export function validateOutput(v: unknown, now: Date = new Date()): ItemAiOutput | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o["category"]) || !(CATEGORIES as readonly string[]).includes(o["category"])) return null;
  const tags = Array.isArray(o["tags"]) ? (o["tags"].filter(isStr).map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter((t) => t.length > 0 && t.length <= 40)) : [];
  const entities = Array.isArray(o["entities"])
    ? (o["entities"] as unknown[]).filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
      .map((e) => ({ type: (ENTITY_TYPES as readonly string[]).includes(String(e["type"])) ? (e["type"] as EntityType) : ("other" as EntityType), name: String(e["name"] ?? "").trim() }))
      .filter((e) => e.name.length > 0 && e.name.length <= 120).slice(0, 10)
    : [];
  const actionability = (ACTIONABILITY as readonly string[]).includes(String(o["actionability"])) ? (o["actionability"] as Actionability) : "none";
  const confidenceRaw = typeof o["confidence"] === "number" ? o["confidence"] : 0.5;
  const confidence = Math.min(1, Math.max(0, confidenceRaw));
  return {
    // Below the floor the model is guessing, and a guess is not shown as the category.
    category: confidence < UNSURE_BELOW ? "Other" : o["category"] as Category,
    tags: [...new Set(tags)].slice(0, 5),
    summary: isStr(o["summary"]) ? o["summary"].trim().slice(0, 140) : "",
    entities,
    language: isStr(o["language"]) && /^[a-z]{2}$/i.test(o["language"]) ? o["language"].toLowerCase() : "und",
    actionability,
    confidence,
    venue: venueFrom(o["venue"]),
    event_at: eventFrom(o["event_at"], now),
    screen_text: screenTextFrom(o["screen_text"]),
  };
}

export async function classify(input: ClassifyInput, deps: ClassifyDeps, picture?: Picture): Promise<ClassifyResult> {
  const r = await deps.call(SYSTEM_PROMPT, buildUserMessage(input), undefined, picture);
  if (r.error) return { output: null, error: r.error, model: r.model, usage: r.usage };
  if (r.refused) return { output: null, error: "refused", model: r.model, usage: r.usage };
  const output = validateOutput(r.output);
  return { output, error: output ? null : "invalid model output", model: r.model, usage: r.usage };
}

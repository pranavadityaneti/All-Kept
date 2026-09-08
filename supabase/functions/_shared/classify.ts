// Classification: one model call per item, structured output. Pure; the model call is injected (see classifiers.ts).
import { ACTIONABILITY, CATEGORIES, ENTITY_TYPES } from "./contracts.ts";
import type { Actionability, Category, EntityType, ItemAiOutput } from "./contracts.ts";

export const PROMPT_VERSION = "2026-09-08.1";

export interface ClassifyInput {
  platform: string;
  kind: string;
  url: string | null;
  title: string | null;
  text: string | null;
  author: string | null;
  note: string | null;
}

export interface ModelUsage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; reasoning_tokens?: number }

export interface ModelResult {
  output: unknown;               // parsed JSON from the model, validated here
  refused: boolean;
  model: string;
  usage: ModelUsage | null;
  error?: string;
}

export interface ClassifyDeps {
  call(system: string, user: string): Promise<ModelResult>;
}

export interface ClassifyResult {
  output: ItemAiOutput | null;
  error: string | null;
  model: string;
  usage: ModelUsage | null;
}

export const SYSTEM_PROMPT = `You sort things a person saved from social media into their personal library.
Given one saved item (platform, kind, link, title, caption or text, author, the person's own note), return JSON with:
- category: exactly one of ${JSON.stringify(CATEGORIES)}. Use "Other" only when nothing fits.
- tags: up to five short lowercase tags (single words or hyphenated), specific to the content, no hashtags, no duplicates of the category.
- summary: one plain sentence, at most 140 characters, saying what the item is about, in the caption's language if it is not English.
- entities: places, products, recipes, tools, people or brands named in the content, as {type, name}; empty if none.
- language: ISO 639-1 code of the main language of the text.
- actionability: watch (a video to watch), try (a recipe, workout or how-to to attempt), buy (a product), go (a place to visit), read (an article or thread), reference (facts or tools to keep), none.
- confidence: 0 to 1, your confidence in the category.
Judge from the content only. Hashtags and emoji are weak signals. If the text is empty, use the link, kind and author.`;

export function buildUserMessage(i: ClassifyInput): string {
  const clip = (s: string | null, n: number) => (s ? (s.length > n ? s.slice(0, n) + "…" : s) : "(none)");
  return [
    `platform: ${i.platform}`, `kind: ${i.kind}`, `link: ${i.url ?? "(none)"}`, `author: ${i.author ?? "(none)"}`,
    `title: ${clip(i.title, 300)}`, `caption or text: ${clip(i.text, 1500)}`, `person's note: ${clip(i.note, 300)}`,
  ].join("\n");
}

const isStr = (v: unknown): v is string => typeof v === "string";

/** Validates and normalises the model's JSON; returns null when it cannot be trusted. */
export function validateOutput(v: unknown): ItemAiOutput | null {
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
  return {
    category: o["category"] as Category,
    tags: [...new Set(tags)].slice(0, 5),
    summary: isStr(o["summary"]) ? o["summary"].trim().slice(0, 140) : "",
    entities,
    language: isStr(o["language"]) && /^[a-z]{2}$/i.test(o["language"]) ? o["language"].toLowerCase() : "und",
    actionability,
    confidence: Math.min(1, Math.max(0, confidenceRaw)),
  };
}

export async function classify(input: ClassifyInput, deps: ClassifyDeps): Promise<ClassifyResult> {
  const r = await deps.call(SYSTEM_PROMPT, buildUserMessage(input));
  if (r.error) return { output: null, error: r.error, model: r.model, usage: r.usage };
  if (r.refused) return { output: null, error: "refused", model: r.model, usage: r.usage };
  const output = validateOutput(r.output);
  return { output, error: output ? null : "invalid model output", model: r.model, usage: r.usage };
}

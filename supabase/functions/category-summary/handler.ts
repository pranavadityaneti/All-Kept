// A summary for a category: the facts of what it holds, and three themes written once and kept.
//
// A category is a pile. Opening "Tech" showed 72 cards and nothing about what they add up to. The
// facts — how many, mostly what, the names that keep turning up, what the sorter thought they were
// for — come straight from the database. The themes come from the model, written from the saves'
// own one-line summaries, tags and names (never a caption), in the language of the person's phone,
// and kept against a fingerprint of the members so they are rewritten only when the category
// changed, and no more than once an hour. Nothing waits on the model: the answer goes back at
// once with whatever themes are stored, and the writing happens after the response has gone — the
// first open of a category used to show a blank card for the seconds the model took.
// Pure; the caller's id, the source, the store, the model and the deferral are injected.
import type { ClassifyDeps } from "../_shared/classify.ts";
import type { CategorySummaryResponse } from "../_shared/contracts.ts";
import { apiError, json, readJson } from "../_shared/http.ts";

/** What the database says a category holds, for the caller. */
export interface SummarySource {
  count: number;
  /** Changes whenever a save joins, leaves, or is sorted again. */
  fingerprint: string;
  shapes: Record<string, number>;
  intents: Record<string, number>;
  names: { name: string; kind: string; icon: string | null; n: number }[];
  /** The newest members' derived fields, the model's whole input. */
  saves: { summary: string | null; tags: string[]; names: string[] }[];
}
export interface StoredSummary { fingerprint: string; themes: string[]; updated_at: string }

export interface CategorySummaryDeps {
  userId(req: Request): Promise<string | null>;
  source(userId: string, category: string): Promise<SummarySource>;
  /** The person's "Sort saves automatically" switch: off means no model reads their saves, here either. */
  sortingEnabled(userId: string): Promise<boolean>;
  stored(userId: string, category: string): Promise<StoredSummary | null>;
  write(userId: string, category: string, fingerprint: string, themes: string[], model: string): Promise<void>;
  /** The sorting model, or null when none is configured. */
  call: ClassifyDeps["call"] | null;
  /** Runs work after the response has gone (the runtime's waitUntil); the promise is never awaited by the handler. */
  defer(work: Promise<void>): void;
  /** Categories being written right now, per person, so a second ask meanwhile does not start the model again. */
  inFlight: Set<string>;
  now(): Date;
  log(message: string, meta?: Record<string, unknown>): void;
}

/** Fewer saves than this have no themes worth writing; the facts row stands alone. */
export const MIN_SAVES_FOR_THEMES = 3;
/** Members that changed keep the stored themes this long before the model is asked again. */
export const REFRESH_EVERY_MS = 60 * 60 * 1000;
/** Newest members the model reads. Enough to see the shape of a category, small enough to stay cheap. */
export const MAX_SAVES_READ = 60;
const MAX_THEMES = 3;
const MAX_THEME_CHARS = 90;
const MAX_CATEGORY_CHARS = 80;
/** A language as the phone names it: "en", "ja", "pt". Anything else is English. */
const LANGUAGE = /^[a-z]{2,3}$/;

export const THEMES_PROMPT = `You describe what a person's saved posts in one category are about, in up to three short themes.
You are given JSON {"language", "saves"}: the language to write in (an ISO 639 code), and an array of saves, newest first, each with a one-line summary, tags and the names of things in it.
Return JSON {"themes": ["...", "...", "..."]}: at most three themes, each at most 90 characters, each a named thing or a specific topic rather than an adjective — "Claude Code workflows and agent setups", not "AI content". Only what the saves contain; nothing added. Write every theme in the given language, whatever language the saves are in; keep names as they are. Give fewer themes when the saves are few or all alike, and one theme for a category that is about one thing.`;

/** Strict: every property required, no extras. */
export const THEMES_SCHEMA = {
  type: "object",
  properties: { themes: { type: "array", items: { type: "string" } } },
  required: ["themes"],
  additionalProperties: false,
} as const;

/** The model's answer as themes, or null when it is not one: up to three trimmed lines, each cut at 90 characters. */
export function themesFrom(output: unknown): string[] | null {
  if (typeof output !== "object" || output === null) return null;
  const list = (output as { themes?: unknown }).themes;
  if (!Array.isArray(list) || !list.every((t) => typeof t === "string")) return null;
  const themes = (list as string[]).map((t) => t.trim().slice(0, MAX_THEME_CHARS)).filter((t) => t.length > 0).slice(0, MAX_THEMES);
  return themes.length > 0 ? themes : null;
}

/** The themes, asked of the model and written; nothing thrown, since nothing waits on this. */
async function writeThemes(deps: CategorySummaryDeps, userId: string, category: string, language: string, source: SummarySource, fingerprint: string): Promise<void> {
  try {
    const reply = await deps.call!(THEMES_PROMPT, JSON.stringify({ language, saves: source.saves.slice(0, MAX_SAVES_READ) }), { name: "category_themes", schema: THEMES_SCHEMA });
    const themes = reply.error || reply.refused ? null : themesFrom(reply.output);
    if (!themes) {
      deps.log("category summary: model gave no themes", { category, error: reply.error ?? (reply.refused ? "refused" : "invalid") });
      return;
    }
    await deps.write(userId, category, fingerprint, themes, reply.model);
    deps.log("category summary: written", { category, language, saves: source.saves.length, model: reply.model, usage: reply.usage });
  } catch (e) {
    deps.log("category summary: model unreachable", { category, reason: String(e).slice(0, 200) });
  }
}

export async function handleCategorySummary(req: Request, deps: CategorySummaryDeps): Promise<Response> {
  if (req.method !== "POST") return apiError("bad_request", "POST only");
  const userId = await deps.userId(req);
  if (!userId) return apiError("unauthorized", "Sign in first.");
  const body = await readJson(req);
  const category = typeof body?.["category"] === "string" ? body["category"].trim() : "";
  if (!category || category.length > MAX_CATEGORY_CHARS) return apiError("bad_request", "category is required");
  const asked = typeof body?.["language"] === "string" ? body["language"].trim().toLowerCase().split(/[-_]/)[0]! : "";
  const language = LANGUAGE.test(asked) ? asked : "en";

  const source = await deps.source(userId, category);
  const facts = { count: source.count, shapes: source.shapes, intents: source.intents, names: source.names };
  const answer = (themes: string[], freshness: CategorySummaryResponse["freshness"], extra: Partial<CategorySummaryResponse> = {}): Response =>
    json({ ...facts, themes, freshness, ...extra } satisfies CategorySummaryResponse);

  if (!(await deps.sortingEnabled(userId))) return answer([], "none", { sortingOff: true });
  if (source.count < MIN_SAVES_FOR_THEMES) return answer([], "none");

  // The language is part of what the themes were written for: a phone that changes language gets them again.
  const fingerprint = `${source.fingerprint}:${language}`;
  const stored = await deps.stored(userId, category);
  if (stored) {
    const unchanged = stored.fingerprint === fingerprint;
    const recent = deps.now().getTime() - new Date(stored.updated_at).getTime() < REFRESH_EVERY_MS;
    if (unchanged || recent) return answer(stored.themes, "stored");
  }
  if (!deps.call) return answer(stored?.themes ?? [], stored ? "stored" : "none");

  // The answer goes back now with what is stored; the writing follows, once, however often the app asks meanwhile.
  const key = `${userId}\n${category}`;
  if (!deps.inFlight.has(key)) {
    deps.inFlight.add(key);
    deps.defer(writeThemes(deps, userId, category, language, source, fingerprint).finally(() => { deps.inFlight.delete(key); }));
  }
  return answer(stored?.themes ?? [], "writing");
}

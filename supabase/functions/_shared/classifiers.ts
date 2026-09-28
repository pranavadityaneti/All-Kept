// Picks the classification model from the environment. OpenAI when OPENAI_API_KEY is set (model from
// CLASSIFIER_MODEL, default GPT-5.6 Sol); else Gemini when GEMINI_API_KEY is set (default 2.5 Flash);
// else Claude when ANTHROPIC_API_KEY is set; else none. CLASSIFIER_MODEL / CLASSIFIER_MODEL_BULK name
// the model whichever vendor is chosen.
import type { ClassifyDeps } from "./classify.ts";
import { anthropicDeps, MODEL as CLAUDE_MODEL } from "./anthropic.ts";
import { DEFAULT_MODEL as OPENAI_MODEL, openaiDeps } from "./openai.ts";
import { DEFAULT_MODEL as GEMINI_MODEL, geminiDeps } from "./gemini.ts";

export interface ClassifierChoice { vendor: "openai" | "anthropic" | "gemini"; model: string; deps: ClassifyDeps }

/**
 * The cheaper tier, for a back catalogue arriving all at once. Half the price of the everyday model
 * (see PRICES_PER_MTOK), which matters when someone imports four years of saves in one go.
 */
export const BULK_MODEL = "gpt-5.6-terra";
/** Gemini's cheaper tier, the same idea one vendor over: Flash-Lite for an import. */
export const GEMINI_BULK_MODEL = "gemini-2.5-flash-lite";

export function classifierFromEnv(
  get: (name: string) => string | undefined = (n) => Deno.env.get(n),
  { bulk = false }: { bulk?: boolean } = {},
): ClassifierChoice | null {
  // An explicit model name applies to whichever vendor is chosen; the bulk pass has its own override.
  const named = (bulk ? get("CLASSIFIER_MODEL_BULK") : get("CLASSIFIER_MODEL"))?.trim();

  const openaiKey = get("OPENAI_API_KEY")?.trim();
  if (openaiKey) {
    const model = named || (bulk ? BULK_MODEL : OPENAI_MODEL);
    return { vendor: "openai", model, deps: openaiDeps(openaiKey, model) };
  }
  const geminiKey = get("GEMINI_API_KEY")?.trim();
  if (geminiKey) {
    const model = named || (bulk ? GEMINI_BULK_MODEL : GEMINI_MODEL);
    return { vendor: "gemini", model, deps: geminiDeps(geminiKey, model) };
  }
  const anthropicKey = get("ANTHROPIC_API_KEY")?.trim();
  if (anthropicKey) return { vendor: "anthropic", model: CLAUDE_MODEL, deps: anthropicDeps(anthropicKey) };
  return null;
}

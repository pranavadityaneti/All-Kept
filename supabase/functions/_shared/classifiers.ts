// Picks the classification model from the environment. OpenAI when OPENAI_API_KEY is set (model from CLASSIFIER_MODEL, default GPT-5.6 Sol); else Claude when ANTHROPIC_API_KEY is set; else none.
import type { ClassifyDeps } from "./classify.ts";
import { anthropicDeps, MODEL as CLAUDE_MODEL } from "./anthropic.ts";
import { DEFAULT_MODEL as OPENAI_MODEL, openaiDeps } from "./openai.ts";

export interface ClassifierChoice { vendor: "openai" | "anthropic"; model: string; deps: ClassifyDeps }

/**
 * The cheaper tier, for a back catalogue arriving all at once. Half the price of the everyday model
 * (see PRICES_PER_MTOK), which matters when someone imports four years of saves in one go.
 */
export const BULK_MODEL = "gpt-5.6-terra";

export function classifierFromEnv(
  get: (name: string) => string | undefined = (n) => Deno.env.get(n),
  { bulk = false }: { bulk?: boolean } = {},
): ClassifierChoice | null {
  const openaiKey = get("OPENAI_API_KEY")?.trim();
  if (openaiKey) {
    const named = bulk ? get("CLASSIFIER_MODEL_BULK")?.trim() : get("CLASSIFIER_MODEL")?.trim();
    const model = named || (bulk ? BULK_MODEL : OPENAI_MODEL);
    return { vendor: "openai", model, deps: openaiDeps(openaiKey, model) };
  }
  const anthropicKey = get("ANTHROPIC_API_KEY")?.trim();
  if (anthropicKey) return { vendor: "anthropic", model: CLAUDE_MODEL, deps: anthropicDeps(anthropicKey) };
  return null;
}

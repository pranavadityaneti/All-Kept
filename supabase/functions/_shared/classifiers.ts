// Picks the classification model from the environment. OpenAI when OPENAI_API_KEY is set (model from CLASSIFIER_MODEL, default GPT-5.6 Sol); else Claude when ANTHROPIC_API_KEY is set; else none.
import type { ClassifyDeps } from "./classify.ts";
import { anthropicDeps, MODEL as CLAUDE_MODEL } from "./anthropic.ts";
import { DEFAULT_MODEL as OPENAI_MODEL, openaiDeps } from "./openai.ts";

export interface ClassifierChoice { vendor: "openai" | "anthropic"; model: string; deps: ClassifyDeps }

export function classifierFromEnv(get: (name: string) => string | undefined = (n) => Deno.env.get(n)): ClassifierChoice | null {
  const openaiKey = get("OPENAI_API_KEY")?.trim();
  if (openaiKey) {
    const model = get("CLASSIFIER_MODEL")?.trim() || OPENAI_MODEL;
    return { vendor: "openai", model, deps: openaiDeps(openaiKey, model) };
  }
  const anthropicKey = get("ANTHROPIC_API_KEY")?.trim();
  if (anthropicKey) return { vendor: "anthropic", model: CLAUDE_MODEL, deps: anthropicDeps(anthropicKey) };
  return null;
}

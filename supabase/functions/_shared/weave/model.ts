// The models the Weave speaks to: one to understand, one to plan, each asked in a strict schema.
//
// The sorter's adapter is tuned for a short answer in twenty seconds; a plan is thousands of
// tokens and a minute or two of thought, so this one takes its model, its effort, its room and
// its patience as arguments. Everything else — the cached system prompt, the JSON-schema format,
// the refusal and the non-JSON answer named as such — is the same discipline.
import Anthropic from "npm:@anthropic-ai/sdk";
import type { ModelResult } from "../classify.ts";

export type WeaveCall = (system: string, user: string, schema: Record<string, unknown>) => Promise<ModelResult>;

export interface WeaveModelOptions {
  maxTokens: number;
  effort: "low" | "medium" | "high";
  timeoutMs: number;
}

export function weaveModel(apiKey: string, model: string, options: WeaveModelOptions): WeaveCall {
  const client = new Anthropic({ apiKey, timeout: options.timeoutMs, maxRetries: 0 });
  return async (system, user, schema) => {
    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: options.maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: options.effort, format: { type: "json_schema", schema } },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      } as never) as unknown as { content: { type: string; text?: string }[]; stop_reason: string; model: string; usage: ModelResult["usage"] };
      if (response.stop_reason === "refusal") return { output: null, refused: true, model: response.model, usage: response.usage };
      if (response.stop_reason === "max_tokens") return { output: null, refused: false, model: response.model, usage: response.usage, error: "the answer ran past its room" };
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      try { return { output: JSON.parse(text), refused: false, model: response.model, usage: response.usage }; }
      catch { return { output: null, refused: false, model: response.model, usage: response.usage, error: "model returned non-JSON" }; }
    } catch (e) {
      return { output: null, refused: false, model, usage: null, error: e instanceof Anthropic.APIError ? `anthropic ${e.status ?? "request failed"}` : "anthropic request failed" };
    }
  };
}

/** The two models, as decided: Opus 5 to understand — a reading job — and Fable 5.1 to plan — the judgement. */
export const UNDERSTAND_MODEL = "claude-opus-5";
export const PLAN_MODEL = "claude-fable-5-1";
export const UNDERSTAND_OPTIONS: WeaveModelOptions = { maxTokens: 3000, effort: "medium", timeoutMs: 90_000 };
export const PLAN_OPTIONS: WeaveModelOptions = { maxTokens: 10_000, effort: "high", timeoutMs: 140_000 };
